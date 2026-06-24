import { Controller, Get, Post, Body, Query, Param, Patch, Delete, UseGuards, Req, ForbiddenException, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
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


  @Get('spatial')
  getSpatialOrders(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('minLat') minLat?: string,
    @Query('maxLat') maxLat?: string,
    @Query('minLng') minLng?: string,
    @Query('maxLng') maxLng?: string,
    @Query('updatedAfter') updatedAfter?: string,
  ) {
    return this.ordersService.findSpatial({
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : undefined,
      minLat: minLat ? parseFloat(minLat) : undefined,
      maxLat: maxLat ? parseFloat(maxLat) : undefined,
      minLng: minLng ? parseFloat(minLng) : undefined,
      maxLng: maxLng ? parseFloat(maxLng) : undefined,
      updatedAfter: (updatedAfter && !isNaN(Number(updatedAfter))) ? new Date(Number(updatedAfter)) : undefined
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
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: diskStorage({
      destination: './uploads/orders',
      filename: (req, file, cb) => {
        const randomName = Array(32).fill(null).map(() => (Math.round(Math.random() * 16)).toString(16)).join('');
        return cb(null, `${randomName}${extname(file.originalname)}`);
      }
    })
  }))
  uploadFiles(@UploadedFiles() files: Array<Express.Multer.File>) {
    return files.map(file => `uploads/orders/${file.filename}`);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    return this.ordersService.create(createOrderDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sync')
  syncGlobal(@Query('since') since: string, @Req() req: any) {
    const timestamp = Number(since);
    if (isNaN(timestamp)) return [];
    return this.ordersService.syncGlobal(new Date(timestamp), req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/sync')
  syncEvents(@Param('id') id: string, @Query('since') since: string) {
    const timestamp = Number(since);
    if (isNaN(timestamp)) return [];
    return this.ordersService.syncEvents(id, new Date(timestamp));
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
  @Post(':id/apply')
  apply(
    @Param('id') id: string,
    @Body('price') price: number,
    @Req() req: any
  ) {
    return this.ordersService.apply(id, req.user.id, price);
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
    @Body('status') status: string,
    @Req() req: any
  ) {
    return this.ordersService.transitionStatus(id, status as any, req.user.id);
  }

}
