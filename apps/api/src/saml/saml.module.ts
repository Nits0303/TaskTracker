import { Module } from '@nestjs/common';
import { SamlController } from './saml.controller';
import { SamlService } from './saml.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Sprint 18: Task Tracker as a SAML 2.0 Service Provider with JIT provisioning.
 *
 * PrismaModule and AuditModule are @Global, so only AuthModule needs importing
 * (for AuthService.generateTokens).
 */
@Module({
  imports: [AuthModule],
  controllers: [SamlController],
  providers: [SamlService],
  exports: [SamlService],
})
export class SamlModule {}
