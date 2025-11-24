import { Logger } from '@nestjs/common';
import { NacosServerConfig } from '../config.setup';
import { Kafka2HttpConfig, NacosConfig } from './config.interface';

export class NacosManager extends NacosServerConfig {
    protected DATA_ID = 'app.default'; // Default value, should be set by service
    private static _instance?: NacosManager;
    private _logger = new Logger(NacosManager.name);
    private _kafka2HttpConfig?: Kafka2HttpConfig;

    // HTTP API properties
    private _nacosHost: string;
    private _nacosPort: number;
    private _nacosNamespace: string;
    private _heartbeatTimer: NodeJS.Timeout | null = null;
    private _registeredInstances: Map<string, { ip: string; port: number }> = new Map();

    private constructor() {
        super();
        let serverHost = this.SERVER_HOST;
        // 如果包含 :// 则去掉前面的协议
        if (serverHost.indexOf('://') > 0) {
            serverHost = serverHost.substring(serverHost.indexOf('://') + 3);
        }
        // 如果包含/ 则去掉后面的路径
        if (serverHost.indexOf('/') > 0) {
            serverHost = serverHost.substring(0, serverHost.indexOf('/'));
        }
        const serverPort = this.PORT;

        // 初始化 HTTP API 所需的属性
        this._nacosHost = serverHost || 'nacos';
        this._nacosPort = serverPort || 8848;
        this._nacosNamespace = this.NAMESPACE || '';

        this._logger.log(`[HTTP] Nacos Manager initialized: ${this._nacosHost}:${this._nacosPort}, namespace: ${this._nacosNamespace}`);
    }

    static get Instance(): NacosManager {
        if (!this._instance) {
            this._instance = new NacosManager();
        }
        return this._instance;
    }

    // get all config for dataId "{appid}" and group "DEFAULT_GROUP"
    // Pass in a NacosServerConfig subclass instance to use its DATA_ID
    async setupNacosConfig(nacosConfigClass?: NacosServerConfig): Promise<NacosConfig | undefined> {
        const configDataId = nacosConfigClass ? (nacosConfigClass as any).DATA_ID : this.DATA_ID;
        const config = await this.getConfig(configDataId, this.GROUP);
        if (config) {
            this._kafka2HttpConfig = config['useKafka2Http']
                ? await this.getConfig(this.NAMING_DATA_ID, this.GROUP)
                : undefined;
        }
        return config;
    }

