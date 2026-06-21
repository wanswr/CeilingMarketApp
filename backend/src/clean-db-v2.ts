import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({
      datasources: {
          db: {
              url: process.env.DATABASE_URL
          }
      }
  });
  try {
    console.log('Cleaning database (v2)...');
    await prisma.message.deleteMany();
    await prisma.chat.deleteMany();
    await prisma.application.deleteMany();
    await prisma.order.deleteMany();
    console.log('Database cleaned successfully.');
  } catch (error) {
    console.error('Error cleaning database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
