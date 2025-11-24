import { BaseConfig } from './base.config';

export class MongoConfig extends BaseConfig {
  readonly uri: string;
  readonly uriReport: string;

  constructor(configData) {
    super(MongoConfig.name);
    this.makeConfig(configData);
  }
}
