import { BaseConfig } from './base.config';

export class BtiConfig extends BaseConfig {
  readonly freeBetUrl: string;
  readonly freeBetAuthUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;

  readonly baseUrl: string;
  readonly AgentId: string;
  readonly DomainId: string;
  readonly securityKey: string;
  readonly options: any;

  constructor(configData) {
    super(BtiConfig.name);
    this.makeConfig(configData);
  }
}
