import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { ExecutionContext, Injectable, Logger, Inject } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit.service';
import { AuditEventType } from '@prisma/client';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  @Inject(AuditLogService)
  private readonly auditLogService: AuditLogService;

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.userId;
    if (userId) {
      return userId.toString();
    }
    
    // Fall back to IP for unauthenticated requests
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return ip;
  }

  protected async throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: any): Promise<void> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId || 'unauthenticated';
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    const endpoint = `${req.method} ${req.url}`;
    
    Logger.warn(
      `[RateLimit] VIOLATION | userId: ${userId} | ip: ${ip} | endpoint: ${endpoint} | timestamp: ${new Date().toISOString()}`,
      'RateLimiter'
    );
    
    if (endpoint === 'POST /auth/login') {
      const targetEmail = req.body?.email || undefined;
      await this.auditLogService.log({
        event: AuditEventType.BRUTE_FORCE_DETECTED,
        actorId: undefined,
        actorEmail: targetEmail,
        ipAddress: ip,
        metadata: { endpoint },
      });
    } else {
      await this.auditLogService.log({
        event: AuditEventType.RATE_LIMIT_VIOLATION,
        actorId: req.user?.userId || undefined,
        actorEmail: req.user?.email || undefined,
        ipAddress: ip,
        metadata: { endpoint },
      });
    }

    // Attach details to request so the Exception Filter can read them
    req.throttlerLimitDetail = throttlerLimitDetail;
    throw new ThrottlerException('Too Many Requests');
  }
}
