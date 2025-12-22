# 配置格式说明

## 📝 重要提示

本项目的配置文件使用 **JSON 格式**，而非 YAML 格式！

## 配置存储位置

所有配置存储在 Nacos 配置中心：

- **Common 配置**: `dragon.common` (data-id)
- **服务配置**: `dragon-{serviceName}` (例如: `dragon-wallet`, `dragon-game`)

## JSON 格式示例

### ✅ 正确的 JSON 格式

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
        "password": "secret_123"
      }
    ]
  }
}
```

### ❌ 错误的 YAML 格式（不支持）

```yaml
wallet:
  '@import':
    - '@db'
  '@merge':
    replication.slaves:
      mode: merge
  replication.slaves:
    - database: dragon_wallet
      password: secret_123
```

## JSON 格式要点

1. **属性名必须用双引号**：`"@import"` 而非 `@import`
2. **字符串值必须用双引号**：`"merge"` 而非 `merge`
3. **数组使用方括号**：`[]` 
4. **对象使用花括号**：`{}`
5. **属性之间用逗号分隔**（最后一个属性后不要逗号）
6. **不支持注释**：JSON 标准不支持 `//` 或 `#` 注释

## 本地配置文件

如果不使用 Nacos，可以创建本地配置文件：

```
BE/dragon-{serviceName}/config.default.json
```

示例 `config.default.json`:

```json
{
  "wallet": {
    "database": {
      "host": "localhost",
      "port": 3306,
      "database": "dragon_wallet"
    },
    "redis": {
      "host": "localhost",
      "port": 6379
    }
  }
}
```

## 配置验证

在添加配置到 Nacos 前，建议先验证 JSON 格式：

```bash
# 使用 jq 验证 JSON 格式
cat config.json | jq .

# 或使用 Node.js
node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')))"
```

## 文档中的示例

⚠️ **注意**：所有文档中的配置示例均已更新为 JSON 格式。如发现 YAML 格式示例，请以 JSON 格式为准。

## 快速参考

| 特性 | JSON | YAML | 本项目 |
|------|------|------|--------|
| 属性名 | `"key"` | `key:` | ✅ JSON |
| 字符串 | `"value"` | `value` | ✅ JSON |
| 数组 | `["a", "b"]` | `- a`<br>`- b` | ✅ JSON |
| 对象 | `{"k": "v"}` | `k: v` | ✅ JSON |
| 注释 | ❌ 不支持 | ✅ 支持 | ❌ 不支持 |

---

**最后更新**: 2024-12-21  
**适用版本**: 所有 dragon 服务
