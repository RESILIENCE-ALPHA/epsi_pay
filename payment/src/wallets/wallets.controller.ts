import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, SessionGuard, SessionUser } from '../common/session.guard';
import { PrismaService } from '../prisma/prisma.service';

const HISTORY_SIZE = 20;

@Controller('wallets')
@UseGuards(SessionGuard)
export class WalletsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.prisma.wallet.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  }

  @Get(':id')
  async findOne(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id } });
    if (!wallet || (wallet.userId !== user.id && user.role !== UserRole.ADMIN)) {
      throw new NotFoundException('WALLET_NOT_FOUND');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { OR: [{ senderWalletId: id }, { receiverWalletId: id }] },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_SIZE,
    });
    return { ...wallet, transactions };
  }
}
