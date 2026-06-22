import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEventType } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AuditLog');

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway
  ) {}

  async log(payload: {
    workspaceId?: string;
    actorId?: string;
    actorEmail?: string;
    actorRole?: string;
    event: AuditEventType;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      // Prisma requires metadata to be cast as any or properly formatted for Json, standard objects work well
      await this.prisma.auditLog.create({
        data: {
          workspaceId: payload.workspaceId,
          actorId: payload.actorId,
          actorEmail: payload.actorEmail,
          actorRole: payload.actorRole,
          event: payload.event,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          resourceName: payload.resourceName,
          metadata: payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : null,
          ipAddress: payload.ipAddress,
        },
      });

      if (payload.workspaceId) {
        this.realtimeGateway.server.to(`workspace:${payload.workspaceId}`).emit('audit:new_log');
      }
    } catch (error) {
      // Never throw on audit log write failure
      this.logger.error(`Failed to write audit log entry: ${error.message}`, error.stack);
    }
  }
}
