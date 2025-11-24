export class NacosServerConfig {
  protected NAMESPACE = process.env.NACOS_NAMESPACE ?? 'dragon-dev';
  protected DATA_ID = 'app.activity';
  protected readonly NAMING_DATA_ID = 'server.naming.table';
  protected GROUP = 'DEFAULT_GROUP';
  protected readonly SERVER_HOST = process.env.NACOS_HOST ?? 'dragon.fly';
  protected readonly PORT = Number.parseInt(process.env.NACOS_PORT ?? '443');
  protected USERNAME = process.env.NACOS_USERNAME ?? 'nacos';
  protected PASSWORD = process.env.NACOS_PASSWORD ?? 'nacos';
  protected TOKEN = '';
}
