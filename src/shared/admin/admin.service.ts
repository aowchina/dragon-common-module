import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { NacosManager } from '../../config/base/nacos.manager';
import { BaseConfigService } from '../../config/base/baseconfig.service';
import { firstValueFrom } from 'rxjs';

export interface AdminValidationResult {
    code: number;
    data?: any;
    message?: string;
}

export interface AdminServiceConfig {
    /**
     * Admin service URL or Nacos service name
     * - Direct URL: http://xxx or https://xxx
     * - Nacos service name: will be resolved by NacosManager
     */
    adminService: string;
}

/**
 * 通用管理后台认证服务
 * 提供基于 HTTP 的 admin token 验证功能
 *
 * 使用方式：
 * 1. 在你的服务中继承 BaseConfigService 并实现 server.services.admin 配置
 * 2. 导入 AdminModule
 * 3. 注入 AdminService 使用
 *
 * @example
 * ```typescript
 * import { AdminModule } from '@dragon/common';
 *
 * @Module({
 *   imports: [AdminModule],
 * })
 * export class YourModule {}
 * ```
 */
@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: BaseConfigService,
    ) {}

    /**
     * 获取 admin 服务 URL
     * 支持直接配置 HTTP URL 或 Nacos 服务名
     */
    private async getAdminServiceUrl(): Promise<string> {
        const adminService = this.configService.getServerConfig()?.services?.admin;

        if (!adminService) {
            throw new Error('admin service is not configured in server.services.admin');
        }

        if (adminService.startsWith('http://') || adminService.startsWith('https://')) {
            return adminService;
        } else {
            const nacosUrl = await NacosManager.Instance.findServerByName(adminService);
            return `http://${nacosUrl}`;
        }
    }

    /**
     * 验证管理后台 token 有效性
     * 通过 HTTP POST 调用 admin 服务的 /api/v1/validateToken 接口
     *
     * @param token - JWT token
     * @returns AdminValidationResult - 验证结果
     *
     * Admin Service Response Format:
     * - Success: `{ code: 200, data: authUser, msg: 'success' }`
     * - Error: `{ code: 1101, msg: '登录无效或无权限访问', data: null }`
     *
     * @example
     * ```typescript
     * const result = await this.adminService.validate(token);
     * if (result.code === 0) {
     *   // Token valid, use result.data
     * } else {
     *   // Token invalid
     * }
     * ```
     */
    async validate(token: string): Promise<AdminValidationResult> {
        try {
            const adminServiceUrl = await this.getAdminServiceUrl();
            const validateUrl = `${adminServiceUrl}/api/v1/validateToken`;

            this.logger.debug(`Validating admin token at: ${validateUrl}`);

            const response = await firstValueFrom(
                this.httpService.post(
                    validateUrl,
                    { token },
                    {
                        timeout: 5000,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    },
                ),
            );

            const responseData = response.data;

            // admin 服务返回格式: { code: 200, data: authUser, msg: 'success' }
            if (responseData && responseData.code === 200) {
                this.logger.debug(`Admin token validation successful`);
                return {
                    code: 0,
                    data: responseData.data, // 提取 data 字段中的 authUser
                };
            }

            // 如果 code 不是 200，说明验证失败
            this.logger.warn(
                `Admin token validation failed: code=${responseData?.code}, msg=${responseData?.msg}`,
            );
            return {
                code: responseData?.code || -1,
                message: responseData?.msg || 'Invalid response from admin service',
            };
        } catch (error) {
            this.logger.error(`Admin token validation error: ${error.message}`);

            // 如果是 axios 错误且有响应，提取错误信息
            if (error.response?.data) {
                const errorData = error.response.data;
                return {
                    code: errorData.code || error.response.status,
                    message: errorData.msg || 'Token validation failed',
                };
            }

            return {
                code: -1,
                message: error.message || 'Unknown error',
            };
        }
    }
}
