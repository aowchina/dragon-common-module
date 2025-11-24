import { Logger } from '@nestjs/common';
import * as _ from 'lodash';
import { NacosConfig } from './config.interface';

enum NodeEnvEnum {
  dev = 'development',
  pro = 'production',
}

export abstract class BaseConfigService {
  logger = new Logger(BaseConfigService.name);
  protected readonly env: string;
  constructor(protected nacosConfigs?: NacosConfig) {
    if (process.env.NODE_ENV) {
      this.env = process.env.NODE_ENV;
    } else {
      this.env = NodeEnvEnum.dev;
    }

    const confDefault = this.getDefaultConf();
    if (this.nacosConfigs) {
      _.merge(this.nacosConfigs, confDefault);
    } else {
      this.nacosConfigs = confDefault;
    }

    this.evalFunc(this.nacosConfigs);
  }

  get isDevelopment(): boolean {
    return this.env === NodeEnvEnum.dev;
  }

  get isProduction(): boolean {
    return this.env === NodeEnvEnum.pro;
  }

  getServiceConfig() {
    /* TODO document why this method 'getServiceConfig' is empty */
  }

  getOneConfig(key: string) {
    if (this.nacosConfigs && this.nacosConfigs[key]) {
      return this.nacosConfigs[key];
    }
  }

  private getDefaultConf() {
    let confDefault = null;
    try {
      confDefault = require('../config.default.json');
    } catch (e) {
      if (e.message.search('Cannot find module') == 0) {
        this.logger.log('Local config.default.json not exist, try to nacos');
      } else {
        this.logger.log('Try to get local config.default.json failed', e);
      }
    }
    return confDefault;
  }

  // 执行配置文件里的动态函数
  private evalFunc(confg: NacosConfig) {
    this.loopObject(confg);
  }

  private loopObject(obj: NacosConfig) {
    for (const key in obj) {
      if (typeof obj[key] == 'object') {
        this.loopObject(obj[key]);
      } else if (typeof obj[key] == 'string') {
        let value = obj[key];
        const matches = value.match(/\{{.*?\}}/gi);
        if (matches) {
          for (const element of matches) {
            const func = element.substr(2, element.length - 4);
            value = value.replace(element, eval(func));
          }
          obj[key] = value;
        }
      }
    }
  }
}
