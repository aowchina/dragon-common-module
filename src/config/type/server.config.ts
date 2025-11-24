import { BaseConfig } from './base.config';

export class ServerConfig extends BaseConfig {
  readonly siteName: string;
  readonly url: string;
  readonly domain: string;
  readonly allowOrigins: string[];
  readonly port: number;
  readonly apiPrefix: string;
  readonly tokenName: string;
  readonly jwtExpiresIn: number;
  readonly jwtSecret: string;
  readonly rateLimitWindowMs: number; // 时间窗口，单位毫秒
  readonly rateLimitMax: number; // limit each IP to rateLimitMax requests per windowMs
  readonly swaggerPrefix: string;

  constructor(configData) {
    super(ServerConfig.name);
    this.makeConfig(configData);
  }
}
