import { SetMetadata } from '@nestjs/common';

export const SKIP_AUTH_DECORATOR = 'decorator:skip-auth';
export const SkipAuth = () => SetMetadata(SKIP_AUTH_DECORATOR, true);
