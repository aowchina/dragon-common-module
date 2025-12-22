# 配置合并策略使用指南

> **⚠️ 配置格式**: 本项目使用 **JSON 格式**配置文件。所有示例均为 JSON 格式。详见 [CONFIG_FORMAT_NOTE.md](CONFIG_FORMAT_NOTE.md)

## 概述

配置加载器现在支持通过 `@merge` 指令自定义配置合并行为，特别是对数组和对象的高级合并策略。

## 基本原理

### 默认行为（向后兼容）

在没有 `@merge` 配置时，系统保持原有行为：

- **对象**：递归深度合并
- **数组**：完全替换（source 替换 target）
- **基本类型**：直接替换

### @merge 指令

通过 `@merge` 对象，你可以为特定路径指定自定义合并策略：

```json
{
  "@import": ["@commonConfig"],
  "@merge": {
    "path.to.array": {
      "mode": "merge"
    }
  },
  "path.to.array": [...]
}
```

## 合并模式

### 1. replace（默认）

完全替换目标数组/对象。

```json
{
  "@import": ["@db"],
  "@merge": {
    "replication.slaves": { "mode": "replace" }
  },
  "replication.slaves": [
    { "host": "slave1.com", "port": 3306 }
  ]
}
```

**结果**：`replication.slaves` 完全被替换为新数组。

---

### 2. merge（按索引合并）

按数组索引合并元素，只覆盖 source 中指定的字段，保留 target 中的其他字段。

**适用场景**：
- 数据库从库配置（保留公共配置，只覆盖特定字段如 database、password）
- 支付渠道配置（保留通用设置，只修改特定参数）

**示例**：

Common 配置 (`@db`):
```json
{
  "replication": {
    "slaves": [
      { "host": "slave1.example.com", "port": 3306, "user": "readonly", "database": "common_db" },
      { "host": "slave2.example.com", "port": 3306, "user": "readonly", "database": "common_db" }
    ]
  }
}
```

服务配置:
```json
{
  "@import": ["@db"],
  "@merge": {
    "replication.slaves": { "mode": "merge" }
  },
  "replication.slaves": [
    { "database": "dragon_wallet", "password": "secret123" },
    { "database": "dragon_wallet", "password": "secret456" }
  ]
}
```

**最终结果**:
```json
{
  "replication": {
    "slaves": [
      { "host": "slave1.example.com", "port": 3306, "user": "readonly", "database": "dragon_wallet", "password": "secret123" },
      { "host": "slave2.example.com", "port": 3306, "user": "readonly", "database": "dragon_wallet", "password": "secret456" }
    ]
  }
}
```

✅ **优点**：保留了 host、port、user，只覆盖了 database 和 password。

---

### 3. append（追加到末尾）

将 source 数组追加到 target 数组末尾。

**适用场景**：
- 添加额外的服务器节点
- 追加额外的中间件
- 添加自定义规则

**示例**：

Common 配置:
```json
{
  "servers": [
    { "name": "server1", "host": "s1.com" },
    { "name": "server2", "host": "s2.com" }
  ]
}
```

服务配置:
```json
{
  "@import": ["@common"],
  "@merge": {
    "servers": { "mode": "append" }
  },
  "servers": [
    { "name": "server3", "host": "s3.com" }
  ]
}
```

**最终结果**:
```json
{
  "servers": [
    { "name": "server1", "host": "s1.com" },
    { "name": "server2", "host": "s2.com" },
    { "name": "server3", "host": "s3.com" }
  ]
}
```

---

### 4. patch（按 key 字段匹配合并）

根据指定的 key 字段查找匹配的数组元素并合并。

**适用场景**：
- 修改特定支付渠道的配置
- 更新特定服务的设置
- 覆盖特定环境的参数

**配置选项**：
- `mode`: "patch"
- `arrayMergeBy`: 用于匹配的 key 字段名（如 "id", "name", "channelCode"）

**示例**：

Common 配置:
```json
{
  "paymentChannels": [
    { "channelCode": "alipay", "appId": "common_app", "enabled": true },
    { "channelCode": "wechat", "appId": "common_app", "enabled": true },
    { "channelCode": "unionpay", "appId": "common_app", "enabled": false }
  ]
}
```

服务配置:
```json
{
  "@import": ["@payment"],
  "@merge": {
    "paymentChannels": { 
      "mode": "patch",
      "arrayMergeBy": "channelCode"
    }
  },
  "paymentChannels": [
    { "channelCode": "alipay", "appId": "wallet_specific_app", "secretKey": "xxx" },
    { "channelCode": "wechat", "enabled": false },
    { "channelCode": "stripe", "appId": "stripe_app", "enabled": true }
  ]
}
```

**最终结果**:
```json
{
  "paymentChannels": [
    { "channelCode": "alipay", "appId": "wallet_specific_app", "enabled": true, "secretKey": "xxx" },
    { "channelCode": "wechat", "appId": "common_app", "enabled": false },
    { "channelCode": "unionpay", "appId": "common_app", "enabled": false },
    { "channelCode": "stripe", "appId": "stripe_app", "enabled": true }
  ]
}
```

