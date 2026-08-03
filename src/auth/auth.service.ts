import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export interface AuthenticatedSocket {
  userId: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private hash(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: this.hash(dto.password),
      },
    });

    return this.signUser(user.id, user.email, user.name);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.password !== this.hash(dto.password)) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.signUser(user.id, user.email, user.name);
  }

  private signUser(userId: string, email: string, name: string) {
    const payload: JwtPayload = { sub: userId, email, name };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: userId, email, name },
    };
  }

  async verifyToken(token: string): Promise<AuthenticatedSocket> {
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      return {
        userId: payload.sub,
        email: payload.email,
        name: payload.name,
      };
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
