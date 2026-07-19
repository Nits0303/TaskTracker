import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SamlService } from './saml.service';

/**
 * Sprint 18: the SAML Assertion Consumer Service.
 *
 * Deliberately PUBLIC - no JwtAuthGuard. The whole point is that the caller has
 * no Task Tracker session (and may have no account at all) at this moment; the
 * signed assertion is the credential.
 */
@ApiTags('Auth')
@Controller('auth/saml')
export class SamlController {
  constructor(private readonly samlService: SamlService) {}

  private setRefreshCookie(res: Response, token: string) {
    // Mirrors AuthController.setRefreshCookie exactly.
    //
    // NOTE (hosting prerequisite): sameSite 'strict' works for the local demo
    // only because SameSite ignores port - localhost:3000 (Crate) and
    // localhost:3001/3100 (Task Tracker) count as the SAME site. Once the two
    // apps live on different domains the SAML POST becomes genuinely
    // cross-site and Strict will silently drop this cookie (user appears to log
    // in, then is immediately logged out). At that point this must become
    // sameSite: 'none' with real HTTPS.
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  @ApiOperation({
    summary: 'SAML Assertion Consumer Service (ACS) — IdP-initiated SSO with JIT provisioning',
  })
  @ApiResponse({ status: 302, description: 'Redirects into the target workspace with an access token' })
  @ApiResponse({ status: 400, description: 'Unknown workspace slug, or a role not assignable via SSO' })
  @ApiResponse({ status: 401, description: 'Invalid or untrusted SAML assertion' })
  @ApiExcludeEndpoint(false)
  @Post('acs')
  async acs(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, any>,
  ) {
    const samlResponse = body?.SAMLResponse;
    if (!samlResponse || typeof samlResponse !== 'string') {
      throw new BadRequestException('Missing SAMLResponse');
    }

    // Signature/audience/timing validation. Throws 401 on any failure - we never
    // fall through to provisioning on an unverified assertion.
    const profile = await this.samlService.validateAssertion(samlResponse);

    const { accessToken, refreshToken, workspaceSlug } =
      await this.samlService.provisionAndLogin(profile, req.ip);

    this.setRefreshCookie(res, refreshToken);

    // Land the user INSIDE the target workspace - this is the demo moment.
    // The workspace route is /w/[slug] (NOT /workspaces/[slug]; that path is the
    // workspace *list* and has no dynamic segment, so it would 404).
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
    res.redirect(`${frontendUrl}/w/${workspaceSlug}?token=${accessToken}`);
  }
}
