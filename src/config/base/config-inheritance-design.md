# 配置继承与加密方案设计 v2

## 一、设计目标

1. **配置复用**：公共配置可以被多个服务继承，支持多节点导入
2. **配置加密**：敏感配置可以加密存储
3. **精准覆盖**：支持任意层级的字段精准覆盖，未指定字段保留公共配置
4. **多环境支持**：公共配置按环境拆分（dev/test/prod）
5. **简化语法**：支持点分隔路径简化嵌套写法

## 二、配置存储结构

### 2.1 Nacos 配置组织

**Data ID: dragon.common** (公共配置 - 整合所有公共配置)
```json
{
  "kafka": {
    "$encrypt": true,
    "$data": "iv:authTag:encrypted_kafka_config..."
  },
  "redis": {
    "host": "{{process.env.REDIS_HOST || 'localhost'}}",
    "port": 6379,
    "db": 0,
    "keyPrefix": "dragon:",
    "ttl": 3600,
    "cluster": false
  },
  "db": {
    "type": "mysql",
    "charset": "utf8mb4",
    "logging": false,
    "synchronize": false,
    "maxQueryExecutionTime": 1000,
    "pool": {
      "max": 100,
      "min": 10
    }
  },
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
        "allowAutoTopicCreation": true,
        "sessionTimeout": 30000
      }
    }
  },
  "registry": {
    "msg.data": "app.data",
    "msg.auth": "app.auth",
    "msg.wallet": "app.wallet",
    "msg.profile": "app.user",
    "msg.user": "app.user",
    "msg.crm": "app.user",
    "msg.account": "app.user",
    "msg.tweet": "app.tweet",
    "msg.tweetlive": "app.tweet",
    "msg.tweet-comment": "app.tweet",
    "msg.tweet-praise": "app.tweet",
    "msg.tweet-feed": "app.tweet",
    "msg.gambling": "gambling.server",
    "msg.assistant": "app.assistant",
    "msg.search": "app.search",
    "msg.activity": "app.activity"
  }
}
```

**说明**:
- `registry` 节点整合了原 `server.naming.table` 的内容
- 这是一个 Kafka 消息路由注册表：`topic -> service` 的映射
- 键: Kafka topic 名称（如 `msg.user`）
- 值: 对应的服务 Data ID（如 `app.user`）
- 统一管理，所有服务共享同一份路由表

**Data ID: dragon-game** (服务配置)
```json
{
  "kafka": {
    "@import": ["kafka-base", "kafka-consumer"],
    "options.client.clientId": "game_client",
    "subscribeTopics": ["game", "tournament", "bet"]
  },
  "redis": {
    "@import": ["redis"],
    "db": 2,
    "keyPrefix": "game:"
  },
  "db": {
    "@import": ["db"],
    "database": "dragon_game",
    "host": "{{process.env.DB_HOST}}",
    "username": "game_user",
    "password": "{{process.env.DB_PASSWORD}}"
  },
  "registry": {
    "@import": ["registry"]
  },
  "service": {
    "name": "dragon-game",
    "port": 8001,
    "apiPrefix": "/api"
  },
  "useKafka2Http": true
}
```

**Data ID: dragon-user** (服务配置)
```json
{
  "kafka": {
    "@import": ["kafka"],
    "options.consumer.groupId": "user_consumer_group",
    "subscribeTopics": ["user", "profile", "auth"]
  },
  "redis": {
    "@import": ["redis"],
    "db": 3,
    "keyPrefix": "user:"
  },
  "db": {
    "@import": ["db"],
    "database": "dragon_user"
  },
  "naming": {
    "@import": ["naming"]
  },
  "useKafka2Http": true
}
```

**说明**:
- 服务配置通过 `@import: ["naming"]` 继承公共的服务命名表
- `useKafka2Http` 字段决定该服务是否需要加载 naming 配置
- 无需每个服务单独维护 `server.naming.table`

**kafka 解密后的内容:**
```json
{
  "options": {
    "client": {
      "clientId": "dragon_client",
      "brokers": ["kafka-1:9092", "kafka-2:9092"]
    },
    "consumer": {
      "groupId": "dragon_consumer_group",
      "allowAutoTopicCreation": true,
      "sessionTimeout": 30000
    }
  },
  "subscribeTopics": ["wallet", "auth", "user", "profile"]
}
```

### 2.2 服务配置文件

**dragon-game/config.json**
```json
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "game_client",
    "subscribeTopics": ["game", "tournament"]
  },
  "redis": {
    "@import": ["redis"],
    "db": 2,
    "keyPrefix": "game:"
  },
  "db": {
    "@import": ["db"],
    "database": "dragon_game",
    "host": "{{process.env.DB_HOST}}",
    "username": "game_user",
    "password": "{{process.env.DB_PASSWORD}}"
  },
  "service": {
    "name": "dragon-game",
    "port": 8001,
    "apiPrefix": "/api"
  }
}
```

**dragon-user/config.json**
```json
{
  "kafka": {
    "@import": ["kafka"],
    "options": {
      "consumer": {
        "groupId": "user_consumer_group"
      }
    },
    "subscribeTopics": ["user", "profile", "auth"]
  },
  "redis": {
    "@import": ["redis"],
    "db": 3,
    "keyPrefix": "user:"
  },
  "db": {
    "@import": ["db"],
    "database": "dragon_user",
    "pool.max": 100
  }
}
```

## 三、配置语法说明

### 3.1 核心语法

#### `@import`: 导入公共配置节点

**语法**: `"@import": ["node1", "node2", ...]`

**说明**: 
- 从公共配置文件导入指定节点
- 支持单节点或多节点导入
- 多节点按数组顺序合并，后面的覆盖前面的

**示例**:
```json
{
  "kafka": {
    "@import": ["kafka"]
  }
}
```

#### 字段覆盖: 精准替换

**规则**:
1. **直接覆盖**: 同名字段直接替换
2. **嵌套覆盖**: 对象字段递归合并
3. **数组替换**: 数组字段完全替换（不是追加）
4. **保留未指定**: 未指定的字段保留公共配置的值

