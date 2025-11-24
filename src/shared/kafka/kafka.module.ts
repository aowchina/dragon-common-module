import { ConfigService } from '../../config/config.service';
import { DynamicModule, Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientKafka, ClientsModule } from '@nestjs/microservices';

class KafkaService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(KafkaService.name);
  
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

@Global()
@Module({})
export class KafkaModule {
  static forRootAsync(): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
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
        KafkaService,
      ],
      exports: [ClientsModule],
    };
  }
}