✅ **行为说明**：
- `alipay`：找到匹配项，合并 appId 和新增 secretKey
- `wechat`：找到匹配项，只覆盖 enabled
- `unionpay`：没有 source 对应项，保持原样
- `stripe`：没有 target 对应项，追加到末尾

---

### 5. shallow（浅合并）

对对象只合并第一层属性，不递归深度合并。

**适用场景**：
- 完全替换嵌套对象
- 避免深度合并导致的意外保留

**示例**：

Common 配置:
```json
{
  "redis": {
    "host": "common-redis",
    "port": 6379,
    "options": {
      "maxRetriesPerRequest": 3,
      "enableReadyCheck": true
    }
  }
}
```

服务配置（深度合并 - 默认）:
```json
{
  "@import": ["@redis"],
  "redis": {
    "host": "service-redis",
    "options": {
      "enableReadyCheck": false
    }
  }
}
```

**结果（深度合并）**:
```json
{
  "redis": {
    "host": "service-redis",
    "port": 6379,
    "options": {
      "maxRetriesPerRequest": 3,
      "enableReadyCheck": false
    }
  }
}
```

服务配置（浅合并）:
```json
{
  "@import": ["@redis"],
  "@merge": {
    "redis": { "mode": "shallow" }
  },
  "redis": {
    "host": "service-redis",
    "options": {
      "enableReadyCheck": false
    }
  }
}
```

**结果（浅合并）**:
```json
{
  "redis": {
    "host": "service-redis",
    "options": {
      "enableReadyCheck": false
    }
  }
}
```

⚠️ **注意**：浅合并会丢弃 `port` 和 `options.maxRetriesPerRequest`。

---

## 复杂场景示例

### 多路径配置

可以为不同路径指定不同的合并策略：

```json
{
  "@import": ["@common"],
  "@merge": {
    "database.slaves": { "mode": "merge" },
    "paymentChannels": { "mode": "patch", "arrayMergeBy": "channelCode" },
    "middlewares": { "mode": "append" }
  },
  "database.slaves": [...],
  "paymentChannels": [...],
  "middlewares": [...]
}
```

### 嵌套数组

如果数组元素本身包含数组，可以通过路径指定更深层的策略：

```json
{
  "@import": ["@env"],
  "@merge": {
    "environments[0].servers": { "mode": "append" }
  },
  "environments": [
    {
      "name": "production",
      "servers": [{ "host": "extra-server.com" }]
    }
  ]
}
```

---

## 向后兼容性

### ✅ 完全兼容

- 如果不使用 `@merge` 指令，所有现有配置行为保持不变
- 默认的数组替换行为不受影响
- 对象深度合并逻辑保持一致

### ⚠️ 注意事项

1. **路径匹配**：路径使用点分隔符（如 `database.replication.slaves`）
2. **数组索引路径**：在 merge 模式内部使用 `path[0]` 格式（自动生成）
3. **key 字段必须存在**：patch 模式要求数组元素为对象且包含指定的 key 字段
4. **大小写敏感**：路径和字段名区分大小写

---

## 常见问题

### Q1: 什么时候使用 merge vs patch？

- **merge**：当数组顺序固定、元素位置对应明确时（如按索引配置的从库列表）
- **patch**：当数组元素有唯一标识符、顺序不重要时（如支付渠道、服务配置）

### Q2: append 会覆盖重复项吗？

不会。append 简单地将 source 追加到 target 末尾，不做去重。如果需要去重或合并，请使用 patch 模式。

### Q3: 如何完全替换某个对象的子属性？

使用 shallow 模式：

```json
{
  "@merge": {
    "redis.options": { "mode": "shallow" }
  }
}
```

### Q4: merge 模式下，如果 source 数组比 target 短怎么办？

target 中超出 source 长度的元素保持不变。例如：

```
target: [A, B, C, D]
source: [X, Y]
result: [merge(A,X), merge(B,Y), C, D]
```

---

## 最佳实践

1. **优先使用默认行为**：只在必要时使用 @merge 指令
2. **patch 模式使用稳定的 key**：确保 arrayMergeBy 指定的字段值稳定且唯一
3. **路径要精确**：避免使用过于宽泛的路径导致意外行为
4. **测试配置**：在开发环境验证合并结果符合预期
5. **文档化自定义策略**：在服务配置中添加注释说明为什么使用特定策略

---

## 实现细节

- **路径追踪**：系统在递归合并过程中维护当前路径（如 `database.slaves[0].host`）
- **策略查找**：在每次合并操作前检查当前路径是否有自定义策略
- **优先级**：自定义策略 > 默认行为
- **性能**：策略查找使用 O(1) 的对象查找，对性能影响最小

---

## 相关文档

- [配置系统迁移指南](CONFIG_MIGRATION_GUIDE.md)
- [Nacos 配置监听](NACOS_CONFIG_LISTENER.md)
- [优雅关闭与集群模式](GRACEFUL_SHUTDOWN_CLUSTER.md)

---

**最后更新**: 2024-01
**版本**: 1.0.0
