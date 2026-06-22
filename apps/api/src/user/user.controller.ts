import {
  Controller, Get, Patch, Post, Body, Req,
  UseGuards, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: any, @Body() body: { fullName?: string }) {
    return this.userService.updateProfile(user.userId, body);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, or GIF images are allowed');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size must be under 5MB');
    }
    return this.userService.uploadAvatar(user.userId, file.buffer, file.mimetype);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUser() user: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Current and new passwords are required');
    }
    return this.userService.changePassword(user.userId, body.currentPassword, body.newPassword);
  }
}
