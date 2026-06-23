import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Full name of the user', example: 'John Doe' })
  fullName?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'oldPassword123' })
  currentPassword!: string;

  @ApiProperty({ description: 'New password', example: 'newPassword456' })
  newPassword!: string;
}
