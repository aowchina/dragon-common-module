# Dragon Common Module

共享模块，包含所有Dragon服务的通用配置和工具。

> **⚠️ 重要**: 本项目使用 **JSON 格式配置**，而非 YAML！详见 [配置格式说明](docs/CONFIG_FORMAT_NOTE.md)

## 包含内容

- **Config**: Nacos配置管理
- **Redis**: Redis服务封装
- **Kafka**: Kafka模块配置

## 使用方法

### 1. 安装依赖

```bash
cd dragon-common-module
npm install
```

### 2. 编译

```bash
npm run build
```

### 3. 在其他项目中使用

在项目的 `package.json` 中添加依赖：

```json
{
  "dependencies": {
    "@dragon/common": "file:../dragon-common-module"
  }
}
```

然后在代码中导入：

```typescript
import { ConfigModule, RedisModule, KafkaModule } from '@dragon/common';
```

## 结构

```
src/
├── config/              # 配置管理
│   ├── base/           # 基础配置和Nacos管理
│   └── type/           # 各种配置类型定义
├── shared/
│   ├── redis/          # Redis模块
│   └── kafka/          # Kafka模块
└── index.ts            # 主导出文件
```

## 配置系统文档

### 核心功能
- ✅ Nacos 配置管理
- ✅ @import 语法支持（从公共配置导入）
- ✅ 点路径语法（`a.b.c` 自动展开为嵌套对象）
- ✅ **高级合并策略**（5种模式：replace/merge/append/patch/shallow）
- ✅ 配置加密/解密
- ✅ 配置缓存

### 📚 文档导航

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [CONFIG_FORMAT_NOTE.md](docs/CONFIG_FORMAT_NOTE.md) | **配置格式说明** - JSON vs YAML | 必读 🔴 |
| [CONFIG_MERGE_QUICK_REFERENCE.md](docs/CONFIG_MERGE_QUICK_REFERENCE.md) | **速查表** - 快速查找合并模式 | 日常使用 ⭐ |
| [CONFIG_MERGE_STRATEGIES.md](docs/CONFIG_MERGE_STRATEGIES.md) | 完整使用指南 - 详细说明和原理 | 深入了解 |
| [CONFIG_MERGE_EXAMPLES.md](docs/CONFIG_MERGE_EXAMPLES.md) | 示例集合 - 丰富的实战案例 | 学习参考 |
| [IMPLEMENTATION_SUMMARY_MERGE_STRATEGIES.md](docs/IMPLEMENTATION_SUMMARY_MERGE_STRATEGIES.md) | 实现总结 - 技术细节 | 开发维护 |
| [CONFIG_MIGRATION_GUIDE.md](docs/CONFIG_MIGRATION_GUIDE.md) | 配置迁移指南 | 系统升级 |
| [NACOS_CONFIG_LISTENER.md](docs/NACOS_CONFIG_LISTENER.md) | Nacos 监听机制 | 运维管理 |

### 🚀 快速开始

#### 基本用法（@import）

```json
// Common 配置 (nacos: dragon.common)
{
  "db": {
    "host": "db.example.com",
    "port": 3306
  }
}

// 服务配置 (nacos: dragon-wallet)
{
  "wallet": {
    "@import": ["@db"],
    "database": "dragon_wallet"
  }
}
```

#### 高级用法（@merge 策略）

```json
// 保留公共配置的部分字段，只覆盖特定字段
{
  "wallet": {
    "@import": ["@db"],
    "@merge": {
      "replication.slaves": { "mode": "merge" }
    },
    "replication.slaves": [
      { "database": "dragon_wallet", "password": "secret_123" }
    ]
  }
}
```

查看 [速查表](CONFIG_MERGE_QUICK_REFERENCE.md) 了解更多合并模式。

