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

  async findPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        avatar: true,
        rating: true,
        experience: true,
        completedOrders: true,
        ordersCount: true,
        instagram: true,
        telegram: true,
        isVerified: true,
        portfolioItems: true,
        subscription: true,
        deletedAt: true,
      }
    });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${id} not found`);
    const { deletedAt, ...publicProfile } = user;
    return publicProfile;
  }

  async update(id: string, dto: any) {
    // Whitelist only safe, user-configurable profile fields to prevent Mass Assignment vulnerability (P0)
    const allowedFields = ['name', 'avatar', 'experience', 'telegram', 'instagram', 'portfolio', 'description'];
    const filteredDto: any = {};

    for (const key of allowedFields) {
        if (dto[key] !== undefined) {
            filteredDto[key] = dto[key];
        }
    }

    if (dto.role !== undefined) {
      const currentUser = await this.prisma.user.findUnique({ where: { id } });
      if (!currentUser) throw new NotFoundException(`User with ID ${id} not found`);
      if (currentUser.role) {
        throw new ForbiddenException('Role is already set and cannot be changed');
      }
      filteredDto.role = dto.role;
    }

    try {
        return await this.prisma.user.update({
          where: { id },
          data: filteredDto,
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

  async deleteProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${id} not found`);

    await this.prisma.user.update({
      where: { id },
      data: {
        name: 'Удалённый пользователь',
        avatar: null,
        phone: `deleted_${id}`,
        instagram: null,
        telegram: null,
        pushToken: null,
        isVerified: false,
        phoneVerified: false,
        deletedAt: new Date(),
      },
    });
    return { success: true };
  }
}
