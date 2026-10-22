import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, errorMessage, formatAmount, newIdempotencyKey, type Transaction, type Wallet, type WalletDetail } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT_PATTERN = /^\d{1,10}([.,]\d{1,2})?$/;

export function PaymentPage() {
  const { token, expire } = useAuth();
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [selected, setSelected] = useState<WalletDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [senderWalletId, setSenderWalletId] = useState('');
  const [receiverWalletId, setReceiverWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  // Même clé tant que le formulaire n'a pas changé : un double clic ou un renvoi après coupure ne débite qu'une fois
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [lastPayment, setLastPayment] = useState<Transaction | null>(null);

  const handleError = useCallback(
    (err: unknown, setMessage: (message: string) => void) => {
      if (err instanceof ApiError && err.status === 401) expire();
      else setMessage(errorMessage(err));
    },
    [expire],
  );

  const loadWallets = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.wallets(token);
      setWallets(list);
      setSenderWalletId((current) => current || list.find((w) => w.status === 'ACTIVE')?.id || '');
    } catch (err) {
      handleError(err, setLoadError);
    }
  }, [token, handleError]);

  const loadHistory = useCallback(
    async (walletId: string) => {
      if (!token || !walletId) return;
      try {
        setSelected(await api.wallet(token, walletId));
      } catch (err) {
        handleError(err, setLoadError);
      }
    },
    [token, handleError],
  );

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    loadHistory(senderWalletId);
  }, [senderWalletId, loadHistory]);

  function editForm<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setIdempotencyKey(newIdempotencyKey());
      setPayError(null);
    };
  }

  const sender = wallets?.find((w) => w.id === senderWalletId);
  const amountValue = Number(amount.replace(',', '.'));
  const amountError =
    amount === '' ? null
    : !AMOUNT_PATTERN.test(amount) || amountValue <= 0 ? 'Enter a positive amount with at most 2 decimals.'
    : sender && amountValue > Number(sender.balance) ? 'Amount exceeds your balance.'
    : null;
  const receiverError =
    receiverWalletId === '' ? null
    : !UUID_PATTERN.test(receiverWalletId.trim()) ? 'A wallet ID looks like 3f2b8c1e-….'
    : receiverWalletId.trim() === senderWalletId ? 'You cannot pay your own wallet.'
    : null;
  const canSubmit = !!sender && sender.status === 'ACTIVE' && amount !== '' && receiverWalletId !== '' && !amountError && !receiverError;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !canSubmit) return;
    setPayError(null);
    setLastPayment(null);
    setSubmitting(true);
    try {
      const transaction = await api.pay(
        token,
        {
          senderWalletId,
          receiverWalletId: receiverWalletId.trim(),
          amount: amountValue,
          ...(description.trim() && { description: description.trim() }),
        },
        idempotencyKey,
      );
      setLastPayment(transaction);
      setReceiverWalletId('');
      setAmount('');
      setDescription('');
      setIdempotencyKey(newIdempotencyKey());
      await Promise.all([loadWallets(), loadHistory(senderWalletId)]);
    } catch (err) {
      handleError(err, setPayError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError && !wallets) return <Alert kind="error">{loadError}</Alert>;
  if (!wallets) return <p className="loading">Loading your wallets…</p>;

  return (
    <div className="dashboard">
      <section className="card">
        <h2>Your wallets</h2>
        {wallets.length === 0 && <p className="muted">You have no wallet yet.</p>}
        <ul className="wallets">
          {wallets.map((wallet) => (
            <li key={wallet.id}>
              <button
                type="button"
                className={`wallet ${wallet.id === senderWalletId ? 'wallet-selected' : ''}`}
                onClick={() => editForm(setSenderWalletId)(wallet.id)}
              >
                <span className="wallet-balance">{formatAmount(wallet.balance, wallet.currency)}</span>
                <span className={`badge badge-${wallet.status.toLowerCase()}`}>{wallet.status}</span>
              </button>
              <WalletId id={wallet.id} />
            </li>
          ))}
        </ul>
        <p className="muted small">Share a wallet ID to receive payments.</p>
      </section>

      <section className="card">
        <h2>Make a payment</h2>
        {lastPayment && (
          <Alert kind="success">
            Payment of {formatAmount(lastPayment.amount, lastPayment.currency)} sent — reference <code>{lastPayment.reference}</code>
          </Alert>
        )}
        {payError && <Alert kind="error">{payError}</Alert>}
        <form onSubmit={handleSubmit} className="form">
          <label>
            From
            <select value={senderWalletId} onChange={(e) => editForm(setSenderWalletId)(e.target.value)} required>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id} disabled={wallet.status !== 'ACTIVE'}>
                  {wallet.currency} · {formatAmount(wallet.balance, wallet.currency)} · {wallet.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Receiver wallet ID
            <input
              required
              spellCheck={false}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={receiverWalletId}
              onChange={(e) => editForm(setReceiverWalletId)(e.target.value)}
              aria-invalid={!!receiverError}
            />
          </label>
          {receiverError && <p className="field-error">{receiverError}</p>}
          <label>
            Amount {sender && <span className="muted">({sender.currency})</span>}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => editForm(setAmount)(e.target.value)}
              aria-invalid={!!amountError}
            />
          </label>
          {amountError && <p className="field-error">{amountError}</p>}
          <label>
            Description <span className="muted">(optional)</span>
            <input maxLength={255} value={description} onChange={(e) => editForm(setDescription)(e.target.value)} />
          </label>
          <button type="submit" disabled={submitting || !canSubmit}>{submitting ? 'Sending…' : 'Pay'}</button>
        </form>
      </section>

      <section className="card card-wide">
        <h2>Recent transactions</h2>
        {loadError && <Alert kind="error">{loadError}</Alert>}
        {selected && selected.transactions.length === 0 && <p className="muted">No transactions on this wallet yet.</p>}
        {selected && selected.transactions.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {selected.transactions.map((tx) => {
                  const outgoing = tx.senderWalletId === selected.id;
                  return (
                    <tr key={tx.id}>
                      <td>{new Date(tx.createdAt).toLocaleString()}</td>
                      <td><code>{tx.reference}</code></td>
                      <td>{tx.description ?? '—'}</td>
                      <td><span className={`badge badge-${tx.status.toLowerCase()}`}>{tx.status}</span></td>
                      <td className={`num ${outgoing ? 'amount-out' : 'amount-in'}`}>
                        {outgoing ? '−' : '+'}{formatAmount(tx.amount, tx.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function WalletId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  // L'API Clipboard n'est disponible qu'en HTTPS ou sur localhost
  const canCopy = typeof navigator.clipboard?.writeText === 'function';

  async function copy() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="wallet-id">
      <code>{id}</code>
      {canCopy && <button type="button" className="button-ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>}
    </div>
  );
}
