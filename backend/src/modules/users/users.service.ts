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
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async update(id: string, dto: any) {
    try {
        return await this.prisma.user.update({
          where: { id },
          data: dto,
        });
    } catch (error) {
        // Prisma error P2025: Record to update not found
        if (error.code === 'P2025') {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        throw error;
    }
  }
}
