import { DynamicModule, Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AdminService } from './admin.service';

/**
 * 通用管理后台认证模块
 * 提供 AdminService 用于验证管理后台 token
 *
 * 使用说明：
 * 1. 确保你的项目中已有全局 ConfigModule（提供 BaseConfigService 的实现）
 * 2. 在根模块中导入 AdminModule
 * 3. 在任何服务中注入 AdminService 即可使用
 *
 * @example
 * ```typescript
 * // app.module.ts
 * import { AdminModule } from '@dragon/common';
 *
 * @Global()
 * @Module({
 *   providers: [ConfigService], // ConfigService extends BaseConfigService
 *   exports: [ConfigService],
 * })
 * export class ConfigModule {}
 *
 * @Module({
 *   imports: [
 *     ConfigModule, // 必须在 AdminModule 之前导入
 *     AdminModule,
 *     // ... other modules
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example
 * ```typescript
 * // your.service.ts
 * import { AdminService } from '@dragon/common';
 *
 * @Injectable()
 * export class YourService {
 *   constructor(private readonly adminService: AdminService) {}
 *
 *   async validateAdminToken(token: string) {
 *     const result = await this.adminService.validate(token);
 *     if (result.code === 0) {
 *       return result.data;
 *     }
 *     throw new UnauthorizedException('Invalid admin token');
 *   }
 * }
 * ```
 *
 * 注意：
 * - AdminService 依赖 BaseConfigService（通常通过你的 ConfigService 提供）
 * - 确保 ConfigModule 是全局模块（@Global()）或在 AdminModule 所在模块中导入
 * - 需要配置 server.services.admin 指向 admin 服务地址或 Nacos 服务名
 */
@Global()
@Module({
    imports: [HttpModule],
    providers: [AdminService],
    exports: [AdminService],
})
export class AdminModule {
    /**
     * 动态模块配置（可选）
     * 如果你的 ConfigModule 不是全局模块，可以使用此方法显式导入
     *
     * @example
     * ```typescript
     * @Module({
     *   imports: [
     *     AdminModule.forRoot({
     *       imports: [ConfigModule],
     *     }),
     *   ],
     * })
     * export class AppModule {}
     * ```
     */
    static forRoot(options?: { imports?: any[] }): DynamicModule {
        return {
            module: AdminModule,
            global: true,
            imports: [HttpModule, ...(options?.imports || [])],
            providers: [AdminService],
            exports: [AdminService],
        };
    }
}
