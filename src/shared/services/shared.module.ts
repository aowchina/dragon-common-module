import { Global, Module } from '@nestjs/common';
import { ServiceUrlResolver } from './service-url.resolver';
import { ConfigModule } from '../../config/config.module';

/**
 * Shared Module - 提供跨服务共享的工具和服务
 * @Global 装饰器使该模块的 providers 在整个应用中全局可用
 *
 * 依赖关系：
 * - ServiceUrlResolver 依赖 ConfigService（从 ConfigModule 导入）
 */
@Global()
@Module({
    imports: [ConfigModule],
    providers: [ServiceUrlResolver],
    exports: [ServiceUrlResolver],
})
export class SharedModule {}
