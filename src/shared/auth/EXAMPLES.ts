/**
 * AuthModule 使用示例
 * 
 * 此文件展示了如何在不同场景下使用 @dragon/common 中的 AuthModule 和 AuthService
 */

// ============================================
// 示例 1: 基本使用 - 在根模块中导入
// ============================================
import { Module } from '@nestjs/common';
import { AuthModule } from '@dragon/common';

@Module({
  imports: [
    AuthModule,  // 全局模块，导入一次即可
  ],
})
export class AppModule {}

// ============================================
// 示例 2: 在服务中使用 AuthService
// ============================================
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@dragon/common';

@Injectable()
export class UserService {
  constructor(private readonly authService: AuthService) {}

  async getUserByToken(token: string) {
    const result = await this.authService.validate(token);
    
    if (result.code !== 0) {
      throw new UnauthorizedException(result.message || 'Invalid token');
    }

    // result.data 包含 JWT payload + auth service 返回的数据
    return result.data;
  }
}

// ============================================
// 示例 3: 在 Guard 中使用
// ============================================
import { 
  Injectable, 
  CanActivate, 
  ExecutionContext,
  UnauthorizedException 
} from '@nestjs/common';
import { AuthService } from '@dragon/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 从 header 提取 token
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    // 验证 token
    const result = await this.authService.validate(token);
    
    if (result.code !== 0) {
      throw new UnauthorizedException(result.message || 'Invalid token');
    }

    // 将用户信息附加到 request 对象
    request.user = result.data;
    
    return true;
  }

  private extractTokenFromHeader(request: any): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}

// ============================================
// 示例 4: 在 WebSocket Gateway 中使用
// ============================================
import { 
  WebSocketGateway,
  OnGatewayConnection,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '@dragon/common';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ path: '/socket.io', cors: true })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly authService: AuthService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token) {
      this.logger.warn(`Client ${client.id} connection rejected: No token`);
      client.disconnect();
      return;
    }

    // 验证 token
    const result = await this.authService.validate(token);

    if (result.code !== 0) {
      this.logger.warn(
        `Client ${client.id} connection rejected: ${result.message}`
      );
      client.disconnect();
      return;
    }

    // 将用户信息附加到 socket
    client.data.user = result.data;
    this.logger.log(
      `Client ${client.id} connected, user: ${result.data.uid}`
    );
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const user = client.data.user;
    this.logger.log(`Message from ${user.uid}: ${data}`);
    // 处理消息...
  }
}

// ============================================
// 示例 5: 在 Controller 中使用 Guard
// ============================================
import { 
  Controller, 
  Get, 
  UseGuards,
  Request 
} from '@nestjs/common';

@Controller('users')
export class UserController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)  // 使用上面定义的 Guard
  getProfile(@Request() req) {
    // req.user 由 Guard 注入
    return {
      success: true,
      data: req.user,
    };
  }

  @Get('public')
  // 不使用 Guard，公开接口
  getPublicData() {
    return {
      message: 'This is public data',
    };
  }
}

// ============================================
// 示例 6: Nacos 配置示例
// ============================================
/*
{
  "server": {
    "port": 3000,
    "authService": "dragon-auth"  // 使用 Nacos 服务名
  }
}

或者使用直接 URL（本地开发）：

{
  "server": {
    "port": 3000,
    "authService": "http://localhost:3001"
  }
}
*/

// ============================================
// 示例 7: 错误处理最佳实践
// ============================================
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '@dragon/common';

@Injectable()
export class SecureService {
  private readonly logger = new Logger(SecureService.name);

  constructor(private readonly authService: AuthService) {}

  async performSecureOperation(token: string) {
    try {
      const result = await this.authService.validate(token);

      switch (result.code) {
        case 0:
          // 成功
          return this.doOperation(result.data);
        
        case 107:
          // Token 格式错误
          this.logger.warn('Invalid token format');
          throw new UnauthorizedException('Invalid token format');
        
        case -1:
          // Auth service 错误
          this.logger.error('Auth service error:', result.message);
          throw new Error('Authentication service unavailable');
        
        default:
          // 其他业务错误
          this.logger.warn(`Auth failed with code ${result.code}`);
          throw new UnauthorizedException(result.message);
      }
    } catch (error) {
      this.logger.error('Unexpected error during auth:', error);
      throw error;
    }
  }

  private doOperation(user: any) {
    // 执行业务逻辑
    return { success: true, user };
  }
}

// ============================================
// 示例 8: 自定义装饰器
// ============================================
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 获取当前用户信息的装饰器
 * 前提：请求已通过 JwtAuthGuard
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// 使用示例：
@Controller('api')
export class ApiController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: any) {
    return {
      uid: user.uid,
      token: user.token,
      // ... 其他用户信息
    };
  }
}
