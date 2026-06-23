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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UpdateProfileDto, ChangePasswordDto } from './dto/user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile data.' })
  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.userId);
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  @Patch('me')
  updateProfile(@CurrentUser() user: any, @Body() body: UpdateProfileDto) {
    return this.userService.updateProfile(user.userId, body);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error (e.g. file size/type)' })
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

  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error or incorrect current password' })
  @Patch('me/password')
  changePassword(
    @CurrentUser() user: any,
    @Body() body: ChangePasswordDto,
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Current and new passwords are required');
    }
    return this.userService.changePassword(user.userId, body.currentPassword, body.newPassword);
  }
}
