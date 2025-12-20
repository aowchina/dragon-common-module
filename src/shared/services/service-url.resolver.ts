import { Injectable, Logger, Inject } from '@nestjs/common';
import { NacosManager } from '../../config/base/nacos.manager';
import { BaseConfigService } from '../../config/base/baseconfig.service';

/**
 * 服务 URL 解析器
 * 统一处理服务 URL 的获取，支持：
 * 1. 直接 HTTP/HTTPS URL
 * 2. Nacos 服务名（从注册中心获取实例）
 *
 * 注意：使用 @Inject(BaseConfigService) 来支持各应用的 ConfigService（继承自 BaseConfigService）
 */
@Injectable()
export class ServiceUrlResolver {
    private readonly logger = new Logger(ServiceUrlResolver.name);
    private urlCache = new Map<string, { url: string; timestamp: number }>();
    private readonly CACHE_TTL = 60000; // 缓存1分钟

    constructor(@Inject(BaseConfigService) private readonly configService: BaseConfigService) {}

    /**
     * 获取服务 URL
     * @param serviceName - 服务名（如 'user', 'data', 'activity' 等）
     * @returns 完整的服务 URL
     */
    async getServiceUrl(serviceName: string): Promise<string> {
        const services = this.configService.getServerConfig()?.services;

        if (!services) {
            throw new Error('server.services is not configured');
        }

        const serviceConfig = services[serviceName];

        if (!serviceConfig) {
            throw new Error(`Service '${serviceName}' is not configured in server.services`);
        }

        // 如果是直接的 HTTP/HTTPS URL，直接返回
        if (serviceConfig.startsWith('http://') || serviceConfig.startsWith('https://')) {
            return serviceConfig;
        }

        // 检查缓存
        const cached = this.urlCache.get(serviceName);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
            return cached.url;
        }

        // 从 Nacos 获取服务实例
        try {
            const nacosUrl = await NacosManager.Instance.findServerByName(serviceConfig);
            const fullUrl = `http://${nacosUrl}`;

            // 更新缓存
            this.urlCache.set(serviceName, {
                url: fullUrl,
                timestamp: Date.now()
            });

            return fullUrl;
        } catch (error) {
            this.logger.error(`Failed to resolve service '${serviceName}' (${serviceConfig}): ${error.message}`);
            throw new Error(`Failed to resolve service URL for '${serviceName}'`);
        }
    }

    /**
     * 清除指定服务的缓存
     */
    clearCache(serviceName?: string): void {
        if (serviceName) {
            this.urlCache.delete(serviceName);
        } else {
            this.urlCache.clear();
        }
    }
}
