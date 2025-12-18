import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';

/**
 * 全局认证模块
 * 提供通用的 token 验证功能
 * 
 * 使用说明：
 * 1. 在你的根模块中导入 AuthModule
 * 2. 确保你的 ConfigService 中配置了 server.authService
 * 3. 在任何服务中注入 AuthService 即可使用
 * 
 * @example
 * ```typescript
 * // app.module.ts
 * import { AuthModule } from '@dragon/common';
 * 
 * @Module({
 *   imports: [
 *     ConfigModule,
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
 */
@Global()
@Module({
    imports: [HttpModule],
    providers: [AuthService],
    exports: [AuthService],
})
export class AuthModule {}
