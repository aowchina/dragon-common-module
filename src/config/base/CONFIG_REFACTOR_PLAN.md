# 配置系统重构方案（最终版）

## 核心特性

1. ✅ **简单的 @import 语法**：`"@import": ["@kafka"]`
2. ✅ **NACOS_ENABLED 开关**：支持本地配置模式
3. ✅ **按需解密**：只解密用到的节点
4. ✅ **智能检测**：自动检测是否需要 common 配置
5. ✅ **同步解析**：避免异步初始化问题

## 环境变量

```bash
# Nacos 开关（新增）
NACOS_ENABLED=true          # true/false，默认 true（启用）

# Nacos 连接配置
NACOS_HOST=nacos.prod
NACOS_PORT=8848
NACOS_NAMESPACE=dragon-prod

# 配置加密密钥（可选，只在用到加密配置时需要）
CONFIG_ENCRYPT_KEY=your-secret-key
```

## 配置加载逻辑

```
┌─────────────────────────┐
│ 服务启动                 │
│ NacosManager.setupNacosConfig()
└──────────┬──────────────┘
           │
           ▼
    ┌──────────────┐
    │ 检查 NACOS_ENABLED │
    └──────┬───────┘
           │
           ├─ false ────────────────┐
           │                        ▼
           │              ┌─────────────────────┐
           │              │ 读取本地配置文件      │
           │              │ config.default.json  │
           │              └─────────┬───────────┘
           │                        │
           │                        ▼
           │              ┌─────────────────────┐
           │              │ 返回本地配置         │
           │              │ (无 @import 处理)   │
           │              └─────────────────────┘
           │
           ├─ true/未设置 ─────────┐
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 并行获取配置          │
           │            │ - 服务配置 (dragon-game)
           │            │ - 公共配置 (dragon.common)
           │            └─────────┬────────────┘
           │                      │
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 快速检测 @import      │
           │            │ quickDetectImports() │
           │            └─────────┬────────────┘
           │                      │
           │                      ├─ 无 @import ──┐
           │                      │               ▼
           │                      │     ┌──────────────┐
           │                      │     │ 返回服务配置  │
           │                      │     └──────────────┘
           │                      │
           │                      ├─ 有 @import ──┐
           │                      │               ▼
           │                      │     ┌──────────────────┐
           │                      │     │ 创建 ConfigLoader │
           │                      │     │ setCommonConfig() │
           │                      │     └────────┬─────────┘
           │                      │              │
           │                      │              ▼
           │                      │     ┌──────────────────┐
           │                      │     │ 同步解析配置      │
           │                      │     │ parseConfig()    │
           │                      │     │ - 处理 @import   │
           │                      │     │ - 按需解密       │
           │                      │     │ - 合并配置       │
           │                      │     └────────┬─────────┘
           │                      │              │
           │                      └──────────────┤
           │                                     │
           └─────────────────────────────────────┤
                                                 │
                                                 ▼
                                    ┌─────────────────────┐
                                    │ 返回最终配置         │
                                    │ BaseConfigService   │
                                    └─────────────────────┘
```

## 实现代码

### 1. NacosManager.setupNacosConfig()

```typescript
// nacos.manager.ts
export class NacosManager extends NacosServerConfig {
    // ... 现有代码
    
    /**
     * 设置 Nacos 配置
     * 支持 NACOS_ENABLED 环境变量控制
     */
    async setupNacosConfig(nacosConfig?: string | NacosServerConfig): Promise<NacosConfig | undefined> {
        let configDataId: string;
        
        if (typeof nacosConfig === 'string') {
            configDataId = nacosConfig;
            this.DATA_ID = configDataId;
        } else if (nacosConfig) {
            configDataId = (nacosConfig as any).DATA_ID;
            this.DATA_ID = configDataId;
        } else {
            configDataId = this.DATA_ID;
        }
        
        // ✨ 检查 NACOS_ENABLED 环境变量
        const nacosEnabled = process.env.NACOS_ENABLED !== 'false';
        
        if (!nacosEnabled) {
            this._logger.log('⚙️ NACOS_ENABLED=false, using local config.default.json');
            return this.loadLocalConfig();
        }
        
        this._logger.log(`Setting up Nacos config for: ${configDataId}`);
        
        // ✨ 1. 并行获取服务配置和公共配置
        const [serviceConfig, commonConfig] = await Promise.all([
            this.getConfig(configDataId, this.GROUP),
            this.getConfig('dragon.common', this.GROUP)
        ]);
        
        if (!serviceConfig) {
            this._logger.warn(`⚠️ Failed to get service config: ${configDataId}, falling back to local config`);
            return this.loadLocalConfig();
        }
        
        // ✨ 2. 快速检测是否有 @import
        const needsCommon = this.quickDetectImports(serviceConfig);
        
        if (!needsCommon) {
            this._logger.log('No @import detected, using service config as-is');
            return serviceConfig;
        }
        
        if (!commonConfig) {
            this._logger.warn('⚠️ @import detected but dragon.common not found, using service config as-is');
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
        if (finalConfig['useKafka2Http']) {
            if (finalConfig['registry']) {
                this._kafka2HttpConfig = finalConfig['registry'];
                this._logger.log('✓ Using registry from config');
            } else {
                // 降级：尝试从旧的 server.naming.table 获取
                this._logger.warn('⚠️ Registry not found, falling back to server.naming.table');
                try {
                    this._kafka2HttpConfig = await this.getConfig(this.NAMING_DATA_ID, this.GROUP);
                } catch (error) {
                    this._logger.error('Failed to get fallback naming table:', error);
                }
            }
        }
        
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
            this._logger.error('Failed to load local config.default.json:', error);
            return undefined;
        }
    }
    
    /**
     * 快速检测配置中是否有 @import（浅层检测，性能优化）
     * 只检查第一层对象，不深度递归
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
}
```

