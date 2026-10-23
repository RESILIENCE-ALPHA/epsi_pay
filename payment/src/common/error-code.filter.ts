import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';

const ERROR_CODE = /^[A-Z][A-Z0-9_]+$/;

// Les services lèvent new XxxException('CODE') ; le front lit le code dans `error` ({ error, message }).
// Nest le place dans `message` et met le libellé HTTP dans `error` : on remet le code dans `error`.
@Catch(HttpException)
export class ErrorCodeFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const payload =
      typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' &&
      ERROR_CODE.test((body as { message: string }).message)
        ? { ...body, error: (body as { message: string }).message }
        : body;
    host.switchToHttp().getResponse<Response>().status(status).json(payload);
  }
}
