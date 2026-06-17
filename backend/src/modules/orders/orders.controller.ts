import { Controller, Get, Post, Body, Query, Param, Patch, Delete, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('radius') radius?: number,
    @Query('minPrice') minPrice?: number,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll({
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      radius: radius ? Number(radius) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      status
    });
  }

  @Get('map')
  getMapOrders(@Query('updatedAfter') updatedAfter?: string) {
    // Legacy Sync (only for background delta updates)
    return this.ordersService.findIncremental({
      updatedAfter: updatedAfter ? new Date(Number(updatedAfter)) : undefined,
      status: 'PUBLISHED'
    });
  }

  @Get('map/bounds')
  getOrdersInBounds(
    @Query('updatedAfter') updatedAfter?: string,
    @Query('minLat') minLat?: string,
    @Query('maxLat') maxLat?: string,
    @Query('minLng') minLng?: string,
    @Query('maxLng') maxLng?: string,
  ) {
    if (minLat === undefined || maxLat === undefined || minLng === undefined || maxLng === undefined) {
        return { created: [], updated: [], deleted: [] };
    }

    const bounds = {
      minLat: parseFloat(minLat),
      maxLat: parseFloat(maxLat),
      minLng: parseFloat(minLng),
      maxLng: parseFloat(maxLng),
    };

    if (isNaN(bounds.minLat) || isNaN(bounds.maxLat) || isNaN(bounds.minLng) || isNaN(bounds.maxLng)) {
        return { created: [], updated: [], deleted: [] };
    }

    return this.ordersService.findInBounds(
      bounds,
      (updatedAfter && !isNaN(Number(updatedAfter))) ? new Date(Number(updatedAfter)) : undefined
    );
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
  update(@Param('id') id: string, @Body() updateDto: any, @Req() req: any) {
    return this.ordersService.update(id, updateDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.remove(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/claim')
  claim(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.claim(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: any
  ) {
    return this.ordersService.transitionStatus(id, status as any, req.user.id);
  }
}
