import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePersonalBlockDto {
  @ApiProperty({ description: 'Title of the personal block', example: 'Dentist Appointment' })
  title!: string;

  @ApiProperty({ description: 'Start date/time (ISO format)', example: '2023-10-15T14:00:00Z' })
  startDatetime!: string;

  @ApiProperty({ description: 'End date/time (ISO format)', example: '2023-10-15T15:00:00Z' })
  endDatetime!: string;

  @ApiPropertyOptional({ description: 'Is it an all-day event?', example: false })
  isAllDay?: boolean;

  @ApiPropertyOptional({ description: 'Recurrence rule string', example: 'FREQ=WEEKLY;INTERVAL=1' })
  recurrence?: string;
}

export class UpdatePersonalBlockDto {
  @ApiPropertyOptional({ description: 'Title of the personal block', example: 'Dentist Appointment Rescheduled' })
  title?: string;

  @ApiPropertyOptional({ description: 'Start date/time (ISO format)', example: '2023-10-15T15:00:00Z' })
  startDatetime?: string;

  @ApiPropertyOptional({ description: 'End date/time (ISO format)', example: '2023-10-15T16:00:00Z' })
  endDatetime?: string;

  @ApiPropertyOptional({ description: 'Is it an all-day event?', example: false })
  isAllDay?: boolean;

  @ApiPropertyOptional({ description: 'Recurrence rule string', example: 'FREQ=WEEKLY;INTERVAL=1' })
  recurrence?: string;
}

export class CheckConflictsDto {
  @ApiProperty({ description: 'List of participant user IDs', example: ['uuid-1', 'uuid-2'] })
  participants!: string[];

  @ApiProperty({ description: 'Proposed start date/time (ISO format)', example: '2023-10-15T14:00:00Z' })
  startDatetime!: string;

  @ApiProperty({ description: 'Proposed end date/time (ISO format)', example: '2023-10-15T15:00:00Z' })
  endDatetime!: string;
}

export class CreateMeetingDto {
  @ApiProperty({ description: 'Title of the meeting', example: 'Weekly Sync' })
  title!: string;

  @ApiPropertyOptional({ description: 'Meeting description/agenda', example: 'Discussing project updates.' })
  description?: string;

  @ApiProperty({ description: 'Start date/time (ISO format)', example: '2023-10-15T14:00:00Z' })
  startDatetime!: string;

  @ApiProperty({ description: 'End date/time (ISO format)', example: '2023-10-15T15:00:00Z' })
  endDatetime!: string;

  @ApiProperty({ description: 'List of participant user IDs', example: ['uuid-1', 'uuid-2'] })
  participantIds!: string[];
}

export class RespondToMeetingDto {
  @ApiProperty({ description: 'Response to the meeting request', example: 'Accepted', enum: ['Accepted', 'Declined'] })
  response!: 'Accepted' | 'Declined';
}

export class UpdateMeetingDto {
  @ApiProperty({ description: 'New start date/time (ISO format)', example: '2023-10-15T15:00:00Z' })
  startDatetime!: string;

  @ApiProperty({ description: 'New end date/time (ISO format)', example: '2023-10-15T16:00:00Z' })
  endDatetime!: string;
}
