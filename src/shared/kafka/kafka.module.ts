import { ConfigService } from '../../config/config.service';
import { Global, Inject, Injector, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientKafka, ClientsModule } from '@nestjs/microservices';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        useFactory: async (configService: any) => {
          if (!configService.kafka) {
            throw new Error('kafka config is required in ConfigService');
          }
          return configService.kafka;
        },
        inject: [ConfigService],
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class KafkaModule implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(KafkaModule.name);
  private configServer: any;
  
  constructor(
    @Inject('KAFKA_CLIENT') private readonly client: ClientKafka,
    private readonly injector: Injector,
  ) {
    // Get ConfigService from injector to work with any extended ConfigService
    this.configServer = this.injector.get(ConfigService, { strict: false });
  }

  async onModuleInit() {
    this.logger.log('onModuleInit');
    const configServer = this.configServer as any;
    if (!configServer.kafka) {
      this.logger.warn('kafka config not found, skipping subscription');
      return;
    }
    const subscribeTopics = configServer.kafka.subscribeTopics;
    subscribeTopics?.forEach((key) => {
      this.logger.log(`Subscribing to ${key}`);
      this.client.subscribeToResponseOf(`msg.${key}`);
    });
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
