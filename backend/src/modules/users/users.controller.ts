import { Controller, Get, Patch, Body, UseGuards, Req, Param, Post, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Body() updateDto: UpdateUserDto, @Req() req) {
    return this.usersService.update(req.user.id, updateDto);
  }

  @Get(':id/portfolio')
  getPortfolio(@Param('id') id: string) {
    return this.usersService.getPortfolio(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/portfolio')
  addPortfolioItem(@Req() req, @Body() dto: any) {
    return this.usersService.addPortfolioItem(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile/portfolio/:id')
  deletePortfolioItem(@Req() req, @Param('id') id: string) {
    return this.usersService.deletePortfolioItem(req.user.id, id);
  }
}
