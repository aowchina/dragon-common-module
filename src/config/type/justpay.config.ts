import { BaseConfig } from './base.config';

export class JustpayConfig extends BaseConfig {
  readonly baseUrl: string;
  readonly AgentId: string;
  readonly securityKey: string;
  readonly whiteList?: string[];

  constructor(configData) {
    super(JustpayConfig.name);
    this.makeConfig(configData);
  }
}
