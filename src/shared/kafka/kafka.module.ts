import { ConfigService } from '../../config';
import { Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientKafka, ClientsModule } from '@nestjs/microservices';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        useFactory: async (configService: ConfigService) => configService.kafka,
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
    const subscribeTopics = this.configServer.kafka.subscribeTopics;
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
