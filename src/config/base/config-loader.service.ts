import { Logger } from '@nestjs/common';
import { ConfigEncryptor } from './config-encryptor';

export interface ConfigLoaderOptions {
    enableCache?: boolean;
    cacheExpiry?: number;
}

interface ConfigNode {
    '@import'?: string[];
    '@merge'?: Record<string, MergeConfig>;
    [key: string]: any;
}

/**
 * 数组/对象合并策略配置
 */
export interface MergeConfig {
    /**
     * 合并模式：
     * - replace: 完全替换（默认）
     * - merge: 按索引/键值合并（保留未指定字段）
     * - append: 追加到数组末尾
     * - patch: 按指定键匹配合并（需配合 arrayMergeBy）
     * - shallow: 浅合并对象（仅第一层）
     */
    mode?: 'replace' | 'merge' | 'append' | 'patch' | 'shallow';

    /**
     * 数组合并时的匹配键（仅 patch 模式有效）
     * 例如：'id', 'channelId' 等
     */
    arrayMergeBy?: string;
}

/**
 * 配置加载服务
 * 负责处理配置继承、合并和解密
 *
 * 核心功能：
 * 1. 处理 @import 语法，从公共配置导入节点
 * 2. 支持 @merge 自定义合并策略（支持数组按索引/键值合并）
 * 3. 支持点路径语法（a.b.c）简化嵌套配置
 * 4. 按需解密加密配置节点
 * 5. 深度合并配置（同名替换，新key添加）
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
                result = this.deepMergeWithStrategy(result, importedNode, nodeConfig['@merge']);

                this.logger.debug(`Imported and merged node: ${importRef}`);
            }
        }

        // 2. 提取业务配置（排除 @import 和 @merge）
        const { '@import': _, '@merge': mergeConfig, ...businessConfig } = nodeConfig;

        // 3. 展开点路径（options.client.clientId）
        const expandedConfig = this.expandDotPaths(businessConfig);

        // 4. 合并业务配置（支持自定义合并策略）
        result = this.deepMergeWithStrategy(result, expandedConfig, mergeConfig);

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
     * 深度合并（简单规则）- 保持向后兼容
     * - 同名字段：替换
     * - 不存在的key：添加
     * - 对象：递归合并
     * - 数组：完全替换
     */
    private deepMerge(target: any, source: any): any {
        return this.deepMergeWithStrategy(target, source, undefined, '');
    }

    /**
     * 带策略的深度合并（支持 @merge 配置）
     * @param target 目标对象
     * @param source 源对象
     * @param mergeConfig 合并配置（路径 -> 策略）
     * @param currentPath 当前路径（用于匹配策略）
     */
    private deepMergeWithStrategy(
        target: any,
        source: any,
        mergeConfig?: Record<string, MergeConfig>,
        currentPath: string = '',
    ): any {
        // 如果 source 不是对象或为 null，直接返回（替换）
        if (source === null || typeof source !== 'object') {
            return source;
        }

        // 如果 target 不是对象，用 source 初始化
        if (target === null || typeof target !== 'object') {
            return Array.isArray(source) ? [...source] : { ...source };
        }

        // 检查当前路径是否有自定义合并策略
        const strategy = mergeConfig?.[currentPath];

        // 数组处理
        if (Array.isArray(source)) {
            // 如果 target 不是数组，直接替换
            if (!Array.isArray(target)) {
                return [...source];
            }

            // 根据策略处理数组
            switch (strategy?.mode) {
                case 'merge':
                    // 按索引合并，保留未指定的字段
                    return this.mergeArrayByIndex(target, source, mergeConfig, currentPath);

                case 'append':
                    // 追加到末尾
                    return [...target, ...source];

                case 'patch':
                    // 按 key 字段匹配并合并
                    if (!strategy.arrayMergeBy) {
                        this.logger.warn(
                            `patch mode requires arrayMergeBy for path: ${currentPath}, fallback to replace`,
                        );
                        return [...source];
                    }
                    return this.patchArrayByKey(target, source, strategy.arrayMergeBy, mergeConfig, currentPath);

                case 'replace':
                default:
                    // 默认：完全替换（保持向后兼容）
                    return [...source];
            }
        }

        // 对象处理
        const result = { ...target };

        // 检查是否使用浅合并（只合并第一层）
        const useShallowMerge = strategy?.mode === 'shallow';

        for (const key in source) {
            if (!source.hasOwnProperty(key)) continue;

            const newPath = currentPath ? `${currentPath}.${key}` : key;

            if (useShallowMerge) {
                // 浅合并：直接替换属性值
                result[key] = source[key];
            } else if (key in result) {
                // 递归合并已存在的 key
                result[key] = this.deepMergeWithStrategy(result[key], source[key], mergeConfig, newPath);
            } else {
                // 新 key 直接赋值
                result[key] = source[key];
            }
        }

        return result;
    }

    /**
     * 按索引合并数组（merge 模式）
     * 只合并 source 中指定的字段，保留 target 中的其他字段
     */
    private mergeArrayByIndex(
        target: any[],
        source: any[],
        mergeConfig?: Record<string, MergeConfig>,
        currentPath?: string,
    ): any[] {
        const result = [...target];

        for (let i = 0; i < source.length; i++) {
            const sourceItem = source[i];
            const indexPath = `${currentPath}[${i}]`;

            if (i < result.length) {
                // 合并现有元素
                result[i] = this.deepMergeWithStrategy(result[i], sourceItem, mergeConfig, indexPath);
            } else {
                // 超出原数组长度，直接添加
                result.push(sourceItem);
            }
        }

        return result;
    }

    /**
     * 按 key 字段匹配并合并数组（patch 模式）
     * 在 target 中查找具有相同 key 值的元素并合并
     */
    private patchArrayByKey(
        target: any[],
        source: any[],
        keyField: string,
        mergeConfig?: Record<string, MergeConfig>,
        currentPath?: string,
    ): any[] {
        const result = [...target];

        for (const sourceItem of source) {
            // 必须是对象且包含 key 字段
            if (typeof sourceItem !== 'object' || sourceItem === null || !(keyField in sourceItem)) {
                this.logger.warn(`Source item missing key field '${keyField}' in path: ${currentPath}`);
                continue;
            }

            const keyValue = sourceItem[keyField];

            // 在 target 中查找匹配的元素
            const targetIndex = result.findIndex(
                (item) => typeof item === 'object' && item !== null && item[keyField] === keyValue,
            );

            if (targetIndex >= 0) {
                // 找到匹配项，深度合并
                const indexPath = `${currentPath}[${targetIndex}]`;
                result[targetIndex] = this.deepMergeWithStrategy(
                    result[targetIndex],
                    sourceItem,
                    mergeConfig,
                    indexPath,
                );
            } else {
                // 未找到匹配项，添加到末尾
                result.push(sourceItem);
            }
        }

        return result;
    }

    /**
     * 生成缓存 key
     */
    private getCacheKey(nodeName: string, nodeConfig: ConfigNode): string {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(JSON.stringify(nodeConfig)).digest('hex').substring(0, 8);
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
