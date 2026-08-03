import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedSocket, AuthService } from './auth.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client = context.switchToWs().getClient<{
      handshake: {
        auth?: { token?: string };
        query?: { token?: string };
      };
      data: { user?: AuthenticatedSocket };
    }>();

    const token =
      client.handshake.auth?.token ?? client.handshake.query?.token;

    if (!token) {
      return false;
    }

    return this.auth
      .verifyToken(token)
      .then((user) => {
        client.data.user = user;
        return true;
      })
      .catch(() => false);
  }
}
