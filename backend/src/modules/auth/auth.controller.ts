import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Post('request-otp')
  async requestOtp(@Body() dto: RequestOtpDto, @Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.authService.requestOtp(dto.phone, ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const fingerprint = req.headers['x-device-fingerprint'] as string;
    return this.authService.verifyOtp(dto.phone, dto.code, fingerprint, ip);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.authService.register(registerDto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.authService.logout(req.user.sessionId, req.user.id, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.authService.logoutAll(req.user.id, ip);
  }
}
