import { normalizePhone } from '../../common/utils/normalize-phone';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.logger.setService('AuthService');
  }

  async requestOtp(phone: string) {
    const authMode = this.configService.get('AUTH_MODE') || 'development';
    const nodeEnv = this.configService.get('NODE_ENV') || process.env.NODE_ENV || 'development';

    if (authMode === 'development' && nodeEnv !== 'production') {
      return {
        status: 'sent',
        devCode: '1234'
      };
    }

    return {
      status: 'sent'
    };
  }

  async verifyOtp(phone: string, code: string) {
    const authMode = this.configService.get('AUTH_MODE') || 'development';

    if (authMode === 'development') {
      if (code !== '1234') {
        throw new UnauthorizedException('Invalid OTP code');
      }
    } else {
      throw new UnauthorizedException('Authentication is only allowed in development mode');
    }

    let user = await this.prisma.user.findUnique({ where: { phone: normalizePhone(phone) } });

    if (user && user.isBlocked) {
      throw new ForbiddenException('User is blocked');
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normalizePhone(phone),
          name: `User ${phone.slice(-4)}`,
          phoneVerified: true,
        },
      });
    } else if (!user.phoneVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true }
      });
    }

    this.logger.info('USER_REGISTERED', `User registered/verified via OTP`, { userId: user.id });
    return this.login(user);
  }

  async validateUser(phone: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { phone: normalizePhone(phone) } });
    return user;
  }

  async login(user: any) {
    if (user.isBlocked) {
      throw new ForbiddenException('User is blocked');
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt,
      },
    });

    const payload = {
      id: user.id,
      phone: user.phone,
      role: user.role,
      sessionVersion: user.sessionVersion || 1,
      sessionId: session.id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        phoneVerified: user.phoneVerified,
      },
    };
  }

  async logout(sessionId: string) {
    if (sessionId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      }).catch(() => null);
    }
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  async register(dto: RegisterDto) {
    // Strictly restrict role to WORKER or EMPLOYER (disallow ADMIN)
    const assignedRole = dto.role === 'EMPLOYER' ? 'EMPLOYER' : 'WORKER';

    const user = await this.prisma.user.create({
      data: {
        phone: normalizePhone(dto.phone),
        name: dto.name,
        role: assignedRole,
        roles: [assignedRole],
        phoneVerified: false,
      },
    });
    this.logger.info('USER_REGISTERED', `User registered via OTP`, { userId: user.id });

    const otpResult = await this.requestOtp(dto.phone);

    return {
      requiresVerification: true,
      phone: dto.phone,
      ...otpResult,
    };
  }
}
