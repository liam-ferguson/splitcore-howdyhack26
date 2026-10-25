import React, { useMemo, useState } from 'react';
import { formatMoney } from '../domain/money.js';
import { buildRequest, checkPayment } from '../domain/requests.js';
import { matchMerchant } from '../domain/rewards.js';
import { CopyButton, Icon, QrCode, initials } from './ui.jsx';
import { PointsRescueCard } from './Rewards.jsx';

export default function Settle({ bill, alloc, dispatch, demo, announce, onBack, onNewBill, onOpenRewards, sample }) {
  const r = bill.receipt;
  const reward = useMemo(() => matchMerchant(r.merchant), [r.merchant]);

  if (!alloc.ready) {
    return (
      <section className="settle" aria-labelledby="settle-title">
        <h1 id="settle-title" className="screen-title">Your split needs attention</h1>
        <p className="notice notice-warning"><Icon name="alert" /> {alloc.blockers[0]?.message ?? 'Something changed.'} Payment requests are hidden until the bill checks out again.</p>
        <button type="button" className="btn btn-primary" onClick={onBack}><Icon name="back" /> Back to Claim</button>
      </section>
    );
  }
  const payer = alloc.payer;
  return (
    <section className="settle" aria-labelledby="settle-title">
      <div className="settle-hero">
        <p className="muted">{payer.name} paid {r.merchant ? `at ${r.merchant}` : 'the bill'}</p>
        <h1 id="settle-title" className="amount-hero">{formatMoney(alloc.reimbursementCents)} <span>to get back</span></h1>
        <p className="settle-sub">{payer.name}’s share {formatMoney(payer.totalCents)} · Paid {formatMoney(alloc.finalPaidCents)}</p>
        <p className="small muted">Requests are prepared for you to send. Nothing has been sent or paid.</p>
      </div>

      <div className="workspace">
        <div className="main-col">
          <PaymentSettings bill={bill} dispatch={dispatch} demo={demo} payerName={payer.name} />
          {alloc.others.length === 0 && <p className="notice notice-plain">Only {payer.name} is at the table, so nobody owes anything.</p>}
          {alloc.others.map(p => (
            <DinerCard key={p.id} person={p} payerName={payer.name} merchant={r.merchant} payment={bill.payment} demo={demo} announce={announce} />
          ))}
          <PayerCard person={payer} />
          {reward && r.merchantConfirmed && <PointsRescueCard entry={reward} onOpen={onOpenRewards} sample={sample} />}
          <div className="policy card">
            <h2 className="h3">How the split works</h2>
            <p>Each unit belongs to whoever claimed it; shared units split equally. Item discounts stay with that item. Bill discounts are shared in proportion to food.</p>
            <p>Tax, service and tip are shared in proportion to food after discounts. Penny ties use diner order.</p>
            {alloc.equalCharges && <p>Food after discounts was zero, so remaining charges were split equally, as you chose.</p>}
            <p className="small muted">This is a reimbursement convention. It doesn’t model item-specific tax exemptions or the restaurant’s own tax rules; printed totals are kept exactly.</p>
          </div>
        </div>
        <aside className="side-col">
          <div className="summary card">
            <h2 className="h3">Totals</h2>
            <ul className="summary-list">
              {alloc.people.map(p => <li key={p.id}><span>{p.name}{p.isPayer ? ' (paid)' : ''}</span><strong className="amount-sm">{formatMoney(p.totalCents)}</strong></li>)}
              <li className="summary-total"><span>Paid</span><strong className="amount-sm">{formatMoney(alloc.finalPaidCents)}</strong></li>
            </ul>
            <div className="summary-actions">
              <button type="button" className="btn btn-secondary btn-block" onClick={onBack}><Icon name="back" /> Edit claims</button>
              <button type="button" className="btn-text" onClick={onNewBill}>Start a new bill</button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PaymentSettings({ bill, dispatch, demo, payerName }) {
  const pay = bill.payment;
  const status = checkPayment(pay);
  const set = patch => dispatch({ type: 'SET_PAYMENT', payment: patch });
  const handleLabel = { paypal: 'PayPal.Me name or link', venmo: 'Venmo username', cashapp: 'Cash App $cashtag' }[pay.method];
  return (
    <section className="card payment" aria-labelledby="pay-title">
      <h2 id="pay-title" className="h3">Payment request</h2>
      <p className="small muted">Optional. How should people pay {payerName}? SplitCore prepares a link or message; it never processes payments.</p>
      {demo && <p className="notice notice-plain small">Demo mode: requests use sample QR codes and never open a payment app.</p>}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="f-pay-method">Method</label>
          <select id="f-pay-method" value={pay.method} onChange={e => set({ method: e.target.value })}>
            <option value="none">Just send the amount</option>
            <option value="paypal">PayPal.Me</option>
            <option value="venmo">Venmo</option>
            <option value="cashapp">Cash App</option>
          </select>
        </div>
        {pay.method !== 'none' && (
          <div className="field">
            <label htmlFor="f-pay-handle">{handleLabel}</label>
            <input id="f-pay-handle" value={pay.handle} maxLength={200} autoComplete="off" spellCheck={false}
              aria-invalid={!!pay.handle && !status.ok || undefined} aria-describedby="pay-handle-msg"
              onChange={e => set({ handle: e.target.value })} />
            <p id="pay-handle-msg" className={pay.handle && !status.ok ? 'field-error' : 'field-hint'}>
              {pay.handle && !status.ok ? status.error
                : status.ok && status.base ? `Requests will use ${status.base}${status.stripped ? ' (amount and extras from the pasted link removed)' : ''}. Name checked for format only.`
                : status.ok && status.handle ? `People will be asked to pay ${status.handle}. Checked for format only.`
                : 'Checked for format only; SplitCore can’t confirm who owns it.'}
            </p>
          </div>
        )}
        {(pay.method === 'venmo' || pay.method === 'cashapp') && (
          <div className="field">
            <label htmlFor="f-pay-url">Your profile link (optional, copied from the app)</label>
            <input id="f-pay-url" value={pay.profileUrl} maxLength={300} autoComplete="off" spellCheck={false} inputMode="url"
              aria-invalid={!!status.urlError || undefined} aria-describedby="pay-url-msg"
              onChange={e => set({ profileUrl: e.target.value })} />
            <p id="pay-url-msg" className={status.urlError ? 'field-error' : 'field-hint'}>
              {status.urlError ?? (status.url ? `Opens ${status.url} unchanged. People enter the amount in the app.` : 'SplitCore never adds an amount to these links.')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Breakdown({ person }) {
  const rows = [
    ...person.lines.map(l => [l.label, l.grossCents]),
    ['Item discount', -person.itemDiscountCents],
    ['Bill discount (by food)', -person.billDiscountCents],
    ['Food after discounts', person.netFoodCents, 'sub'],
    ['Tax', person.taxCents], ['Included service', person.serviceCents],
    ['Included tip', person.includedTipCents], ['Extra tip', person.extraTipCents],
  ];
  return (
    <table className="breakdown">
      <caption className="sr-only">Breakdown for {person.name}</caption>
      <tbody>
        {rows.map(([label, cents, kind], i) => (
          <tr key={i} className={kind === 'sub' ? 'row-sub' : cents === 0 ? 'row-zero' : ''}>
            <th scope="row">{label}</th><td className="amount-sm">{formatMoney(cents)}</td>
          </tr>
        ))}
        <tr className="row-total"><th scope="row">Total</th><td className="amount-sm">{formatMoney(person.totalCents)}</td></tr>
      </tbody>
    </table>
  );
}

function DinerCard({ person, payerName, merchant, payment, demo, announce }) {
  const req = buildRequest({ person, payerName, merchant, payment, demo });
  const [showMsg, setShowMsg] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = () => {
    // Called directly in the click handler so the user gesture is preserved.
    navigator.share({ text: req.message }).then(
      () => announce('Share sheet closed.'),
      e => announce(e?.name === 'AbortError' ? 'Sharing cancelled.' : 'Sharing is unavailable. Use Copy instead.'));
  };
  return (
    <article className="person card" aria-labelledby={`p-${person.id}`}>
      <div className="person-head">
        <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
        <h2 id={`p-${person.id}`} className="h3">{person.name}</h2>
        <strong className="amount-md">{formatMoney(person.totalCents)}</strong>
      </div>
      <p className="small muted">{person.totalCents > 0 ? `Owes ${payerName}` : 'Nothing owed'}</p>
      <details className="disclosure">
        <summary>Show the math</summary>
        <Breakdown person={person} />
      </details>
      {person.totalCents > 0 && (
        <>
          <div className="row-wrap actions">
            <CopyButton text={req.message} label="Copy reminder" announce={announce} className="btn btn-primary" />
            {canShare && <button type="button" className="btn btn-secondary" onClick={share}><Icon name="share" /> Share</button>}
            <button type="button" className="btn-text" aria-expanded={showMsg} onClick={() => setShowMsg(s => !s)}>{showMsg ? 'Hide message' : 'Preview message'}</button>
          </div>
          {showMsg && <pre className="message-preview" aria-label={`Friendly reminder for ${person.name}`}>{req.message}</pre>}
          {req.copyHandle && (
            <div className="row-wrap handle-row">
              <span className="small">Pay to <strong>{req.copyHandle}</strong> · {req.amount}</span>
              <CopyButton text={`${req.copyHandle} ${req.amount}`} label="Copy handle and amount" announce={announce} className="btn-text btn-small" />
            </div>
          )}
          {req.link && (
            <p className="link-row">
              <a className="btn btn-secondary" href={req.link.href} target="_blank" rel="noopener noreferrer">{req.link.label}</a>
              <span className="small muted break">{req.link.href}{req.link.kind === 'recipient' ? ` — enter ${req.amount} in ${req.link.provider}.` : ' — opens PayPal; nothing is paid until they confirm there.'}</span>
            </p>
          )}
          {req.formatExample && (
            <p className="small muted break">Format example — recipient not validated: <code>{req.formatExample}</code></p>
          )}
          {req.qrPayload && (
            <details className="disclosure qr-disclosure" open={demo || undefined}>
              <summary>{demo ? 'Demo QR' : 'QR code'}</summary>
              <QrCode payload={req.qrPayload} label={req.qrLabel} />
              <p className="small break payload"><span className="muted">Contains:</span> <code>{req.qrPayload}</code></p>
              {demo && <CopyButton text={req.qrPayload} label="Copy QR text" announce={announce} className="btn-text btn-small" />}
            </details>
          )}
          {req.paymentError && payment.method !== 'none' && <p className="small muted">Payment link not added: {req.paymentError}</p>}
        </>
      )}
    </article>
  );
}

function PayerCard({ person }) {
  return (
    <article className="person card payer-card" aria-labelledby={`p-${person.id}`}>
      <div className="person-head">
        <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
        <h2 id={`p-${person.id}`} className="h3">{person.name} <span className="tag tag-accent">Paid</span></h2>
        <strong className="amount-md">{formatMoney(person.totalCents)}</strong>
      </div>
      <p className="small muted">{person.name}’s own share — no request needed.</p>
      <details className="disclosure">
        <summary>Show the math</summary>
        <Breakdown person={person} />
      </details>
    </article>
  );
}
