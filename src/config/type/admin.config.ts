import { BaseConfig } from './base.config';

export class AdminConfig extends BaseConfig {
  readonly host: string;

  constructor(configData) {
    super(AdminConfig.name);
    this.makeConfig(configData);
  }
}
