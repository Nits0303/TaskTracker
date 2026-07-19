import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';

/**
 * Smoke test. The CLI-scaffolded version registered only the controller, so
 * Nest tried to construct its route guards for real - CustomThrottlerGuard needs
 * THROTTLER:MODULE_OPTIONS, which no test module provided. Stubbing AuthService
 * and overriding both guards keeps this a wiring check rather than dragging in
 * ThrottlerModule and Redis.
 */
describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
