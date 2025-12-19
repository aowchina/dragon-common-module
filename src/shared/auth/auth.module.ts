import { DynamicModule, Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';

/**
 * 全局认证模块
 * 提供通用的 token 验证功能
 *
 * 使用说明：
 * 1. 确保你的项目中已有全局 ConfigModule（提供 BaseConfigService 的实现）
 * 2. 在根模块中导入 AuthModule
 * 3. 在任何服务中注入 AuthService 即可使用
 *
 * @example
 * ```typescript
 * // app.module.ts
 * import { AuthModule } from '@dragon/common';
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
 *     ConfigModule, // 必须在 AuthModule 之前导入
 *     AuthModule,
 *     // ... other modules
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example
 * ```typescript
 * // your.service.ts
 * import { AuthService } from '@dragon/common';
 *
 * @Injectable()
 * export class YourService {
 *   constructor(private readonly authService: AuthService) {}
 *
 *   async validateToken(token: string) {
 *     const result = await this.authService.validate(token);
 *     if (result.code === 0) {
 *       return result.data;
 *     }
 *     throw new UnauthorizedException('Invalid token');
 *   }
 * }
 * ```
 *
 * 注意：
 * - AuthService 依赖 BaseConfigService（通常通过你的 ConfigService 提供）
 * - 确保 ConfigModule 是全局模块（@Global()）或在 AuthModule 所在模块中导入
 */
@Global()
@Module({
    imports: [HttpModule],
    providers: [AuthService],
    exports: [AuthService],
})
export class AuthModule {
    /**
     * 动态模块配置（可选）
     * 如果你的 ConfigModule 不是全局模块，可以使用此方法显式导入
     *
     * @example
     * ```typescript
     * @Module({
     *   imports: [
     *     AuthModule.forRoot({
     *       imports: [ConfigModule],
     *     }),
     *   ],
     * })
     * export class AppModule {}
     * ```
     */
    static forRoot(options?: { imports?: any[] }): DynamicModule {
        return {
            module: AuthModule,
            global: true,
            imports: [HttpModule, ...(options?.imports || [])],
            providers: [AuthService],
            exports: [AuthService],
        };
    }
}
