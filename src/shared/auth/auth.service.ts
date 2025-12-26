import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { NacosManager } from '../../config/base/nacos.manager';
import { BaseConfigService } from '../../config/base/baseconfig.service';
import { firstValueFrom } from 'rxjs';

export interface AuthValidationResult {
    code: number;
    data?: any;
    message?: string;
}

export interface AuthServiceConfig {
    /**
     * Auth service URL or Nacos service name
     * - Direct URL: http://xxx or https://xxx
     * - Nacos service name: will be resolved by NacosManager
     */
    authService: string;
}

/**
 * 通用认证服务
 * 提供基于 HTTP 的 token 验证功能
 *
 * 使用方式：
 * 1. 在你的服务中继承 BaseConfigService 并实现 server.authService 配置
 * 2. 导入 AuthModule
 * 3. 注入 AuthService 使用
 *
 * @example
 * ```typescript
 * import { AuthModule } from '@dragon/common';
 *
 * @Module({
 *   imports: [AuthModule],
 * })
 * export class YourModule {}
 * ```
 */
@Injectable()
export class AuthService {
    protected readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: BaseConfigService,
    ) {}

    /**
     * 获取 auth 服务 URL
     * 支持直接配置 HTTP URL 或 Nacos 服务名
     */
    private async getAuthServiceUrl(): Promise<string> {
        const authService = this.configService.getServerConfig()?.services?.auth;

        if (!authService) {
            throw new Error('auth service is not configured in server.services.auth');
        }

        if (authService.startsWith('http://') || authService.startsWith('https://')) {
            return authService;
        } else {
            const nacosUrl = await NacosManager.Instance.findServerByName(authService);
            return `http://${nacosUrl}`;
        }
    }

    /**
     * 验证 token 有效性
     * 通过 HTTP POST 调用 auth 服务验证
     *
     * @param accessToken - JWT token (格式: header.payload.signature)
     * @returns AuthValidationResult - 验证结果
     *
     * JWT Payload 格式：
     * ```json
     * {
     *   "uid": "用户ID",
     *   "token": "实际的认证token"
     * }
     * ```
     *
     * Auth Service Request:
     * ```json
     * {
     *   "messageType": "user.check",
     *   "messageBody": {
     *     "uid": "用户ID",
     *     "token": "实际的认证token"
     *   }
     * }
     * ```
     *
     * @example
     * ```typescript
     * const result = await this.authService.validate(token);
     * if (result.code === 0) {
     *   // Token valid, use result.data
     * } else {
     *   // Token invalid
     * }
     * ```
     */
    async validate(accessToken: string): Promise<AuthValidationResult> {
        try {
            const authServiceUrl = await this.getAuthServiceUrl();

            // 解析 JWT token 获取 payload
            const parts = accessToken.split('.');
            if (parts.length !== 3) {
                this.logger.error(`Invalid JWT token format`);
                return {
                    code: 107,
                    message: 'Invalid token format',
                };
            }

            const payloadBase64 = parts[1];
            const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
            const payload = JSON.parse(payloadJson);

            const actualToken = payload.token;
            const uid = payload.uid;

            if (!actualToken || !uid) {
                this.logger.error(`Missing token or uid in JWT payload`);
                return {
                    code: 107,
                    message: 'Invalid payload',
                };
            }

            const requestBody = {
                messageType: 'user.check',
                messageBody: {
                    uid,
                    token: actualToken,
                },
            };

            const requestUrl = `${authServiceUrl}/kh/msg.auth`;
            this.logger.debug(`Validating token for uid: ${uid}, URL: ${requestUrl}`);

            const response = await firstValueFrom(
                this.httpService.post(requestUrl, requestBody, {
                    timeout: 5000,
                }),
            );

            const responseData = (response as any).data;
            const result = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;

            this.logger.debug(`Auth validation result: ${JSON.stringify(result)}`);

            // 合并 payload 到返回结果
            if (result.code === 0) {
                result.data = { ...result.data, ...payload };
            }

            return result;
        } catch (error) {
            this.logger.error(`Token validation failed: ${error.message}`);
            return {
                code: -1,
                message: `Auth service error: ${error.message}`,
            };
        }
    }
}