    async getConfig(dataId: string, group: string): Promise<any | undefined> {
        try {
            // HTTP API: GET /nacos/v1/cs/configs
            const http = require('http');
            const url = `/nacos/v1/cs/configs?dataId=${dataId}&group=${group}&tenant=${this._nacosNamespace}`;

            this._logger.log(`Fetching Nacos config via HTTP: ${this._nacosHost}:${this._nacosPort}${url}`);

            return await new Promise((resolve, reject) => {
                http.get({
                    hostname: this._nacosHost,
                    port: this._nacosPort,
                    path: url,
                    method: 'GET'
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode === 200 && data) {
                            this._logger.log(`✓ Nacos config retrieved successfully (${data.length} bytes)`);
                            resolve(JSON.parse(data));
                        } else {
                            this._logger.error(`Failed to get config: ${res.statusCode}`);
                            resolve(undefined);
                        }
                    });
                }).on('error', (err) => {
                    if (err.message.search('connect ECONNREFUSED') == 0) {
                        this._logger.log('Nacos not active');
                        resolve(undefined);
                    } else {
                        this._logger.error(`HTTP request error: ${err.message}`);
                        resolve(undefined);
                    }
                });
            });
        } catch (e) {
            if (e.message && e.message.search('connect ECONNREFUSED') == 0) {
                this._logger.log('Nacos not active');
                return;
            }
            this._logger.error(`e: ${JSON.stringify(e)}`);
        }
    }

    async fetchKafka2HttpConfig(): Promise<any | undefined> {
        return await this.getConfig(this.NAMING_DATA_ID, this.GROUP);
    }

    async registerServer(port: number) {
        try {
            this._logger.debug('Will register server address to nacos');
            this._logger.debug('Will get locale address');
            const ip = this.getFirstLocaleIpV4Address();
            this._logger.debug(`Locale address is ${ip.address}`);
            if (ip) {
                // HTTP API: POST /nacos/v1/ns/instance
                const http = require('http');
                const querystring = require('querystring');
                const postData = querystring.stringify({
                    serviceName: this.DATA_ID,
                    ip: ip.address,
                    port: port,
                    namespaceId: this._nacosNamespace,
                    enabled: true,
                    healthy: true,
                    ephemeral: true
                });

                // 添加详细调试信息
                this._logger.log(`[DEBUG] Nacos Host: ${this._nacosHost}`);
                this._logger.log(`[DEBUG] Nacos Port: ${this._nacosPort}`);
                this._logger.log(`[DEBUG] Nacos Namespace: ${this._nacosNamespace}`);
                this._logger.log(`[DEBUG] Post Data: ${postData}`);

                await new Promise((resolve, reject) => {
                    this._logger.log(`[HTTP] Registering instance: ${this.DATA_ID} at ${ip.address}:${port}`);
                    const req = http.request({
                        hostname: this._nacosHost,
                        port: this._nacosPort,
                        path: '/nacos/v1/ns/instance',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Content-Length': Buffer.byteLength(postData)
                        }
                    }, (res) => {
                        this._logger.log(`[DEBUG] Response Status: ${res.statusCode}`);
                        this._logger.log(`[DEBUG] Response Headers: ${JSON.stringify(res.headers)}`);
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            this._logger.log(`[HTTP] Response body: ${data.substring(0, 200)}`);
                            if (data === 'ok') {
                                this._logger.log(`[HTTP] ✓ Instance registered successfully`);
                                resolve(data);
                            } else {
                                this._logger.error(`[HTTP] Registration failed, unexpected response: ${data.substring(0, 100)}`);
                                resolve(null);
                            }
                        });
                    });
                    req.on('error', (err) => {
                        this._logger.error(`[HTTP] Register request error: ${err.message}`);
                        resolve(null);
                    });
                    req.write(postData);
                    req.end();
                }).then((result) => {
                    // 只有注册成功时才启动心跳
                    if (result === 'ok') {
                        this._logger.log(`[HTTP] Starting heartbeat for ${this.DATA_ID}`);
                        this.startHeartbeat(this.DATA_ID, ip.address, port);
                    } else {
                        this._logger.error(`[HTTP] Heartbeat not started due to registration failure`);
                    }
                });
            }
        } catch (e) {
            if (e.message && e.message.search('connect ECONNREFUSED') == 0) {
                this._logger.log('Nacos not active');
                return;
            }
            this._logger.error(`e: ${JSON.stringify(e)}`);
        }
    }

    private sendHeartbeat(serviceName: string, ip: string, port: number): Promise<boolean> {
        const http = require('http');
        const querystring = require('querystring');

        const beatData = querystring.stringify({
            serviceName: serviceName,
            ip: ip,
            port: port,
            namespaceId: this._nacosNamespace,
            beat: JSON.stringify({
                serviceName: serviceName,
                ip: ip,
                port: port
            })
        });

        return new Promise((resolve) => {
            const req = http.request({
                hostname: this._nacosHost,
                port: this._nacosPort,
                path: '/nacos/v1/ns/instance/beat',
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(beatData)
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        this._logger.debug(`[Heartbeat] ✓ ${serviceName} @ ${ip}:${port}`);
                        resolve(true);
                    } else {
                        this._logger.error(`[Heartbeat] ✗ ${serviceName} failed: ${res.statusCode}`);
                        resolve(false);
                    }
                });
            });
            req.on('error', (err) => {
                this._logger.error(`[Heartbeat] Error: ${err.message}`);
                resolve(false);
            });
            req.write(beatData);
            req.end();
        });
    }

    private startHeartbeat(serviceName: string, ip: string, port: number, interval: number = 5000) {
        const key = `${serviceName}@${ip}:${port}`;

        // 如果已经有心跳，先清除
        if (this._registeredInstances.has(key)) {
            this._logger.debug(`[Heartbeat] Already running for ${key}`);
            return;
        }

        this._registeredInstances.set(key, { ip, port });
        this._logger.log(`[Heartbeat] Starting for ${serviceName} @ ${ip}:${port} every ${interval}ms`);

        // 立即发送第一次心跳
        this.sendHeartbeat(serviceName, ip, port);

        // 设置定时心跳
        const timer = setInterval(() => {
            this.sendHeartbeat(serviceName, ip, port);
        }, interval);

        this._heartbeatTimer = timer;
    }

    async findServerByTopic(topic: string): Promise<string | undefined> {
        if (this._kafka2HttpConfig?.registry[topic]) {
            return await this.findServerByName(this._kafka2HttpConfig.registry[topic]);
        }
    }

    async findServerByName(name: string): Promise<string | undefined> {
        try {
            this._logger.debug('Will find server address from nacos');

            // HTTP API: GET /nacos/v1/ns/instance/list
            const http = require('http');
            const url = `/nacos/v1/ns/instance/list?serviceName=${name}&namespaceId=${this._nacosNamespace}&healthyOnly=true`;

            return await new Promise((resolve) => {
                http.get({
                    hostname: this._nacosHost,
                    port: this._nacosPort,
                    path: url,
                    method: 'GET'
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            const result = JSON.parse(data);
                            const instances = result.hosts || [];
                            if (instances.length > 0) {
                                const index = Math.floor(Math.random() * instances.length);
                                const instance = instances[index];
                                this._logger.debug(`Found server address ${instance.ip}:${instance.port}, index is ${index}, length is ${instances.length}`);
                                resolve(`${instance.ip}:${instance.port}`);
                            } else {
                                this._logger.debug('No healthy instances found');
                                resolve(undefined);
                            }
                        } else {
                            this._logger.error(`Failed to find server: ${res.statusCode}`);
                            resolve(undefined);
                        }
                    });
                }).on('error', (err) => {
                    if (err.message.search('connect ECONNREFUSED') == 0) {
                        this._logger.log('Nacos not active');
                    } else {
                        this._logger.error(`HTTP request error: ${err.message}`);
                    }
                    resolve(undefined);
                });
            });
        } catch (e) {
            if (e.message && e.message.search('connect ECONNREFUSED') == 0) {
                this._logger.log('Nacos not active');
                return;
            }
            this._logger.error(`e: ${JSON.stringify(e)}`);
        }
    }

    private getFirstLocaleIpV4Address() {
        const os = require('os');

        const networkInterfaces = os.networkInterfaces();
        console.log(`Interfaces is: \n${JSON.stringify(networkInterfaces)}`);
        for (const devName in networkInterfaces) {
            if (devName.startsWith('lo')) {
                continue;
            }

            const address = networkInterfaces[devName].find((o) => {
                return o.family === 'IPv4';
            });

            if (address) {
                return address;
            }
        }

        return undefined;
    }
}
