import { KafkaConfig } from './kafka.config';

export class ServiceConfig extends KafkaConfig {
  constructor(configData) {
    super(ServiceConfig.name);
    this.makeConfig(configData);
  }
}