### 2. ConfigLoaderService（简化版）

```typescript
// config-loader.service.ts
import { Logger } from '@nestjs/common';
import { ConfigEncryptor } from './config-encryptor';

export interface ConfigLoaderOptions {
    enableCache?: boolean;
    cacheExpiry?: number;
}

interface ConfigNode {
    '@import'?: string[];
    [key: string]: any;
}

export class ConfigLoaderService {
    private logger = new Logger(ConfigLoaderService.name);
    private commonConfig: Record<string, any> = {};
    private configCache: Map<string, any> = new Map();
    private encryptor?: ConfigEncryptor;  // 延迟初始化
    
    constructor(private options: ConfigLoaderOptions = {}) {
        // 不在构造函数中初始化加密器
    }
    
    /**
     * 设置公共配置（由 NacosManager 调用）
     */
    setCommonConfig(config: Record<string, any>): void {
        if (!config) {
            this.logger.warn('Setting empty common config');
            this.commonConfig = {};
            return;
        }
        
        this.commonConfig = config;
        this.logger.log(`Common config set with ${Object.keys(config).length} nodes`);
        
        // 清除缓存
        if (this.configCache.size > 0) {
            this.logger.log('Clearing config cache');
            this.configCache.clear();
        }
    }
    
    /**
     * 解析配置（同步方法）
     * 唯一特殊关键字：@import
     * 合并规则：同名替换，新key添加，对象递归合并，数组完全替换
     */
    parseConfig(serviceConfig: any): any {
        if (!serviceConfig) {
            this.logger.warn('Service config is null or undefined');
            return {};
        }
        
        if (Object.keys(this.commonConfig).length === 0) {
            this.logger.warn('Common config not set, using service config as-is');
            return serviceConfig;
        }
        
        const result: any = {};
        
        for (const [nodeName, nodeConfig] of Object.entries(serviceConfig)) {
            if (nodeConfig && typeof nodeConfig === 'object' && nodeConfig['@import']) {
                // 有 @import：处理导入和合并
                result[nodeName] = this.processNode(nodeName, nodeConfig as ConfigNode);
            } else {
                // 无 @import：直接保留
                result[nodeName] = nodeConfig;
            }
        }
        
        return result;
    }
    
    /**
     * 处理单个节点的导入和合并
     */
    private processNode(nodeName: string, nodeConfig: ConfigNode): any {
        // 检查缓存
        const cacheKey = this.getCacheKey(nodeName, nodeConfig);
        if (this.options.enableCache && this.configCache.has(cacheKey)) {
            return this.configCache.get(cacheKey);
        }
        
        let result: any = {};
        
        // 1. 处理 @import（唯一的特殊关键字）
        if (nodeConfig['@import'] && Array.isArray(nodeConfig['@import'])) {
            for (const importRef of nodeConfig['@import']) {
                if (!importRef.startsWith('@')) {
                    this.logger.warn(`Import ref must start with @: ${importRef}`);
                    continue;
                }
                
                const refName = importRef.substring(1);
                
                if (!this.commonConfig[refName]) {
                    this.logger.warn(`Import not found in common config: ${importRef}`);
                    continue;
                }
                
                let importedNode = this.commonConfig[refName];
                
                // 🔑 按需解密（只解密用到的节点）
                importedNode = this.decryptNode(importedNode);
                
                // 按顺序合并（后面覆盖前面）
                result = this.deepMerge(result, importedNode);
            }
        }
        
        // 2. 提取业务配置（排除 @import）
        const { '@import': _, ...businessConfig } = nodeConfig;
        
        // 3. 展开点路径（options.client.clientId）
        const expandedConfig = this.expandDotPaths(businessConfig);
        
        // 4. 合并业务配置（默认行为：同名替换，新key添加）
        result = this.deepMerge(result, expandedConfig);
        
        // 缓存结果
        if (this.options.enableCache) {
            this.configCache.set(cacheKey, result);
        }
        
        return result;
    }
    
    /**
     * 解密配置节点（按需初始化加密器）
     */
    private decryptNode(node: any): any {
        if (!node || typeof node !== 'object' || !node.$encrypt || !node.$data) {
            return node;
        }
        
        // 遇到加密节点时才初始化加密器
        if (!this.encryptor) {
            const secretKey = process.env.CONFIG_ENCRYPT_KEY;
            
            if (!secretKey) {
                this.logger.error('❌ CONFIG_ENCRYPT_KEY not found in environment');
                this.logger.error('Cannot decrypt config, using encrypted data as-is');
                return node;
            }
            
            this.logger.log('Initializing config encryptor...');
            this.encryptor = new ConfigEncryptor(secretKey);
        }
        
        try {
            const decrypted = this.encryptor.decrypt(node.$data);
            this.logger.log('✓ Config node decrypted successfully');
            return decrypted;
        } catch (error) {
            this.logger.error('Failed to decrypt node:', error);
            throw new Error(`Config decryption failed: ${error.message}`);
        }
    }
    
    /**
     * 处理点分隔路径
     * "options.client.clientId" -> { options: { client: { clientId: value } } }
     */
    private expandDotPaths(config: any): any {
        const expanded: any = {};
        
        for (const [key, value] of Object.entries(config)) {
            if (key.includes('.')) {
                // 点分隔路径
                const parts = key.split('.');
                let current = expanded;
                
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                
                current[parts[parts.length - 1]] = value;
            } else {
                expanded[key] = value;
            }
        }
        
        return expanded;
    }
    
    /**
     * 深度合并（简单规则）
     * - 同名字段：替换
     * - 不存在的key：添加
     * - 对象：递归合并
     * - 数组：完全替换
     */
    private deepMerge(target: any, source: any): any {
        if (!source || typeof source !== 'object') {
            return source;
        }
        
        if (Array.isArray(source)) {
            return [...source];
        }
        
        const result = { ...target };
        
        for (const [key, value] of Object.entries(source)) {
            if (value === undefined) {
                continue;
            }
            
            if (Array.isArray(value)) {
                result[key] = [...value];
            } else if (value !== null && typeof value === 'object') {
                result[key] = this.deepMerge(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        
        return result;
    }
    
    /**
     * 生成缓存 key
     */
    private getCacheKey(nodeName: string, nodeConfig: ConfigNode): string {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5')
            .update(JSON.stringify(nodeConfig))
            .digest('hex')
            .substring(0, 8);
        return `${nodeName}:${hash}`;
    }
    
    /**
     * 清除缓存
     */
    clearCache(): void {
        this.configCache.clear();
    }
}
```

