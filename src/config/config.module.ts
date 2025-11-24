import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { NacosManager } from './base/nacos.manager';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useFactory: async () => {
        let nacosConfig = null;
        try {
          nacosConfig = await NacosManager.Instance.setupNacosConfig();
        } catch (e) {
          console.error('get remote config from nacos server error', e);
          console.log('use local config');
        }
        return new ConfigService(nacosConfig);
      },
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
