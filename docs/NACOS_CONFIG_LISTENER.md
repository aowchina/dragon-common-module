# Nacos 配置监听器使用指南

## 概述

`NacosManager` 现在提供了通用的配置监听功能，使用 Nacos 长轮询机制实现配置的实时更新通知（响应时间 < 100ms）。

所有服务都可以使用这个统一的监听器来实现配置热更新，无需各自实现重复的轮询逻辑。

## 功能特点

✅ **长轮询机制**：使用 Nacos Listener API，配置变化响应时间 < 100ms  
✅ **MD5 验证**：只在配置真正变化时触发回调，避免无效更新  
✅ **自动重连**：网络异常或超时后自动重新连接  
✅ **多监听器支持**：可同时监听多个不同的配置项  
✅ **回调机制**：支持为同一配置注册多个回调函数  
✅ **统一管理**：所有服务使用相同的监听逻辑，便于维护  

## API 说明

### 1. 开始监听配置

```typescript
NacosManager.Instance.startConfigListener(
    dataId: string,           // 配置的 dataId
    group?: string,           // 配置的 group（默认 'DEFAULT_GROUP'）
    callback: (config: any) => void  // 配置更新时的回调函数
): void
```

**参数说明**：
- `dataId`: 要监听的配置 ID
- `group`: 配置分组，可选，默认为 `'DEFAULT_GROUP'`
- `callback`: 当配置发生变化时调用的回调函数，参数为解析后的配置对象

**注意事项**：
- 可以为同一个配置注册多个回调函数
- 回调函数中的异常不会影响其他回调或监听器
- 首次调用 `startConfigListener` 会自动启动长轮询

### 2. 停止监听配置

```typescript
NacosManager.Instance.stopConfigListener(
    dataId: string,           // 配置的 dataId
    group?: string,           // 配置的 group（默认 'DEFAULT_GROUP'）
    callback?: (config: any) => void  // 要移除的回调函数（可选）
): void
```

**参数说明**：
- `dataId`: 要停止监听的配置 ID
- `group`: 配置分组，可选，默认为 `'DEFAULT_GROUP'`
- `callback`: 要移除的特定回调函数，可选
  - 如果提供，只移除该回调
  - 如果不提供，移除该配置的所有回调

**注意事项**：
- 当所有配置的监听都被移除后，长轮询会自动停止
- 停止监听不会影响其他正在监听的配置

## 使用示例

### 示例 1: Gateway 配置监听

```typescript
// dragon-gateway/src/config/config.module.ts

@Module({
    providers: [
        {
            provide: ConfigService,
            useFactory: async () => {
                // 1. 初始化配置
                const nacosConfig = await NacosManager.Instance.setupNacosConfig('gateway.json');
                const configService = new ConfigService(nacosConfig);

                // 2. 启动配置监听
                NacosManager.Instance.startConfigListener(
                    'gateway.json',
                    'DEFAULT_GROUP',
                    (updatedConfig) => {
                        console.log('Gateway config updated!');
                        configService.updateConfig(updatedConfig);
                    }
                );

                return configService;
            },
        },
    ],
})
export class GatewayConfigModule {}
```

### 示例 2: 业务服务配置监听

```typescript
// dragon-user/src/config/config.module.ts

@Module({
    providers: [
        {
            provide: ConfigService,
            useFactory: async () => {
                const logger = new Logger('UserConfigModule');
                
                // 初始化配置
                const nacosConfig = await NacosManager.Instance.setupNacosConfig('user.json');
                const configService = new ConfigService(nacosConfig);

                // 监听配置变化
                NacosManager.Instance.startConfigListener(
                    'user.json',
                    'DEFAULT_GROUP',
                    (updatedConfig) => {
                        logger.log('🔄 User service config updated');
                        
                        // 更新业务配置
                        configService.updateBusinessRules(updatedConfig.businessRules);
                        configService.updateFeatureFlags(updatedConfig.featureFlags);
                    }
                );

                return configService;
            },
        },
    ],
})
export class UserConfigModule {}
```

