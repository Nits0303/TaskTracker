import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SAML } from '@node-saml/node-saml';
import { AuditEventType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../audit/audit.service';

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
  private samlInstance: SAML | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The IdP's public certificate - the sole trust anchor. Supports either an
   * inline PEM (with literal \n escapes, which .env files force) or a path to a
   * .pem file. The file path is preferred: multi-line PEM in .env is a common
   * source of silent misconfiguration.
   */
  private loadIdpCertificate(): string {
    const certPath = this.configService.get<string>('SAML_IDP_CERT_PATH');
    if (certPath) {
      return fs.readFileSync(certPath, 'utf8').trim();
    }
    const inline = this.configService.get<string>('SAML_IDP_CERT');
    if (!inline) {
      throw new Error('Neither SAML_IDP_CERT_PATH nor SAML_IDP_CERT is configured.');
    }
    return inline.replace(/\\n/g, '\n').trim();
  }

  private getSaml(): SAML {
    if (this.samlInstance) return this.samlInstance;

    const audience = this.configService.get<string>('SAML_SP_AUDIENCE') ?? 'task-tracker';
    this.samlInstance = new SAML({
      callbackUrl: this.configService.get<string>('SAML_ACS_URL'),
      entryPoint: this.configService.get<string>('SAML_IDP_ENTRY_POINT'),
      issuer: audience,
      audience,
      idpCert: this.loadIdpCertificate(),

      // Crate signs the ASSERTION, not the Response. This defaults to true and
      // would reject every valid Crate assertion if left alone.
      wantAuthnResponseSigned: false,
      // The assertion signature IS the security model here. Never relax this.
      wantAssertionsSigned: true,
      // IdP-initiated SSO is unsolicited - there is no InResponseTo to correlate.
      validateInResponseTo: 'never',
    } as any);

    return this.samlInstance;
  }

  /** Validate a base64 SAMLResponse. Throws on any signature/audience/timing failure. */
  async validateAssertion(samlResponse: string): Promise<SamlProfile> {
    try {
      const { profile } = await this.getSaml().validatePostResponseAsync({
        SAMLResponse: samlResponse,
      });
      if (!profile) throw new Error('No profile returned from assertion');
      return profile as unknown as SamlProfile;
    } catch (err: any) {
      this.logger.warn(`Rejected SAML assertion: ${err?.message}`);
      throw new UnauthorizedException('Invalid SAML assertion');
    }
  }

  /**
   * Just-in-time provisioning. Creates the user if needed, resolves the target
   * workspace by slug, upserts membership at the asserted role, and mints a
   * Task Tracker session - mirroring validateGoogleUser()'s patterns exactly.
   */
  async provisionAndLogin(profile: SamlProfile, ipAddress?: string): Promise<ProvisionResult> {
    const email = String(profile.email ?? profile.nameID ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Assertion is missing an email/NameID');

    const fullName = String(profile.name ?? '').trim() || email;
    const slug = String(profile.workspace ?? '').trim();
    const assertedRole = String(profile.role ?? '').trim();

    if (!slug) throw new BadRequestException('Assertion is missing the workspace attribute');

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
