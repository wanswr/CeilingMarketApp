import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class UsersService {
  calculateTrustScore(user: { completedOrders: number; rating: number | null; experience: number | null; isVerified: boolean }): number {
    let score = 50; // Base score
    if (user.isVerified) score += 20;
    score += Math.min(user.experience || 0, 5) * 2; // Up to 10 points
    score += Math.min(user.completedOrders || 0, 10) * 2; // Up to 20 points
    if (user.rating !== null && user.rating !== undefined) {
      const ratingDiff = user.rating - 3;
      score += Math.round(ratingDiff * 10); // rating of 5.0 adds 20. rating of 3.0 adds 0. rating below 3.0 subtracts.
    }
    return Math.max(0, Math.min(100, score));
  }

    async assertUserCanMutate(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBlocked: true, deletedAt: true }
    });
    if (!user || user.deletedAt) {
      throw new ForbiddenException("User account is deleted or non-existent");
    }
    if (user.isBlocked) {
      throw new ForbiddenException("Blocked users cannot perform this action");
    }
    return user;
  }

  constructor(
    private prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        roles: true,
        avatar: true,
        rating: true,
        experience: true,
        ordersCount: true,
        completedOrders: true,
        instagram: true,
        telegram: true,
        isVerified: true,
        phoneVerified: true,
        isTrialUsed: true,
        createdAt: true,
        updatedAt: true,
        subscriptions: { include: { category: true } },
        portfolioItems: true,
        activeCategoryId: true,
        activeCategory: { select: { id: true, slug: true, name: true } },
      }
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    let categoryLocked = false;
    if (user.activeCategoryId) {
      categoryLocked = await this.subscriptionService.checkActiveSubscription(id, user.activeCategoryId || undefined);
    }

    return {
      ...user,
      categoryLocked,
      trustScore: this.calculateTrustScore({
        completedOrders: user.completedOrders,
        rating: user.rating,
        experience: user.experience,
        isVerified: user.isVerified
      }),
    };
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
        isVerified: true,
        portfolioItems: true,
        isBlocked: true,
        deletedAt: true,
        activeCategory: { select: { id: true, slug: true, name: true } },
      }
    });

    if (!user || user.deletedAt || user.isBlocked) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { deletedAt, isBlocked, ...publicProfile } = user;
    return {
      ...publicProfile,
      trustScore: this.calculateTrustScore({
        completedOrders: user.completedOrders,
        rating: user.rating,
        experience: user.experience,
        isVerified: user.isVerified
      }),
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${id} not found`);

    const filteredDto: Partial<UpdateUserDto> = {};

    if (dto.name !== undefined) filteredDto.name = dto.name;
    if (dto.avatar !== undefined) filteredDto.avatar = dto.avatar;
    if (dto.experience !== undefined) filteredDto.experience = dto.experience;
    if (dto.telegram !== undefined) filteredDto.telegram = dto.telegram;
    if (dto.instagram !== undefined) filteredDto.instagram = dto.instagram;

    // Role cannot be updated via general update. If a client attempts to pass role, it is strictly ignored or rejected.
    // For general profile PATCH requests, we silently ignore other fields to maintain backward compatibility with permissive clients.

    try {
        return await this.prisma.user.update({
          where: { id },
          data: filteredDto,
        });
    } catch (error: any) {
        if (error.code === 'P2025') {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        throw error;
    }
  }

  async setRole(userId: string, role: 'WORKER' | 'EMPLOYER') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${userId} not found`);

    // Restrict role switching strictly to roles in user's roles array.
    // Fall back to ['WORKER', 'EMPLOYER'] for older entries or mock users.
    const allowedRoles = user.roles && user.roles.length > 0 ? user.roles : ['WORKER', 'EMPLOYER'];
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException(`User does not possess the ${role} role`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  async getPortfolio(userId: string, params?: { skip?: number; take?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBlocked: true, deletedAt: true }
    });

    if (!user || user.deletedAt || user.isBlocked) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const rawSkip = params?.skip !== undefined ? Number(params.skip) : 0;
    const skip = Math.max(0, isNaN(rawSkip) ? 0 : rawSkip);

    const rawTake = params?.take !== undefined ? Number(params.take) : 50;
    const clampedTake = isNaN(rawTake) ? 50 : Math.max(1, Math.min(rawTake, 100));

    return this.prisma.portfolioItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: clampedTake
    });
  }

  async addPortfolioItem(userId: string, dto: { imageUrl: string; description?: string; workType?: any }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${userId} not found`);

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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${userId} not found`);

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

  async setActiveCategory(userId: string, categoryId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${userId} not found`);
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role].filter(Boolean);
    if (!userRoles.includes('WORKER') || user.role !== 'WORKER') {
      throw new ForbiddenException('Only workers can select a direction');
    }

    if (user.activeCategoryId && user.activeCategoryId !== categoryId) {
      const hasActiveSub = await this.subscriptionService.checkActiveSubscription(userId, user.activeCategoryId || undefined);
      if (hasActiveSub) {
        throw new ForbiddenException(
          'Cannot change direction while subscription is active'
        );
      }
    }

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { activeCategoryId: categoryId },
      select: {
        id: true, name: true, role: true, activeCategoryId: true,
        activeCategory: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  async deleteProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    // Idempotency: if already requested deletion, preserve original deletion date
    if (user.deletedAt) {
      return { success: true, deletedAt: user.deletedAt };
    }

    // 1. Guard against active orders
    const activeOrdersCount = await this.prisma.order.count({
      where: {
        OR: [
          { employerId: id },
          { executorId: id }
        ],
        status: { in: ['CLAIMED', 'IN_PROGRESS'] }
      }
    });

    if (activeOrdersCount > 0) {
      throw new ConflictException('Cannot delete account with active orders in progress');
    }

    // 2. Guard against active disputes
    const activeDisputesCount = await this.prisma.dispute.count({
      where: {
        OR: [{ openedById: id }, { respondentId: id }],
        status: { in: ['OPEN', 'IN_REVIEW', 'UNDER_REVIEW', 'WAITING_FOR_PARTY', 'APPEALED'] }
      }
    });

    if (activeDisputesCount > 0) {
      throw new ConflictException('Cannot delete account with active disputes');
    }

    // 3. Guard against pending payments
    const pendingPaymentsCount = await this.prisma.payment.count({
      where: {
        userId: id,
        status: { in: ['PENDING', 'PROCESSING'] }
      }
    });

    if (pendingPaymentsCount > 0) {
      throw new ConflictException('Cannot delete account with pending financial obligations');
    }

    const updatedUser = await this.prisma.user.update({
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

    // Revoke all active sessions
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return { success: true, deletedAt: updatedUser.deletedAt };
  }

    async restoreProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    if (!user.deletedAt) {
      return { success: true, message: "Account is already active" };
    }

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - user.deletedAt.getTime();

    if (elapsed > thirtyDaysMs) {
      throw new ConflictException("Account recovery period of 30 days has expired");
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: null,
      },
    });

    return { success: true, message: "Account successfully restored" };
  }

  async permanentDeleteExpiredAccounts() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const expiredUsers = await this.prisma.user.findMany({
      where: {
        deletedAt: {
          lt: thirtyDaysAgo
        }
      },
      select: { id: true }
    });

    let count = 0;
    for (const u of expiredUsers) {
      // Soft-anonymize PII for retention compliance while preserving historical Orders/Reviews/Disputes
      await this.prisma.user.update({
        where: { id: u.id },
        data: {
          name: "Anonymized User",
          phone: `anonymized_${u.id}`,
          instagram: null,
          telegram: null,
          pushToken: null,
        }
      });
      count++;
    }

    return { count };
  }

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { activeCategory: true, subscriptions: true }
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    const trustScore = this.calculateTrustScore({
      completedOrders: user.completedOrders,
      rating: user.rating,
      experience: user.experience,
      isVerified: user.isVerified
    });

    // Get unread chats count
    const unreadChatsCount = await this.prisma.message.count({
      where: {
        chat: {
          OR: [{ employerId: userId }, { executorId: userId }]
        },
        senderId: { not: userId },
        isRead: false
      }
    });

    // Get unread notifications count
    const unreadNotificationsCount = await this.prisma.notification.count({
      where: { userId, read: false }
    });

    if (user.role === 'EMPLOYER') {
      // 1. Orders requiring action
      const ordersWithResponses = await this.prisma.order.findMany({
        where: {
          employerId: userId,
          status: { in: ['PUBLISHED', 'HAS_RESPONSES'] },
          applications: { some: { status: 'PENDING' } }
        },
        include: {
          applications: { where: { status: 'PENDING' }, include: { executor: { select: { name: true, avatar: true } } } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      const ordersPendingReview = await this.prisma.order.findMany({
        where: {
          employerId: userId,
          status: 'COMPLETED',
          reviews: { none: { authorId: userId } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      const activeOrders = await this.prisma.order.findMany({
        where: {
          employerId: userId,
          status: { in: ['CLAIMED', 'IN_PROGRESS'] }
        },
        include: {
          executor: { select: { name: true, avatar: true } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      return {
        role: 'EMPLOYER',
        user: { name: user.name, rating: user.rating, avatar: user.avatar, trustScore },
        stats: {
          activeOrders: activeOrders.length,
          totalCreated: user.ordersCount
        },
        actionRequired: {
          ordersWithResponses,
          ordersPendingReview,
          activeOrders
        },
        unreadChatsCount,
        unreadNotificationsCount
      };
    } else {
      // WORKER dashboard
      // 1. My active work (Claimed or In Progress)
      const activeJobs = await this.prisma.order.findMany({
        where: {
          executorId: userId,
          status: { in: ['CLAIMED', 'IN_PROGRESS'] }
        },
        include: {
          employer: { select: { name: true, avatar: true } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      // 2. Jobs pending review
      const jobsPendingReview = await this.prisma.order.findMany({
        where: {
          executorId: userId,
          status: 'COMPLETED',
          reviews: { none: { authorId: userId } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      // 3. Hot/Relevant orders in my category
      const relevantOrders = await this.prisma.order.findMany({
        where: {
          status: { in: ['PUBLISHED', 'HAS_RESPONSES'] },
          categoryId: user.activeCategoryId || undefined,
          applications: { none: { executorId: userId } }
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
      });

      return {
        role: 'WORKER',
        user: { name: user.name, rating: user.rating, avatar: user.avatar, trustScore, activeCategory: user.activeCategory?.name },
        stats: {
          completedOrders: user.completedOrders,
          experience: user.experience,
          subscriptionActive: await this.subscriptionService.checkActiveSubscription(userId, user.activeCategoryId || undefined)
        },
        actionRequired: {
          activeJobs,
          jobsPendingReview
        },
        relevantOrders,
        unreadChatsCount,
        unreadNotificationsCount
      };
    }
  }

  async verifyProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${id} not found`);

    // Real biometric identity/liveness provider is not yet integrated.
    // Throwing ForbiddenException to provide a clean API contract explaining the status.
    throw new ForbiddenException('Интеграция с биометрическим провайдером верификации (Liveness SDK) находится в процессе настройки. Моментальное подтверждение в клик отключено в целях безопасности.');
  }
}