**示例1: 基本类型覆盖**
```json
// 公共配置
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "db": 0
  }
}

// 业务配置
{
  "redis": {
    "@import": ["redis"],
    "db": 2
  }
}

// 最终结果
{
  "redis": {
    "host": "localhost",  // 保留
    "port": 6379,         // 保留
    "db": 2              // 覆盖
  }
}
```

**示例2: 嵌套对象覆盖**
```json
// 公共配置
{
  "kafka": {
    "options": {
      "client": {
        "clientId": "dragon_client",
        "brokers": ["kafka:9092"]
      },
      "consumer": {
        "groupId": "dragon_group",
        "sessionTimeout": 30000
      }
    }
  }
}

// 业务配置
{
  "kafka": {
    "@import": ["kafka"],
    "options": {
      "client": {
        "clientId": "game_client"
      }
    }
  }
}

// 最终结果
{
  "kafka": {
    "options": {
      "client": {
        "clientId": "game_client",        // 覆盖
        "brokers": ["kafka:9092"]         // 保留
      },
      "consumer": {                       // 保留整个对象
        "groupId": "dragon_group",
        "sessionTimeout": 30000
      }
    }
  }
}
```

**示例3: 数组替换**
```json
// 公共配置
{
  "kafka": {
    "subscribeTopics": ["wallet", "auth", "user", "profile"]
  }
}

// 业务配置
{
  "kafka": {
    "@import": ["kafka"],
    "subscribeTopics": ["game"]
  }
}

// 最终结果
{
  "kafka": {
    "subscribeTopics": ["game"]  // 完全替换，不是追加
  }
}
```

### 3.2 点分隔路径语法

**语法**: `"path.to.field": value`

**优势**: 简化深层嵌套字段的覆盖写法

**示例**:
```json
// 传统写法（冗长）
{
  "kafka": {
    "@import": ["kafka"],
    "options": {
      "client": {
        "clientId": "game_client"
      },
      "consumer": {
        "groupId": "game_consumer"
      }
    }
  }
}

// 点分隔路径写法（简洁）
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "game_client",
    "options.consumer.groupId": "game_consumer"
  }
}

// 两者结果相同
```

**支持的路径操作**:
```json
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "new_client",           // 修改字符串
    "options.consumer.sessionTimeout": 60000,          // 修改数字
    "options.consumer.autoCommit": true,               // 新增字段
    "subscribeTopics": ["game", "tournament"]          // 替换数组（不能用点路径）
  }
}

### 3.3 多节点导入

**语法**: `"@import": ["node1", "node2", "node3"]`

**合并顺序**: 从左到右，后面的覆盖前面的

**示例**:
```json
// common.json
{
  "kafka-base": {
    "options": {
      "client": {
        "brokers": ["kafka:9092"]
      }
    }
  },
  "kafka-consumer": {
    "options": {
      "consumer": {
        "groupId": "default_group",
        "sessionTimeout": 30000
      }
    }
  }
}

// 业务配置
{
  "kafka": {
    "@import": ["kafka-base", "kafka-consumer"],
    "options.consumer.groupId": "game_group"
  }
}

// 最终结果：先导入 kafka-base，再导入 kafka-consumer，最后应用本地覆盖
{
  "kafka": {
    "options": {
      "client": {
        "brokers": ["kafka:9092"]
      },
      "consumer": {
        "groupId": "game_group",      // 本地覆盖
        "sessionTimeout": 30000
      }
    }
  }
}
```

### 3.4 加密配置语法

**语法**:
```json
{
  "node": {
    "$encrypt": true,
    "$data": "iv:authTag:encryptedData"
  }
}
```

**说明**:
- `$encrypt`: 标识该节点已加密
- `$data`: 加密后的字符串，格式为 `iv:authTag:encryptedData`
- 解密后自动展开为原始 JSON 对象

### 3.5 无 @import 的节点

**规则**: 直接作为新配置节保留

**示例**:
```json
{
  "kafka": {
    "@import": ["kafka"]
  },
  "service": {
    "name": "dragon-game",
    "port": 8001
  },
  "customSettings": {
    "feature1": true,
    "feature2": "enabled"
  }
}
```

`service` 和 `customSettings` 节没有 `@import`，直接作为独立配置保留。

## 四、实现方案

### 4.1 配置处理流程（基于 Nacos）

```
┌─────────────────────────┐
│ 1. 服务启动初始化        │
│ ConfigService 构造函数   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 2. 从 Nacos 获取服务配置 │
│ Data ID: dragon-game    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 3. 检测配置中的 @import  │
│ 是否需要公共配置？       │
└──────────┬──────────────┘
           │
           ├─ 有 @import ──┐
           │               ▼
           │      ┌──────────────────────┐
           │      │ 4. 从 Nacos 获取公共配置│
           │      │ Data ID: dragon.common│
           │      └─────────┬────────────┘
           │                │
           │                ▼
           │      ┌──────────────────────┐
           │      │ 5. 缓存公共配置       │
           │      │ commonConfigCache    │
           │      └─────────┬────────────┘
           │                │
           │                ▼
           │      ┌──────────────────────┐
           │      │ 6. 遍历 @import 数组  │
           │      │ 按顺序提取节点        │
           │      └─────────┬────────────┘
           │                │
           │                ▼
           │      ┌──────────────────────┐
           │      │ 7. 检测 $encrypt     │
           │      │ 解密加密节点          │
           │      └─────────┬────────────┘
           │                │
           │                ▼
           │      ┌──────────────────────┐
           │      │ 8. 多节点按序合并     │
           │      │ node1 → node2 → ...  │
           │      └─────────┬────────────┘
           │                │
           │                ▼
           │      ┌──────────────────────┐
           │      │ 9. 处理点路径语法     │
           │      │ "a.b.c" → {a:{b:{c}}}│
           │      └─────────┬────────────┘
           │                │
           │                ▼
           │      ┌──────────────────────┐
           │      │ 10. 深度合并本地配置  │
           │      │ 精准字段覆盖          │
           │      └─────────┬────────────┘
           │                │
           └─ 无 @import ───┤
                            │
                            ▼
                   ┌──────────────────────┐
                   │ 11. 执行动态函数      │
                   │ {{process.env.XXX}}  │
                   └─────────┬────────────┘
                            │
                            ▼
                   ┌──────────────────────┐
                   │ 12. 返回最终配置      │
                   └─────────┬────────────┘
                            │
                            ▼
                   ┌──────────────────────┐
                   │ 13. 监听 Nacos 变化   │
                   │ 配置更新触发重新加载  │
                   └──────────────────────┘
