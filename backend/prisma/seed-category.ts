import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Seeding Categories ---');

    const categories = [
      { slug: 'ceilings', name: 'Потолки' },
      { slug: 'walls', name: 'Стены' },
      { slug: 'floors', name: 'Полы' },
      { slug: 'plumbing', name: 'Сантехника' },
      { slug: 'electricity', name: 'Электрика' },
      { slug: 'finishing', name: 'Отделка' },
      { slug: 'doors-windows', name: 'Двери и окна' },
      { slug: 'furniture-installation', name: 'Мебель и монтаж' },
      { slug: 'heating-climate', name: 'Отопление и климат' },
      { slug: 'turnkey-repair', name: 'Ремонт под ключ' }
    ];

    for (const cat of categories) {
      const category = await prisma.category.upsert({
        where: { slug: cat.slug },
        update: { name: cat.name },
        create: { slug: cat.slug, name: cat.name, isActive: true },
      });
      console.log('Category upserted:', category.id, category.slug, category.name);
    }

    const defaultCat = await prisma.category.findUniqueOrThrow({ where: { slug: 'ceilings' } });
    const result = await prisma.order.updateMany({
      where: { categoryId: null },
      data: { categoryId: defaultCat.id },
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