### 示例 3: 监听多个配置

```typescript
// dragon-game/src/config/config.module.ts

@Module({
    providers: [
        {
            provide: ConfigService,
            useFactory: async () => {
                const configService = new ConfigService();

                // 监听游戏配置
                NacosManager.Instance.startConfigListener(
                    'game.json',
                    'DEFAULT_GROUP',
                    (gameConfig) => {
                        configService.updateGameConfig(gameConfig);
                    }
                );

                // 监听奖励配置
                NacosManager.Instance.startConfigListener(
                    'rewards.json',
                    'DEFAULT_GROUP',
                    (rewardConfig) => {
                        configService.updateRewardConfig(rewardConfig);
                    }
                );

                // 监听活动配置
                NacosManager.Instance.startConfigListener(
                    'activities.json',
                    'ACTIVITY_GROUP',
                    (activityConfig) => {
                        configService.updateActivityConfig(activityConfig);
                    }
                );

                return configService;
            },
        },
    ],
})
export class GameConfigModule {}
```

### 示例 4: 动态添加/移除监听

```typescript
export class DynamicConfigService implements OnModuleInit, OnModuleDestroy {
    private logger = new Logger(DynamicConfigService.name);
    private myCallback: (config: any) => void;

    onModuleInit() {
        // 定义回调函数
        this.myCallback = (updatedConfig) => {
            this.logger.log('Config updated dynamically');
            this.applyConfig(updatedConfig);
        };

        // 启动监听
        NacosManager.Instance.startConfigListener(
            'dynamic.json',
            'DEFAULT_GROUP',
            this.myCallback
        );
    }

    onModuleDestroy() {
        // 清理：移除监听
        NacosManager.Instance.stopConfigListener(
            'dynamic.json',
            'DEFAULT_GROUP',
            this.myCallback
        );
    }

    private applyConfig(config: any) {
        // 处理配置更新
    }
}
```

## 工作原理

### 长轮询机制

1. **初始化**：首次调用 `startConfigListener` 时，获取配置的初始 MD5 值
2. **长轮询请求**：向 Nacos 发送 POST 请求到 `/nacos/v1/cs/configs/listener`
   - 请求体包含：`dataId^2group^2tenant^2MD5^1`（使用特殊分隔符）
   - 服务端超时：30 秒
   - 客户端超时：35 秒（比服务端长）
3. **配置变化检测**：
   - 如果配置没变化：Nacos 服务器 hold 住请求 30 秒后返回空响应
   - 如果配置变化了：Nacos 立即返回（< 100ms），响应包含变化的配置信息
4. **获取新配置**：检测到变化后，立即通过 GET 请求获取新配置内容
5. **触发回调**：将新配置传递给所有注册的回调函数
6. **继续轮询**：无论是否有变化，都立即开始下一轮长轮询

### 请求格式

```http
POST /nacos/v1/cs/configs/listener HTTP/1.1
Host: nacos-server:8848
Content-Type: application/x-www-form-urlencoded
Long-Pulling-Timeout: 30000

Listening-Configs=gateway.json%02DEFAULT_GROUP%02%02abc123def456%01
```

- `%02` 是 ASCII 字符 2 (分隔符)
- `%01` 是 ASCII 字符 1 (配置结束符)
- 格式：`dataId^2group^2tenant^2MD5^1`

### 响应格式

**无变化时**：
```
HTTP 200 OK
(空响应体)
```

**有变化时**：
```
HTTP 200 OK

gateway.json%02DEFAULT_GROUP%02%01
```

## 性能特点

| 特性 | 短轮询 (旧方式) | 长轮询 (新方式) |
|------|----------------|----------------|
| 响应延迟 | 平均 15 秒 | < 100 毫秒 |
| 网络请求频率 | 每 30 秒 1 次 | 配置变化时 1 次 |
| 服务器压力 | 较高（频繁请求） | 低（长连接） |
| 配置实时性 | 差 | 优秀 |

