import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Database Cleanup Start ---');
    const m = await prisma.message.deleteMany();
    const c = await prisma.chat.deleteMany();
    const a = await prisma.application.deleteMany();
    const o = await prisma.order.deleteMany();
    console.log('Cleaned Messages:', m.count);
    console.log('Cleaned Chats:', c.count);
    console.log('Cleaned Applications:', a.count);
    console.log('Cleaned Orders:', o.count);
    console.log('--- Database Cleanup Success ---');
  } catch (error) {
    console.error('Cleanup Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}
main();
