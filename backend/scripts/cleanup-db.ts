import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Orders Audit: Database Cleanup ---');

    // 1. Delete dependent relations first
    const msg = await prisma.message.deleteMany();
    console.log('Deleted messages:', msg.count);

    const cht = await prisma.chat.deleteMany();
    console.log('Deleted chats:', cht.count);

    const app = await prisma.application.deleteMany();
    console.log('Deleted applications:', app.count);

    // 2. Delete main entities
    const ord = await prisma.order.deleteMany();
    console.log('Deleted orders:', ord.count);

    console.log('--- Cleanup Successful ---');
  } catch (error) {
    console.error('Cleanup Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