## 错误处理

监听器内置了完善的错误处理机制：

1. **网络异常**：5 秒后自动重试
2. **超时**：立即重新连接（这是正常行为）
3. **解析失败**：记录错误日志，继续监听
4. **回调异常**：不影响其他回调和监听器

所有错误都会记录到日志中，便于排查问题。

## 日志输出

```bash
# 启动监听
[NacosManager] 📡 Registered config listener for gateway.json@DEFAULT_GROUP
[NacosManager] 🚀 Starting Nacos config long polling...
[NacosManager] ✅ Initial MD5 for gateway.json@DEFAULT_GROUP: abc123de

# 配置变化
[NacosManager] 📝 Config changes detected: gateway.json%02DEFAULT_GROUP%02%01
[NacosManager] 🔄 Config updated for gateway.json@DEFAULT_GROUP, notifying 1 callbacks

# 正常超时（无变化）
[NacosManager] ⏱️  Long polling timeout (expected), reconnecting...

# 错误重试
[NacosManager] ❌ Long polling request error: ECONNREFUSED
```

## 迁移指南

### 从旧的轮询方式迁移

**之前的代码** (dragon-gateway):
```typescript
function startConfigPolling(configService: ConfigService) {
    // 100+ 行的长轮询实现代码
    // ...
}

startConfigPolling(configService);
```

**迁移后的代码**:
```typescript
// 只需 3 行！
NacosManager.Instance.startConfigListener(
    NACOS_DATA_ID,
    'DEFAULT_GROUP',
    (updatedConfig) => configService.updateConfig(updatedConfig)
);
```

### 迁移步骤

1. **移除旧的轮询函数**：删除服务中自己实现的轮询逻辑
2. **调用新的监听器**：使用 `NacosManager.Instance.startConfigListener()`
3. **测试配置更新**：在 Nacos 控制台修改配置，验证服务能及时收到更新
4. **检查日志**：确认监听器正常工作

## 最佳实践

1. ✅ **在模块初始化时启动监听**：在 `useFactory` 中调用
2. ✅ **配置更新使用观察者模式**：在 ConfigService 中实现回调通知机制
3. ✅ **记录配置更新日志**：便于追踪配置变化历史
4. ✅ **处理配置验证**：在回调中验证新配置的有效性
5. ⚠️ **避免在回调中执行耗时操作**：可能阻塞下一轮轮询
6. ⚠️ **回调中的异常要捕获**：避免影响其他监听器

## 常见问题

### Q: 监听器何时启动？
A: 首次调用 `startConfigListener()` 时自动启动，无需手动初始化。

### Q: 可以监听多个配置吗？
A: 可以，每个配置可以有独立的回调函数，所有配置共享一个长轮询连接。

### Q: 如何确认监听器正在工作？
A: 查看日志输出，应该能看到 "Starting Nacos config long polling..." 和周期性的 debug 日志。

### Q: 配置更新的延迟是多少？
A: 正常情况下 < 100ms，取决于网络延迟。

### Q: 服务重启后会自动重连吗？
A: 是的，服务启动时会自动初始化并开始监听。

### Q: 如何在开发环境禁用监听？
A: 设置环境变量 `NACOS_ENABLED=false`（Gateway 示例中已实现）。

## 相关文档

- [ROUTES_CONFIG.md](../../dragon-gateway/ROUTES_CONFIG.md) - Gateway 路由配置说明
- [ROUTES_MIGRATION.md](../../dragon-gateway/ROUTES_MIGRATION.md) - Gateway 配置迁移指南
- [Nacos 官方文档](https://nacos.io/zh-cn/docs/open-api.html) - Nacos Open API

## 更新日志

### v1.0.0 (2024)
- ✨ 新增 `startConfigListener()` 方法
- ✨ 新增 `stopConfigListener()` 方法
- ✨ 实现基于 MD5 的配置变化检测
- ✨ 支持多配置、多回调监听
- ✨ 自动重连和错误处理
- 📝 完善的日志输出
