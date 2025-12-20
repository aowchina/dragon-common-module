import { Global, Module } from '@nestjs/common';
import { ServiceUrlResolver } from './service-url.resolver';

/**
 * Shared Module - 提供跨服务共享的工具和服务
 * @Global 装饰器使该模块的 providers 在整个应用中全局可用
 *
 * 依赖关系：
 * - ServiceUrlResolver 使用 @Inject(BaseConfigService) 注入配置服务
 * - 各应用需要在自己的模块中提供 BaseConfigService 的 provider，映射到自己的 ConfigService
 *
 * 使用方式（在应用的 SharedModule 中）：
 * @Module({
 *   providers: [
 *     {
 *       provide: BaseConfigService,
 *       useExisting: ConfigService,  // 使用应用自己的 ConfigService
 *     }
 *   ]
 * })
 */
@Global()
@Module({
    providers: [ServiceUrlResolver],
    exports: [ServiceUrlResolver],
})
export class SharedModule {}