```

### 4.2 Nacos 配置更新流程

```
┌──────────────────────┐
│ Nacos 配置中心        │
│ 配置发生变更          │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Nacos Client 监听器   │
│ onConfigChange 触发   │
└──────────┬───────────┘
           │
           ├─ dragon.common 更新 ─┐
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 清除公共配置缓存      │
           │            │ commonConfigCache    │
           │            └─────────┬────────────┘
           │                      │
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 重新加载公共配置      │
           │            └─────────┬────────────┘
           │                      │
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 触发所有服务配置重载  │
           │            │ 重新处理 @import     │
           │            └──────────────────────┘
           │
           ├─ dragon-game 更新 ───┐
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 重新处理服务配置      │
           │            │ 合并公共配置          │
           │            └─────────┬────────────┘
           │                      │
           │                      ▼
           │            ┌──────────────────────┐
           │            │ 更新服务实例配置      │
           │            │ ConfigService.reload()│
           │            └──────────────────────┘
           │
           └──────────────────────┘
```

### 4.3 核心类设计

```typescript
// config-loader.interface.ts
export interface EncryptedConfig {
  $encrypt: boolean;
  $data: string;
}

export interface ConfigNode {
  '@import'?: string[];
  [key: string]: any;
}

export interface ConfigLoaderOptions {
  nacosManager: NacosManager;       // Nacos 管理器实例
  commonDataId?: string;            // 公共配置 Data ID，默认: dragon.common
  encryptKey?: string;              // 加密密钥
  enableCache?: boolean;            // 启用缓存
  autoReload?: boolean;             // 自动重载配置
}

// 服务命名表配置接口
export interface NamingConfig {
  useKafka2Http: boolean;
  services: {
    [serviceName: string]: {
      url: string;
      kafka2http: boolean;
    };
  };
}

// Kafka2Http 配置（废弃，由 NamingConfig 替代）
// @deprecated Use NamingConfig from dragon.common instead
export interface Kafka2HttpConfig {
  [serviceName: string]: {
    url: string;
    kafka2http?: boolean;
  };
}

// config-loader.service.ts
export class ConfigLoaderService {
  private logger = new Logger(ConfigLoaderService.name);
  private commonConfig: Record<string, any> | null = null;
  private configCache: Map<string, any>;
  private encryptor: ConfigEncryptor;
  private nacosManager: NacosManager;
  private commonDataId: string;
  private configListeners: Map<string, () => void> = new Map();
  
  constructor(private options: ConfigLoaderOptions) {
    this.nacosManager = options.nacosManager;
    this.commonDataId = options.commonDataId || 'dragon.common';
    this.encryptor = new ConfigEncryptor(options.encryptKey || process.env.CONFIG_ENCRYPT_KEY);
    this.configCache = new Map();
    
    // 如果启用自动重载，监听公共配置变化
    if (options.autoReload !== false) {
      this.watchCommonConfig();
    }
  }
  
  /**
   * 从 Nacos 加载公共配置
   * dragon.common 包含所有公共配置：kafka, redis, db, naming 等
   */
  async loadCommonConfig(): Promise<Record<string, any>> {
    // 检查缓存
    if (this.commonConfig && this.options.enableCache) {
      this.logger.debug('Using cached common config');
      return this.commonConfig;
    }
    
    try {
      this.logger.log(`Loading common config from Nacos: ${this.commonDataId}`);
      
      // 从 Nacos 获取公共配置（包含 naming 配置）
      const configContent = await this.nacosManager.getConfig(this.commonDataId);
      
      if (!configContent) {
        this.logger.warn(`Common config not found in Nacos: ${this.commonDataId}`);
        return {};
      }
      
      // 解析 JSON
      this.commonConfig = JSON.parse(configContent);
      this.logger.log('Common config loaded successfully');
      
      // 记录包含的配置节点
      const nodeKeys = Object.keys(this.commonConfig);
      this.logger.debug(`Common config nodes: ${nodeKeys.join(', ')}`);
      
      return this.commonConfig;
    } catch (error) {
      this.logger.error(`Failed to load common config from Nacos:`, error);
      throw error;
    }
  }
  
  /**
   * 获取服务命名表配置
   * 从 dragon.common 的 naming 节点获取
   * 替代原来单独获取 server.naming.table 的方式
   */
  async getNamingConfig(): Promise<any> {
    await this.loadCommonConfig();
    
    if (this.commonConfig && this.commonConfig['naming']) {
      return this.commonConfig['naming'];
    }
    
    this.logger.warn('Naming config not found in common config');
    return null;
  }
  
  /**
   * 检查是否启用 Kafka2Http
   * 从公共配置的 naming 节点读取
   */
  isKafka2HttpEnabled(): boolean {
    if (!this.commonConfig || !this.commonConfig['naming']) {
      return false;
    }
    
    return this.commonConfig['naming']['useKafka2Http'] === true;
  }
  
  /**
   * 监听公共配置变化
   */
  private watchCommonConfig(): void {
    this.nacosManager.subscribe(this.commonDataId, async (configContent: string) => {
      this.logger.log(`Common config updated, reloading...`);
      
      try {
        // 清除缓存
        this.commonConfig = null;
        this.configCache.clear();
        
        // 重新解析公共配置
        this.commonConfig = JSON.parse(configContent);
        
        // 触发所有配置监听器重新加载
        this.logger.log(`Triggering ${this.configListeners.size} config listeners...`);
        for (const [key, listener] of this.configListeners.entries()) {
          try {
            await listener();
            this.logger.log(`Config listener ${key} reloaded successfully`);
          } catch (error) {
            this.logger.error(`Config listener ${key} reload failed:`, error);
          }
        }
      } catch (error) {
        this.logger.error('Failed to reload common config:', error);
      }
    });
    
    this.logger.log(`Watching common config changes: ${this.commonDataId}`);
  }
  
