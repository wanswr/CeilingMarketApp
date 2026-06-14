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
  getMapOrders(
    @Query('updatedAfter') updatedAfter?: string,
    @Query('tileX') tileX?: number,
    @Query('tileY') tileY?: number,
    @Query('zoom') zoom?: number,
  ) {
    // Production Tile Engine V2
    if (tileX !== undefined && tileY !== undefined && zoom !== undefined) {
      return this.ordersService.findByTile(
        Number(zoom),
        Number(tileX),
        Number(tileY),
        updatedAfter ? new Date(Number(updatedAfter)) : undefined
      );
    }

    // Fallback/Legacy
    return this.ordersService.findIncremental({
      updatedAfter: updatedAfter ? new Date(Number(updatedAfter)) : undefined,
      status: 'PUBLISHED'
    });
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
