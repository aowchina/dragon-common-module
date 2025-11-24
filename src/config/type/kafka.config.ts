import { Transport } from '@nestjs/microservices';
import { BaseConfig } from './base.config';

export class KafkaConfig extends BaseConfig {
  readonly transport: Transport = Transport.KAFKA;
  readonly options: any;
  readonly subscribeTopics?: string[];

  constructor(configData) {
    super(KafkaConfig.name);
    this.makeConfig(configData);
  }
}
