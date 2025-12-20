import { Global, Module } from '@nestjs/common';
import { ServiceUrlResolver } from './service-url.resolver';

/**
 * Shared Module - 提供跨服务共享的工具和服务
 * @Global 装饰器使该模块的 providers 在整个应用中全局可用
 *
 * 依赖关系：
 * - ServiceUrlResolver 依赖 ConfigService
 * - 各应用需要自己提供 ConfigModule（提供 ConfigService）
 * 
 * 重要：此模块不导入 ConfigModule，避免与各应用自己的 ConfigModule 冲突
 * 各应用的 AppModule 需要确保同时导入 ConfigModule 和 SharedModule
 */
@Global()
@Module({
    providers: [ServiceUrlResolver],
    exports: [ServiceUrlResolver],
})
export class SharedModule {}
