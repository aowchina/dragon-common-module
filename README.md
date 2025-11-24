# Dragon Common Module

共享模块，包含所有Dragon服务的通用配置和工具。

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
