import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';

describe('OrdersController (Validation E2E)', () => {
  let app: INestApplication;
  const ordersServiceMock = {
    update: jest.fn().mockImplementation((id, dto, userId) => {
      return { id, ...dto, employerId: 'original-employer' };
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: ordersServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 'test-user-id' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /orders/:id with disallowed field (employerId) should return 400', async () => {
    const res = await request(app.getHttpServer())
      .patch('/orders/1')
      .send({ title: 'ok', employerId: 'other-user-id' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('property employerId should not exist');
  });

  it('PATCH /orders/:id with correct fields should return 200', async () => {
    const res = await request(app.getHttpServer())
      .patch('/orders/1')
      .send({ title: 'ok', price: 5000 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: '1',
      title: 'ok',
      price: 5000,
      employerId: 'original-employer',
    });
    expect(ordersServiceMock.update).toHaveBeenCalledWith('1', { title: 'ok', price: 5000 }, 'test-user-id');
  });

  it('PATCH /orders/:id with CANCELLED status should return 200', async () => {
    const res = await request(app.getHttpServer())
      .patch('/orders/1')
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(ordersServiceMock.update).toHaveBeenCalledWith('1', { status: 'CANCELLED' }, 'test-user-id');
  });
});
