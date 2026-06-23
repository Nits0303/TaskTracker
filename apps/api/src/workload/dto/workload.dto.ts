import { ApiProperty } from '@nestjs/swagger';

export class ToggleLeaveStatusDto {
  @ApiProperty({ description: 'Set whether the user is on leave or not', example: true })
  onLeave!: boolean;
}
