import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    HttpException,
    Injectable,
    Logger,
    UnauthorizedException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_AUTH_DECORATOR } from '../../decorators/skip-auth.decorator';
import { AuthService } from '../auth/auth.service';
import { BaseConfigService } from '../../config/base/baseconfig.service';

@Injectable()
export class ClientAuthGuard implements CanActivate {
    protected logger = new Logger('ClientAuthGuard');
    protected tokenName = 'authorization';

    constructor(
        protected readonly reflector: Reflector,
        protected readonly authService: AuthService,
        protected readonly configService: BaseConfigService,
    ) {
        this.tokenName = configService.getServerConfig().token?.name || 'authorization';
        this.logger.log(`ClientAuthGuard: tokenName = ${this.tokenName}`);
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const skipAuth = this.reflector.getAllAndOverride(SKIP_AUTH_DECORATOR, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skipAuth) {
            return true;
        }

        const req = context.switchToHttp().getRequest();
        try {
            const accessToken = this.extractToken(req);
            if (!accessToken) {
                throw new UnauthorizedException('请先登录');
            }

            const result = await this.authService.validate(accessToken);
            if (!result) {
                throw new ForbiddenException('请先登录');
            }
            if (result.code != 0) {
                this.logger.warn(`canActivate error, result: ${JSON.stringify(result)}`);
                throw new HttpException(`登录无效, code: ${result.code}`, result.code);
            }
            req.user = result.data;

            return true;
        } catch (e) {
            this.logger.error(e);
            if (e instanceof ForbiddenException || e instanceof HttpException || e instanceof UnauthorizedException) {
                throw e;
            } else {
                throw new ServiceUnavailableException(e.message);
            }
        }
    }

    protected extractToken(req: any): string | null {
        // ExtractJwt.fromAuthHeaderAsBearerToken()
        const bearerToken = req.headers?.authorization;
        if (bearerToken && bearerToken.startsWith('Bearer ')) {
            return bearerToken.substring(7);
        }

        // ExtractJwt.fromHeader(this.tokenName)
        return req.headers?.[this.tokenName] || null;
    }
}
