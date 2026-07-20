import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SamlConfigService } from './saml-config.service';

/**
 * Sprint 20: manage a workspace's trusted SAML identity provider.
 *
 * Trust is per-workspace, so this is gated on being that workspace's Owner or
 * Admin - checked against WorkspaceMember rather than inferred from the token.
 */
@ApiTags('Workspaces')
@ApiBearerAuth('access-token')
@Controller('workspaces/:slug/saml')
@UseGuards(JwtAuthGuard)
export class SamlConfigController {
  constructor(
    private readonly samlConfig: SamlConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Resolve the workspace and assert the caller may administer its SSO. */
  private async assertCanAdminister(slug: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException(`No workspace with slug "${slug}"`);

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
    });
    if (!membership || (membership.role !== Role.Owner && membership.role !== Role.Admin)) {
      throw new ForbiddenException('Only workspace owners and admins can configure single sign-on.');
    }
    return workspace;
  }

  @ApiOperation({ summary: "Get this workspace's SAML SSO configuration" })
  @ApiResponse({ status: 200, description: 'Current configuration and certificate summary' })
  @Get('config')
  async get(@Param('slug') slug: string, @CurrentUser() user: any) {
    await this.assertCanAdminister(slug, user.userId);

    const config = await this.samlConfig.resolve(slug);
    const acsUrl = this.samlConfig.acsUrlFor(slug);

    if (!config) {
      return { configured: false, acsUrl, audience: 'task-tracker', workspaceSlug: slug };
    }

    return {
      configured: true,
      workspaceSlug: slug,
      audience: config.audience,
      acsUrl,
      idpEntityId: config.idpEntityId,
      idpSsoUrl: config.idpSsoUrl,
      certificate: this.samlConfig.summarize(config.certificatePem),
    };
  }

  @ApiOperation({ summary: "Set this workspace's identity provider (metadata XML or certificate)" })
  @ApiResponse({ status: 200, description: 'Saved; takes effect immediately, no restart required' })
  @ApiResponse({ status: 400, description: 'Unparseable metadata or certificate' })
  @Put('config')
  async put(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body() body: { metadataXml?: string; certificatePem?: string; audience?: string },
  ) {
    const workspace = await this.assertCanAdminister(slug, user.userId);

    let certificatePem: string;
    let idpEntityId: string | null = null;
    let idpSsoUrl: string | null = null;

    if (body.metadataXml?.trim()) {
      const parsed = this.samlConfig.parseMetadata(body.metadataXml);
      certificatePem = parsed.certificatePem;
      idpEntityId = parsed.entityId ?? null;
      idpSsoUrl = parsed.ssoUrl ?? null;
    } else if (body.certificatePem?.trim()) {
      certificatePem = this.samlConfig.normalizeCertificate(body.certificatePem);
    } else {
      throw new BadRequestException('Provide either metadataXml or certificatePem.');
    }

    const summary = this.samlConfig.summarize(certificatePem);
    if (summary?.expired) {
      throw new BadRequestException(
        `That certificate expired on ${new Date(summary.validTo).toDateString()}. Generate a new one from the identity provider.`,
      );
    }

    await this.samlConfig.save({
      workspaceId: workspace.id,
      certificatePem,
      audience: body.audience?.trim() || 'task-tracker',
      idpEntityId,
      idpSsoUrl,
      updatedById: user.userId,
    });

    // No restart required: SamlService caches its validator per workspace keyed
    // on certificate + audience, so the next assertion rebuilds it.
    return { saved: true, certificate: summary };
  }

  @ApiOperation({ summary: "Remove this workspace's identity provider" })
  @ApiResponse({ status: 200, description: 'Removed; SSO logins to this workspace will be rejected' })
  @Delete('config')
  async remove(@Param('slug') slug: string, @CurrentUser() user: any) {
    const workspace = await this.assertCanAdminister(slug, user.userId);
    await this.samlConfig.clear(workspace.id);
    return { cleared: true };
  }
}
