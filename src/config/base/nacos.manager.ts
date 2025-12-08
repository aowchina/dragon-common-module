import { Logger } from '@nestjs/common';
import { NacosServerConfig } from '../config.setup';
import { Kafka2HttpConfig, NacosConfig } from './config.interface';
import { ConfigLoaderService } from './config-loader.service';
import * as http from 'http';
import * as querystring from 'querystring';
import * as os from 'os';

type ConfigUpdateCallback = (config: any) => void;

interface ConfigListenerInfo {
    dataId: string;
    group: string;
    md5: string | null;
    callbacks: ConfigUpdateCallback[];
}

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

    // Config listener properties
    private _configListeners: Map<string, ConfigListenerInfo> = new Map();
    private _isListening: boolean = false;
    private _isPolling: boolean = false; // 防止重复轮询

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

        this._logger.log(
            `[HTTP] Nacos Manager initialized: ${this._nacosHost}:${this._nacosPort}, namespace: ${this._nacosNamespace}`,
        );
    }

    static get Instance(): NacosManager {
        if (!this._instance) {
            this._instance = new NacosManager();
        }
        return this._instance;
    }

    // get all config for dataId "{appid}" and group "DEFAULT_GROUP"
    // Can pass either a DATA_ID string or a NacosServerConfig subclass instance
    async setupNacosConfig(nacosConfig?: string | NacosServerConfig): Promise<NacosConfig | undefined> {
        let configDataId: string;

        if (typeof nacosConfig === 'string') {
            // Direct DATA_ID string
            configDataId = nacosConfig;
            // Update DATA_ID so registerServer uses the correct service name
            this.DATA_ID = configDataId;
        } else if (nacosConfig) {
            // NacosServerConfig instance
            configDataId = (nacosConfig as any).DATA_ID;
            this.DATA_ID = configDataId;
        } else {
            // Fallback to default
            configDataId = this.DATA_ID;
        }

        // ✨ 检查 NACOS_ENABLED 环境变量
        const nacosEnabled = process.env.NACOS_ENABLED !== 'false';

        if (!nacosEnabled) {
            this._logger.log('⚙️ NACOS_ENABLED=false, using local config.default.json');
            return this.loadLocalConfig();
        }

        this._logger.log(`Setting up Nacos config for: ${configDataId}`);

        // ✨ 1. 并行获取服务配置和公共配置（性能优化）
        const [serviceConfig, commonConfig] = await Promise.all([
            this.getConfig(configDataId, this.GROUP),
            this.getConfig('dragon.common', this.GROUP)
        ]);

        if (!serviceConfig) {
            this._logger.warn(`⚠️ Failed to get service config: ${configDataId}, falling back to local config`);
            return this.loadLocalConfig();
        }

        // ✨ 2. 快速检测是否有 @import（浅层检测，性能优化）
        const needsCommon = this.quickDetectImports(serviceConfig);

        if (!needsCommon) {
            this._logger.log('No @import detected, using service config as-is');
            // 兼容性处理：处理 registry
            this.handleRegistryCompat(serviceConfig);
            return serviceConfig;
        }

        if (!commonConfig) {
            this._logger.warn('⚠️ @import detected but dragon.common not found, using service config as-is');
            this.handleRegistryCompat(serviceConfig);
            return serviceConfig;
        }

        this._logger.log('Processing config inheritance...');

        // ✨ 3. 创建 ConfigLoader 并设置公共配置
        const configLoader = new ConfigLoaderService({ enableCache: true });
        configLoader.setCommonConfig(commonConfig);

        // ✨ 4. 同步解析配置（处理 @import，按需解密）
        const finalConfig = configLoader.parseConfig(serviceConfig);

        this._logger.log('✓ Config inheritance processed successfully');

        // ✨ 5. 兼容性处理：处理 registry（替代 server.naming.table）
        this.handleRegistryCompat(finalConfig);

        return finalConfig;
    }

    /**
     * 加载本地配置文件
     */
    private loadLocalConfig(): NacosConfig | undefined {
        try {
            const localConfig = require('../config.default.json');
            this._logger.log('✓ Local config loaded from config.default.json');
            return localConfig;
        } catch (error) {
            this._logger.error(`Failed to load local config.default.json: ${error.message}`);
            return undefined;
        }
    }

    /**
     * 快速检测配置中是否有 @import（浅层检测，不深度递归）
     * 只检查第一层对象，性能优化
     */
    private quickDetectImports(config: any): boolean {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // 检查顶层 @import（罕见但支持）
        if (config['@import']) {
            return true;
        }

        // 检查第一层子节点
        for (const value of Object.values(config)) {
            if (value && typeof value === 'object' && value['@import']) {
                return true;
            }
        }

        return false;
    }

    /**
     * 处理 registry 兼容性（替代 server.naming.table）
     */
    private async handleRegistryCompat(config: NacosConfig): Promise<void> {
        if (config['useKafka2Http']) {
            if (config['registry']) {
                this._kafka2HttpConfig = config['registry'];
                this._logger.log('✓ Using registry from config');
            } else {
                // 降级：尝试从旧的 server.naming.table 获取
                this._logger.warn('⚠️ Registry not found in config, falling back to server.naming.table');
                try {
                    this._kafka2HttpConfig = await this.getConfig(this.NAMING_DATA_ID, this.GROUP);
                    if (this._kafka2HttpConfig) {
                        this._logger.log('✓ Fallback to server.naming.table successful');
                    }
                } catch (error) {
                    this._logger.error(`Failed to get fallback naming table: ${error.message}`);
                }
            }
        }
    }

    async getConfig(dataId: string, group: string): Promise<any | undefined> {
        try {
            // HTTP API: GET /nacos/v1/cs/configs
            const http = require('http');
            const url = `/nacos/v1/cs/configs?dataId=${dataId}&group=${group}&tenant=${this._nacosNamespace}`;

            this._logger.log(`Fetching Nacos config via HTTP: ${this._nacosHost}:${this._nacosPort}${url}`);

            return await new Promise((resolve, reject) => {
                http.get(
                    {
                        hostname: this._nacosHost,
                        port: this._nacosPort,
                        path: url,
                        method: 'GET',
                    },
                    (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            if (res.statusCode === 200 && data) {
                                this._logger.log(`✓ Nacos config retrieved successfully (${data.length} bytes)`);
                                resolve(JSON.parse(data));
                            } else {
                                this._logger.error(`Failed to get config: ${res.statusCode}`);
                                resolve(undefined);
                            }
                        });
                    },
                ).on('error', (err) => {
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

    /**
     * @deprecated Use registry from dragon.common instead
     * This method will be removed in v3.0
     */
    async fetchKafka2HttpConfig(): Promise<any | undefined> {
        this._logger.warn('⚠️ fetchKafka2HttpConfig() is deprecated, use config.registry instead');

        // 优先返回新的 registry
        if (this._kafka2HttpConfig) {
            return this._kafka2HttpConfig;
        }

        // 降级到旧方式
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
                    ephemeral: true,
                });

                // 添加详细调试信息
                this._logger.log(`[DEBUG] Nacos Host: ${this._nacosHost}`);
                this._logger.log(`[DEBUG] Nacos Port: ${this._nacosPort}`);
                this._logger.log(`[DEBUG] Nacos Namespace: ${this._nacosNamespace}`);
                this._logger.log(`[DEBUG] Post Data: ${postData}`);

                await new Promise((resolve, reject) => {
                    this._logger.log(`[HTTP] Registering instance: ${this.DATA_ID} at ${ip.address}:${port}`);
                    const req = http.request(
                        {
                            hostname: this._nacosHost,
                            port: this._nacosPort,
                            path: '/nacos/v1/ns/instance',
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Content-Length': Buffer.byteLength(postData),
                            },
                        },
                        (res) => {
                            this._logger.log(`[DEBUG] Response Status: ${res.statusCode}`);
                            this._logger.log(`[DEBUG] Response Headers: ${JSON.stringify(res.headers)}`);
                            let data = '';
                            res.on('data', (chunk) => {
                                data += chunk;
                            });
                            res.on('end', () => {
                                this._logger.log(`[HTTP] Response body: ${data.substring(0, 200)}`);
                                if (data === 'ok') {
                                    this._logger.log(`[HTTP] ✓ Instance registered successfully`);
                                    resolve(data);
                                } else {
                                    this._logger.error(
                                        `[HTTP] Registration failed, unexpected response: ${data.substring(0, 100)}`,
                                    );
                                    resolve(null);
                                }
                            });
                        },
                    );
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
                port: port,
            }),
        });

        return new Promise((resolve) => {
            const req = http.request(
                {
                    hostname: this._nacosHost,
                    port: this._nacosPort,
                    path: '/nacos/v1/ns/instance/beat',
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(beatData),
                    },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            this._logger.debug(`[Heartbeat] ✓ ${serviceName} @ ${ip}:${port}`);
                            resolve(true);
                        } else {
                            this._logger.error(`[Heartbeat] ✗ ${serviceName} failed: ${res.statusCode}`);
                            resolve(false);
                        }
                    });
                },
            );
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
                http.get(
                    {
                        hostname: this._nacosHost,
                        port: this._nacosPort,
                        path: url,
                        method: 'GET',
                    },
                    (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                const result = JSON.parse(data);
                                const instances = result.hosts || [];
                                if (instances.length > 0) {
                                    const index = Math.floor(Math.random() * instances.length);
                                    const instance = instances[index];
                                    this._logger.debug(
                                        `Found server address ${instance.ip}:${instance.port}, index is ${index}, length is ${instances.length}`,
                                    );
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
                    },
                ).on('error', (err) => {
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

    /**
     * 开始监听指定的 Nacos 配置变化（使用长轮询机制）
     * @param dataId 配置的 dataId
     * @param group 配置的 group（默认 'DEFAULT_GROUP'）
     * @param callback 配置更新时的回调函数
     */
    startConfigListener(dataId: string, group: string = 'DEFAULT_GROUP', callback: ConfigUpdateCallback): void {
        const key = `${dataId}@${group}`;

        if (!this._configListeners.has(key)) {
            this._configListeners.set(key, {
                dataId,
                group,
                md5: null,
                callbacks: [],
            });
        }

        const listener = this._configListeners.get(key)!;
        listener.callbacks.push(callback);

        this._logger.log(`📡 Registered config listener for ${key}`);

        // 如果还没有启动长轮询，则启动
        if (!this._isListening) {
            this._startLongPolling();
        }
    }

    /**
     * 停止监听指定的配置
     * @param dataId 配置的 dataId
     * @param group 配置的 group（默认 'DEFAULT_GROUP'）
     * @param callback 要移除的回调函数（可选，不传则移除所有回调）
     */
    stopConfigListener(dataId: string, group: string = 'DEFAULT_GROUP', callback?: ConfigUpdateCallback): void {
        const key = `${dataId}@${group}`;
        const listener = this._configListeners.get(key);

        if (!listener) return;

        if (callback) {
            // 移除特定回调
            listener.callbacks = listener.callbacks.filter((cb) => cb !== callback);
            if (listener.callbacks.length === 0) {
                this._configListeners.delete(key);
                this._logger.log(`🔌 Removed all callbacks for ${key}`);
            }
        } else {
            // 移除所有回调
            this._configListeners.delete(key);
            this._logger.log(`🔌 Stopped listening to ${key}`);
        }

        // 如果没有监听器了，停止长轮询
        if (this._configListeners.size === 0) {
            this._isListening = false;
            this._logger.log('⏸️  No active listeners, long polling stopped');
        }
    }

    /**
     * 启动 Nacos 长轮询机制
     */
    private async _startLongPolling(): Promise<void> {
        this._isListening = true;
        this._logger.log('🚀 Starting Nacos config long polling...');

        // 首次获取所有配置的初始 MD5
        for (const [key, listener] of this._configListeners) {
            try {
                const config = await this._fetchConfigWithMd5(listener.dataId, listener.group);
                if (config) {
                    listener.md5 = config.md5;
                    this._logger.log(`✅ Initial MD5 for ${key}: ${config.md5}`);
                }
            } catch (error) {
                this._logger.warn(`⚠️  Failed to get initial MD5 for ${key}:`, error.message);
            }
        }

        // 启动长轮询循环
        this._longPoll();
    }

    /**
     * 执行长轮询请求
     */
    private _longPoll(): void {
        this._logger.debug(
            `🔍 _longPoll called: isListening=${this._isListening}, isPolling=${this._isPolling}, listeners=${this._configListeners.size}`,
        );

        if (!this._isListening || this._configListeners.size === 0) {
            this._logger.warn(
                `⚠️  Long polling skipped: isListening=${this._isListening}, listeners=${this._configListeners.size}`,
            );
            return;
        }

        // 防止重复轮询
        if (this._isPolling) {
            this._logger.warn(`⚠️  Long polling already in progress, skipping duplicate call`);
            return;
        }

        this._isPolling = true; // 构建 Listening-Configs 字符串
        // 根据 Nacos 源码 MD5Util.getClientMd5Map:
        // 新格式(带 tenant): dataId^2group^2md5^2tenant^1
        // 旧格式(不带 tenant): dataId^2group^2md5^1
        const listeningConfigs =
            Array.from(this._configListeners.values())
                .map((listener) => {
                    const md5 = listener.md5 || '';
                    this._logger.debug(
                        `📋 Sending listener: ${listener.dataId}, group: ${listener.group}, MD5: ${md5.substring(0, 8)}..., tenant: ${this._nacosNamespace}`,
                    );
                    return `${listener.dataId}${String.fromCharCode(2)}${listener.group}${String.fromCharCode(2)}${md5}${String.fromCharCode(2)}${this._nacosNamespace}`;
                })
                .join(String.fromCharCode(1)) + String.fromCharCode(1);

        // 不能使用 querystring.stringify,因为它会对特殊字符进行 URL 编码
        // Nacos 期望原始的 String.fromCharCode(1) 和 String.fromCharCode(2)
        const postData = `Listening-Configs=${encodeURIComponent(listeningConfigs)}`;

        this._logger.debug(`📤 Sending long polling request, configs count: ${this._configListeners.size}`);
        this._logger.debug(`📤 POST data (first 200 chars): ${postData.substring(0, 200)}`);
        const options: http.RequestOptions = {
            hostname: this._nacosHost,
            port: this._nacosPort,
            path: '/nacos/v1/cs/configs/listener',
            method: 'POST',
            headers: {
                'Long-Pulling-Timeout': '30000', // 30s server timeout
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 35000, // 35s client timeout (longer than server)
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', async () => {
                this._logger.debug(
                    `📨 Long polling response end: ${data.length} bytes, status: ${res.statusCode}, data: "${data}"`,
                );

                // 如果有数据返回，说明配置可能变化了
                if (data && data.trim().length > 0) {
                    this._logger.debug(`📦 Nacos reported config changes: ${data.trim()}`);
                    // 解析可能变化的配置 (Nacos 返回的是 URL 编码的数据,需要先解码)
                    const changedConfigs = data
                        .trim()
                        .split('\n')
                        .map((line) => {
                            const decodedLine = decodeURIComponent(line);
                            this._logger.debug(`📑 Decoded line: "${decodedLine}" (length=${decodedLine.length})`);
                            const parts = decodedLine.split(String.fromCharCode(2));
                            this._logger.debug(
                                `📑 Parsed ${parts.length} parts: dataId=${parts[0]}, group=${parts[1]}, part3=${parts[2]}`,
                            );
                            return {
                                dataId: parts[0],
                                group: parts[1] || 'DEFAULT_GROUP',
                            };
                        });

                    // 获取变化的配置并通知回调
                    for (const changed of changedConfigs) {
                        const key = `${changed.dataId}@${changed.group}`;
                        const listener = this._configListeners.get(key);

                        if (listener) {
                            try {
                                const config = await this._fetchConfigWithMd5(changed.dataId, changed.group);
                                if (config) {
                                    // 只有 MD5 真正变化时才更新和通知
                                    if (config.md5 !== listener.md5) {
                                        const oldMd5 = listener.md5;
                                        listener.md5 = config.md5;
                                        this._logger.log(
                                            `📝 Config content changed for ${key} (MD5: ${oldMd5?.substring(0, 8)} → ${config.md5.substring(0, 8)})`,
                                        );
                                        this._logger.log(`🔄 Notifying ${listener.callbacks.length} callbacks`);

                                        // 通知所有回调
                                        listener.callbacks.forEach((callback) => {
                                            try {
                                                callback(config.content);
                                            } catch (error) {
                                                this._logger.error(`❌ Error in config callback for ${key}:`, error);
                                            }
                                        });
                                    } else {
                                        // MD5 未变化，只是 Nacos 心跳通知，不打印日志
                                        this._logger.debug(
                                            `⏭️  Config heartbeat for ${key}, no content change (MD5: ${config.md5.substring(0, 8)})`,
                                        );
                                    }
                                }
                            } catch (error) {
                                this._logger.error(`❌ Failed to fetch updated config for ${key}:`, error.message);
                            }
                        }
                    }
                }

                // 继续下一轮长轮询
                this._logger.debug('♻️  Long polling cycle complete, starting next poll...');
                this._isPolling = false;
                setImmediate(() => this._longPoll());
            });
        });

        req.on('error', (error) => {
            this._logger.error('❌ Long polling request error:', error.message);
            this._isPolling = false;
            // 5s 后重试
            setTimeout(() => this._longPoll(), 5000);
        });

        req.on('timeout', () => {
            this._logger.debug('⏱️  Long polling timeout (expected), reconnecting...');
            req.destroy();
            this._isPolling = false;
            // 立即重连
            setImmediate(() => this._longPoll());
        });

        req.write(postData);
        req.end();
    }

    /**
     * 获取配置内容和 MD5
     */
    private async _fetchConfigWithMd5(dataId: string, group: string): Promise<{ content: any; md5: string } | null> {
        return new Promise((resolve, reject) => {
            const path = `/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(this._nacosNamespace)}`;

            const options: http.RequestOptions = {
                hostname: this._nacosHost,
                port: this._nacosPort,
                path: path,
                method: 'GET',
                timeout: 5000,
            };

            const req = http.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200 && data) {
                        try {
                            const content = JSON.parse(data);
                            // 直接从响应头获取 Nacos 服务器计算的 MD5
                            let md5 = res.headers['content-md5'];
                            if (Array.isArray(md5)) {
                                md5 = md5[0];
                            }

                            if (!md5) {
                                this._logger.warn(`⚠️  No content-md5 header from Nacos for ${dataId}`);
                                md5 = ''; // 使用空字符串作为默认值
                            }

                            resolve({ content, md5 });
                        } catch (error) {
                            reject(new Error(`Failed to parse config: ${error.message}`));
                        }
                    } else if (res.statusCode === 404) {
                        resolve(null);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    /**
     * Register service to Nacos with simplified API
     * @param port Service port number
     * @param logger Optional logger instance
     * @returns Promise<void>
     */
    static async registerToNacos(port: number, logger?: Logger): Promise<void> {
        const log = logger || new Logger('NacosRegister');
        try {
            await NacosManager.Instance.registerServer(port);
            log.log('✅ Registered to Nacos successfully');
        } catch (error) {
            log.warn('⚠️  Failed to register to Nacos:', error.message);
        }
    }
}
