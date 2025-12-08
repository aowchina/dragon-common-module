import { BaseConfigService } from './base/baseconfig.service';
import { NacosConfig } from './base/config.interface';

/**
 * Base ConfigService that can be extended by each service.
 * Each service should create its own ConfigService with specific config types.
 *
 * @example
 * ```typescript
 * import { ConfigService as BaseConfigService } from '@dragon/common';
 * import { ServerConfig, MongoConfig, KafkaConfig } from './types';
 *
 * export class ConfigService extends BaseConfigService {
 *   readonly server: ServerConfig;
 *   readonly mongo: MongoConfig;
 *   readonly kafka: KafkaConfig;
 *
 *   constructor(nacosConfigs?: NacosConfig) {
 *     super(nacosConfigs);
 *     this.server = new ServerConfig(this.nacosConfigs.server);
 *     this.mongo = new MongoConfig(this.nacosConfigs.mongo);
 *     this.kafka = new KafkaConfig(this.nacosConfigs.kafka);
 *   }
 * }
 * ```
 */
export class ConfigService extends BaseConfigService {
    constructor(nacosConfigs?: NacosConfig) {
        super(nacosConfigs);
    }
}

// Re-export BaseConfigService for services that want to extend it directly
export { BaseConfigService };
