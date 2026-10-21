import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

// Réservé aux appels internes (moteur de remédiation) : header X-Internal-Token = INTERNAL_API_TOKEN.
// Si INTERNAL_API_TOKEN n'est pas défini, les routes protégées sont désactivées.
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_TOKEN;
    const provided = context.switchToHttp().getRequest<Request>().header('x-internal-token');
    if (!expected || !provided || !timingSafeEqual(sha256(provided), sha256(expected))) {
      throw new ForbiddenException('INVALID_INTERNAL_TOKEN');
    }
    return true;
  }
}
