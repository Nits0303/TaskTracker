import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    // We only care about formatting HTTP responses.
    if (!response || typeof response.status !== 'function') {
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    let errors: any = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        errors = (exceptionResponse as any).errors;
      }
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        // Specifically handle nested 'message' properties typically used by class-validator or manual throw
        const resObj = exceptionResponse as any;
        if (resObj.message) {
          message = Array.isArray(resObj.message) ? resObj.message.join(', ') : resObj.message;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Prisma error code P2025: Record not found
      if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
      }
      // Prisma error code P2002: Unique constraint violation
      else if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        const target = (exception.meta?.target as string[]) || [];
        message = `Conflict error: Unique constraint failed on field(s) - ${target.join(', ')}`;
      } else {
        // Log other Prisma errors as unknown
        this.logger.error(`Prisma Error: ${exception.message}`, exception.stack);
      }
    } else {
      // Unknown Error
      this.logger.error(`Unhandled Exception: ${exception instanceof Error ? exception.message : JSON.stringify(exception)}`, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
