// 环境变量的结构体
export interface NacosConfig {
  redis: RedisConfig;
  db: DBConfig;
  kafka: KafkaConfig;
  service: ServiceConfig;
  mongo: MongoConfig;
  server: ServerConfig;
  bti: BtiConfig;
  admin: AdminConfig;
}

interface MongoConfig {
  uri: string;
  uriReport: string;
}

interface ServiceConfig {
  options: ServiceOptions;
}

interface ServiceOptions {
  client: CommonClient;
  consumer: ServiceConsumer;
}

interface ServiceConsumer {
  groupId: string;
}

interface RedisConfig {
  host: string;
  port: number;
  password: string;
  keyPrefix: string;
  family: number;
  db: number;
  exp: number;
}

interface DBConfig {
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  entities: string[];
  logging: string;
  logger: string;
  maxQueryExecutionTime: number;
}

interface CommonClient {
  clientId: string;
  brokers: string[];
}

interface KafkaConsumer {
  groupId: string;
  allowAutoTopicCreation: boolean;
}

interface KafkaOptions {
  client: CommonClient;
  consumer: KafkaConsumer;
}

interface KafkaConfig {
  options: KafkaOptions;
  subscribeTopics: string[];
}

interface BtiConfig {
  freeBetUrl: string;
  freeBetAuthUrl: string;
  clientId: string;
  clientSecret: string;
}

interface JustpayConfig {
  baseUrl: string;
  AgentId: string;
  securityKey: string;
  whiteList: string[];
}

interface ServerConfig {
  siteName: string;
  allowOrigins: string[];
  port: number;
  apiPrefix: number;
  passSalt: string;
  tokenName: string;
  jwtSecret: string;
  jwtExpiresIn: number;
  cookieSecret: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  swaggerPrefix: string;
}

interface AdminConfig {
  host: string;
}

export interface Kafka2HttpConfig {
  registry: { [key: string]: string };
}
