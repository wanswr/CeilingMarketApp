import { Controller, Get, Patch, Body, UseGuards, Req, Param, Post, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddPortfolioItemDto } from './dto/add-portfolio-item.dto';
import { SetActiveCategoryDto } from './dto/set-active-category.dto';
import { SetRoleDto } from './dto/set-role.dto';

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
    return this.usersService.findPublicProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Body() updateDto: UpdateUserDto, @Req() req) {
    return this.usersService.update(req.user.id, updateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile/category')
  setActiveCategory(@Req() req, @Body() dto: SetActiveCategoryDto) {
    return this.usersService.setActiveCategory(req.user.id, dto.categoryId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile/role')
  setRole(@Req() req, @Body() dto: SetRoleDto) {
    return this.usersService.setRole(req.user.id, dto.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile')
  deleteProfile(@Req() req) {
    return this.usersService.deleteProfile(req.user.id);
  }

  @Get(':id/portfolio')
  getPortfolio(@Param('id') id: string) {
    return this.usersService.getPortfolio(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/portfolio')
  addPortfolioItem(@Req() req, @Body() dto: AddPortfolioItemDto) {
    return this.usersService.addPortfolioItem(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile/portfolio/:id')
  deletePortfolioItem(@Req() req, @Param('id') id: string) {
    return this.usersService.deletePortfolioItem(req.user.id, id);
  }
}
