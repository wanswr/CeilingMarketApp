import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Starting User Rating Data Migration ---');

    const users = await prisma.user.findMany({
      select: { id: true, rating: true }
    });

    let updatedCount = 0;

    for (const user of users) {
      const reviewsCount = await prisma.review.count({
        where: { targetId: user.id }
      });

      if (reviewsCount === 0 && user.rating !== null) {
        await prisma.user.update({
          where: { id: user.id },
          data: { rating: null }
        });
        updatedCount++;
      }
    }

    console.log(`Successfully completed. Updated ${updatedCount} users with zero reviews to rating: null.`);
    console.log('--- Data Migration Successful ---');
  } catch (error) {
    console.error('Data Migration Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
