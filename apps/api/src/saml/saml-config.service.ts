import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { X509Certificate } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sprint 20: owns the SAML trust configuration.
 *
 * Sprint 18 read the IdP certificate from environment variables, so configuring
 * SSO meant editing files and restarting. This resolves config from the database
 * first (managed via the settings UI), falling back to env so existing
 * deployments keep working untouched.
 */

export interface ResolvedSamlConfig {
  workspaceId: string;
  workspaceSlug: string;
  certificatePem: string;
  audience: string;
  idpEntityId?: string | null;
  idpSsoUrl?: string | null;
}

export interface CertificateSummary {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  expired: boolean;
  fingerprint: string;
}

@Injectable()
export class SamlConfigService {
  private readonly logger = new Logger(SamlConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolve the trusted identity provider for one workspace. Returns null when
   * that workspace has no IdP configured, so callers can say "not configured"
   * rather than failing opaquely.
   *
   * Deliberately no environment-variable fallback: trust is per-workspace, and
   * a global env certificate would silently make every workspace trust an IdP
   * its owner never approved.
   */
  async resolve(workspaceSlug: string): Promise<ResolvedSamlConfig | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      include: { samlIdpConfig: true },
    });
    if (!workspace?.samlIdpConfig?.certificatePem) return null;

    return {
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      certificatePem: workspace.samlIdpConfig.certificatePem,
      audience: workspace.samlIdpConfig.audience,
      idpEntityId: workspace.samlIdpConfig.idpEntityId,
      idpSsoUrl: workspace.samlIdpConfig.idpSsoUrl,
    };
  }

  /** The ACS URL for a given workspace - what the admin pastes into the IdP. */
  acsUrlFor(workspaceSlug: string): string {
    const base =
      this.configService.get<string>('SAML_ACS_BASE_URL') ??
      this.configService.get<string>('API_PUBLIC_URL') ??
      'http://localhost:3001';
    return `${base.replace(/\/+$/, '')}/auth/saml/acs/${workspaceSlug}`;
  }

  /** Normalize a pasted/uploaded certificate and reject anything unparseable. */
  normalizeCertificate(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) throw new BadRequestException('Certificate is empty');

    // Accept a bare base64 body as well as a full PEM block.
    let pem = trimmed;
    if (!trimmed.includes('BEGIN CERTIFICATE')) {
      const body = trimmed.replace(/\s+/g, '');
      const lines = body.match(/.{1,64}/g);
      if (!lines) throw new BadRequestException('Certificate is not valid base64');
      pem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
    }

    // Parsing is the real validation - a malformed cert otherwise fails much
    // later, at assertion time, with an unhelpful error.
    try {
      new X509Certificate(pem);
    } catch {
      throw new BadRequestException('Could not parse the certificate. Check you pasted the whole thing.');
    }
    return pem;
  }

  /**
   * Extract the signing certificate (and, informationally, entityID / SSO URL)
   * from IdP metadata XML. Regex rather than a full XML parse: we only need
   * three well-known fields, and the certificate is independently validated by
   * normalizeCertificate() below.
   */
  parseMetadata(xml: string): { certificatePem: string; entityId?: string; ssoUrl?: string } {
    const certMatch = xml.match(/<(?:[\w-]+:)?X509Certificate>([\s\S]*?)<\/(?:[\w-]+:)?X509Certificate>/);
    if (!certMatch) {
      throw new BadRequestException('No <X509Certificate> found in that metadata XML.');
    }
    const entityMatch = xml.match(/entityID=["']([^"']+)["']/);
    const ssoMatch = xml.match(
      /<(?:[\w-]+:)?SingleSignOnService[^>]*Location=["']([^"']+)["']/,
    );

    return {
      certificatePem: this.normalizeCertificate(certMatch[1]),
      entityId: entityMatch?.[1],
      ssoUrl: ssoMatch?.[1],
    };
  }

  /** Human-readable summary for the settings screen. */
  summarize(certificatePem: string): CertificateSummary | null {
    try {
      const cert = new X509Certificate(certificatePem);
      const validTo = new Date(cert.validTo);
      return {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: new Date(cert.validFrom).toISOString(),
        validTo: validTo.toISOString(),
        expired: validTo.getTime() < Date.now(),
        fingerprint: cert.fingerprint256,
      };
    } catch {
      return null;
    }
  }

  async save(params: {
    workspaceId: string;
    certificatePem: string;
    audience: string;
    idpEntityId?: string | null;
    idpSsoUrl?: string | null;
    updatedById?: string | null;
  }) {
    const data = {
      certificatePem: params.certificatePem,
      audience: params.audience.trim() || 'task-tracker',
      idpEntityId: params.idpEntityId ?? null,
      idpSsoUrl: params.idpSsoUrl ?? null,
      updatedById: params.updatedById ?? null,
    };
    return this.prisma.samlIdpConfig.upsert({
      where: { workspaceId: params.workspaceId },
      create: { workspaceId: params.workspaceId, ...data },
      update: data,
    });
  }

  async clear(workspaceId: string) {
    await this.prisma.samlIdpConfig.deleteMany({ where: { workspaceId } });
  }
}
