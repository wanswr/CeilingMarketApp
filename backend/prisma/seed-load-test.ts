import { PrismaClient, OrderStatus, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING LOAD TEST SEED (5000 ORDERS) ---');

  // 1. Ensure we have an employer
  let employer = await prisma.user.findFirst({
    where: { role: Role.EMPLOYER }
  });

  if (!employer) {
    console.log('No employer found. Creating "Test Employer"...');
    employer = await prisma.user.create({
      data: {
        phone: '+79990000000',
        name: 'Test Employer',
        role: Role.EMPLOYER,
        isVerified: true
      }
    });
  }

  console.log(`Using Employer ID: ${employer.id}`);

  // 2. Prepare 5000 orders
  const ordersCount = 5000;
  const ordersData = [];

  const statuses = [OrderStatus.PUBLISHED, OrderStatus.CLAIMED, OrderStatus.COMPLETED];
  const titles = [
    'Монтаж потолка (гостиная)',
    'Срочный ремонт багета',
    'Установка люстры и ПВХ',
    'Двухуровневый потолок',
    'Теневой профиль EuroKRAAB',
    'Замена полотна после залива',
    'Слив воды и ремонт',
    'Магнитные треки в спальне'
  ];

  const addresses = [
    'Ленинский пр-т, 45',
    'ул. Профсоюзная, 12',
    'Московская обл, Химки, ул. Мира',
    'ул. Удальцова, 10',
    'Одинцово, Можайское ш.',
    'Красногорск, ул. Ленина',
    'Балашиха, мкр. Железнодорожный',
    'ул. Тверская, 1'
  ];

  // Moscow Center: 55.75, 37.61
  // We'll spread them roughly within ~100km radius
  for (let i = 0; i < ordersCount; i++) {
    const lat = 55.75 + (Math.random() - 0.5) * 1.5; // ~55.0 to 56.5
    const lng = 37.61 + (Math.random() - 0.5) * 2.0; // ~36.6 to 38.6
    const price = Math.floor(Math.random() * 50000) + 3000;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const daysOffset = Math.floor(Math.random() * 30) - 15;
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);

    ordersData.push({
      employerId: employer.id,
      title: `${titles[i % titles.length]} #${i}`,
      address: `${addresses[i % addresses.length]} ${Math.floor(Math.random() * 100)}`,
      latitude: lat,
      longitude: lng,
      price: price,
      status: status,
      date: date,
      details: 'Тестовый заказ для нагрузочного тестирования Spatial Engine V6. Описание должно быть достаточно длинным, чтобы проверить расход памяти на клиенте при хранении 5000 таких записей в EntityStore.',
      idempotencyKey: `load-test-${i}-${Date.now()}`
    });
  }

  console.log(`Prepared ${ordersData.length} records. Inserting in batches...`);

  // 3. Batch insert (Prisma createMany is best for this)
  // Note: createMany might not be available depending on the connector/version, but we'll try it.
  try {
      const result = await prisma.order.createMany({
          data: ordersData,
          skipDuplicates: true
      });
      console.log(`Successfully inserted ${result.count} orders.`);
  } catch (err) {
      console.warn('createMany failed, falling back to individual inserts (slower):', err.message);
      for (const o of ordersData) {
          await prisma.order.create({ data: o }).catch(() => {});
      }
      console.log('Finished individual inserts.');
  }

  // 4. Verification
  const finalCount = await prisma.order.count();
  console.log(`TOTAL ORDERS IN DB: ${finalCount}`);
  console.log('--- SEED COMPLETE ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
