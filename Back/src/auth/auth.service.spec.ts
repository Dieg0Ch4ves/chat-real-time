import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const TEST_ROUNDS = 4;

const storedHash = (value: string) => hash(value, TEST_ROUNDS);

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    jwt = { sign: jest.fn(), verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    const dto = {
      email: 'ana@exemplo.com',
      name: 'Ana',
      password: 'senha123',
    };

    it('cria o usuário e devolve o token quando o email está livre', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: dto.name,
      });
      jwt.sign.mockReturnValue('token-assinado');

      const result = await service.register(dto);

      expect(result).toEqual({
        access_token: 'token-assinado',
        user: { id: 'user-1', email: dto.email, name: dto.name },
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: dto.email,
        name: dto.name,
      });
    });

    it('grava a senha com hash bcrypt salgado, nunca em texto puro', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: dto.name,
      });

      await service.register(dto);
      await service.register(dto);

      const [first, second] = prisma.user.create.mock.calls.map(
        ([arg]) => (arg as { data: { password: string } }).data.password,
      );

      expect(first).not.toBe(dto.password);
      expect(first).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(first).not.toBe(second);
      await expect(compare(dto.password, first)).resolves.toBe(true);
    });

    it('rejeita com ConflictException quando o email já existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existente' });

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'ana@exemplo.com', password: 'senha123' };

    it('devolve o token quando as credenciais conferem', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: 'Ana',
        password: await storedHash(dto.password),
      });
      jwt.sign.mockReturnValue('token-assinado');

      const result = await service.login(dto);

      expect(result.access_token).toBe('token-assinado');
      expect(result.user).toEqual({
        id: 'user-1',
        email: dto.email,
        name: 'Ana',
      });
    });

    it('rejeita quando a senha não confere', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: 'Ana',
        password: await storedHash('outra-senha'),
      });

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejeita quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verifyToken', () => {
    it('mapeia o payload do JWT para o usuário do socket', () => {
      jwt.verify.mockReturnValue({
        sub: 'user-1',
        email: 'ana@exemplo.com',
        name: 'Ana',
      });

      expect(service.verifyToken('token')).toEqual({
        userId: 'user-1',
        email: 'ana@exemplo.com',
        name: 'Ana',
      });
    });

    it('lança UnauthorizedException quando o token é inválido', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      expect(() => service.verifyToken('token')).toThrow(UnauthorizedException);
    });
  });
});
