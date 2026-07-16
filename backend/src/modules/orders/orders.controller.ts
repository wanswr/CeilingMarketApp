import { Controller, Get, Post, Body, Query, Param, Patch, Delete, UseGuards, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ApplyOrderDto } from './dto/apply-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { GetOrdersSpatialDto } from './dto/get-orders-spatial.dto';
import { FindAllOrdersDto } from './dto/find-all-orders.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMyOrders(@Req() req: any) {
    return this.ordersService.findMyOrders(req.user.id);
  }

  @Get()
  findAll(@Query() query: FindAllOrdersDto) {
    return this.ordersService.findAll(query as any);
  }

  @Get('spatial')
  getSpatialOrders(@Query() query: GetOrdersSpatialDto) {
    return this.ordersService.findSpatial({
      ...query,
      updatedAfter: (query.updatedAfter && !isNaN(Number(query.updatedAfter))) ? new Date(Number(query.updatedAfter)) : undefined
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/apply')
  cancelApplication(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.cancelApplication(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('parse')
  parseOrderText(@Body('text') text: string) {
    return this.ordersService.parseOrderText(text);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    return this.ordersService.create(createOrderDto, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  update(@Param('id') id: string, @Body() updateDto: UpdateOrderDto, @Req() req: any) {
    return this.ordersService.update(id, updateDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.remove(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/apply')
  apply(
    @Param('id') id: string,
    @Body() dto: ApplyOrderDto,
    @Req() req: any
  ) {
    return this.ordersService.apply(id, req.user.id, dto.price);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('applications/:id/view')
  markApplicationViewed(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.markApplicationViewed(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('applications/:id/accept')
  acceptApplication(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.acceptApplication(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  async start(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.startWork(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/complete')
  async complete(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.completeWork(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() req: any
  ) {
    return this.ordersService.transitionStatus(id, dto.status, req.user.id);
  }
}
