import { ExceptionFilter, Catch, HttpException, ArgumentsHost } from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const exceptionResponse: any = exception.getResponse();
        const status = exceptionResponse?.status || exceptionResponse?.code || exception.getStatus();

        const responseBody = {
            code: status,
            message: exceptionResponse?.message || exception.message,
            timestamp: new Date().toISOString(),
            path: request.url,
        };

        const statusCode = status < 200 ? 200 : status;

        // 兼容 Express 和 Fastify
        // 先检测 Fastify (有 code 方法)，因为 Fastify 也有 status 方法
        if (typeof response.code === 'function' && typeof response.send === 'function') {
            // Fastify
            response.code(statusCode).send(responseBody);
        } else if (typeof response.status === 'function' && typeof response.json === 'function') {
            // Express
            response.status(statusCode).json(responseBody);
        } else {
            // Fallback
            response.status(statusCode).send(responseBody);
        }
    }
}
