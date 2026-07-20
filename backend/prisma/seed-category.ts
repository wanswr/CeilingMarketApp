import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Seeding Categories ---');

    const categories = [
      { slug: 'ceiling', name: 'Натяжные потолки' },
      { slug: 'plumbing', name: 'Сантехника' },
      { slug: 'electrical', name: 'Электрика' },
      { slug: 'tiling', name: 'Плитка' },
      { slug: 'flooring', name: 'Напольные покрытия' },
      { slug: 'painting', name: 'Малярные работы' },
    ];

    for (const cat of categories) {
      const category = await prisma.category.upsert({
        where: { slug: cat.slug },
        update: { name: cat.name },
        create: { slug: cat.slug, name: cat.name, isActive: true },
      });
      console.log('Category upserted:', category.id, category.slug, category.name);
    }

    const ceiling = await prisma.category.findUniqueOrThrow({ where: { slug: 'ceiling' } });
    const result = await prisma.order.updateMany({
      where: { categoryId: null },
      data: { categoryId: ceiling.id },
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