  /**
   * 注册配置重载监听器
   * 当公共配置更新时，会触发这些监听器
   */
  registerReloadListener(key: string, listener: () => void | Promise<void>): void {
    this.configListeners.set(key, listener);
    this.logger.debug(`Registered config reload listener: ${key}`);
  }
  
  /**
   * 取消注册配置监听器
   */
  unregisterReloadListener(key: string): void {
    this.configListeners.delete(key);
    this.logger.debug(`Unregistered config reload listener: ${key}`);
  }
  
  /**
   * 解密配置节点
   */
  private decryptNode(node: any): any {
    if (node && typeof node === 'object' && node.$encrypt && node.$data) {
      return this.encryptor.decrypt(node.$data);
    }
    return node;
  }
  
  /**
   * 处理点分隔路径
   * "options.client.clientId" -> 转换为嵌套对象
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
   * 深度合并对象
   * 规则：
   * 1. 基本类型：直接覆盖
   * 2. 数组：完全替换
   * 3. 对象：递归合并
   */
  private deepMerge(target: any, source: any): any {
    if (!source || typeof source !== 'object') {
      return source;
    }
    
    if (Array.isArray(source)) {
      // 数组完全替换
      return [...source];
    }
    
    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        // 数组：完全替换
        result[key] = [...value];
      } else if (value !== null && typeof value === 'object') {
        // 对象：递归合并
        result[key] = this.deepMerge(result[key] || {}, value);
      } else {
        // 基本类型：直接覆盖
        result[key] = value;
      }
    }
    
    return result;
  }
  
  /**
   * 处理单个节点的导入和合并
   */
  private processNode(nodeName: string, nodeConfig: ConfigNode): any {
    // 检查缓存
    const cacheKey = `${nodeName}:${JSON.stringify(nodeConfig)}`;
    if (this.options.enableCache && this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }
    
    let result: any = {};
    
    // 处理 @import
    if (nodeConfig['@import'] && Array.isArray(nodeConfig['@import'])) {
      for (const importName of nodeConfig['@import']) {
        if (!this.commonConfig[importName]) {
          this.logger.warn(`Import node not found in common config: ${importName}`);
          continue;
        }
        
        // 获取导入的节点
        let importedNode = this.commonConfig[importName];
        
        // 解密（如果需要）
        importedNode = this.decryptNode(importedNode);
        
        // 合并到结果
        result = this.deepMerge(result, importedNode);
      }
    }
    
    // 处理本地配置覆盖
    const { '@import': _, ...localConfig } = nodeConfig;
    
    // 展开点分隔路径
    const expandedConfig = this.expandDotPaths(localConfig);
    
    // 合并本地配置
    result = this.deepMerge(result, expandedConfig);
    
    // 缓存结果
    if (this.options.enableCache) {
      this.configCache.set(cacheKey, result);
    }
    
    return result;
  }
  
  /**
   * 解析完整配置（同步方法）
   * 前提：commonConfig 已通过 setCommonConfig 设置
   */
  parseConfig(serviceConfig: any): any {
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
   * 清除缓存
   */
  clearCache(): void {
    this.configCache.clear();
  }
}
```

### 4.3 加密工具设计

```typescript
// config-encryptor.ts
export class ConfigEncryptor {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  
  constructor(secretKey: string) {
    // 从环境变量或配置中心获取密钥
    this.key = crypto.scryptSync(secretKey, 'salt', 32);
  }
  
  // 加密配置节点
  encrypt(data: any): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    const jsonStr = JSON.stringify(data);
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // 格式: iv:authTag:encryptedData
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }
  
  // 解密配置节点
  decrypt(encryptedData: string): any {
    const [ivStr, authTagStr, encrypted] = encryptedData.split(':');
    
    const iv = Buffer.from(ivStr, 'base64');
    const authTag = Buffer.from(authTagStr, 'base64');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
}
```

## 五、完整使用示例

### 5.1 准备公共配置文件

**步骤1: 创建原始配置**

```json
// config/common.dev.json
{
  "kafka": {
    "options": {
      "client": {
        "clientId": "dragon_client",
        "brokers": ["localhost:9092"]
      },
      "consumer": {
        "groupId": "dragon_consumer_group",
        "allowAutoTopicCreation": true,
        "sessionTimeout": 30000
      }
    },
    "subscribeTopics": ["wallet", "auth", "user", "profile"]
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "db": 0,
    "keyPrefix": "dragon:",
    "ttl": 3600
  },
  "db": {
    "type": "mysql",
    "charset": "utf8mb4",
    "logging": true,
    "synchronize": false,
    "pool": {
      "max": 50,
      "min": 5
    }
  }
}
```

**步骤2: 加密敏感配置**

```typescript
// scripts/encrypt-config.ts
import { ConfigEncryptor } from '@dragon/common';
import * as fs from 'fs';
import * as path from 'path';

async function encryptCommonConfig() {
  const encryptor = new ConfigEncryptor(process.env.CONFIG_ENCRYPT_KEY!);
  
  // 读取开发环境配置
  const devConfig = JSON.parse(
    fs.readFileSync('config/common.dev.json', 'utf-8')
  );
  
  // 加密 kafka 配置
  const encryptedKafka = encryptor.encrypt(devConfig.kafka);
  
  // 生成加密后的配置文件
  const encryptedConfig = {
    kafka: {
      $encrypt: true,
      $data: encryptedKafka
    },
    redis: devConfig.redis,  // redis 不加密
    db: devConfig.db         // db 不加密
  };
  
  // 写入加密后的配置
  fs.writeFileSync(
    'config/common.dev.encrypted.json',
    JSON.stringify(encryptedConfig, null, 2)
  );
  
  console.log('✅ Configuration encrypted successfully');
}

