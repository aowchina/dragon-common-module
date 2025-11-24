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
      provide: 'KAFKA_SUBSCRIBE_TOPICS',
      useFactory: (configService: any) => {
        return configService.kafka?.subscribeTopics || [];
      },
      inject: [ConfigService],
    },
  ],
  exports: [ClientsModule],
})
export class KafkaModule implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(KafkaModule.name);
  
  constructor(
    @Inject('KAFKA_CLIENT') private readonly client: ClientKafka,
    @Inject('KAFKA_SUBSCRIBE_TOPICS') private readonly subscribeTopics: string[],
  ) {}

  async onModuleInit() {
    this.logger.log('onModuleInit');
    if (!this.subscribeTopics || this.subscribeTopics.length === 0) {
      this.logger.warn('No kafka subscribe topics found, skipping subscription');
      return;
    }
    this.subscribeTopics.forEach((key) => {
      this.logger.log(`Subscribing to ${key}`);
      this.client.subscribeToResponseOf(`msg.${key}`);
    });
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
