import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
      }
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: any) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }
}
