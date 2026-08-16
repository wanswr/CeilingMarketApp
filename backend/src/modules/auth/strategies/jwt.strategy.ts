import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.deletedAt || user.isBlocked) {
      throw new UnauthorizedException();
    }

    if (payload.sessionVersion !== undefined && payload.sessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException('Session invalidated');
    }

    if (payload.sessionId) {
      const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });
      if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
        throw new UnauthorizedException('Session expired or revoked');
      }
    }

    return { id: user.id, phone: user.phone, role: user.role, sessionId: payload.sessionId };
  }
}
