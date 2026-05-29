import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../../modules/auth/strategies/jwt.strategy';

export const CurrentUser = createParamDecorator<keyof UserPayload | undefined>(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext): UserPayload | UserPayload[keyof UserPayload] => {
    const request = ctx.switchToHttp().getRequest<{ user: UserPayload }>();
    const user = request.user;

    return data ? user[data] : user;
  },
);
