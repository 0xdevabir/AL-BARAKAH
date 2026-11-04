import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger, type PipeTransform } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

/** Errors the UI can act on: `code` is stable for clients, `message` is shown to people. */
export class AppError extends HttpException {
  constructor(status: number, readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(message, status);
  }
}
export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const forbidden = (message = 'You do not have access to this') => new AppError(403, 'FORBIDDEN', message);
export const unauthorized = (message = 'Please sign in') => new AppError(401, 'UNAUTHORIZED', message);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Something went wrong. Please try again.';
    let fields: Record<string, string> | undefined;

    if (err instanceof AppError) {
      status = err.getStatus();
      code = err.code;
      message = err.message;
      fields = err.fields;
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      code = status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
      message = err.message;
    } else if (typeof err === 'object' && err && (err as { statusCode?: number }).statusCode === 429) {
      status = 429;
      code = 'RATE_LIMITED';
      message = 'Too many requests. Please wait a moment.';
    } else {
      // Unknown errors are logged in full but never sent to the client.
      this.log.error({ requestId: req.id, url: req.url, err });
    }
    void reply.status(status).send({ code, message, fields, requestId: req.id });
  }
}

export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    const first = parsed.error.issues[0]?.message ?? 'Invalid input';
    throw new AppError(400, 'VALIDATION', first, fields);
  }
}
