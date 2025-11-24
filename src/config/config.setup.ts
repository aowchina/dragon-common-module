/**
 * Abstract base class for Nacos server configuration.
 * Each service should extend this class and provide its own DATA_ID.
 * 
 * @example
 * ```typescript
 * export class ActivityNacosConfig extends NacosServerConfig {
 *   protected DATA_ID = 'app.activity';
 * }
 * ```
 */
export abstract class NacosServerConfig {
  protected NAMESPACE = process.env.NACOS_NAMESPACE ?? 'dragon-dev';
  protected abstract DATA_ID: string; // Must be defined by subclass
  protected readonly NAMING_DATA_ID = 'server.naming.table';
  protected GROUP = 'DEFAULT_GROUP';
  protected readonly SERVER_HOST = process.env.NACOS_HOST ?? 'dragon.fly';
  protected readonly PORT = Number.parseInt(process.env.NACOS_PORT ?? '443');
  protected USERNAME = process.env.NACOS_USERNAME ?? 'nacos';
  protected PASSWORD = process.env.NACOS_PASSWORD ?? 'nacos';
  protected TOKEN = '';
}
