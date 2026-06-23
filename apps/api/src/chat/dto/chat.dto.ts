import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ description: 'Name of the channel', example: 'general' })
  name!: string;

  @ApiPropertyOptional({ description: 'Description of the channel', example: 'General discussion for the project' })
  description?: string;
}

export class UpdateChannelDto {
  @ApiPropertyOptional({ description: 'Name of the channel', example: 'general-updated' })
  name?: string;

  @ApiPropertyOptional({ description: 'Description of the channel', example: 'Updated description' })
  description?: string;
}

export class AddChannelMemberDto {
  @ApiProperty({ description: 'UUID of the user to add to the channel', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId!: string;
}

export class DeleteChannelDto {
  @ApiProperty({ description: 'Exact name of the channel for confirmation', example: 'general' })
  name!: string;
}

export class CreateMessageDto {
  @ApiProperty({ description: 'Content of the message', example: 'Hello everyone!' })
  content!: string;

  @ApiPropertyOptional({ description: 'Parent message ID if this is a reply in a thread', example: '123e4567-e89b-12d3-a456-426614174000' })
  parentId?: string;
}

export class UpdateMessageDto {
  @ApiProperty({ description: 'Updated content of the message', example: 'Hello everyone! (edited)' })
  content!: string;
}

export class MarkReadDto {
  @ApiProperty({ description: 'ID of the last read message', example: '123e4567-e89b-12d3-a456-426614174000' })
  messageId!: string;
}

export class CreateDirectMessageDto {
  @ApiPropertyOptional({ description: 'Channel ID (if existing conversation)', example: '123e4567-e89b-12d3-a456-426614174000' })
  channelId?: string;

  @ApiPropertyOptional({ description: 'Target user ID (if new conversation)', example: '123e4567-e89b-12d3-a456-426614174000' })
  targetUserId?: string;

  @ApiProperty({ description: 'Content of the message', example: 'Hey, are you free to chat?' })
  content!: string;
}

export class MuteDurationDto {
  @ApiProperty({ description: 'Mute duration string (e.g. "1h", "24h", "forever")', example: '8h' })
  duration!: string;
}
