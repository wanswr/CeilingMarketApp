import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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
    console.log(`Category upserted: ${category.id} | ${category.slug} | ${category.name}`);
  }

  // Update existing orders with default category ceilings if they do not have one
  try {
    const defaultCat = await prisma.category.findUnique({ where: { slug: 'ceilings' } });
    if (defaultCat) {
      const result = await prisma.order.updateMany({
        where: { categoryId: null },
        data: { categoryId: defaultCat.id },
      });
      console.log('Orders updated with category:', result.count);
    }
  } catch (e) {}

  console.log('--- Seeding Successful ---');
}

main()
  .catch((e) => {
    console.error('Seeding Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