encryptCommonConfig().catch(console.error);
```

**运行加密脚本**:
```bash
CONFIG_ENCRYPT_KEY=your-secret-key-here pnpm run encrypt-config
```

### 5.2 服务配置文件

**dragon-game/config.json**
```json
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "game_client",
    "subscribeTopics": ["game", "tournament", "bet"]
  },
  "redis": {
    "@import": ["redis"],
    "db": 2,
    "keyPrefix": "game:"
  },
  "db": {
    "@import": ["db"],
    "database": "dragon_game",
    "host": "{{process.env.DB_HOST || 'localhost'}}",
    "port": 3306,
    "username": "game_user",
    "password": "{{process.env.DB_PASSWORD}}",
    "pool.max": 100
  },
  "service": {
    "name": "dragon-game",
    "port": 8001,
    "apiPrefix": "/api"
  }
}
```

**dragon-user/config.json**
```json
{
  "kafka": {
    "@import": ["kafka"],
    "options": {
      "consumer": {
        "groupId": "user_consumer_group"
      }
    },
    "subscribeTopics": ["user", "profile", "auth"]
  },
  "redis": {
    "@import": ["redis"],
    "db": 3,
    "keyPrefix": "user:",
    "ttl": 7200
  },
  "db": {
    "@import": ["db"],
    "database": "dragon_user"
  }
}
```

### 5.3 在服务中集成（基于 Nacos）

**dragon-common-module/src/config/base/baseconfig.service.ts**
```typescript
import { Logger } from '@nestjs/common';
import * as _ from 'lodash';
import { NacosConfig } from './config.interface';
import { ConfigLoaderService } from './config-loader.service';
import { NacosManager } from './nacos.manager';

export abstract class BaseConfigService {
    logger = new Logger(BaseConfigService.name);
    protected readonly env: string;
    private configLoader: ConfigLoaderService;
    private isInitialized = false;
    private initPromise: Promise<void>;
    
    constructor(
        protected nacosConfigs?: NacosConfig,
        protected nacosManager?: NacosManager
    ) {
        this.env = process.env.NODE_ENV || 'development';
        
        if (!nacosManager) {
            throw new Error('NacosManager is required for config loading');
        }
        
        // 初始化配置加载器
        this.configLoader = new ConfigLoaderService({
            nacosManager: nacosManager,
            commonDataId: 'dragon.common',
            encryptKey: process.env.CONFIG_ENCRYPT_KEY,
            enableCache: true,
            autoReload: true
        });
        
        // 注册配置重载监听器
        this.configLoader.registerReloadListener(
            this.constructor.name,
            () => this.reloadConfig()
        );
        
        // 异步初始化配置
        this.initPromise = this.initConfig();
    }
    
    /**
     * 初始化配置
     */
    private async initConfig(): Promise<void> {
        if (this.isInitialized) {
            return;
        }
        
        try {
            this.logger.log('Initializing configuration...');
            
            // 处理配置继承
            if (this.nacosConfigs) {
                this.nacosConfigs = await this.configLoader.parseConfig(this.nacosConfigs);
            }
            
            // 合并默认配置
            const confDefault = this.getDefaultConf();
            if (this.nacosConfigs) {
                _.merge(confDefault, this.nacosConfigs);
                this.nacosConfigs = confDefault;
            } else {
                this.nacosConfigs = confDefault;
            }
            
            // 执行动态函数
            this.evalFunc(this.nacosConfigs);
            
            this.isInitialized = true;
            this.logger.log('Configuration initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize configuration:', error);
            throw error;
        }
    }
    
    /**
     * 重新加载配置（Nacos 配置更新时调用）
     */
    private async reloadConfig(): Promise<void> {
        this.logger.log('Reloading configuration due to Nacos update...');
        
        this.isInitialized = false;
        await this.initConfig();
        
        // 调用子类的重载钩子
        await this.onConfigReload();
        
        this.logger.log('Configuration reloaded successfully');
    }
    
    /**
     * 配置重载钩子，子类可以覆盖此方法
     */
    protected async onConfigReload(): Promise<void> {
        // 子类可以实现此方法来处理配置重载后的逻辑
        // 例如：重新初始化数据库连接、Redis 连接等
    }
    
    /**
     * 等待配置初始化完成
     */
    async waitForInit(): Promise<void> {
        await this.initPromise;
    }
    
    get isDevelopment(): boolean {
        return this.env === 'development';
    }
    
    get isProduction(): boolean {
        return this.env === 'production';
    }
    
    // ... 其他方法保持不变
    
    /**
     * 销毁时取消注册监听器
     */
    destroy(): void {
        this.configLoader.unregisterReloadListener(this.constructor.name);
    }
}
```

**dragon-game/src/config/config.service.ts**
```typescript
import { BaseConfigService, NacosManager } from '@dragon/common';
import { DBConfig, KafkaConfig, RedisConfig, ServiceConfig } from './type';

export class ConfigService extends BaseConfigService {
    readonly db: DBConfig;
    readonly redis: RedisConfig;
    readonly kafka: KafkaConfig;
    readonly service: ServiceConfig;
    
    constructor(nacosConfigs?: any, nacosManager?: NacosManager) {
        // 调用父类构造函数，会自动处理配置继承
        super(nacosConfigs, nacosManager);
        
        // 等待配置初始化完成后再初始化各个模块
        this.waitForInit().then(() => {
            this.initModules();
        });
    }
    
    private initModules(): void {
        const configs = this.nacosConfigs || {} as any;
        
        this.db = new DBConfig(configs.db);
        this.redis = new RedisConfig(configs.redis);
        this.kafka = new KafkaConfig(configs.kafka);
        this.service = new ServiceConfig(configs.service);
        
        this.logger.log('All config modules initialized');
    }
    
