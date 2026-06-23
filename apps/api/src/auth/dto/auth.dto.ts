import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'User full name', example: 'Arjun Shah' })
  fullName!: string;

  @ApiProperty({ description: 'Valid email address', example: 'arjun@example.com' })
  email!: string;

  @ApiProperty({ description: 'User password (min 6 characters)', example: 'SecurePass123!' })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ description: 'Valid email address', example: 'arjun@example.com' })
  email!: string;

  @ApiProperty({ description: 'User password', example: 'SecurePass123!' })
  password!: string;
}

export class InviteDto {
  @ApiProperty({ description: 'Email address to invite', example: 'newuser@example.com' })
  email!: string;

  @ApiProperty({ description: 'Role for the new member', example: 'Member', enum: ['Owner', 'Admin', 'Member', 'Viewer'] })
  role!: 'Owner' | 'Admin' | 'Member' | 'Viewer';

  @ApiProperty({ description: 'UUID of the workspace', example: '123e4567-e89b-12d3-a456-426614174000' })
  workspaceId!: string;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invite token received via email', example: 'abc123token' })
  token!: string;

  @ApiPropertyOptional({ description: 'Full name (required if new user)', example: 'New User' })
  fullName?: string;

  @ApiPropertyOptional({ description: 'Password (required if new user)', example: 'SecurePass123!' })
  password?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Valid email address', example: 'arjun@example.com' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset token received via email', example: 'xyz789token' })
  token!: string;

  @ApiProperty({ description: 'New password (min 6 characters)', example: 'NewSecurePass123!' })
  password!: string;
}
