import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditSeverity, Prisma, User, UserRole, UserStatus, WalletStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { generateToken, hashToken } from './token.util';

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS ?? 5);
const LOCK_DURATION_MS = Number(process.env.LOCK_DURATION_MINUTES ?? 15) * 60_000;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MINUTES ?? 60) * 60_000;

// Comparé quand l'email est inconnu, pour que le temps de réponse ne révèle pas l'existence du compte
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

type FailureReason = 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'IP_BLOCKED';

export interface ClientContext {
  ip: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(email: string, password: string, name: string | undefined, client: ClientContext) {
    email = email.toLowerCase();
    if (await this.isIpBlocked(client.ip, new Date())) throw new ForbiddenException('IP_BLOCKED');

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          name,
          passwordHash: await bcrypt.hash(password, 10),
          role: UserRole.CLIENT,
          status: UserStatus.ACTIVE,
          // Wallet vide créé d'office pour pouvoir utiliser le service payment
          wallets: { create: { currency: 'EUR', status: WalletStatus.ACTIVE } },
          auditLogs: { create: { action: 'USER_SIGNUP', severity: AuditSeverity.INFO, ipAddress: client.ip } },
        },
        include: { wallets: { select: { id: true, currency: true, balance: true } } },
      });
      return { id: user.id, email: user.email, name: user.name, role: user.role, wallets: user.wallets };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('EMAIL_ALREADY_USED');
      }
      throw error;
    }
  }

  async login(email: string, password: string, client: ClientContext) {
    const now = new Date();
    email = email.toLowerCase();

    if (await this.isIpBlocked(client.ip, now)) {
      await this.recordAttempt(email, null, client, 'IP_BLOCKED');
      throw new ForbiddenException('IP_BLOCKED');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await this.recordAttempt(email, null, client, 'INVALID_CREDENTIALS');
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (this.isLocked(user, now)) {
      await this.recordAttempt(email, user.id, client, 'ACCOUNT_LOCKED');
      throw new HttpException('ACCOUNT_LOCKED', HttpStatus.LOCKED);
    }

    const valid = await bcrypt.compare(password, user.passwordHash).catch(() => false);
    if (!valid) {
      await this.registerFailure(user, client, now);
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    const token = generateToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const [, session] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, status: UserStatus.ACTIVE, lockedUntil: null },
      }),
      this.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          ipAddress: client.ip,
          userAgent: client.userAgent,
          expiresAt,
        },
      }),
      this.prisma.loginAttempt.create({
        data: {
          attemptedEmail: email,
          targetUserId: user.id,
          ipAddress: client.ip,
          userAgent: client.userAgent,
          isAuthenticated: true,
        },
      }),
      this.prisma.auditLog.create({
        data: { userId: user.id, action: 'USER_LOGIN_SUCCESS', severity: AuditSeverity.INFO, ipAddress: client.ip },
      }),
    ]);

    return {
      accessToken: token,
      tokenType: 'Bearer',
      sessionId: session.id,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async logout(token: string) {
    const { count } = await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), isValid: true },
      data: { isValid: false },
    });
    if (count === 0) throw new UnauthorizedException('INVALID_SESSION');
  }

  async me(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
    });
    if (!session || !session.isValid || session.expiresAt <= new Date() || session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('INVALID_SESSION');
    }
    return { user: session.user, sessionId: session.id, sessionExpiresAt: session.expiresAt };
  }

  private async isIpBlocked(ip: string, now: Date): Promise<boolean> {
    const blocked = await this.prisma.blockedIp.findFirst({
      where: { ipAddress: ip, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
    return blocked !== null;
  }

  private isLocked(user: User, now: Date): boolean {
    if (user.status === UserStatus.SUSPENDED) return true;
    if (user.status !== UserStatus.LOCKED) return false;
    // LOCKED sans date de fin = verrouillage manuel ; sinon déverrouillage automatique à l'échéance
    return !user.lockedUntil || user.lockedUntil > now;
  }

  private async registerFailure(user: User, client: ClientContext, now: Date) {
    const { failedLoginAttempts } = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: { status: UserStatus.LOCKED, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) },
        }),
        this.prisma.session.updateMany({ where: { userId: user.id, isValid: true }, data: { isValid: false } }),
        this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_FAILURE_THRESHOLD_EXCEEDED',
            severity: AuditSeverity.WARNING,
            ipAddress: client.ip,
            details: { failedLoginAttempts },
          },
        }),
      ]);
    }

    await this.recordAttempt(user.email, user.id, client, 'INVALID_CREDENTIALS');
  }

  private recordAttempt(email: string, userId: string | null, client: ClientContext, failureReason: FailureReason) {
    return this.prisma.loginAttempt.create({
      data: {
        attemptedEmail: email,
        targetUserId: userId,
        ipAddress: client.ip,
        userAgent: client.userAgent,
        isAuthenticated: false,
        failureReason,
      },
    });
  }
}