    /**
     * 配置重载后的处理
     */
    protected async onConfigReload(): Promise<void> {
        this.logger.log('Handling config reload in GameConfigService...');
        
        // 重新初始化各个模块
        this.initModules();
        
        // 这里可以添加其他重载逻辑，比如：
        // - 重新连接数据库
        // - 重新连接 Redis
        // - 重新订阅 Kafka topic
    }
}
```

**dragon-game/src/main.ts** (使用示例)
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { NacosManager } from '@dragon/common';

async function bootstrap() {
  // 1. 初始化 Nacos Manager
  const nacosManager = new NacosManager({
    serverAddr: process.env.NACOS_SERVER || 'localhost:8848',
    namespace: process.env.NACOS_NAMESPACE || 'public',
    group: process.env.NACOS_GROUP || 'DEFAULT_GROUP'
  });
  
  await nacosManager.init();
  
  // 2. 从 Nacos 获取服务配置
  const dataId = 'dragon-game';
  const nacosConfig = await nacosManager.getConfig(dataId);
  const serviceConfig = JSON.parse(nacosConfig);
  
  // 3. 创建 ConfigService（会自动处理 @import 和配置继承）
  const configService = new ConfigService(serviceConfig, nacosManager);
  await configService.waitForInit();
  
  // 4. 创建应用
  const app = await NestFactory.create(AppModule, {
    logger: configService.Logger
  });
  
  // 5. 监听服务配置变化
  nacosManager.subscribe(dataId, async (newConfig: string) => {
    console.log('Service config updated, reloading...');
    const newServiceConfig = JSON.parse(newConfig);
    // ConfigService 会自动重新处理配置继承
  });
  
  // 6. 启动应用
  await app.listen(configService.service.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
```

### 5.4 最终效果对比

**dragon-game 最终配置**:
```json
{
  "kafka": {
    "options": {
      "client": {
        "clientId": "game_client",              // ← 覆盖
        "brokers": ["localhost:9092"]           // ← 继承
      },
      "consumer": {
        "groupId": "dragon_consumer_group",     // ← 继承
        "allowAutoTopicCreation": true,         // ← 继承
        "sessionTimeout": 30000                 // ← 继承
      }
    },
    "subscribeTopics": ["game", "tournament", "bet"]  // ← 替换
  },
  "redis": {
    "host": "localhost",      // ← 继承
    "port": 6379,            // ← 继承
    "db": 2,                 // ← 覆盖
    "keyPrefix": "game:",    // ← 覆盖
    "ttl": 3600             // ← 继承
  },
  "db": {
    "type": "mysql",                    // ← 继承
    "charset": "utf8mb4",               // ← 继承
    "logging": true,                    // ← 继承
    "synchronize": false,               // ← 继承
    "database": "dragon_game",          // ← 新增
    "host": "localhost",                // ← 新增
    "port": 3306,                       // ← 新增
    "username": "game_user",            // ← 新增
    "password": "******",               // ← 新增
    "pool": {
      "max": 100,                       // ← 覆盖
      "min": 5                          // ← 继承
    }
  },
  "service": {                          // ← 完全独立（无 @import）
    "name": "dragon-game",
    "port": 8001,
    "apiPrefix": "/api"
  }
}
```

## 六、配置对比

### 6.1 当前方式（冗余严重）

**每个服务都要重复配置 kafka**:

```json
// dragon-game/config.json (185 行)
{
  "kafka": {
    "options": {
      "client": {
        "clientId": "game_client",
        "brokers": ["kafka-1:9092", "kafka-2:9092", "kafka-3:9092"]
      },
      "consumer": {
        "groupId": "dragon_consumer_group",
        "allowAutoTopicCreation": true,
        "sessionTimeout": 30000,
        "heartbeatInterval": 3000
      }
    },
    "subscribeTopics": ["game", "tournament"]
  },
  "redis": { /* 50行重复配置 */ },
  "db": { /* 50行重复配置 */ }
}

// dragon-user/config.json (180 行)
{
  "kafka": {
    "options": {
      "client": {
        "clientId": "game_client",         // 重复
        "brokers": ["kafka-1:9092", ...]   // 重复
      },
      "consumer": {
        "groupId": "dragon_consumer_group", // 重复
        "allowAutoTopicCreation": true,     // 重复
        "sessionTimeout": 30000,            // 重复
        "heartbeatInterval": 3000           // 重复
      }
    },
    "subscribeTopics": ["user", "profile"]  // 仅此不同
  }
}

// 10个服务 = 1850 行重复配置！
```

**问题**:
- ❌ 修改 broker 地址需要改 10 个文件
- ❌ 配置不一致风险高
- ❌ 难以维护和审查
- ❌ Git diff 混乱

### 6.2 新方式（简洁高效）

**公共配置一份**:
```json
// config/common.prod.json (100 行)
{
  "kafka": {
    "$encrypt": true,
    "$data": "encrypted_data..."
  }
}
```

**每个服务只写差异**:
```json
// dragon-game/config.json (15 行)
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "game_client",
    "subscribeTopics": ["game", "tournament"]
  }
}

// dragon-user/config.json (12 行)
{
  "kafka": {
    "@import": ["kafka"],
    "subscribeTopics": ["user", "profile"]
  }
}

// 10个服务 = 100行公共 + 130行差异 = 230行总配置
```

**优势**:
- ✅ 配置量减少 **88%** (1850 → 230 行)
- ✅ 修改 broker 地址只需改 1 个地方
- ✅ 配置一致性有保障
- ✅ Git diff 清晰可读
- ✅ 敏感信息加密存储

## 七、高级特性

### 7.1 多节点组合继承

```json
// common.prod.json
{
  "kafka-base": {
    "options": {
      "client": {
        "brokers": ["kafka-1:9092", "kafka-2:9092"]
      }
    }
  },
  "kafka-consumer-config": {
    "options": {
      "consumer": {
        "groupId": "dragon_group",
        "sessionTimeout": 30000
      }
    }
  },
  "kafka-game-topics": {
    "subscribeTopics": ["game", "tournament", "bet"]
  }
}

// dragon-game/config.json
{
  "kafka": {
    "@import": ["kafka-base", "kafka-consumer-config", "kafka-game-topics"],
    "options.client.clientId": "game_client"
  }
}

// 结果：三个节点合并 + 本地覆盖
```

