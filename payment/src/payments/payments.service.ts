import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditSeverity, Prisma, RemediationAction, TransactionStatus, TransactionType, WalletStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { SessionUser } from '../common/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

const SYSTEM_BOT_EMAIL = process.env.SYSTEM_BOT_EMAIL ?? 'system-bot@epsi-pay.internal';
const VALIDATION_TEST_AMOUNT = new Prisma.Decimal('0.01');

export interface ClientContext {
  ip: string;
  userAgent?: string;
}

// Ex : TX-20261021-9F3A61C2
function generateReference(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `TX-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: SessionUser, dto: CreatePaymentDto, client: ClientContext, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey, user);
      if (existing) return existing;
    }
    if (dto.senderWalletId === dto.receiverWalletId) throw new BadRequestException('SAME_WALLET');

    const amount = new Prisma.Decimal(dto.amount);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const sender = await tx.wallet.findUnique({ where: { id: dto.senderWalletId } });
        if (!sender || sender.userId !== user.id) throw new NotFoundException('SENDER_WALLET_NOT_FOUND');
        const receiver = await tx.wallet.findUnique({ where: { id: dto.receiverWalletId } });
        if (!receiver) throw new NotFoundException('RECEIVER_WALLET_NOT_FOUND');

        if (sender.status !== WalletStatus.ACTIVE || receiver.status !== WalletStatus.ACTIVE) {
          throw new UnprocessableEntityException('WALLET_NOT_ACTIVE');
        }
        if (sender.currency !== receiver.currency) throw new UnprocessableEntityException('CURRENCY_MISMATCH');
        if (sender.balance.lt(amount)) throw new UnprocessableEntityException('INSUFFICIENT_FUNDS');

        // Verrou optimiste : aucun débit si le wallet a été modifié depuis la lecture
        const debited = await tx.wallet.updateMany({
          where: { id: sender.id, version: sender.version },
          data: { balance: { decrement: amount }, version: { increment: 1 } },
        });
        if (debited.count === 0) throw new ConflictException('CONCURRENT_UPDATE_RETRY');

        await tx.wallet.update({
          where: { id: receiver.id },
          data: { balance: { increment: amount }, version: { increment: 1 } },
        });

        const transaction = await tx.transaction.create({
          data: {
            reference: generateReference(),
            idempotencyKey,
            type: TransactionType.PAYMENT,
            status: TransactionStatus.SUCCESS,
            amount,
            currency: sender.currency,
            description: dto.description,
            senderWalletId: sender.id,
            receiverWalletId: receiver.id,
            clientIp: client.ip,
            userAgent: client.userAgent,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: user.id,
            transactionId: transaction.id,
            action: 'TRANSACTION_AUTHORIZED',
            severity: AuditSeverity.INFO,
            ipAddress: client.ip,
          },
        });

        return transaction;
      });
    } catch (error) {
      // Deux requêtes simultanées avec la même clé : la seconde renvoie la transaction de la première
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByIdempotencyKey(idempotencyKey, user);
        if (existing) return existing;
      }
      throw error;
    }
  }

  // Preuve de rétablissement : crédite le wallet système d'un montant symbolique via le circuit de paiement réel
  async runValidationTest(incidentId?: string) {
    const startedAt = Date.now();

    if (incidentId && !(await this.prisma.incident.findUnique({ where: { id: incidentId } }))) {
      throw new NotFoundException('INCIDENT_NOT_FOUND');
    }

    try {
      const wallet = await this.prisma.wallet.findFirst({
        where: { user: { email: SYSTEM_BOT_EMAIL }, status: WalletStatus.ACTIVE },
      });
      if (!wallet) throw new ServiceUnavailableException('SYSTEM_WALLET_NOT_FOUND');

      const transaction = await this.prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: VALIDATION_TEST_AMOUNT }, version: { increment: 1 } },
        });
        return tx.transaction.create({
          data: {
            reference: generateReference(),
            type: TransactionType.VALIDATION_TEST,
            status: TransactionStatus.SUCCESS,
            amount: VALIDATION_TEST_AMOUNT,
            currency: wallet.currency,
            description: 'Paiement test post-remédiation',
            receiverWalletId: wallet.id,
            metadata: incidentId ? { incidentId } : undefined,
          },
        });
      });

      const durationMs = Date.now() - startedAt;
      if (incidentId) {
        await this.logRemediation(incidentId, true, durationMs, {
          proofTransaction: transaction.reference,
          status: transaction.status,
        });
      }
      return { status: transaction.status, durationMs, transaction };
    } catch (error) {
      if (incidentId) {
        await this.logRemediation(incidentId, false, Date.now() - startedAt, {
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  private async findByIdempotencyKey(idempotencyKey: string, user: SessionUser) {
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
      include: { senderWallet: { select: { userId: true } } },
    });
    if (!existing) return null;
    if (existing.senderWallet?.userId !== user.id) throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');

    const { senderWallet: _senderWallet, ...transaction } = existing;
    return transaction;
  }

  private logRemediation(incidentId: string, isSuccess: boolean, durationMs: number, details: Prisma.InputJsonObject) {
    return this.prisma.remediationLog.create({
      data: {
        incidentId,
        actionTaken: RemediationAction.TEST_PAYMENT_VERIFIED,
        executedBy: 'PAYMENT_SERVICE',
        isSuccess,
        durationMs,
        details,
      },
    });
  }
}
