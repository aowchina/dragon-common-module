import { Logger } from '@nestjs/common';
import { ConfigEncryptor } from './config-encryptor';

export interface ConfigLoaderOptions {
    enableCache?: boolean;
    cacheExpiry?: number;
}

interface ConfigNode {
    '@import'?: string[];
    [key: string]: any;
}

/**
 * 配置加载服务
 * 负责处理配置继承、合并和解密
 *
 * 核心功能：
 * 1. 处理 @import 语法，从公共配置导入节点
 * 2. 支持点路径语法（a.b.c）简化嵌套配置
 * 3. 按需解密加密配置节点
 * 4. 深度合并配置（同名替换，新key添加）
 */
export class ConfigLoaderService {
    private logger = new Logger(ConfigLoaderService.name);
    private commonConfig: Record<string, any> = {};
    private configCache: Map<string, any> = new Map();
    private encryptor?: ConfigEncryptor; // 延迟初始化

    constructor(private options: ConfigLoaderOptions = {}) {
        // 不在构造函数中初始化加密器，等遇到加密配置时再初始化
    }

    /**
     * 设置公共配置（由 NacosManager 调用）
     * @param config 公共配置对象
     */
    setCommonConfig(config: Record<string, any>): void {
        if (!config) {
            this.logger.warn('Setting empty common config');
            this.commonConfig = {};
            return;
        }

        this.commonConfig = config;
        this.logger.log(`Common config set with ${Object.keys(config).length} nodes`);

        // 清除缓存（公共配置更新后）
        if (this.configCache.size > 0) {
            this.logger.log('Clearing config cache due to common config update');
            this.configCache.clear();
        }
    }

    /**
     * 解析配置（同步方法）
     * 前提：commonConfig 已通过 setCommonConfig 设置
     *
     * 唯一特殊关键字：@import
     * 合并规则：同名替换，新key添加，对象递归合并，数组完全替换
     *
     * @param serviceConfig 服务配置对象
     * @returns 解析后的完整配置
     */
    parseConfig(serviceConfig: any): any {
        if (!serviceConfig) {
            this.logger.warn('Service config is null or undefined');
            return {};
        }

        if (Object.keys(this.commonConfig).length === 0) {
            this.logger.warn('Common config not set, using service config as-is');
            return serviceConfig;
        }

        const result: any = {};

        for (const [nodeName, nodeConfig] of Object.entries(serviceConfig)) {
            if (nodeConfig && typeof nodeConfig === 'object' && nodeConfig['@import']) {
                // 有 @import：处理导入和合并
                result[nodeName] = this.processNode(nodeName, nodeConfig as ConfigNode);
            } else {
                // 无 @import：直接保留
                result[nodeName] = nodeConfig;
            }
        }

        return result;
    }

    /**
     * 处理单个节点的导入和合并
     */
    private processNode(nodeName: string, nodeConfig: ConfigNode): any {
        // 检查缓存
        const cacheKey = this.getCacheKey(nodeName, nodeConfig);
        if (this.options.enableCache && this.configCache.has(cacheKey)) {
            this.logger.debug(`Using cached config for node: ${nodeName}`);
            return this.configCache.get(cacheKey);
        }

        let result: any = {};

        // 1. 处理 @import（唯一的特殊关键字）
        if (nodeConfig['@import'] && Array.isArray(nodeConfig['@import'])) {
            for (const importRef of nodeConfig['@import']) {
                if (!importRef.startsWith('@')) {
                    this.logger.warn(`Import ref must start with @: ${importRef}`);
                    continue;
                }

                const refName = importRef.substring(1); // 去掉 @ 前缀

                if (!this.commonConfig[refName]) {
                    this.logger.warn(`Import not found in common config: ${importRef}`);
                    continue;
                }

                let importedNode = this.commonConfig[refName];

                // 🔑 按需解密（只解密用到的节点）
                importedNode = this.decryptNode(importedNode);

                // 按顺序合并（后面覆盖前面）
                result = this.deepMerge(result, importedNode);

                this.logger.debug(`Imported and merged node: ${importRef}`);
            }
        }

        // 2. 提取业务配置（排除 @import）
        const { '@import': _, ...businessConfig } = nodeConfig;

        // 3. 展开点路径（options.client.clientId）
        const expandedConfig = this.expandDotPaths(businessConfig);

        // 4. 合并业务配置（默认行为：同名替换，新key添加）
        result = this.deepMerge(result, expandedConfig);

        // 缓存结果
        if (this.options.enableCache) {
            this.configCache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * 解密配置节点（按需初始化加密器）
     * 只有遇到 $encrypt 标记时才会解密
     */
    private decryptNode(node: any): any {
        if (!node || typeof node !== 'object' || !node.$encrypt || !node.$data) {
            return node;
        }

        // 遇到加密节点时才初始化加密器
        if (!this.encryptor) {
            const secretKey = process.env.CONFIG_ENCRYPT_KEY;

            if (!secretKey) {
                this.logger.error('❌ CONFIG_ENCRYPT_KEY not found in environment');
                this.logger.error('Cannot decrypt config, using encrypted data as-is');
                return node;
            }

            this.logger.log('Initializing config encryptor...');
            this.encryptor = new ConfigEncryptor(secretKey);
        }

        try {
            const decrypted = this.encryptor.decrypt(node.$data);
            this.logger.log('✓ Config node decrypted successfully');
            return decrypted;
        } catch (error) {
            this.logger.error(`Failed to decrypt node: ${error.message}`);
            throw new Error(`Config decryption failed: ${error.message}`);
        }
    }

    /**
     * 处理点分隔路径
     * "options.client.clientId" -> { options: { client: { clientId: value } } }
     */
    private expandDotPaths(config: any): any {
        const expanded: any = {};

        for (const [key, value] of Object.entries(config)) {
            if (key.includes('.')) {
                // 点分隔路径
                const parts = key.split('.');
                let current = expanded;

                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }

                current[parts[parts.length - 1]] = value;
            } else {
                expanded[key] = value;
            }
        }

        return expanded;
    }

    /**
     * 深度合并（简单规则）
     * - 同名字段：替换
     * - 不存在的key：添加
     * - 对象：递归合并
     * - 数组：完全替换
     */
    private deepMerge(target: any, source: any): any {
        if (!source || typeof source !== 'object') {
            return source;
        }

        if (Array.isArray(source)) {
            return [...source];
        }

        const result = { ...target };

        for (const [key, value] of Object.entries(source)) {
            if (value === undefined) {
                continue;
            }

            if (Array.isArray(value)) {
                // 数组：完全替换
                result[key] = [...value];
            } else if (value !== null && typeof value === 'object') {
                // 对象：递归合并
                result[key] = this.deepMerge(result[key] || {}, value);
            } else {
                // 基本类型：直接替换
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * 生成缓存 key
     */
    private getCacheKey(nodeName: string, nodeConfig: ConfigNode): string {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5')
            .update(JSON.stringify(nodeConfig))
            .digest('hex')
            .substring(0, 8);
        return `${nodeName}:${hash}`;
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.configCache.clear();
        this.logger.log('Config cache cleared');
    }
}