### 7.2 Nacos 配置热更新

**场景1: 修改 Kafka broker 地址**

```
1. 在 Nacos 控制台修改 dragon.common 配置
2. 修改 kafka.options.client.brokers 字段
3. 发布配置
   ↓
4. 所有服务的 ConfigLoaderService 收到通知
5. 清除公共配置缓存
6. 重新加载 dragon.common
7. 触发所有服务的配置重载
8. 各服务的 onConfigReload() 被调用
9. 重新初始化 Kafka 连接
   ↓
10. ✅ 所有服务自动切换到新的 Kafka broker
```

**场景2: 修改单个服务配置**

```
1. 在 Nacos 控制台修改 dragon-game 配置
2. 修改 subscribeTopics 字段
3. 发布配置
   ↓
4. dragon-game 服务的 Nacos 监听器收到通知
5. 重新解析服务配置（包含 @import 处理）
6. 触发 dragon-game 的配置重载
7. onConfigReload() 重新订阅 Kafka topics
   ↓
8. ✅ dragon-game 服务自动更新 topic 订阅
```

**配置更新影响范围**:

| 配置变更 | 影响范围 | 重载时间 |
|---------|---------|---------|
| dragon.common | 所有使用该节点的服务 | ~2-5秒 |
| dragon-game | 仅 dragon-game 服务 | ~1-2秒 |
| dragon.common (加密节点) | 所有使用该节点的服务 | ~2-5秒 |

### 7.3 点路径语法简化

```json
// 传统嵌套写法（冗长）
{
  "kafka": {
    "@import": ["kafka"],
    "options": {
      "client": {
        "clientId": "game_client",
        "connectionTimeout": 10000
      },
      "consumer": {
        "groupId": "game_group",
        "sessionTimeout": 60000
      }
    }
  }
}

// 点路径写法（简洁）
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "game_client",
    "options.client.connectionTimeout": 10000,
    "options.consumer.groupId": "game_group",
    "options.consumer.sessionTimeout": 60000
  }
}

// 混合写法（推荐）
{
  "kafka": {
    "@import": ["kafka"],
    "options.client.clientId": "game_client",  // 简单覆盖用点路径
    "subscribeTopics": ["game", "bet"]         // 数组替换用直接字段
  }
}
```

## 八、Nacos 配置管理最佳实践

### 8.1 配置组织策略

**Data ID 命名规范**:
```
dragon.common          - 所有服务的公共配置（整合所有公共内容）
  ├─ kafka            - Kafka 公共配置
  ├─ redis            - Redis 公共配置
  ├─ db               - 数据库公共配置
  ├─ naming           - 服务命名表（原 server.naming.table）
  └─ ...              - 其他公共配置节点

dragon-game           - dragon-game 服务配置
dragon-user           - dragon-user 服务配置
dragon-wallet         - dragon-wallet 服务配置

❌ 废弃的 Data ID:
server.naming.table   - 已整合到 dragon.common.naming
```

**优势**:
- ✅ 所有公共配置统一管理在 `dragon.common`
- ✅ 减少 Nacos 请求次数（1次获取所有公共配置）
- ✅ 简化配置逻辑，无需单独判断和获取 naming 配置
- ✅ 配置更新时统一触发重载

**Group 分组**:
```
DEFAULT_GROUP         - 默认组
COMMON_CONFIG         - 公共配置组
SERVICE_CONFIG        - 服务配置组
```

**Namespace 隔离**:
```
dev                   - 开发环境
test                  - 测试环境
staging               - 预发布环境
prod                  - 生产环境
```

### 8.2 配置加密策略

**加密内容选择**:
```json
{
  "kafka": {
    "$encrypt": true,        // ✅ 推荐加密（包含 broker 地址和认证信息）
    "$data": "..."
  },
  "redis": {
    "$encrypt": true,        // ✅ 推荐加密（包含密码）
    "$data": "..."
  },
  "db": {
    "$encrypt": false,       // ❌ 部分加密（敏感字段单独加密）
    "host": "{{env.DB_HOST}}",
    "password": {
      "$encrypt": true,
      "$data": "..."
    }
  }
}
```

**密钥管理**:
1. 使用环境变量存储密钥: `CONFIG_ENCRYPT_KEY`
2. 不同环境使用不同密钥
3. 定期轮换密钥（建议 90 天）
4. 使用密钥管理服务（AWS KMS, Azure Key Vault）

### 8.3 配置更新流程

**开发环境**:
```
1. 在 Nacos 控制台直接修改配置
2. 发布配置
3. 服务自动热更新（2-5秒内生效）
4. 观察日志确认更新成功
```

**生产环境**:
```
1. 在测试环境验证配置变更
2. 使用 Nacos API 批量更新配置
3. 灰度发布（先更新部分实例）
4. 监控服务状态和日志
5. 确认无误后全量发布
6. 必要时可以回滚配置
```

### 8.4 配置版本管理

**使用 Git 管理配置模板**:
```bash
config-templates/
├── common/
│   ├── dragon.common.dev.json
│   ├── dragon.common.test.json
│   └── dragon.common.prod.json
└── services/
    ├── dragon-game.json
    ├── dragon-user.json
    └── dragon-wallet.json
```

**配置同步脚本**:
```bash
#!/bin/bash
# sync-config-to-nacos.sh

NACOS_SERVER="http://nacos:8848"
NAMESPACE="prod"
GROUP="DEFAULT_GROUP"

# 上传公共配置
curl -X POST "$NACOS_SERVER/nacos/v1/cs/configs" \
  -d "dataId=dragon.common" \
  -d "group=$GROUP" \
  -d "tenant=$NAMESPACE" \
  -d "content=$(cat config-templates/common/dragon.common.prod.json)"

# 上传服务配置
for file in config-templates/services/*.json; do
  dataId=$(basename "$file" .json)
  curl -X POST "$NACOS_SERVER/nacos/v1/cs/configs" \
    -d "dataId=$dataId" \
    -d "group=$GROUP" \
    -d "tenant=$NAMESPACE" \
    -d "content=$(cat $file)"
done
```

