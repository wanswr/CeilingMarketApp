import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(phone: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    return user;
  }

  async login(user: any) {
    const payload = { id: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async register(dto: RegisterDto) {
    const user = await this.prisma.user.create({
      data: {
        ...dto,
      },
    });
    return this.login(user);
  }
}
