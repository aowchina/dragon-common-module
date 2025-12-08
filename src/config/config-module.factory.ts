import { Logger, Type } from '@nestjs/common';
import { NacosManager } from './base/nacos.manager';
import { BaseConfigService } from './base/baseconfig.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ConfigModuleOptions<T extends BaseConfigService = BaseConfigService> {
    /**
     * Nacos dataId for remote config
     */
    nacosDataId: string;

    /**
     * Nacos group, defaults to 'DEFAULT_GROUP'
     */
    nacosGroup?: string;

    /**
     * Absolute path to local config file, e.g. path.join(__dirname, 'config.default.json')
     * If file exists, it will be used instead of Nacos
     */
    localConfigPath?: string;

    /**
     * ConfigService class to instantiate
     */
    configServiceClass: Type<T>;

    /**
     * Module name for logging
     */
    moduleName: string;

    /**
     * Whether to enable Nacos listener for dynamic updates
     * Only works when using Nacos config (not local file)
     * Defaults to true
     */
    enableNacosListener?: boolean;
}

/**
 * Create a config service provider that:
 * 1. Tries to load local config file first (if specified)
 * 2. Falls back to Nacos remote config
 * 3. Optionally starts Nacos listener for dynamic updates
 */
export function createConfigServiceProvider<T extends BaseConfigService>(options: ConfigModuleOptions<T>) {
    const {
        nacosDataId,
        nacosGroup = 'DEFAULT_GROUP',
        localConfigPath,
        configServiceClass,
        moduleName,
        enableNacosListener = true,
    } = options;

    return {
        provide: configServiceClass,
        useFactory: async () => {
            const logger = new Logger(moduleName);
            let config = null;
            let useLocalConfig = false;

            // 1. 优先尝试加载本地配置文件
            if (localConfigPath && fs.existsSync(localConfigPath)) {
                try {
                    const localConfigContent = fs.readFileSync(localConfigPath, 'utf-8');
                    config = JSON.parse(localConfigContent);
                    useLocalConfig = true;
                    logger.log(`✅ Using local config file: ${localConfigPath}`);
                } catch (e) {
                    logger.warn(`Failed to load local config file ${localConfigPath}:`, e.message);
                }
            }

            // 2. 如果本地配置不存在，则从 Nacos 加载
            if (!config) {
                try {
                    config = await NacosManager.Instance.setupNacosConfig(nacosDataId);
                    logger.log(`✅ Using Nacos remote config (dataId: ${nacosDataId})`);
                } catch (e) {
                    logger.error('Failed to get config from both local file and Nacos:', e);
                    throw new Error(`No configuration available for ${moduleName}`);
                }
            }

            const configService = new configServiceClass(config);

            // 3. 只有当使用 Nacos 配置且启用监听时，才启动配置监听
            if (!useLocalConfig && enableNacosListener) {
                try {
                    NacosManager.Instance.startConfigListener(nacosDataId, nacosGroup, (newConfig) => {
                        if (
                            'updateConfig' in configService &&
                            typeof (configService as any).updateConfig === 'function'
                        ) {
                            (configService as any).updateConfig(newConfig);
                        } else {
                            logger.warn('ConfigService does not implement updateConfig method');
                        }
                    });
                    logger.log('✅ Started Nacos config listener for dynamic updates');
                } catch (e) {
                    logger.warn('Failed to start Nacos config listener:', e.message);
                }
            } else if (useLocalConfig) {
                logger.log('ℹ️  Using local config, Nacos listener disabled');
            }

            return configService;
        },
    };
}
