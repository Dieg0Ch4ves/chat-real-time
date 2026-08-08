import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedSocket, AuthService } from './auth.service';
import { WsJwtGuard } from './ws-jwt.guard';

interface FakeClient {
  handshake: { auth?: { token?: string }; query?: { token?: string } };
  data: { user?: AuthenticatedSocket };
}

const user: AuthenticatedSocket = {
  userId: 'user-1',
  email: 'ana@exemplo.com',
  name: 'Ana',
};

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let verifyToken: jest.Mock;

  const contextFor = (client: FakeClient) =>
    ({
      switchToWs: () => ({ getClient: () => client }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    verifyToken = jest.fn();
    guard = new WsJwtGuard({ verifyToken } as unknown as AuthService);
  });

  it('libera e popula client.data.user com o token vindo de handshake.auth', () => {
    verifyToken.mockReturnValue(user);
    const client: FakeClient = {
      handshake: { auth: { token: 'abc' } },
      data: {},
    };

    expect(guard.canActivate(contextFor(client))).toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('abc');
    expect(client.data.user).toEqual(user);
  });

  it('usa o token da query string como fallback', () => {
    verifyToken.mockReturnValue(user);
    const client: FakeClient = {
      handshake: { query: { token: 'xyz' } },
      data: {},
    };

    expect(guard.canActivate(contextFor(client))).toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('xyz');
  });

  it('bloqueia quando nenhum token é enviado', () => {
    const client: FakeClient = { handshake: {}, data: {} };

    expect(guard.canActivate(contextFor(client))).toBe(false);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('bloqueia quando o token é inválido, sem propagar a exceção', () => {
    verifyToken.mockImplementation(() => {
      throw new UnauthorizedException();
    });
    const client: FakeClient = {
      handshake: { auth: { token: 'ruim' } },
      data: {},
    };

    expect(guard.canActivate(contextFor(client))).toBe(false);
    expect(client.data.user).toBeUndefined();
  });
});
