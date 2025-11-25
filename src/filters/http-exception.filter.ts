import { ExceptionFilter, Catch, HttpException, ArgumentsHost } from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const exceptionResponse: any = exception.getResponse();
        const status = exceptionResponse?.status || exceptionResponse?.code || exception.getStatus();

        response.status(status < 200 ? 200 : status).json({
            code: status,
            message: exceptionResponse?.message || exception.message,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
