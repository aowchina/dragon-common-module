# Graceful Shutdown and Cluster Service

## Overview

The `@dragon/common` module now provides reusable services for graceful shutdown handling and cluster management.

## Features

### 1. GracefulShutdownService

Handles graceful shutdown of NestJS applications with configurable timeout.

**Features:**
- Listens for SIGTERM and SIGINT signals
- Configurable shutdown timeout (default: 10 seconds)
- Prevents duplicate shutdown attempts
- Custom logger support
- Works with both Express and Fastify adapters

**Usage:**

```typescript
import { GracefulShutdownService } from '@dragon/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const logger = new Logger('Bootstrap');
    
    // Enable shutdown hooks
    app.enableShutdownHooks();
    
    // Setup graceful shutdown with 20 second timeout
    GracefulShutdownService.setup(app, 20000, logger);
    
    await app.listen(3000);
}
```

### 2. ClusterService

Manages Node.js cluster mode for horizontal scaling.

**Features:**
- Automatic worker process management
- Configurable number of workers (defaults to CPU count)
- Automatic worker restart on failure
- Environment variable support
- Primary/Worker process separation

**Usage:**

```typescript
import { ClusterService } from '@dragon/common';
import { NestFactory } from '@nestjs/core';

async function bootstrap(enableCluster: boolean, isPrimary: boolean) {
    const app = await NestFactory.create(AppModule);
    
    if (isPrimary) {
        // Primary process: handle scheduled tasks
        await app.init();
    } else {
        // Worker process: handle HTTP requests
        await app.listen(3000);
    }
}

// Start with cluster support
ClusterService.clusterize(bootstrap);

// Or with custom options
ClusterService.clusterize(bootstrap, {
    workers: 4,        // Number of worker processes
    enable: true       // Enable cluster mode
});
```

**Environment Variables:**
- `CLUSTER_ENABLE`: Set to any truthy value to enable cluster mode
- `CLUSTER_WORKER`: Number of worker processes (default: CPU count)

## Complete Example

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ClusterService, GracefulShutdownService } from '@dragon/common';
import { AppModule } from './app.module';

async function bootstrap(enableCluster: boolean = false, isPrimary: boolean = false) {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule);

    // Setup graceful shutdown for worker processes
    if (!isPrimary) {
        app.enableShutdownHooks();
        GracefulShutdownService.setup(app, 20000, logger);
    }

    if (enableCluster && isPrimary) {
        // Primary process: Initialize app for scheduled tasks
        logger.log('✅ Primary process initialized for task scheduling');
        await app.init();
    } else {
        // Single process or worker: Start HTTP service
        const port = process.env.PORT ?? 3000;
        await app.listen(port);
        logger.log(`🚀 Application listening on port ${port}`);
    }
}

// Start application with cluster support
ClusterService.clusterize(bootstrap);
```

## Migration from Old Code

### Before (dragon-game/src/app.cluster.ts):
```typescript
import { AppClusterService } from './app.cluster';

async function bootstrap(enableCluster: boolean, isPrimary: boolean) {
    // ... app setup
}

AppClusterService.clusterize(bootstrap);
```

### After:
```typescript
import { ClusterService, GracefulShutdownService } from '@dragon/common';

async function bootstrap(enableCluster: boolean, isPrimary: boolean) {
    const app = await NestFactory.create(AppModule);
    
    if (!isPrimary) {
        app.enableShutdownHooks();
        GracefulShutdownService.setup(app, 20000);
    }
    
    // ... rest of app setup
}

ClusterService.clusterize(bootstrap);
```

### Benefits:
1. ✅ No need for local `app.cluster.ts` file
2. ✅ Centralized shutdown logic in common module
3. ✅ Consistent behavior across all services
4. ✅ Better type safety and error handling
5. ✅ Easier to maintain and update

## Notes

- The graceful shutdown timeout should be set based on your application's needs
- For long-running operations, increase the timeout accordingly
- The cluster service automatically restarts failed workers
- Primary process in cluster mode should only handle scheduled tasks, not HTTP requests
