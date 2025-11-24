import * as _ from 'lodash';
import { AdminConfig, KafkaConfig, MongoConfig, RedisConfig, ServerConfig, ServiceConfig } from './type';
import { BaseConfigService } from './base/baseconfig.service';
import { NacosConfig } from './base/config.interface';
import { BtiConfig } from './type/bti.config';

export class ConfigService extends BaseConfigService {
  readonly server: ServerConfig;
  readonly mongo: MongoConfig;
  readonly kafka: KafkaConfig;
  readonly service: ServiceConfig;
  readonly bti: BtiConfig;
  readonly redis: RedisConfig;
  readonly admin: AdminConfig;

  constructor(nacosConfigs?: NacosConfig) {
    super(nacosConfigs);
    this.mongo = new MongoConfig(this.nacosConfigs.mongo);
    this.server = new ServerConfig(this.nacosConfigs.server);
    this.kafka = new KafkaConfig(this.nacosConfigs.kafka);
    this.service = new ServiceConfig(this.nacosConfigs.service);
    this.bti = new BtiConfig(this.nacosConfigs.bti);
    this.redis = new RedisConfig(this.nacosConfigs.redis);
    this.admin = new AdminConfig(this.nacosConfigs.admin);
  }

  getServiceConfig() {
    return this.service;
  }
}
