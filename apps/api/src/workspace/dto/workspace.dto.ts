import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Workspace name (2-50 chars)', example: 'Acme Corp' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug (lowercase, digits, hyphens)', example: 'acme-corp' })
  slug!: string;

  @ApiPropertyOptional({ description: 'URL to the workspace logo', example: 'https://example.com/logo.png' })
  logoUrl?: string | null;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ description: 'Workspace name', example: 'Acme Corp Updated' })
  name?: string;

  @ApiPropertyOptional({ description: 'URL-friendly slug', example: 'acme-corp-updated' })
  slug?: string;

  @ApiPropertyOptional({ description: 'URL to the workspace logo', example: 'https://example.com/logo.png' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Whether the workspace is archived', example: false })
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Whether the workspace allows only invited members to join', example: true })
  isInviteOnly?: boolean;

  @ApiPropertyOptional({ description: 'Enable or disable email notifications', example: true })
  emailNotifications?: boolean;
}

export class DeleteWorkspaceDto {
  @ApiProperty({ description: 'Exact name of the workspace for confirmation', example: 'Acme Corp' })
  name!: string;
}

export class AcceptWorkspaceInviteDto {
  @ApiProperty({ description: 'Invite token received via email', example: 'abc123token' })
  token!: string;
}

export class InviteMemberDto {
  @ApiProperty({ description: 'Email address of the user to invite', example: 'newmember@example.com' })
  email!: string;

  @ApiProperty({ description: 'Role for the invited member', example: 'Member', enum: ['Admin', 'Member', 'Viewer'] })
  role!: 'Admin' | 'Member' | 'Viewer';
}

export class ChangeMemberRoleDto {
  @ApiProperty({ description: 'New role for the member', example: 'Admin', enum: ['Admin', 'Member', 'Viewer'] })
  role!: 'Admin' | 'Member' | 'Viewer';
}
