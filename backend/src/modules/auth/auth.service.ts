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
    let user = await this.prisma.user.findUnique({ where: { phone } });

    // If user doesn't exist, create one automatically (Login-as-Registration)
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          name: `User ${phone.slice(-4)}`,
          // We don't set a default role here to allow the frontend to trigger role selection
        },
      });
    }

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
          role: user.role
      },
    };
  }

  async register(dto: RegisterDto) {
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        role: dto.role || 'WORKER',
      },
    });
    return this.login(user);
  }
}
