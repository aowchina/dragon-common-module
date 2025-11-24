import { BaseConfig } from './base.config';

export class RedisConfig extends BaseConfig {
  readonly host: string;
  readonly port: number;
  readonly password: string;
  readonly keyPrefix?: string;
  readonly nodes?: [];

  constructor(configData) {
    super(RedisConfig.name);
    this.makeConfig(configData);
    this.password = process.env.TOUP_REDIS_PASSWORD || this.password;
  }
}
