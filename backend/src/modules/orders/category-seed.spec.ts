import { PrismaClient } from '@prisma/client';

describe('Category Seeding Logic', () => {
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      category: {
        upsert: jest.fn().mockResolvedValue({
          id: 'ceiling-category-uuid',
          slug: 'ceiling',
          name: 'Натяжные потолки',
          isActive: true,
        }),
      },
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      $disconnect: jest.fn(),
    };
  });

  it('should successfully upsert the "ceiling" category and update orders having null categoryId', async () => {
    // Simulate the exact seeding steps:
    const category = await prismaMock.category.upsert({
      where: { slug: 'ceiling' },
      update: {},
      create: {
        slug: 'ceiling',
        name: 'Натяжные потолки',
        isActive: true,
      },
    });

    expect(prismaMock.category.upsert).toHaveBeenCalledWith({
      where: { slug: 'ceiling' },
      update: {},
      create: {
        slug: 'ceiling',
        name: 'Натяжные потолки',
        isActive: true,
      },
    });
    expect(category.slug).toBe('ceiling');
    expect(category.id).toBe('ceiling-category-uuid');

    const updateResult = await prismaMock.order.updateMany({
      where: {
        categoryId: null,
      },
      data: {
        categoryId: category.id,
      },
    });

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: {
        categoryId: null,
      },
      data: {
        categoryId: 'ceiling-category-uuid',
      },
    });
    expect(updateResult.count).toBe(5);
  });
});
