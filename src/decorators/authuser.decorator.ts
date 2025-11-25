import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../interfaces/jwt.interface';

export const AuthUser = createParamDecorator((data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
});
