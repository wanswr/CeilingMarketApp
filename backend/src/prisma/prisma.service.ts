import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService {
  user: any;
  order: any;
  application: any;
  subscription: any;
}
