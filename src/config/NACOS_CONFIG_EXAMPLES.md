# Nacos 配置示例

## dragon.common (Data ID: dragon.common, Group: DEFAULT_GROUP)

公共配置，包含所有可复用的配置节点：

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
        "sessionTimeout": 30000,
        "allowAutoTopicCreation": true
      }
    }
  },
  "redis": {
    "host": "redis.prod",
    "port": 6379,
    "db": 0,
    "keyPrefix": "dragon:",
    "ttl": 3600,
    "family": 4,
    "password": "",
    "exp": 3600
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
  "registry": {
    "msg.user": "app.user",
    "msg.wallet": "app.wallet",
    "msg.game": "app.game",
    "msg.auth": "app.auth",
    "msg.data": "app.data"
  }
}
```

## dragon-game (Data ID: dragon-game, Group: DEFAULT_GROUP)

服务配置示例，使用 @import 继承公共配置：

```json
{
  "kafka": {
    "@import": ["@kafka-base", "@kafka-consumer"],
    "options.client.clientId": "game_client",
    "subscribeTopics": ["game", "tournament", "bet"]
  },
  "redis": {
    "@import": ["@redis"],
    "db": 2,
    "keyPrefix": "game:"
  },
  "db": {
    "@import": ["@db"],
    "database": "dragon_game",
    "host": "{{process.env.DB_HOST}}",
    "username": "game_user",
    "password": "{{process.env.DB_PASSWORD}}"
  },
  "registry": {
    "@import": ["@registry"]
  },
  "service": {
    "name": "dragon-game",
    "port": 8001
  },
  "useKafka2Http": true
}
```

## 加密配置示例

如果需要加密敏感配置（如数据库密码），可以使用加密格式：

```json
{
  "db": {
    "$encrypt": true,
    "$data": "iv:authTag:encryptedData..."
  }
}
```

服务配置中通过 @import 继承时会自动解密：

```json
{
  "db": {
    "@import": ["@db"],
    "database": "dragon_game"
  }
}
```

## 配置合并规则

### 示例 1: 基本类型覆盖

公共配置：
```json
{
  "redis": {
    "host": "redis.prod",
    "port": 6379,
    "db": 0
  }
}
```

服务配置：
```json
{
  "redis": {
    "@import": ["@redis"],
    "db": 2
  }
}
```

结果：
```json
{
  "redis": {
    "host": "redis.prod",  // 保留
    "port": 6379,          // 保留
    "db": 2               // 替换
  }
}
```

### 示例 2: 点路径语法

服务配置：
```json
{
  "kafka": {
    "@import": ["@kafka-base"],
    "options.client.clientId": "game_client"
  }
}
```

等价于：
```json
{
  "kafka": {
    "@import": ["@kafka-base"],
    "options": {
      "client": {
        "clientId": "game_client"
      }
    }
  }
}
```

### 示例 3: 数组替换

公共配置：
```json
{
  "kafka": {
    "subscribeTopics": ["topic1", "topic2", "topic3"]
  }
}
```

服务配置：
```json
{
  "kafka": {
    "@import": ["@kafka"],
    "subscribeTopics": ["game"]
  }
}
```

结果（数组完全替换，不是追加）：
```json
{
  "kafka": {
    "subscribeTopics": ["game"]  // 完全替换
  }
}
```

### 示例 4: 多节点导入

服务配置：
```json
{
  "kafka": {
    "@import": ["@kafka-base", "@kafka-consumer"],
    "options.client.clientId": "game_client"
  }
}
```

合并顺序：
1. 先导入 @kafka-base
2. 再导入 @kafka-consumer（覆盖第1步的同名字段）
3. 最后应用本地配置（覆盖前面的同名字段）

## 环境变量

```bash
# Nacos 开关
NACOS_ENABLED=true          # true/false，默认 true

# Nacos 连接
NACOS_HOST=nacos.prod
NACOS_PORT=8848
NACOS_NAMESPACE=dragon-prod

# 配置加密（可选，只在有加密配置时需要）
CONFIG_ENCRYPT_KEY=your-secret-key
```

## 本地开发模式

设置 `NACOS_ENABLED=false` 时，会直接读取 `config.default.json`，跳过 Nacos 和配置继承：

```bash
# .env.local
NACOS_ENABLED=false
```

此时需要确保 `config.default.json` 包含完整配置（不使用 @import）。
