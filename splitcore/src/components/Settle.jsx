import React, { useEffect, useState } from 'react';
import { formatMoney } from '../domain/money.js';
import { buildRequest, checkPayment } from '../domain/requests.js';
import { AnimatedMoney, Avatar, Burst, CopyButton, Dialog, Donut, Icon, QrCode, personColor } from './ui.jsx';
import { RewardsSpotlight } from './Rewards.jsx';

const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Settle({ bill, alloc, dispatch, demo, announce, onBack, onNewBill, rewards, onRewardsDetails, onRewardsPick, sample }) {
  const r = bill.receipt;
  const [qrFor, setQrFor] = useState(/** @type {string|null} */ (null));
  const [burst, setBurst] = useState(0);
  useEffect(() => { if (alloc.ready && !prefersReduced()) setBurst(1); }, []);

  if (!alloc.ready) {
    return (
      <section className="settle" aria-labelledby="settle-title">
        <div className="card attention">
          <h1 id="settle-title" className="screen-title">Your split needs attention</h1>
          <p className="notice notice-warning"><Icon name="alert" /> {alloc.blockers[0]?.message ?? 'Something changed.'} Payment requests are hidden until the bill checks out again.</p>
          <button type="button" className="btn btn-primary" onClick={onBack}><Icon name="back" /> Back to Claim</button>
        </div>
      </section>
    );
  }
  const payer = alloc.payer;
  const segments = alloc.people.map(p => ({ id: p.id, cents: p.totalCents, color: personColor(p.order) }));
  const qrPerson = alloc.others.find(p => p.id === qrFor) ?? null;
  const qrReq = qrPerson ? buildRequest({ person: qrPerson, payerName: payer.name, merchant: r.merchant, payment: bill.payment, demo }) : null;

  return (
    <section className="settle" aria-labelledby="settle-title">
      <div className="settle-hero reveal">
        <div className="settle-hero-copy">
          <p className="eyebrow"><Avatar name={payer.name} order={payer.order} size={24} payer /> {payer.name} paid{r.merchant ? ` at ${r.merchant}` : ''}</p>
          <h1 id="settle-title" className="hero-amount">
            <span className="burst-anchor"><AnimatedMoney cents={alloc.reimbursementCents} duration={1100} className="grad-text" /><Burst fire={burst} /></span>
            <span className="hero-amount-label">to get back</span>
          </h1>
          <p className="settle-sub">{payer.name}’s share {formatMoney(payer.totalCents)} · Paid {formatMoney(alloc.finalPaidCents)}</p>
          <p className="small muted"><Icon name="shield" size={14} /> Requests are prepared for you to send. Nothing has been sent or paid.</p>
        </div>
        <div className="settle-chart">
          <Donut segments={segments} size={180} stroke={20} label={`Shares: ${alloc.people.map(p => `${p.name} ${formatMoney(p.totalCents)}`).join(', ')}`}>
            <span className="muted small">Total</span>
            <strong>{formatMoney(alloc.finalPaidCents)}</strong>
          </Donut>
          <ul className="legend-list">
            {alloc.people.map(p => (
              <li key={p.id}><span className="dot" style={{ background: personColor(p.order) }} aria-hidden="true" />{p.name}{p.isPayer ? ' (paid)' : ''}<strong>{formatMoney(p.totalCents)}</strong></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="workspace">
        <div className="main-col">
          <PaymentSettings bill={bill} dispatch={dispatch} demo={demo} payerName={payer.name} />
          {alloc.others.length === 0 && <p className="notice notice-plain">Only {payer.name} is at the table, so nobody owes anything.</p>}
          <div className="request-grid">
            {alloc.others.map((p, i) => (
              <DinerCard key={p.id} index={i} person={p} payerName={payer.name} merchant={r.merchant} payment={bill.payment} demo={demo} announce={announce} onQr={() => setQrFor(p.id)} />
            ))}
          </div>
          <PayerCard person={payer} />
          <RewardsSpotlight result={rewards} merchant={r.merchant} sample={sample} onDetails={onRewardsDetails} onPick={onRewardsPick} />
          <details className="card policy">
            <summary><Icon name="info" size={18} /> How the split works</summary>
            <p>Each unit belongs to whoever claimed it; shared units split equally. Item discounts stay with that item. Bill discounts are shared in proportion to food.</p>
            <p>Tax, service and tip are shared in proportion to food after discounts. Penny ties use diner order.</p>
            {alloc.equalCharges && <p>Food after discounts was zero, so remaining charges were split equally, as you chose.</p>}
            <p className="small muted">This is a reimbursement convention. It doesn’t model item-specific tax exemptions or the restaurant’s own tax rules; printed totals are kept exactly.</p>
          </details>
        </div>
        <aside className="side-col" aria-label="Totals">
          <div className="summary card">
            <h2 className="h3">Totals</h2>
            <ul className="summary-list">
              {alloc.people.map(p => <li key={p.id}><span className="dot" style={{ background: personColor(p.order) }} aria-hidden="true" /><span className="summary-name">{p.name}{p.isPayer ? ' (paid)' : ''}</span><strong className="amount-sm">{formatMoney(p.totalCents)}</strong></li>)}
              <li className="summary-total"><span className="dot dot-empty" aria-hidden="true" /><span className="summary-name">Paid</span><strong className="amount-sm">{formatMoney(alloc.finalPaidCents)}</strong></li>
            </ul>
            <div className="summary-actions">
              <button type="button" className="btn btn-secondary btn-block" onClick={onBack}><Icon name="back" /> Edit claims</button>
              <button type="button" className="btn-text" onClick={onNewBill}><Icon name="plus" size={18} /> Start a new bill</button>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={!!qrPerson} onClose={() => setQrFor(null)} title={qrPerson ? `${qrPerson.name} · ${formatMoney(qrPerson.totalCents)}` : 'QR code'} icon="qr">
        {qrReq?.qrPayload && (
          <div className="qr-panel">
            <QrCode payload={qrReq.qrPayload} label={qrReq.qrLabel} />
            <p className="small break payload"><span className="muted">Contains:</span> <code>{qrReq.qrPayload}</code></p>
            <CopyButton text={qrReq.qrPayload} label={demo ? 'Copy QR text' : 'Copy link'} announce={announce} />
          </div>
        )}
      </Dialog>
    </section>
  );
}

const METHODS = [['none', 'Just the amount', 'text'], ['paypal', 'PayPal.Me', 'wallet'], ['venmo', 'Venmo', 'wallet'], ['cashapp', 'Cash App', 'wallet']];

function PaymentSettings({ bill, dispatch, demo, payerName }) {
  const pay = bill.payment;
  const status = checkPayment(pay);
  const set = patch => dispatch({ type: 'SET_PAYMENT', payment: patch });
  const handleLabel = { paypal: 'PayPal.Me name or link', venmo: 'Venmo username', cashapp: 'Cash App $cashtag' }[pay.method];
  return (
    <section className="card payment reveal" style={{ '--i': 1 }} aria-labelledby="pay-title">
      <div className="section-head">
        <h2 id="pay-title">Payment request</h2>
        <span className="muted small">Optional</span>
      </div>
      <p className="small muted">How should people pay {payerName}? SplitCore prepares the link or message; it never processes payments.</p>
      {demo && <p className="notice notice-plain small"><Icon name="info" size={16} /> Demo mode: requests use sample QR codes and never open a payment app.</p>}
      <fieldset className="segmented">
        <legend className="sr-only">Payment method</legend>
        {METHODS.map(([id, label]) => (
          <label key={id} className={`seg ${pay.method === id ? 'is-on' : ''}`}>
            <input type="radio" name="pay-method" value={id} checked={pay.method === id} onChange={() => set({ method: id })} />
            {label}
          </label>
        ))}
      </fieldset>
      {pay.method !== 'none' && (
        <div className="field-grid">
          <div className="field">
            <label htmlFor="f-pay-handle">{handleLabel}</label>
            <input id="f-pay-handle" value={pay.handle} maxLength={200} autoComplete="off" spellCheck={false}
              aria-invalid={!!pay.handle && !status.ok || undefined} aria-describedby="pay-handle-msg"
              onChange={e => set({ handle: e.target.value })} />
            <p id="pay-handle-msg" className={pay.handle && !status.ok ? 'field-error' : 'field-hint'}>
              {pay.handle && !status.ok ? status.error
                : status.ok && status.base ? `Requests will use ${status.base}${status.stripped ? ' (amount and extras from the pasted link removed)' : ''}. Checked for format only.`
                : status.ok && status.handle ? `People will be asked to pay ${status.handle}. Checked for format only.`
                : 'Checked for format only; SplitCore can’t confirm who owns it.'}
            </p>
          </div>
          {(pay.method === 'venmo' || pay.method === 'cashapp') && (
            <div className="field">
              <label htmlFor="f-pay-url">Your profile link (optional)</label>
              <input id="f-pay-url" value={pay.profileUrl} maxLength={300} autoComplete="off" spellCheck={false} inputMode="url"
                aria-invalid={!!status.urlError || undefined} aria-describedby="pay-url-msg"
                onChange={e => set({ profileUrl: e.target.value })} />
              <p id="pay-url-msg" className={status.urlError ? 'field-error' : 'field-hint'}>
                {status.urlError ?? (status.url ? `Opens ${status.url} unchanged. People enter the amount in the app.` : 'Copied from the app. SplitCore never adds an amount to these links.')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Breakdown({ person }) {
  const rows = [
    ...person.lines.map(l => [l.label, l.grossCents]),
    ['Item discount', -person.itemDiscountCents],
    ['Bill discount (by food)', -person.billDiscountCents],
    ['Food after discounts', person.netFoodCents, 'sub'],
    ['Tax', person.taxCents], ['Service & fees', person.serviceCents],
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

function DinerCard({ person, index, payerName, merchant, payment, demo, announce, onQr }) {
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
    <article className="person card reveal" style={{ '--pc': personColor(person.order), '--i': index + 2 }} aria-labelledby={`p-${person.id}`}>
      <div className="person-head">
        <Avatar name={person.name} order={person.order} size={44} />
        <div className="person-who">
          <h2 id={`p-${person.id}`} className="h3">{person.name}</h2>
          <p className="small muted">{person.totalCents > 0 ? `Owes ${payerName}` : 'Nothing owed'}</p>
        </div>
        <AnimatedMoney cents={person.totalCents} className="amount-lg" />
      </div>
      <ul className="mini-lines">
        {person.lines.slice(0, 4).map(l => <li key={l.key}><span>{l.label}</span><span>{formatMoney(l.grossCents)}</span></li>)}
        {person.lines.length > 4 && <li className="muted"><span>+{person.lines.length - 4} more</span><span /></li>}
      </ul>
      {person.totalCents > 0 && (
        <>
          <div className="row-wrap actions">
            <CopyButton text={req.message} label="Copy reminder" announce={announce} className="btn btn-primary btn-small" />
            {canShare && <button type="button" className="btn btn-secondary btn-small" onClick={share}><Icon name="share" size={16} /> Share</button>}
            {req.qrPayload && <button type="button" className="btn btn-secondary btn-small" onClick={onQr}><Icon name="qr" size={16} /> {demo ? 'Demo QR' : 'QR code'}</button>}
          </div>
          {req.copyHandle && (
            <div className="row-wrap handle-row">
              <span className="small">Pay to <strong>{req.copyHandle}</strong> · {req.amount}</span>
              <CopyButton text={`${req.copyHandle} ${req.amount}`} label="Copy handle and amount" announce={announce} className="btn-text btn-small" />
            </div>
          )}
          {req.link && (
            <p className="link-row">
              <a className="btn btn-secondary btn-small" href={req.link.href} target="_blank" rel="noopener noreferrer">{req.link.label} <Icon name="external" size={15} /></a>
              <span className="small muted break">{req.link.href}{req.link.kind === 'recipient' ? ` — enter ${req.amount} in ${req.link.provider}.` : ' — opens PayPal; nothing is paid until they confirm there.'}</span>
            </p>
          )}
          {req.formatExample && <p className="small muted break">Format example — recipient not validated: <code>{req.formatExample}</code></p>}
          {req.paymentError && payment.method !== 'none' && <p className="small muted">Payment link not added: {req.paymentError}</p>}
          <div className="row-wrap disclosure-row">
            <details className="disclosure">
              <summary>Show the math</summary>
              <Breakdown person={person} />
            </details>
            <button type="button" className="btn-text btn-small" aria-expanded={showMsg} onClick={() => setShowMsg(s => !s)}>{showMsg ? 'Hide message' : 'Preview message'}</button>
          </div>
          {showMsg && <pre className="message-preview" aria-label={`Friendly reminder for ${person.name}`}>{req.message}</pre>}
        </>
      )}
    </article>
  );
}

function PayerCard({ person }) {
  return (
    <article className="person card payer-card" style={{ '--pc': personColor(person.order) }} aria-labelledby={`p-${person.id}`}>
      <div className="person-head">
        <Avatar name={person.name} order={person.order} size={44} payer />
        <div className="person-who">
          <h2 id={`p-${person.id}`} className="h3">{person.name} <span className="tag tag-accent">Paid</span></h2>
          <p className="small muted">{person.name}’s own share — no request needed.</p>
        </div>
        <strong className="amount-lg">{formatMoney(person.totalCents)}</strong>
      </div>
      <details className="disclosure">
        <summary>Show the math</summary>
        <Breakdown person={person} />
      </details>
    </article>
  );
}
