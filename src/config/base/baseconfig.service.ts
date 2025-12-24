import { Logger } from '@nestjs/common';
import * as _ from 'lodash';
import { NacosConfig } from './config.interface';
import { BaseConfig } from './base.config';

/**
 * Server 配置接口
 * 定义 server 配置的基本结构
 * 只定义 AuthService 需要的最小接口
 */
export class BaseServerConfig extends BaseConfig {
    port: number;
    api?: {
        prefix?: string;
        allow_origins?: string[];
        [key: string]: any;
    };
    token?: {
        name?: string;
        secret?: string;
        expiresIn?: number;
        [key: string]: any;
    };
    services?: {
        auth?: string;
        tweet?: string;
        sport_bet?: string;
        payment?: string;
        wallet?: string;
        user?: string;
        data?: string;
        risk?: string;
        admin?: string;
        activity?: string;
        [key: string]: any;
    };
    [key: string]: any;
}

export abstract class BaseConfigService {
    logger = new Logger(BaseConfigService.name);
    protected readonly env: string;

    /**
     * Server 配置
     * 子类必须实现此属性以提供 server 配置访问
     */
    protected abstract server: BaseServerConfig;

    constructor(protected nacosConfigs?: NacosConfig) {
        if (process.env.NODE_ENV) {
            this.env = process.env.NODE_ENV;
        } else {
            this.env = 'development';
        }

        const confDefault = this.getDefaultConf();
        if (this.nacosConfigs) {
            _.merge(this.nacosConfigs, confDefault);
        } else {
            this.nacosConfigs = confDefault;
        }

        this.evalFunc(this.nacosConfigs);
    }

    get isDevelopment(): boolean {
        return this.env === 'development';
    }

    get isProduction(): boolean {
        return this.env === 'production';
    }

    getServiceConfig() {
        /* TODO document why this method 'getServiceConfig' is empty */
    }

    getServerConfig(): BaseServerConfig {
        return this.server;
    }

    getOneConfig(key: string) {
        if (this.nacosConfigs && this.nacosConfigs[key]) {
            return this.nacosConfigs[key];
        }
    }

    private getDefaultConf() {
        let confDefault = null;
        try {
            confDefault = require('../config.default.json');
        } catch (e) {
            if (e.message.search('Cannot find module') == 0) {
                this.logger.log('Local config.default.json not exist, try to nacos');
            } else {
                this.logger.log('Try to get local config.default.json failed', e);
            }
        }
        return confDefault;
    }

    // 执行配置文件里的动态函数
    private evalFunc(confg: NacosConfig) {
        this.loopObject(confg);
    }

    private loopObject(obj: NacosConfig) {
        for (const key in obj) {
            if (typeof obj[key] == 'object') {
                this.loopObject(obj[key]);
            } else if (typeof obj[key] == 'string') {
                obj[key] = this.evaluateTemplate(obj[key]);
            }
        }
    }

    /**
     * 安全的模板求值（替代 eval）
     * 支持的表达式：
     * - {{process.env.XXX}}
     * - {{process.env.XXX || 'default'}}
     * - {{env.XXX}}
     */
    private evaluateTemplate(value: string): string {
        const templateRegex = /\{\{(.*?)\}\}/g;
        return value.replace(templateRegex, (match, expression) => {
            return this.evaluateExpression(expression.trim());
        });
    }

    /**
     * 白名单表达式求值
     */
    private evaluateExpression(expr: string): string {
        // 支持 process.env.XXX
        const envMatch = expr.match(/^process\.env\.(\w+)$/);
        if (envMatch) {
            return process.env[envMatch[1]] || '';
        }

        // 支持 process.env.XXX || 'default'
        const envWithDefaultMatch = expr.match(/^process\.env\.(\w+)\s*\|\|\s*['"](.+?)['"]$/);
        if (envWithDefaultMatch) {
            return process.env[envWithDefaultMatch[1]] || envWithDefaultMatch[2];
        }

        // 支持环境变量简写 {{env.XXX}}
        const envShortMatch = expr.match(/^env\.(\w+)$/);
        if (envShortMatch) {
            return process.env[envShortMatch[1]] || '';
        }

        // 支持 Math.random() 生成随机字符串
        const randomMatch = expr.match(/^Math\.random\(\)\.toString\((\d+)\)\.substring\((\d+)\)$/);
        if (randomMatch) {
            return Math.random().toString(parseInt(randomMatch[1])).substring(parseInt(randomMatch[2]));
        }

        // __dirname 表达式：保持原样，由服务代码在运行时处理
        // 因为 __dirname 需要在服务上下文中求值，而不是在 dragon-common-module 中
        if (expr.includes('__dirname')) {
            // 静默处理，不输出警告（这是预期行为）
            return `{{${expr}}}`;
        }

        // 不支持的表达式，保持原样并警告
        this.logger.warn(`Unsupported template expression: ${expr}`);
        return `{{${expr}}}`;
    }
}
