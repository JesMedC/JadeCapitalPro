import { Injectable, Logger } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

export interface AuthenticatedSocket extends Socket {
  user: { sub: string; email: string; username: string; roles: string[] };
}

@Injectable()
export class WsAuthMiddleware {
  private readonly logger = new Logger(WsAuthMiddleware.name);

  constructor(private readonly configService: ConfigService) {}

  use(socket: Socket, next: (err?: Error) => void): void {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Socket ${socket.id} - no token provided`);
      return next(new Error('Authentication required'));
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'change-me-in-production');
      const payload = verify(token, secret) as {
        sub: string;
        email: string;
        username: string;
        roles: string[];
      };

      (socket as AuthenticatedSocket).user = payload;
      this.logger.log(`Socket ${socket.id} authenticated as ${payload.email}`);
      next();
    } catch (err) {
      this.logger.warn(`Socket ${socket.id} - invalid token`);
      return next(new Error('Invalid authentication token'));
    }
  }
}
