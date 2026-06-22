import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpException, HttpStatus, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterSchema, LoginSchema, InviteSchema, AcceptInviteSchema } from '@repo/shared';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const result = RegisterSchema.safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }

    const { refreshToken, ...authResponse } = await this.authService.register(result.data);
    this.setRefreshCookie(res, refreshToken);
    return authResponse;
  }

  @ApiOperation({ summary: 'Log in and receive tokens' })
  @ApiResponse({ status: 200, description: 'User logged in successfully.' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Req() req: Request, @Body() body: any, @Res({ passthrough: true }) res: Response) {
    const result = LoginSchema.safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }

    const { refreshToken, ...authResponse } = await this.authService.login(result.data, req.ip);
    this.setRefreshCookie(res, refreshToken);
    return authResponse;
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refreshToken'];
    if (!refreshToken) {
      throw new HttpException({ message: 'No refresh token provided' }, HttpStatus.UNAUTHORIZED);
    }

    const { refreshToken: newRefreshToken, ...authResponse } = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, newRefreshToken);
    return authResponse;
  }

  @ApiOperation({ summary: 'Log out user' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request, @CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('refreshToken');
    return this.authService.logout(user.userId, req.ip);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates the Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const { refreshToken, accessToken } = await this.authService.validateGoogleUser(req.user, req.ip);
    this.setRefreshCookie(res, refreshToken);
    
    // Redirecting to the frontend workspaces
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/workspaces?token=${accessToken}`);
  }

  @UseGuards(JwtAuthGuard, CustomThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('invite')
  async createInvite(@CurrentUser() user: any, @Body() body: any) {
    const result = InviteSchema.safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }

    return this.authService.createInvite(user.userId, result.data);
  }

  @Get('invite/:token')
  async getInvite(@Param('token') token: string) {
    return this.authService.getInvite(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('accept-invite')
  async acceptInvite(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const result = AcceptInviteSchema.safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }

    const { refreshToken, ...authResponse } = await this.authService.acceptInvite(result.data);
    this.setRefreshCookie(res, refreshToken);
    return authResponse;
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    if (!body.email) throw new HttpException({ message: 'Email is required' }, HttpStatus.BAD_REQUEST);
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    if (!body.token || !body.password) {
      throw new HttpException({ message: 'Token and password are required' }, HttpStatus.BAD_REQUEST);
    }
    if (body.password.length < 8) {
      throw new HttpException({ message: 'Password must be at least 8 characters' }, HttpStatus.BAD_REQUEST);
    }
    return this.authService.resetPassword(body.token, body.password);
  }
}
