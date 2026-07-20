import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
// BadRequestException is used for both unconfigured SSO and invalid assertion
// attribute values - see getSaml() and provisionAndLogin().
import { ConfigService } from '@nestjs/config';
import { SAML } from '@node-saml/node-saml';
import { AuditEventType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../audit/audit.service';
import { SamlConfigService } from './saml-config.service';

/**
 * Sprint 18: Task Tracker as a SAML 2.0 Service Provider, with just-in-time
 * provisioning driven by Crate (the IdP).
 *
 * Trust model: the IdP's X.509 signing certificate is the ONE and ONLY trust
 * channel. No API key, no standing connection, no shared database.
 */

/**
 * SSO-assignable roles. `Owner` is deliberately excluded: it sits at the top of
 * the role hierarchy and `Workspace.ownerId` is a hard FK to a single user, so
 * an assertion granting Owner could produce a second owner / inconsistent state.
 * Crate cannot emit it (its enum lacks the value); we reject it defensively too.
 */
const SSO_ASSIGNABLE_ROLES: readonly string[] = [Role.Admin, Role.Member, Role.Viewer];

export interface SamlProfile {
  nameID?: string;
  email?: string;
  name?: string;
  workspace?: string;
  role?: string;
  [key: string]: unknown;
}

export interface ProvisionResult {
  accessToken: string;
  refreshToken: string;
  workspaceSlug: string;
}

@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);

  // Cached SAML validators, one per workspace, keyed by the config they were
  // built from. Sprint 20 allows trust config to change at runtime from the
  // settings UI, so the key must include the certificate + audience - otherwise
  // saving new config would silently keep validating against the old
  // certificate until restart, which is the problem this sprint removes.
  private samlInstances = new Map<string, { key: string; saml: SAML }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
    private readonly samlConfig: SamlConfigService,
  ) {}

  /**
   * Build (or reuse) the SAML validator from the current trust config. Config
   * comes from the database when set via the settings UI, falling back to
   * environment variables.
   */
  private async getSaml(workspaceSlug: string): Promise<SAML> {
    const config = await this.samlConfig.resolve(workspaceSlug);
    if (!config) {
      throw new BadRequestException(
        `Single sign-on is not configured for workspace "${workspaceSlug}". An owner can add an identity provider in that workspace's settings.`,
      );
    }

    const cacheKey = `${config.audience}::${config.certificatePem}`;
    const cached = this.samlInstances.get(workspaceSlug);
    if (cached && cached.key === cacheKey) return cached.saml;

    const saml = new SAML({
      callbackUrl: this.samlConfig.acsUrlFor(workspaceSlug),
      entryPoint: config.idpSsoUrl ?? undefined,
      issuer: config.audience,
      audience: config.audience,
      idpCert: config.certificatePem,

      // Crate signs the ASSERTION, not the Response. This defaults to true and
      // would reject every valid Crate assertion if left alone.
      wantAuthnResponseSigned: false,
      // The assertion signature IS the security model here. Never relax this.
      wantAssertionsSigned: true,
      // IdP-initiated SSO is unsolicited - there is no InResponseTo to correlate.
      validateInResponseTo: 'never',
    } as any);

    this.samlInstances.set(workspaceSlug, { key: cacheKey, saml });
    this.logger.log(`SAML validator built for workspace "${workspaceSlug}" (audience: ${config.audience})`);
    return saml;
  }

  /**
   * Validate a base64 SAMLResponse against the certificate trusted by the
   * workspace named in the ACS URL. Throws on any signature/audience/timing
   * failure.
   *
   * The workspace comes from the URL, not the assertion: choosing the
   * verification key based on unverified assertion content would let a caller
   * nominate which key verifies them.
   */
  async validateAssertion(workspaceSlug: string, samlResponse: string): Promise<SamlProfile> {
    const saml = await this.getSaml(workspaceSlug);
    let profile: SamlProfile;
    try {
      const result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
      if (!result.profile) throw new Error('No profile returned from assertion');
      profile = result.profile as unknown as SamlProfile;
    } catch (err: any) {
      this.logger.warn(`Rejected SAML assertion for "${workspaceSlug}": ${err?.message}`);
      throw new UnauthorizedException('Invalid SAML assertion');
    }

    // Defence in depth: the assertion carries its own `workspace` attribute.
    // It must agree with the endpoint it was sent to, or a valid assertion for
    // one workspace could be replayed at another workspace's ACS URL.
    const asserted = String(profile.workspace ?? '').trim();
    if (asserted && asserted !== workspaceSlug) {
      this.logger.warn(
        `Assertion for workspace "${asserted}" was POSTed to the ACS URL for "${workspaceSlug}" - rejected.`,
      );
      throw new UnauthorizedException('Assertion workspace does not match this endpoint');
    }

    return profile;
  }

  /**
   * Just-in-time provisioning. Creates the user if needed, resolves the target
   * workspace by slug, upserts membership at the asserted role, and mints a
   * Task Tracker session - mirroring validateGoogleUser()'s patterns exactly.
   */
  async provisionAndLogin(
    workspaceSlug: string,
    profile: SamlProfile,
    ipAddress?: string,
  ): Promise<ProvisionResult> {
    const email = String(profile.email ?? profile.nameID ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Assertion is missing an email/NameID');

    const fullName = String(profile.name ?? '').trim() || email;
    // The slug comes from the ACS URL, which selected the certificate that
    // verified this assertion - validateAssertion() has already confirmed the
    // assertion's own `workspace` attribute agrees with it.
    const slug = workspaceSlug;
    const assertedRole = String(profile.role ?? '').trim();

    // Defensive: reject anything outside the SSO-assignable set, Owner included.
    if (!SSO_ASSIGNABLE_ROLES.includes(assertedRole)) {
      throw new BadRequestException(
        `Role "${assertedRole}" cannot be assigned via SSO. Allowed: ${SSO_ASSIGNABLE_ROLES.join(', ')}.`,
      );
    }
    const role = assertedRole as Role;

    // Workspaces are never auto-created from an assertion.
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) {
      throw new BadRequestException(`No workspace exists with slug "${slug}"`);
    }

    // --- Find-or-create the user (mirrors validateGoogleUser) ---
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          fullName,
          // SSO users have no password; identity was proven by the assertion.
          emailVerified: true,
          notificationPref: {
            create: { emailEnabled: true, pushEnabled: false },
          },
        },
      });
      this.logger.log(`JIT-provisioned new user ${email} via SAML SSO`);
    }

    // --- Upsert workspace membership on @@unique([userId, workspaceId]) ---
    const membershipKey = { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } };
    const existing = await this.prisma.workspaceMember.findUnique({ where: membershipKey });

    if (!existing) {
      const created = await this.prisma.workspaceMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role },
      });
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_MEMBER_INVITED,
        workspaceId: workspace.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: role,
        resourceType: 'WorkspaceMember',
        resourceId: created.id,
        resourceName: user.email,
        metadata: { via: 'SAML_SSO', role },
        ipAddress,
      });
    } else if (existing.role === Role.Owner) {
      // Never demote a workspace Owner. Workspace.ownerId is a hard FK to one
      // user, and changeMemberRole() refuses Owner in both directions - honoring
      // an assertion here would leave ownerId pointing at a non-Owner member.
      this.logger.warn(
        `SAML assertion asserted role "${role}" for Owner ${user.email} of workspace "${slug}" - ignored, Owner is never demoted.`,
      );
    } else if (existing.role !== role) {
      // Role overwrite IS the intended "Crate adjusts roles centrally" behavior.
      const updated = await this.prisma.workspaceMember.update({
        where: membershipKey,
        data: { role },
      });
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_MEMBER_ROLE_CHANGED,
        workspaceId: workspace.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: role,
        resourceType: 'WorkspaceMember',
        resourceId: updated.id,
        resourceName: user.email,
        metadata: { via: 'SAML_SSO', from: existing.role, to: role },
        ipAddress,
      });
    }
    // else: membership already at the asserted role - no write, no audit event.

    // --- Mint the session (mirrors validateGoogleUser) ---
    const tokens = await this.authService.generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    await this.auditLogService.log({
      event: AuditEventType.LOGIN_SUCCESS,
      workspaceId: workspace.id,
      actorId: user.id,
      actorEmail: user.email,
      metadata: { via: 'SAML_SSO' },
      ipAddress,
    });

    return { ...tokens, workspaceSlug: workspace.slug };
  }
}
