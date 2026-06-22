import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<any>();

    if (request.throttlerLimitDetail?.timeToExpire) {
      response.setHeader('Retry-After', Math.ceil(request.throttlerLimitDetail.timeToExpire / 1000));
    }

    response.status(429).json({
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
      timestamp: new Date().toISOString()
    });
  }
}
