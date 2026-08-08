import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedSocket, AuthService } from './auth.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<{
      handshake: {
        auth?: { token?: string };
        query?: { token?: string };
      };
      data: { user?: AuthenticatedSocket };
    }>();

    const token = client.handshake.auth?.token ?? client.handshake.query?.token;

    if (!token) {
      return false;
    }

    try {
      client.data.user = this.auth.verifyToken(token);
      return true;
    } catch {
      return false;
    }
  }
}
