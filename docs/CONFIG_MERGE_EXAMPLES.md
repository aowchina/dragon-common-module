# 配置合并策略示例

> **⚠️ 配置格式**: 所有示例使用 **JSON 格式**。详见 [CONFIG_FORMAT_NOTE.md](CONFIG_FORMAT_NOTE.md)

## 示例 1: 数据库主从配置（merge 模式）

### Common 配置 (nacos: dragon.common)

```json
{
  "db": {
    "replication": {
      "master": {
        "host": "master.example.com",
        "port": 3306,
        "user": "admin"
      },
      "slaves": [
        {
          "host": "slave1.example.com",
          "port": 3306,
          "user": "readonly",
          "database": "common_db",
          "charset": "utf8mb4"
        },
        {
          "host": "slave2.example.com",
          "port": 3306,
          "user": "readonly",
          "database": "common_db",
          "charset": "utf8mb4"
        }
      ]
    }
  }
}
```

### 服务配置 (nacos: dragon-wallet)

```json
{
  "wallet": {
    "@import": ["@db"],
    "@merge": {
      "replication.slaves": {
        "mode": "merge"
      }
    },
    "replication.slaves": [
      {
        "database": "dragon_wallet",
        "password": "wallet_secret_123"
      },
      {
        "database": "dragon_wallet",
        "password": "wallet_secret_456"
      }
    ]
  }
}
```

### 最终结果

```json
{
  "wallet": {
    "replication": {
      "master": {
        "host": "master.example.com",
        "port": 3306,
        "user": "admin"
      },
      "slaves": [
        {
          "host": "slave1.example.com",
          "port": 3306,
          "user": "readonly",
          "database": "dragon_wallet",
          "charset": "utf8mb4",
          "password": "wallet_secret_123"
        },
        {
          "host": "slave2.example.com",
          "port": 3306,
          "user": "readonly",
          "database": "dragon_wallet",
          "charset": "utf8mb4",
          "password": "wallet_secret_456"
        }
      ]
    }
  }
}
```

✅ **优点**: 保留了 host、port、user、charset，只覆盖了 database 和 password

---

## 示例 2: 支付渠道配置（patch 模式）

### Common 配置

```json
payment:
  channels:
    - channelCode: alipay
      channelName: 支付宝
      appId: common_alipay_app
      enabled: true
      priority: 1
      timeout: 30000
    - channelCode: wechat
      channelName: 微信支付
      appId: common_wechat_app
      enabled: true
      priority: 2
      timeout: 30000
    - channelCode: unionpay
      channelName: 银联
      appId: common_unionpay_app
      enabled: false
      priority: 3
      timeout: 30000
```

### 服务配置 (dragon-wallet)

```json
wallet:
  '@import':
    - '@payment'
  '@merge':
    channels:
      mode: patch
      arrayMergeBy: channelCode
  channels:
    # 修改支付宝配置
    - channelCode: alipay
      appId: wallet_specific_alipay_app
      secretKey: alipay_secret_xxx
      timeout: 60000
    # 禁用微信支付
    - channelCode: wechat
      enabled: false
    # 添加新的支付渠道
    - channelCode: stripe
      channelName: Stripe
      appId: stripe_app_id
      enabled: true
      priority: 4
      timeout: 45000
```

### 最终结果

```json
wallet:
  channels:
    - channelCode: alipay
      channelName: 支付宝
      appId: wallet_specific_alipay_app
      enabled: true
      priority: 1
      timeout: 60000
      secretKey: alipay_secret_xxx
    - channelCode: wechat
      channelName: 微信支付
      appId: common_wechat_app
      enabled: false
      priority: 2
      timeout: 30000
    - channelCode: unionpay
      channelName: 银联
      appId: common_unionpay_app
      enabled: false
      priority: 3
      timeout: 30000
    - channelCode: stripe
      channelName: Stripe
      appId: stripe_app_id
      enabled: true
      priority: 4
      timeout: 45000
```

✅ **优点**: 精确修改特定渠道，保留其他字段，自动添加新渠道

---

## 示例 3: 中间件配置（append 模式）

### Common 配置

```json
app:
  middlewares:
    - name: cors
      enabled: true
    - name: helmet
      enabled: true
    - name: compression
      enabled: true
```

### 服务配置

```json
api:
  '@import':
    - '@app'
  '@merge':
    middlewares:
      mode: append
  middlewares:
    - name: rate-limiter
      enabled: true
      options:
        max: 100
        windowMs: 60000
    - name: custom-logger
      enabled: true
```

### 最终结果

```json
api:
  middlewares:
    - name: cors
      enabled: true
    - name: helmet
      enabled: true
    - name: compression
      enabled: true
    - name: rate-limiter
      enabled: true
      options:
        max: 100
        windowMs: 60000
    - name: custom-logger
      enabled: true
```

✅ **优点**: 在通用中间件基础上追加服务特定的中间件

---

## 示例 4: Redis 配置（shallow 模式）

### Common 配置

