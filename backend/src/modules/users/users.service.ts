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

  async deleteProfile(id: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete messages sent by the user
      await tx.message.deleteMany({
        where: { senderId: id },
      });

      // 2. Delete applications made by the user
      await tx.application.deleteMany({
        where: { executorId: id },
      });

      // 3. Delete chats involving the user
      await tx.chat.deleteMany({
        where: {
          OR: [
            { employerId: id },
            { executorId: id },
          ],
        },
      });

      // 4. Unassign user from executor orders
      await tx.order.updateMany({
        where: { executorId: id },
        data: { executorId: null },
      });

      // 5. Delete orders created by the user
      await tx.order.deleteMany({
        where: { employerId: id },
      });

      // 6. Delete subscriptions
      await tx.subscription.deleteMany({
        where: { userId: id },
      });

      // 7. Delete the user
      return tx.user.delete({
        where: { id },
      });
    });
  }
}
