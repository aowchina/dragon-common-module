# 配置合并策略速查表

> **⚠️ 配置格式**: 所有示例使用 **JSON 格式**。详见 [CONFIG_FORMAT_NOTE.md](CONFIG_FORMAT_NOTE.md)

## 🚀 快速选择合并模式

```
需要完全替换数组？           → replace (默认)
需要保留部分字段更新数组？     → merge 或 patch
需要在数组末尾追加？          → append
需要精确匹配某个元素更新？     → patch
需要只替换对象第一层？        → shallow
```

---

## 📖 五种模式对比

| 模式 | 使用场景 | 配置示例 | 结果描述 |
|------|---------|---------|---------|
| **replace** | 完全替换，不保留任何内容 | `mode: replace` | 数组/对象完全替换 |
| **merge** | 按索引部分更新数组元素 | `mode: merge` | 保留未指定的字段 |
| **append** | 在末尾添加新元素 | `mode: append` | 原数组 + 新数组 |
| **patch** | 按 key 精确匹配更新 | `mode: patch`<br>`arrayMergeBy: id` | 匹配后合并，未匹配追加 |
| **shallow** | 只合并对象第一层 | `mode: shallow` | 不递归，第一层替换 |

---

## 💡 常见场景速查

### 场景 1：数据库从库配置

**需求**：保留 host/port/user，只改 database/password

```json
{
  "@merge": {
    "replication.slaves": {
      "mode": "merge"
    }
  },
  "replication.slaves": [
    {
      "database": "my_db",
      "password": "my_pass"
    }
  ]
}
```

### 场景 2：支付渠道配置

**需求**：修改指定渠道，保留其他渠道

```json
{
  "@merge": {
    "channels": {
      "mode": "patch",
      "arrayMergeBy": "channelCode"
    }
  },
  "channels": [
    {
      "channelCode": "alipay",
      "enabled": false
    }
  ]
}
```

### 场景 3：中间件追加

**需求**：保留公共中间件，追加自定义中间件

```json
{
  "@merge": {
    "middlewares": {
      "mode": "append"
    }
  },
  "middlewares": [
    { "name": "custom-auth" },
    { "name": "rate-limiter" }
  ]
}
```

### 场景 4：完全替换某部分

**需求**：不要任何旧配置

```json
{
  "servers": [
    { "host": "new-server.com" }
  ]
}
```
// 不需要 @merge，默认就是 replace

### 场景 5：对象浅覆盖

**需求**：只替换第一层属性

```json
{
  "@merge": {
    "redis.options": {
      "mode": "shallow"
    }
  },
  "redis.options": {
    "enableReadyCheck": false
  }
}
```

---

## 🎯 决策流程图

```
开始
  ↓
是数组吗？
  ├─ 否 → 是否需要浅合并？
  │        ├─ 是 → shallow
  │        └─ 否 → 默认深度合并
  │
  └─ 是 → 需要保留原数组内容吗？
           ├─ 否 → replace (默认)
           │
           └─ 是 → 数组元素有唯一标识吗？
                    ├─ 否 → 按索引对应吗？
                    │        ├─ 是 → merge
                    │        └─ 否 → append
                    │
                    └─ 是 → patch (指定 arrayMergeBy)
```

---

## ⚡ 快速配置模板

### 模板 1：微服务数据库配置

```json
{
  "service": {
    "@import": ["@db"],
    "@merge": {
      "replication.slaves": { "mode": "merge" }
    },
    "replication.slaves": [
      { "database": "service_db", "password": "xxx" }
    ]
  }
}
```

### 模板 2：支付系统

```json
{
  "service": {
    "@import": ["@payment"],
    "@merge": {
      "channels": { "mode": "patch", "arrayMergeBy": "channelCode" }
    },
    "channels": [
      { "channelCode": "alipay", "appId": "service_app" }
    ]
  }
}
```

### 模板 3：多路径策略

