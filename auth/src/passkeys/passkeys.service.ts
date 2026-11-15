import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditSeverity, PasskeyChallengePurpose, Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AuthService, ClientContext } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { webauthnConfig } from './webauthn.config';

const MAX_PASSKEYS_PER_USER = 10;

// Seul le résultat de la vérification biométrique faite par l'appareil arrive ici (signature + drapeau
// « utilisateur vérifié ») : ni empreinte, ni image du visage ne quittent le téléphone ou l'ordinateur.
@Injectable()
export class PasskeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ---------- Enregistrement (utilisateur connecté) ----------

  async registrationOptions(userId: string, password: string, client: ClientContext) {
    const user = await this.authService.confirmPassword(userId, password, client);
    const existing = await this.prisma.passkey.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    if (existing.length >= MAX_PASSKEYS_PER_USER) throw new ConflictException('PASSKEY_LIMIT_REACHED');

    const options = await generateRegistrationOptions({
      rpName: webauthnConfig.rpName,
      rpID: webauthnConfig.rpID,
      userName: user.email,
      userDisplayName: user.name ?? user.email,
      // Identifiant stable : un même appareil remplace sa passkey au lieu d'en créer une seconde
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((passkey) => ({ id: passkey.credentialId, transports: passkey.transports })),
      authenticatorSelection: {
        // Passkey « découvrable » : la connexion se fait sans saisir d'e-mail
        residentKey: 'required',
        // Empreinte, visage ou code de l'appareil exigé à chaque usage
        userVerification: 'required',
      },
    });

    const challengeId = await this.saveChallenge(options.challenge, PasskeyChallengePurpose.REGISTRATION, userId);
    return { challengeId, options };
  }

  async register(userId: string, challengeId: string, response: unknown, name: string | undefined, client: ClientContext) {
    const challenge = await this.consumeChallenge(challengeId, PasskeyChallengePurpose.REGISTRATION, userId);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: webauthnConfig.origins,
        expectedRPID: webauthnConfig.rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new BadRequestException('PASSKEY_REGISTRATION_FAILED');
    }
    if (!verification.verified) throw new BadRequestException('PASSKEY_REGISTRATION_FAILED');

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    try {
      const passkey = await this.prisma.passkey.create({
        data: {
          userId,
          credentialId: credential.id,
          publicKey: Uint8Array.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name: name?.trim() || null,
        },
      });
      await this.audit(userId, 'PASSKEY_REGISTERED', AuditSeverity.INFO, client, { passkeyId: passkey.id, deviceType: credentialDeviceType });
      return { passkey: this.toView(passkey) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('PASSKEY_ALREADY_REGISTERED');
      }
      throw error;
    }
  }

  async list(userId: string) {
    const passkeys = await this.prisma.passkey.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return { passkeys: passkeys.map((passkey) => this.toView(passkey)) };
  }

  async revoke(userId: string, passkeyId: string, password: string, client: ClientContext) {
    await this.authService.confirmPassword(userId, password, client);
    const { count } = await this.prisma.passkey.deleteMany({ where: { id: passkeyId, userId } });
    if (count === 0) throw new NotFoundException('PASSKEY_NOT_FOUND');
    await this.audit(userId, 'PASSKEY_REVOKED', AuditSeverity.WARNING, client, { passkeyId });
  }

  // ---------- Connexion sans mot de passe ----------

  async loginOptions() {
    // Pas de liste de passkeys autorisées : le navigateur propose celles enregistrées pour ce site,
    // et on ne révèle pas si un e-mail a une passkey
    const options = await generateAuthenticationOptions({
      rpID: webauthnConfig.rpID,
      userVerification: 'required',
    });
    const challengeId = await this.saveChallenge(options.challenge, PasskeyChallengePurpose.LOGIN, null);
    return { challengeId, options };
  }

  async login(challengeId: string, response: unknown, client: ClientContext) {
    const now = new Date();
    const challenge = await this.consumeChallenge(challengeId, PasskeyChallengePurpose.LOGIN, null);
    const credentialId = (response as { id?: unknown }).id;
    if (typeof credentialId !== 'string') throw new UnauthorizedException('INVALID_PASSKEY');

    const passkey = await this.prisma.passkey.findUnique({ where: { credentialId }, include: { user: true } });
    if (!passkey) throw new UnauthorizedException('INVALID_PASSKEY');
    const { user } = passkey;

    if (await this.authService.isIpBlocked(client.ip, now)) {
      await this.authService.recordAttempt(user.email, user.id, client, 'IP_BLOCKED');
      throw new ForbiddenException('IP_BLOCKED');
    }
    if (this.authService.isLocked(user, now)) {
      await this.authService.recordAttempt(user.email, user.id, client, 'ACCOUNT_LOCKED');
      throw new HttpException('ACCOUNT_LOCKED', HttpStatus.LOCKED);
    }

    let newCounter: number;
    try {
      const verification = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
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
      await this.authService.recordAttempt(user.email, user.id, client, 'INVALID_PASSKEY');
      throw new UnauthorizedException('INVALID_PASSKEY');
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(newCounter), lastUsedAt: now },
    });
    return this.authService.openSession(user, client, now, 'PASSKEY');
  }

  // ---------- Défis à usage unique ----------

  private async saveChallenge(challenge: string, purpose: PasskeyChallengePurpose, userId: string | null) {
    const now = Date.now();
    // Ménage opportuniste des défis expirés depuis plus d'une heure
    void this.prisma.passkeyChallenge
      .deleteMany({ where: { expiresAt: { lt: new Date(now - 3_600_000) } } })
      .catch(() => undefined);

    const { id } = await this.prisma.passkeyChallenge.create({
      data: { challenge, purpose, userId, expiresAt: new Date(now + webauthnConfig.challengeTtlMs) },
    });
    return id;
  }

  // Marque le défi consommé avant toute vérification : une réponse ne peut servir qu'une fois, même ratée
  private async consumeChallenge(id: string, purpose: PasskeyChallengePurpose, userId: string | null): Promise<string> {
    const now = new Date();
    const challenge = await this.prisma.passkeyChallenge.findUnique({ where: { id } });
    const usable =
      challenge && challenge.purpose === purpose && challenge.userId === userId && !challenge.consumedAt && challenge.expiresAt > now;
    if (usable) {
      const { count } = await this.prisma.passkeyChallenge.updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (count === 1) return challenge.challenge;
    }
    throw new BadRequestException('PASSKEY_CHALLENGE_INVALID');
  }

  private audit(userId: string, action: string, severity: AuditSeverity, client: ClientContext, details: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { userId, action, severity, ipAddress: client.ip, details } });
  }

  private toView(passkey: {
    id: string;
    name: string | null;
    deviceType: string;
    backedUp: boolean;
    transports: string[];
    createdAt: Date;
    lastUsedAt: Date | null;
  }) {
    const { id, name, deviceType, backedUp, transports, createdAt, lastUsedAt } = passkey;
    return { id, name, deviceType, backedUp, transports, createdAt, lastUsedAt };
  }
}
