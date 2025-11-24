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
  exports: [ClientsModule],
})
export class KafkaModule implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(KafkaModule.name);
  constructor(
    @Inject('KAFKA_CLIENT') private readonly client: ClientKafka,
    private readonly configServer: ConfigService,
  ) {}

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
