import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    category: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return only active categories with projected fields (id, slug, name)', async () => {
      const mockCategories = [
        { id: 'cat-1', slug: 'ceiling', name: 'Натяжные потолки' },
        { id: 'cat-2', slug: 'plumbing', name: 'Сантехника' },
      ];

      mockPrismaService.category.findMany.mockResolvedValue(mockCategories);

      const result = await service.findAll();

      expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      });
      expect(result).toEqual(mockCategories);
    });
  });
});
