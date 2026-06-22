import { Module, Global } from '@nestjs/common';
import { AuditLogService } from './audit.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  providers: [AuditLogService],
  controllers: [AuditController],
  exports: [AuditLogService],
})
export class AuditModule {}
