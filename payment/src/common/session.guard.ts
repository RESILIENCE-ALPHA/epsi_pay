import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

type AuthenticatedRequest = Request & { user?: SessionUser };

// Valide le jeton Bearer émis par le service auth contre la table partagée `sessions`
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('MISSING_TOKEN');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      include: { user: { select: { id: true, email: true, role: true, status: true } } },
    });
    if (!session || !session.isValid || session.expiresAt <= new Date() || session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('INVALID_SESSION');
    }

    const { id, email, role } = session.user;
    request.user = { id, email, role, sessionId: session.id };
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
