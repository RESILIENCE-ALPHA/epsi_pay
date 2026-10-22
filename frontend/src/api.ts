// Client HTTP des services auth et payment, relayés par nginx (prod) ou webpack-dev-server (dev)
const AUTH_API = '/api/auth';
const PAYMENT_API = '/api/payment';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'CLIENT' | 'MERCHANT' | 'ADMIN';
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: User;
}

export interface Wallet {
  id: string;
  currency: string;
  balance: string; // DECIMAL(12,2) sérialisé en chaîne par Prisma
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  createdAt: string;
}

export interface Transaction {
  id: string;
  reference: string;
  type: 'PAYMENT' | 'TRANSFER' | 'REFUND' | 'VALIDATION_TEST';
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'BLOCKED';
  amount: string;
  currency: string;
  description: string | null;
  senderWalletId: string | null;
  receiverWalletId: string;
  createdAt: string;
}

export type WalletDetail = Wallet & { transactions: Transaction[] };

export interface PaymentInput {
  senderWalletId: string;
  receiverWalletId: string;
  amount: number;
  description?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

async function request<T>(url: string, { method = 'GET', body, token, headers = {} }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Erreurs NestJS : { statusCode, message: string | string[], error }
    const message = data?.message;
    if (Array.isArray(message)) throw new ApiError(response.status, 'VALIDATION_FAILED', message.map(String));
    throw new ApiError(response.status, typeof message === 'string' ? message : `HTTP_${response.status}`);
  }
  return data as T;
}

export const api = {
  signup: (email: string, password: string, name?: string) =>
    request<User>(`${AUTH_API}/signup`, { method: 'POST', body: { email, password, ...(name && { name }) } }),
  login: (email: string, password: string) =>
    request<LoginResponse>(`${AUTH_API}/login`, { method: 'POST', body: { email, password } }),
  logout: (token: string) => request<void>(`${AUTH_API}/logout`, { method: 'POST', token }),
  me: (token: string) => request<{ user: User; sessionExpiresAt: string }>(`${AUTH_API}/me`, { token }),

  wallets: (token: string) => request<Wallet[]>(`${PAYMENT_API}/wallets`, { token }),
  wallet: (token: string, id: string) => request<WalletDetail>(`${PAYMENT_API}/wallets/${id}`, { token }),
  pay: (token: string, payment: PaymentInput, idempotencyKey: string) =>
    request<Transaction>(`${PAYMENT_API}/payments`, {
      method: 'POST',
      token,
      body: payment,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};

const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'The service is unreachable. Please try again in a moment.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  ACCOUNT_LOCKED: 'This account is temporarily locked after too many failed attempts.',
  IP_BLOCKED: 'Access from your network has been blocked.',
  EMAIL_ALREADY_USED: 'An account already exists with this email.',
  INVALID_SESSION: 'Your session has expired. Please sign in again.',
  MISSING_TOKEN: 'Please sign in first.',
  SAME_WALLET: 'The sender and receiver wallets must be different.',
  SENDER_WALLET_NOT_FOUND: 'Your wallet could not be found.',
  RECEIVER_WALLET_NOT_FOUND: 'No wallet exists with this ID.',
  WALLET_NOT_ACTIVE: 'One of the wallets is frozen or closed.',
  CURRENCY_MISMATCH: 'Both wallets must use the same currency.',
  INSUFFICIENT_FUNDS: 'Insufficient balance for this payment.',
  CONCURRENT_UPDATE_RETRY: 'Your wallet was updated at the same time. Please submit again.',
  IDEMPOTENCY_KEY_CONFLICT: 'This payment request conflicts with another one. Please submit again.',
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Unexpected error.';
  if (error.code === 'VALIDATION_FAILED') return error.details.join(' · ');
  if (ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code];
  if (error.status === 429) return 'Too many requests. Please slow down.';
  if (error.status >= 500) return 'The service encountered an error. Please try again later.';
  return error.code;
}

// crypto.randomUUID n'existe qu'en contexte sécurisé (HTTPS) ; getRandomValues fonctionne aussi en HTTP
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatAmount(amount: string | number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
}
