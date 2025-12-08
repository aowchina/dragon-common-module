/**
 * Nacos server configuration class.
 * Can be used directly by passing DATA_ID in constructor.
 *
 * @example
 * ```typescript
 * // Simple usage (recommended)
 * const config = new NacosServerConfig('app.activity');
 *
 * // Legacy usage (still supported)
 * export class ActivityNacosConfig extends NacosServerConfig {
 *   protected DATA_ID = 'app.activity';
 * }
 * ```
 */
export class NacosServerConfig {
    protected NAMESPACE = process.env.NACOS_NAMESPACE ?? 'dragon-dev';
    protected DATA_ID: string;
    protected readonly NAMING_DATA_ID = 'server.naming.table';
    protected GROUP = 'DEFAULT_GROUP';
    protected readonly SERVER_HOST = process.env.NACOS_HOST ?? 'dragon.fly';
    protected readonly PORT = Number.parseInt(process.env.NACOS_PORT ?? '443');
    protected USERNAME = process.env.NACOS_USERNAME ?? 'nacos';
    protected PASSWORD = process.env.NACOS_PASSWORD ?? 'nacos';
    protected TOKEN = '';

    constructor(dataId?: string) {
        if (dataId) {
            this.DATA_ID = dataId;
        }
    }
}
