import { ConfigService } from '../../config/config.service';
import { Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
  providers: [
    {
      provide: 'KAFKA_MODULE_IMPL',
      useClass: KafkaModuleImpl,
    },
  ],
  exports: [ClientsModule, 'KAFKA_MODULE_IMPL'],
})
export class KafkaModule {}

export class KafkaModuleImpl implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(KafkaModuleImpl.name);
  
  constructor(
    @Inject('KAFKA_CLIENT') private readonly client: ClientKafka,
    @Inject(ConfigService) private readonly configServer: any,
  ) {}

  async onModuleInit() {
    this.logger.log('onModuleInit');
    const configServer = this.configServer;
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
