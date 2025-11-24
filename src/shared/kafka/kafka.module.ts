import { DynamicModule, Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientKafka, ClientsModule, KafkaOptions } from '@nestjs/microservices';

export interface KafkaModuleOptions {
  kafkaConfig: KafkaOptions['options'];
  subscribeTopics?: string[];
}

class KafkaService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(KafkaService.name);
  
  constructor(
    @Inject('KAFKA_CLIENT') private readonly client: ClientKafka,
    @Inject('KAFKA_SUBSCRIBE_TOPICS') private readonly subscribeTopics: string[],
  ) {}

  async onModuleInit() {
    this.logger.log('KafkaService onModuleInit');
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

@Module({})
export class KafkaModule {
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
      imports: [
        ClientsModule.register([
          {
            name: 'KAFKA_CLIENT',
            ...options.kafkaConfig,
          },
        ]),
      ],
      providers: [
        {
          provide: 'KAFKA_SUBSCRIBE_TOPICS',
          useValue: options.subscribeTopics || [],
        },
        KafkaService,
      ],
      exports: [ClientsModule, KafkaService],
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<KafkaModuleOptions> | KafkaModuleOptions;
    inject?: any[];
  }): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
      imports: [
        ClientsModule.registerAsync([
          {
            name: 'KAFKA_CLIENT',
            useFactory: async (...args: any[]) => {
              const config = await options.useFactory(...args);
              return config.kafkaConfig;
            },
            inject: options.inject || [],
          },
        ]),
      ],
      providers: [
        {
          provide: 'KAFKA_SUBSCRIBE_TOPICS',
          useFactory: async (...args: any[]) => {
            const config = await options.useFactory(...args);
            return config.subscribeTopics || [];
          },
          inject: options.inject || [],
        },
        KafkaService,
      ],
      exports: [ClientsModule, KafkaService],
    };
  }
}
