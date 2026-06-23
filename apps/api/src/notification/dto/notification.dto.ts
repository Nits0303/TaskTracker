import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PushSubscriptionKeysDto {
  @ApiProperty({ description: 'Auth key for push subscription', example: 'auth-key' })
  auth!: string;

  @ApiProperty({ description: 'p256dh key for push subscription', example: 'p256dh-key' })
  p256dh!: string;
}

export class PushSubscriptionDto {
  @ApiProperty({ description: 'Push service endpoint URL', example: 'https://fcm.googleapis.com/fcm/send/...' })
  endpoint!: string;

  @ApiProperty({ description: 'Subscription keys' })
  keys!: PushSubscriptionKeysDto;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ description: 'Enable/disable all email notifications', example: true })
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable/disable all push notifications', example: true })
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Email notifications for task assignments', example: true })
  emailTaskAssignments?: boolean;

  @ApiPropertyOptional({ description: 'Email notifications for mentions', example: true })
  emailMentions?: boolean;

  @ApiPropertyOptional({ description: 'Email notifications for task deadlines', example: true })
  emailTaskDeadlines?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications for task assignments', example: true })
  inAppTaskAssignments?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications for mentions', example: true })
  inAppMentions?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications for task deadlines', example: true })
  inAppTaskDeadlines?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications for task updates', example: true })
  inAppTaskUpdates?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications for calendar events', example: true })
  inAppCalendarEvents?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications when a member joins', example: true })
  inAppMemberJoined?: boolean;

  @ApiPropertyOptional({ description: 'In-app notifications for direct messages', example: true })
  inAppDirectMessages?: boolean;
}
