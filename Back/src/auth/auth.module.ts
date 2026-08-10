import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WsJwtGuard } from './ws-jwt.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<JwtSignOptions['expiresIn']>(
            'JWT_EXPIRES_IN',
            '7d',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, WsJwtGuard],
  exports: [AuthService],
})
export class AuthModule {}
