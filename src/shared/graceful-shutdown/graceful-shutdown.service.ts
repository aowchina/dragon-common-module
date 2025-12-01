import { Logger, INestApplication } from '@nestjs/common';

export class GracefulShutdownService {
    private static isShuttingDown = false;

    /**
     * Setup graceful shutdown for the application
     * @param app - The NestJS application instance
     * @param timeoutMs - Shutdown timeout in milliseconds (default: 10000ms)
     * @param logger - Optional custom logger
     */
    static setup(
        app: INestApplication,
        timeoutMs: number = 10000,
        logger?: Logger,
    ): void {
        const log = logger || new Logger('GracefulShutdown');

        const shutdown = async (signal: string) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            log.log(`🛑 Received ${signal} signal, starting graceful shutdown...`);

            const forceShutdownTimer = setTimeout(() => {
                log.error('⚠️ Graceful shutdown timeout, forcing exit');
                process.exit(1);
            }, timeoutMs);

            try {
                await app.close();
                clearTimeout(forceShutdownTimer);
                log.log('✅ Application closed successfully');
                process.exit(0);
            } catch (error) {
                log.error('❌ Error during shutdown:', error);
                clearTimeout(forceShutdownTimer);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
}