```json
redis:
  config:
    host: common-redis.example.com
    port: 6379
    password: common_password
    db: 0
    options:
      maxRetriesPerRequest: 3
      enableReadyCheck: true
      connectTimeout: 5000
      commandTimeout: 5000
      keepAlive: 30000
```

### 服务配置（深度合并 - 默认）

```json
wallet:
  '@import':
    - '@redis'
  config:
    host: wallet-redis.example.com
    password: wallet_redis_password
    options:
      enableReadyCheck: false
      commandTimeout: 10000
```

### 结果（深度合并）

```json
wallet:
  config:
    host: wallet-redis.example.com
    port: 6379
    password: wallet_redis_password
    db: 0
    options:
      maxRetriesPerRequest: 3
      enableReadyCheck: false
      connectTimeout: 5000
      commandTimeout: 10000
      keepAlive: 30000
```

### 服务配置（浅合并）

```json
wallet:
  '@import':
    - '@redis'
  '@merge':
    config:
      mode: shallow
  config:
    host: wallet-redis.example.com
    password: wallet_redis_password
    options:
      enableReadyCheck: false
      commandTimeout: 10000
```

### 结果（浅合并）

```json
wallet:
  config:
    host: wallet-redis.example.com
    password: wallet_redis_password
    options:
      enableReadyCheck: false
      commandTimeout: 10000
```

⚠️ **注意**: 浅合并丢失了 port、db 和 options 中的其他字段

---

## 示例 5: 复杂场景 - 多路径策略

### Common 配置

```json
complex:
  database:
    master:
      host: master.db
      port: 3306
    slaves:
      - host: slave1.db
        port: 3306
        weight: 100
      - host: slave2.db
        port: 3306
        weight: 100
  payment:
    channels:
      - code: alipay
        enabled: true
      - code: wechat
        enabled: true
  services:
    - name: auth-service
      url: http://auth:8080
  features:
    enableCache: true
    enableMetrics: true
    advanced:
      enableProfiling: false
      maxConnections: 1000
```

### 服务配置

```json
wallet:
  '@import':
    - '@complex'
  '@merge':
    # 数据库从库：按索引合并
    database.slaves:
      mode: merge
    # 支付渠道：按 code 匹配合并
    payment.channels:
      mode: patch
      arrayMergeBy: code
    # 服务列表：追加
    services:
      mode: append
    # 高级特性：浅合并
    features.advanced:
      mode: shallow
  database.slaves:
    - weight: 200
    - weight: 50
  payment.channels:
    - code: alipay
      enabled: false
    - code: stripe
      enabled: true
  services:
    - name: wallet-internal
      url: http://wallet-internal:9090
  features.advanced:
    enableProfiling: true
```

### 最终结果

```json
wallet:
  database:
    master:
      host: master.db
      port: 3306
    slaves:
      - host: slave1.db
        port: 3306
        weight: 200
      - host: slave2.db
        port: 3306
        weight: 50
  payment:
    channels:
      - code: alipay
        enabled: false
      - code: wechat
        enabled: true
      - code: stripe
        enabled: true
  services:
    - name: auth-service
      url: http://auth:8080
    - name: wallet-internal
      url: http://wallet-internal:9090
  features:
    enableCache: true
    enableMetrics: true
    advanced:
      enableProfiling: true
      # maxConnections 丢失（浅合并）
```

✅ **优势**: 不同配置部分使用最合适的合并策略

---

## 对比表

| 模式 | 适用场景 | 是否保留目标字段 | 是否去重 |
|------|---------|----------------|---------|
| **replace** | 完全替换，不需要保留任何旧值 | ❌ | N/A |
| **merge** | 数组元素位置固定，部分字段更新 | ✅ | ❌ |
| **append** | 在原有基础上添加新元素 | ✅ | ❌ |
| **patch** | 数组元素有唯一标识，精确更新 | ✅ | ✅ (基于key) |
| **shallow** | 只替换对象第一层 | ❌ (仅第一层) | N/A |

---

## 实际应用场景

### 场景 1: 微服务数据库配置

所有服务共享主库和从库配置，但每个服务有自己的数据库名和密码。

```json
# Common
db:
  slaves:
    - { host: slave1, port: 3306, user: ro }
    - { host: slave2, port: 3306, user: ro }

# Service
service:
  '@import': ['@db']
  '@merge':
    slaves: { mode: merge }
  slaves:
    - { database: service_db, password: xxx }
    - { database: service_db, password: yyy }
```

### 场景 2: 支付系统

公共配置定义所有支付渠道，各服务按需启用/禁用和定制参数。

```json
# Common
payment:
  channels: [alipay, wechat, unionpay, stripe]

# Wallet Service
wallet:
  '@merge':
    channels: { mode: patch, arrayMergeBy: code }
  channels:
    - { code: alipay, appId: wallet_app }
    - { code: wechat, enabled: false }
```

### 场景 3: 中间件链

基础中间件 + 服务特定中间件。

```json
# Common
app:
  middlewares: [cors, helmet, compression]

# Service
api:
  '@merge':
    middlewares: { mode: append }
  middlewares: [rate-limiter, custom-auth]
```

---

**提示**: 始终先在开发环境验证合并结果是否符合预期！