## 九、实施计划

### 阶段1: 核心功能（2-3天）
- [ ] ConfigLoaderService 基础实现
  - [ ] 从 Nacos 加载公共配置
  - [ ] @import 单节点导入
  - [ ] 深度合并算法
- [ ] Nacos 配置监听
  - [ ] 监听 dragon.common 变化
  - [ ] 配置热更新机制
- [ ] 集成到 BaseConfigService

### 阶段2: 高级特性（2-3天）
- [ ] ConfigEncryptor 加密/解密
  - [ ] AES-256-GCM 实现
  - [ ] $encrypt 字段处理
- [ ] @import 多节点导入
- [ ] 点路径语法解析
- [ ] 配置缓存优化

### 阶段3: 整合 naming 配置（1-2天）
- [ ] 迁移 server.naming.table 到 dragon.common
  - [ ] 在 dragon.common 添加 naming 节点
  - [ ] 包含 useKafka2Http 和 services 配置
- [ ] 更新 NacosManager
  - [ ] 移除单独获取 NAMING_DATA_ID 的逻辑
  - [ ] 从 commonConfig.naming 读取服务命名表
  - [ ] 废弃 fetchKafka2HttpConfig() 方法
- [ ] 更新 ConfigLoaderService
  - [ ] 添加 getNamingConfig() 方法
  - [ ] 添加 isKafka2HttpEnabled() 方法
- [ ] 向后兼容处理
  - [ ] 保留 server.naming.table 作为降级方案
  - [ ] 优先使用 dragon.common.naming
  - [ ] 添加迁移警告日志

### 阶段4: 工具和测试（2-3天）
- [ ] 加密工具 CLI
  ```bash
  pnpm run encrypt-config --input=kafka.json --output=encrypted.json
  ```
- [ ] 配置验证工具
  ```bash
  pnpm run validate-config --file=dragon-game.json
  ```
- [ ] 配置迁移工具
  ```bash
  pnpm run migrate-naming-config --dry-run
  ```
- [ ] 单元测试（覆盖率 > 80%）
- [ ] 集成测试

### 阶段5: Nacos 配置迁移（3-4天）
- [ ] 准备公共配置模板
  - [ ] 提取 kafka, redis, db 公共配置
  - [ ] 整合 server.naming.table 到 naming 节点
  - [ ] 加密敏感配置节点
- [ ] 转换现有服务配置使用 @import
  - [ ] 添加 @import: ["naming"] 继承服务命名表
  - [ ] 添加 useKafka2Http 字段
- [ ] 配置同步脚本
  - [ ] 上传 dragon.common 到 Nacos
  - [ ] 更新各服务配置
- [ ] 逐个服务迁移和验证
  - [ ] dragon-game (试点)
  - [ ] dragon-user
  - [ ] dragon-wallet
  - [ ] 其他服务
- [ ] 清理废弃配置
  - [ ] 删除各环境的 server.naming.table（确认后）

### 阶段6: 文档和培训（2-3天）
- [ ] 使用文档和示例
  - [ ] 配置继承语法说明
  - [ ] naming 配置使用指南
- [ ] 配置更新操作手册
  - [ ] 如何更新公共配置
  - [ ] 如何添加新服务到 naming 表
- [ ] 故障排查指南
  - [ ] 配置加载失败处理
  - [ ] 服务发现问题排查
- [ ] 团队培训和答疑

**总计**: 12-18 天完成

### 配置整合优势

**Before (当前方式)**:
```
每个服务启动时:
1. 从 Nacos 获取 dragon-game 配置
2. 检查 useKafka2Http 字段
3. 如果为 true，再获取 server.naming.table
4. 解析和使用配置

Nacos 请求: 2 次 (服务配置 + naming 表)
配置文件: 11+ 个 (10个服务配置 + server.naming.table)
```

**After (新方式)**:
```
每个服务启动时:
1. 从 Nacos 获取 dragon-game 配置
2. 检测到 @import: ["naming"]
3. 从 Nacos 获取 dragon.common（包含 naming）
4. 自动合并配置

Nacos 请求: 2 次 (服务配置 + 公共配置)
配置文件: 11 个 (10个服务配置 + 1个公共配置)
配置管理: 集中管理，统一更新
```

**节省的工作量**:
- ✅ 减少 1 个独立的 Data ID (server.naming.table)
- ✅ 减少重复的 useKafka2Http 判断逻辑
- ✅ 服务命名表更新时自动触发所有服务重载
- ✅ 配置更清晰，易于维护和审计

## 十、注意事项和风险

### 10.1 性能影响

**Nacos 请求频率**:
- 首次启动: 2 次 Nacos 请求（公共配置 + 服务配置）
- 配置更新: 根据变更节点决定（1-N 次）
- 建议: 启用配置缓存，减少重复请求

**配置解密耗时**:
- 单次解密: ~1-2ms
- 多节点解密: ~5-10ms
- 影响: 服务启动时间增加 < 100ms

### 10.2 配置一致性

**场景**: dragon.common 更新时，部分服务可能还未重载

**解决方案**:
1. 使用版本号标识配置
2. 服务重载失败时告警
3. 提供配置回滚机制

### 10.3 故障处理

**Nacos 不可用**:
```typescript
// 使用本地配置文件作为降级方案
const fallbackConfig = require('./config.fallback.json');
```

**配置解析失败**:
```typescript
// 保留上一次成功的配置
private lastValidConfig: NacosConfig;

try {
  this.nacosConfigs = await this.parseConfig(newConfig);
} catch (error) {
  this.logger.error('Config parse failed, using last valid config');
  this.nacosConfigs = this.lastValidConfig;
}
```

**加密密钥丢失**:
- 使用密钥管理服务备份密钥
- 提供密钥恢复流程
- 紧急情况下使用明文配置
