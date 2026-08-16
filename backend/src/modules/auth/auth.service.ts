import { normalizePhone } from '../../common/utils/normalize-phone';
import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { RegisterDto } from './dto/register.dto';

interface OtpTracker {
  lastRequestedAt: number;
  failedAttempts: number;
  lockedUntil: number;
}

@Injectable()
export class AuthService {
  private otpTrackers = new Map<string, OtpTracker>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.logger.setService('AuthService');
  }

  private async logSecurityEvent(event: string, userId?: string, phone?: string, ipAddress?: string, metadata?: any) {
    await this.prisma.securityLog.create({
      data: {
        event,
        userId,
        phone,
        ipAddress,
        metadata,
      },
    }).catch(() => null);
  }

  async requestOtp(phone: string, ipAddress?: string) {
    const normPhone = normalizePhone(phone);
    const now = Date.now();
    const tracker = this.otpTrackers.get(normPhone) || { lastRequestedAt: 0, failedAttempts: 0, lockedUntil: 0 };

    if (tracker.lockedUntil > now) {
      await this.logSecurityEvent('OTP_RATE_LIMITED', undefined, normPhone, ipAddress, { reason: 'locked_out' });
      throw new BadRequestException(`Too many failed OTP attempts. Please try again in ${Math.ceil((tracker.lockedUntil - now) / 1000)} seconds.`);
    }

    if (now - tracker.lastRequestedAt < 30000) {
      await this.logSecurityEvent('OTP_RATE_LIMITED', undefined, normPhone, ipAddress, { reason: 'cooldown' });
      throw new BadRequestException('Please wait 30 seconds before requesting another OTP.');
    }

    tracker.lastRequestedAt = now;
    this.otpTrackers.set(normPhone, tracker);

    await this.logSecurityEvent('OTP_REQUEST', undefined, normPhone, ipAddress);

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

  async verifyOtp(phone: string, code: string, deviceFingerprint?: string, ipAddress?: string) {
    const normPhone = normalizePhone(phone);
    const now = Date.now();
    const tracker = this.otpTrackers.get(normPhone) || { lastRequestedAt: 0, failedAttempts: 0, lockedUntil: 0 };

    if (tracker.lockedUntil > now) {
      await this.logSecurityEvent('OTP_RATE_LIMITED', undefined, normPhone, ipAddress, { reason: 'locked_out' });
      throw new BadRequestException(`Too many failed attempts. Account temporarily locked.`);
    }

    const authMode = this.configService.get('AUTH_MODE') || 'development';

    let codeValid = false;
    if (authMode === 'development') {
      codeValid = (code === '1234');
    }

    if (!codeValid) {
      tracker.failedAttempts += 1;
      if (tracker.failedAttempts >= 5) {
        tracker.lockedUntil = now + 5 * 60 * 1000; // 5 min lockout
        this.otpTrackers.set(normPhone, tracker);
        await this.logSecurityEvent('OTP_RATE_LIMITED', undefined, normPhone, ipAddress, { attempts: tracker.failedAttempts });
        throw new BadRequestException('Too many wrong OTP attempts. Account locked for 5 minutes.');
      }
      this.otpTrackers.set(normPhone, tracker);
      await this.logSecurityEvent('OTP_FAILED', undefined, normPhone, ipAddress, { attempts: tracker.failedAttempts });
      throw new UnauthorizedException('Invalid OTP code');
    }

    // Reset failed attempts on success
    tracker.failedAttempts = 0;
    tracker.lockedUntil = 0;
    this.otpTrackers.set(normPhone, tracker);

    let user = await this.prisma.user.findUnique({ where: { phone: normPhone } });

    if (user && user.isBlocked) {
      await this.logSecurityEvent('LOGIN_FAILED', user.id, normPhone, ipAddress, { reason: 'user_blocked' });
      throw new ForbiddenException('User is blocked');
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normPhone,
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
    return this.login(user, deviceFingerprint, ipAddress);
  }

  async validateUser(phone: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { phone: normalizePhone(phone) } });
    return user;
  }

  async login(user: any, deviceFingerprint?: string, ipAddress?: string) {
    if (user.isBlocked) {
      await this.logSecurityEvent('LOGIN_FAILED', user.id, user.phone, ipAddress, { reason: 'user_blocked' });
      throw new ForbiddenException('User is blocked');
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // BIBLE REQUIREMENT: 1 ACCOUNT = 1 ACTIVE SESSION = 1 ACTIVE DEVICE
    // Revoke all previous active sessions and increment sessionVersion so existing JWTs are invalidated immediately.
    const [_, session] = await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.create({
        data: {
          userId: user.id,
          deviceFingerprint,
          ipAddress,
          expiresAt,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      }),
    ]);

    // Fetch updated user to get new sessionVersion
    const updatedUser = await this.prisma.user.findUnique({ where: { id: user.id } });

    const payload = {
      id: updatedUser!.id,
      phone: updatedUser!.phone,
      role: updatedUser!.role,
      sessionVersion: updatedUser!.sessionVersion,
      sessionId: session.id,
    };

    await this.logSecurityEvent('LOGIN_SUCCESS', updatedUser!.id, updatedUser!.phone, ipAddress, {
      sessionId: session.id,
      deviceFingerprint,
    });

    if (deviceFingerprint) {
      await this.logSecurityEvent('NEW_DEVICE_LOGIN', updatedUser!.id, updatedUser!.phone, ipAddress, {
        sessionId: session.id,
        deviceFingerprint,
      });
    }

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: updatedUser!.id,
        phone: updatedUser!.phone,
        name: updatedUser!.name,
        role: updatedUser!.role,
        phoneVerified: updatedUser!.phoneVerified,
      },
    };
  }

  async logout(sessionId: string, userId?: string, ipAddress?: string) {
    if (sessionId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      }).catch(() => null);
    }
    await this.logSecurityEvent('LOGOUT', userId, undefined, ipAddress, { sessionId });
    await this.logSecurityEvent('SESSION_REVOKED', userId, undefined, ipAddress, { sessionId });
    return { success: true };
  }

  async logoutAll(userId: string, ipAddress?: string) {
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
    await this.logSecurityEvent('SESSION_REVOKED', userId, undefined, ipAddress, { type: 'ALL_SESSIONS' });
    return { success: true };
  }

  async register(dto: RegisterDto, ipAddress?: string) {
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

    const otpResult = await this.requestOtp(dto.phone, ipAddress);

    return {
      requiresVerification: true,
      phone: dto.phone,
      ...otpResult,
    };
  }
}
