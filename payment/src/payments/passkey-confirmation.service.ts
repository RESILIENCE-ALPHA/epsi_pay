import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PasskeyChallengePurpose, Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { createHash } from 'crypto';
import { SessionUser } from '../common/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PasskeyAssertionDto, PaymentDetailsDto } from './dto/create-payment.dto';
import { webauthnConfig } from './webauthn.config';

export type StrongAuthMethod = 'PASSKEY';

// Validation forte d'un paiement par passkey (empreinte digitale ou visage vérifié sur l'appareil).
// Exigée dès que l'utilisateur a enregistré une passkey : un jeton de session volé ne suffit plus pour payer.
// Le défi est lié au contenu exact du paiement : la signature ne peut pas servir pour un autre montant
// ou un autre destinataire. Vérifié ici, sans appel au service auth : payment reste autonome si auth tombe.
@Injectable()
export class PasskeyConfirmationService {
  constructor(private readonly prisma: PrismaService) {}

  async options(user: SessionUser, details: PaymentDetailsDto) {
    const passkeys = await this.prisma.passkey.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });
    if (passkeys.length === 0) return { required: false as const };

    const options = await generateAuthenticationOptions({
      rpID: webauthnConfig.rpID,
      allowCredentials: passkeys.map((passkey) => ({ id: passkey.credentialId, transports: passkey.transports })),
      userVerification: 'required',
    });

    const now = Date.now();
    void this.prisma.passkeyChallenge
      .deleteMany({ where: { expiresAt: { lt: new Date(now - 3_600_000) } } })
      .catch(() => undefined);
    const { id: challengeId } = await this.prisma.passkeyChallenge.create({
      data: {
        challenge: options.challenge,
        purpose: PasskeyChallengePurpose.PAYMENT,
        userId: user.id,
        paymentHash: paymentHash(user.id, details),
        expiresAt: new Date(now + webauthnConfig.challengeTtlMs),
      },
    });
    return { required: true as const, challengeId, options };
  }

  // null : aucune passkey enregistrée, la session suffit. Lève une erreur si la validation est requise et absente ou invalide.
  async verify(user: SessionUser, details: PaymentDetailsDto, assertion?: PasskeyAssertionDto): Promise<StrongAuthMethod | null> {
    if (!assertion) {
      const enrolled = await this.prisma.passkey.count({ where: { userId: user.id } });
      if (enrolled > 0) throw new ForbiddenException('PASSKEY_REQUIRED');
      return null;
    }

    const now = new Date();
    const challenge = await this.consumeChallenge(assertion.challengeId, user.id, paymentHash(user.id, details), now);

    const credentialId = (assertion.response as { id?: unknown }).id;
    const passkey =
      typeof credentialId === 'string'
        ? await this.prisma.passkey.findFirst({ where: { credentialId, userId: user.id } })
        : null;
    if (!passkey) throw new ForbiddenException('PASSKEY_VERIFICATION_FAILED');

    let newCounter: number;
    try {
      const verification = await verifyAuthenticationResponse({
        response: assertion.response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: webauthnConfig.origins,
        expectedRPID: webauthnConfig.rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: Uint8Array.from(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports,
        },
        requireUserVerification: true,
      });
      if (!verification.verified) throw new Error('not verified');
      newCounter = verification.authenticationInfo.newCounter;
    } catch {
      throw new ForbiddenException('PASSKEY_VERIFICATION_FAILED');
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(newCounter), lastUsedAt: now },
    });
    return 'PASSKEY';
  }

  // Défi consommé avant la vérification : une signature ne sert qu'une fois, même si le paiement échoue ensuite
  private async consumeChallenge(id: string, userId: string, expectedHash: string, now: Date): Promise<string> {
    const challenge = await this.prisma.passkeyChallenge.findUnique({ where: { id } });
    if (
      !challenge ||
      challenge.purpose !== PasskeyChallengePurpose.PAYMENT ||
      challenge.userId !== userId ||
      challenge.consumedAt ||
      challenge.expiresAt <= now
    ) {
      throw new BadRequestException('PASSKEY_CHALLENGE_INVALID');
    }
    // Paiement modifié depuis la demande de signature (montant, destinataire...)
    if (challenge.paymentHash !== expectedHash) throw new ForbiddenException('PASSKEY_PAYMENT_MISMATCH');

    const { count } = await this.prisma.passkeyChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (count !== 1) throw new BadRequestException('PASSKEY_CHALLENGE_INVALID');
    return challenge.challenge;
  }
}

// Empreinte du contenu du paiement : montant normalisé à 2 décimales ("10" et "10.00" sont le même paiement)
export function paymentHash(userId: string, details: PaymentDetailsDto): string {
  const canonical = JSON.stringify([
    userId,
    details.senderWalletId,
    details.receiverWalletId ?? null,
    details.recipientEmail ?? null,
    new Prisma.Decimal(details.amount).toFixed(2),
    details.description ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