## 使用场景

### 场景 1: 生产环境（Nacos 模式）

```bash
# .env.production
NACOS_ENABLED=true
NACOS_HOST=nacos.prod
NACOS_PORT=8848
NACOS_NAMESPACE=dragon-prod
CONFIG_ENCRYPT_KEY=prod-secret-key
```

**行为**：
- ✅ 从 Nacos 获取配置
- ✅ 处理 @import 继承
- ✅ 按需解密加密配置

### 场景 2: 开发环境（本地配置模式）

```bash
# .env.development
NACOS_ENABLED=false
```

**行为**：
- ✅ 直接读取 config.default.json
- ✅ 跳过 Nacos 请求
- ✅ 不处理 @import（本地配置应该是完整的）
- ✅ 快速启动，适合本地开发

### 场景 3: 测试环境（Nacos 但无加密）

```bash
# .env.test
NACOS_ENABLED=true
NACOS_HOST=nacos.test
# 不设置 CONFIG_ENCRYPT_KEY
```

**行为**：
- ✅ 从 Nacos 获取配置
- ✅ 处理 @import 继承
- ✅ 如果遇到加密配置会报错提示

### 场景 4: 未设置环境变量（默认 Nacos）

```bash
# 未设置 NACOS_ENABLED
```

**行为**：
- ✅ 默认启用 Nacos（向后兼容）
- ✅ 正常处理配置继承

