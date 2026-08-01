import { normalizePhone } from '../../common/utils/normalize-phone';
import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    }

    let user = await this.prisma.user.findUnique({ where: { phone: normalizePhone(phone) } });

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
    const payload = { id: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: user.role,
          phoneVerified: user.phoneVerified
      },
    };
  }

  async register(dto: RegisterDto) {
    const user = await this.prisma.user.create({
      data: {
        phone: normalizePhone(dto.phone),
        name: dto.name,
        role: dto.role || 'WORKER',
        phoneVerified: false,
      },
    });
    this.logger.info('USER_REGISTERED', `User registered/verified via OTP`, { userId: user.id });
    return this.login(user);
  }
}
