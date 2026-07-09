import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
        portfolioItems: true,
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
        if (error.code === 'P2025') {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        throw error;
    }
  }

  async getPortfolio(userId: string) {
    return this.prisma.portfolioItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async addPortfolioItem(userId: string, dto: { imageUrl: string; description?: string; workType?: any }) {
    return this.prisma.portfolioItem.create({
      data: {
        userId,
        imageUrl: dto.imageUrl,
        description: dto.description,
        workType: dto.workType,
      }
    });
  }

  async deletePortfolioItem(userId: string, itemId: string) {
    const item = await this.prisma.portfolioItem.findUnique({
      where: { id: itemId }
    });

    if (!item) throw new NotFoundException('Portfolio item not found');
    if (item.userId !== userId) throw new ForbiddenException('Not your portfolio item');

    await this.prisma.portfolioItem.delete({
      where: { id: itemId }
    });

    return { success: true };
  }
}