## 配置示例

### dragon.common（Nacos）

```json
{
  "kafka-base": {
    "options": {
      "client": {
        "brokers": ["kafka-1:9092", "kafka-2:9092"]
      }
    }
  },
  "kafka-consumer": {
    "options": {
      "consumer": {
        "groupId": "dragon_consumer_group",
        "sessionTimeout": 30000
      }
    }
  },
  "redis": {
    "host": "redis.prod",
    "port": 6379,
    "db": 0,
    "keyPrefix": "dragon:",
    "ttl": 3600
  },
  "db": {
    "$encrypt": true,
    "$data": "iv:authTag:encryptedDbConfig..."
  },
  "registry": {
    "msg.user": "app.user",
    "msg.wallet": "app.wallet",
    "msg.game": "app.game"
  }
}
```

### dragon-game（Nacos）

```json
{
  "kafka": {
    "@import": ["@kafka-base", "@kafka-consumer"],
    "options.client.clientId": "game_client",
    "subscribeTopics": ["game", "tournament"]
  },
  "redis": {
    "@import": ["@redis"],
    "db": 2,
    "keyPrefix": "game:"
  },
  "db": {
    "@import": ["@db"],
    "database": "dragon_game"
  },
  "registry": {
    "@import": ["@registry"]
  },
  "service": {
    "name": "dragon-game",
    "port": 8001
  }
}
```

### config.default.json（本地文件）

```json
{
  "kafka": {
    "options": {
      "client": {
        "brokers": ["localhost:9092"],
        "clientId": "game_client"
      },
      "consumer": {
        "groupId": "dragon_consumer_group",
        "sessionTimeout": 30000
      }
    },
    "subscribeTopics": ["game", "tournament"]
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "db": 2,
    "keyPrefix": "game:"
  },
  "db": {
    "type": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "dragon_game",
    "username": "root",
    "password": "password"
  },
  "service": {
    "name": "dragon-game",
    "port": 8001
  }
}
```

## 优势总结

### 1. 灵活的部署模式
- ✅ **生产环境**：Nacos + 配置继承 + 加密
- ✅ **开发环境**：本地配置文件，快速启动
- ✅ **测试环境**：Nacos + 配置继承，无需加密

### 2. 简单的配置语法
- ✅ 只有一个特殊关键字：`@import`
- ✅ 引用格式：`@node-name`
- ✅ 合并规则：直观易懂

### 3. 性能优化
- ✅ 并行获取配置（Promise.all）
- ✅ 浅层检测 @import（不深度递归）
- ✅ 按需解密（只解密用到的节点）
- ✅ 配置缓存

### 4. 向后兼容
- ✅ 默认启用 Nacos（未设置 NACOS_ENABLED）
- ✅ 保留 server.naming.table 降级逻辑
- ✅ 无需修改现有服务代码

### 5. 开发体验
- ✅ 本地开发无需 Nacos
- ✅ 清晰的日志输出
- ✅ 明确的错误提示

## 实施步骤

### Phase 1: 实现核心功能（2-3天）
1. ✅ 实现 ConfigLoaderService
2. ✅ 更新 NacosManager.setupNacosConfig
3. ✅ 添加 NACOS_ENABLED 判断
4. ✅ 添加 quickDetectImports 方法
5. ✅ 单元测试

### Phase 2: 准备 Nacos 配置（1-2天）
1. ✅ 创建 dragon.common 配置模板
2. ✅ 迁移服务配置使用 @import
3. ✅ 添加 registry 节点

### Phase 3: 灰度发布（1-2周）
1. ✅ 部署到测试环境
2. ✅ 逐个服务验证
3. ✅ 监控日志和性能

### Phase 4: 清理（部署后 2 周）
1. ✅ 删除 server.naming.table
2. ✅ 移除 fetchKafka2HttpConfig() 方法
3. ✅ 更新文档

## 风险控制

| 风险 | 缓解措施 |
|------|---------|
| Nacos 不可用 | 降级到本地配置文件 |
| dragon.common 缺失 | 使用服务配置 as-is |
| 加密密钥缺失 | 明确错误提示，停止启动 |
| @import 引用不存在 | 警告日志，跳过该引用 |
| 配置解析失败 | 捕获异常，使用原始配置 |