```json
{
  "service": {
    "@import": ["@common"],
    "@merge": {
      "database.slaves": { "mode": "merge" },
      "payment.channels": { "mode": "patch", "arrayMergeBy": "code" },
      "middlewares": { "mode": "append" },
      "redis.options": { "mode": "shallow" }
    },
    "database.slaves": [],
    "payment.channels": [],
    "middlewares": [],
    "redis.options": {}
  }
}
```

---

## ⚠️ 常见陷阱

### ❌ 错误 1：patch 模式忘记指定 arrayMergeBy

```json
// ❌ 错误
{
  "@merge": {
    "channels": { "mode": "patch" }
  }
}

// ✅ 正确
{
  "@merge": {
    "channels": { "mode": "patch", "arrayMergeBy": "channelCode" }
  }
}
```

### ❌ 错误 2：shallow 模式导致字段丢失

```json
// 目标：{ "a": 1, "b": 2, "c": { "x": 1 } }
// 源（shallow）: { "a": 10 }
// 结果：{ "a": 10 }  ← b 和 c 丢失了！

// 💡 提示：只在确实需要完全替换第一层时使用 shallow
```

### ❌ 错误 3：路径格式错误

```json
// ❌ 错误
{
  "@merge": {
    "database/slaves": { "mode": "merge" }
  }
}

// ✅ 正确
{
  "@merge": {
    "database.slaves": { "mode": "merge" }
  }
}
```

### ❌ 错误 4：merge 和 patch 混淆

```json
// merge：按索引（位置）合并
// 适用于：数组顺序固定，元素一一对应
{
  "@merge": {
    "slaves": { "mode": "merge" }
  },
  "slaves": [
    { "password": "new_pass_1" },  // 更新 slaves[0]
    { "password": "new_pass_2" }   // 更新 slaves[1]
  ]
}

// patch：按 key 字段匹配合并
// 适用于：数组顺序不重要，元素有唯一标识
{
  "@merge": {
    "channels": { "mode": "patch", "arrayMergeBy": "code" }
  },
  "channels": [
    { "code": "alipay", "enabled": false }  // 查找 code=alipay 并更新
  ]
}
```

---

## 🔍 调试技巧

### 1. 确认路径正确

```typescript
// 路径格式：用点分隔
'database.replication.slaves'
'payment.channels'
'redis.options'
```

### 2. 检查 key 字段存在

```json
# patch 模式要求所有元素都有 key 字段
channels:
  - channelCode: alipay  # ✅ 有 key
  - enabled: false       # ❌ 缺少 channelCode
```

### 3. 验证合并结果

在开发环境打印最终配置：

```typescript
console.log(JSON.stringify(config, null, 2));
```

---

## 📊 性能考虑

| 模式 | 时间复杂度 | 适用数组大小 |
|------|-----------|-------------|
| replace | O(n) | 任意 |
| merge | O(n) | 小到中 (<1000) |
| append | O(n) | 任意 |
| patch | O(n×m) | 小 (<100) |
| shallow | O(n) | 任意 |

💡 **建议**：
- 大数组（>1000）优先用 replace 或 append
- 需要精确匹配时才用 patch
- merge 适合小到中等数组

---

## 📚 延伸阅读

- [完整使用指南](CONFIG_MERGE_STRATEGIES.md) - 详细说明和原理
- [示例集合](CONFIG_MERGE_EXAMPLES.md) - 丰富的实战示例
- [实现总结](IMPLEMENTATION_SUMMARY_MERGE_STRATEGIES.md) - 技术细节

---

## 🆘 需要帮助？

1. 查看 [CONFIG_MERGE_EXAMPLES.md](CONFIG_MERGE_EXAMPLES.md) 找相似场景
2. 在开发环境测试配置合并结果
3. 参考单元测试：`config-loader.service.spec.ts`

---

**最后更新**: 2024-01  
**打印友好** ✅
