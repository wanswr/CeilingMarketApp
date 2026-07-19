import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Seeding Initial Category ---');

    // 1. Upsert Category 'ceiling'
    const category = await prisma.category.upsert({
      where: { slug: 'ceiling' },
      update: {},
      create: {
        slug: 'ceiling',
        name: 'Натяжные потолки',
        isActive: true,
      },
    });

    console.log('Category upserted:', category.id, category.slug, category.name);

    // 2. Proactively link all orders with no category to this category
    const result = await prisma.order.updateMany({
      where: {
        categoryId: null,
      },
      data: {
        categoryId: category.id,
      },
    });

    console.log('Orders updated with category:', result.count);
    console.log('--- Seeding Successful ---');
  } catch (error) {
    console.error('Seeding Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
