import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../domain/money.js';
import { FIELD_LABELS } from '../domain/receipt.js';
import { matchMerchant } from '../domain/rewards.js';
import { MAX_DINERS } from '../state.js';
import { Icon, MoneyField, initials } from './ui.jsx';
import { PointsRescueCard } from './Rewards.jsx';

/** Move focus to a correction field after React renders it. */
function focusSoon(id) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); el.focus({ preventScroll: true }); }
  }));
}

export default function Claim({ bill, alloc, dispatch, demo, names, prefs, onPref, announce, onSettle, invalidCount, onViewReceipt, onOpenRewards, sample }) {
  const r = bill.receipt;
  const [chargesOpen, setChargesOpen] = useState(false);
  const [editing, setEditing] = useState(/** @type {Record<string, boolean>} */ ({}));
  const check = alloc.check;
  const reward = useMemo(() => matchMerchant(r.merchant), [r.merchant]);

  // Open the bill editor automatically when the receipt needs attention on arrival.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!check.arithmeticMatches || r.items.length === 0) setChargesOpen(true);
  }, []);

  const fix = (field) => {
    if (!field) return;
    if (field.startsWith('item:')) {
      const id = field.slice(5);
      setEditing(e => ({ ...e, [id]: true }));
      focusSoon(`item-amount-${id}`);
    } else if (field.startsWith('unit:')) {
      focusSoon(`unit-${field.slice(5)}`);
    } else if (field.startsWith('discount:')) {
      setChargesOpen(true); focusSoon(`disc-scope-${field.slice(9)}`);
    } else if (field === 'paid') focusSoon('f-paid');
    else if (field === 'diners') focusSoon('f-add-diner');
    else if (field === 'payer') focusSoon('f-payer');
    else if (field === 'items') { setChargesOpen(true); focusSoon('btn-add-item'); }
    else if (field === 'chargeBasis') focusSoon('btn-equal-charges');
    else if (field === 'receiptTotalCents' && check.blocking.some(i => i.code === 'mismatch')) { setChargesOpen(true); focusSoon('f-taxCents'); }
    else if (field === 'discounts') { setChargesOpen(true); focusSoon('btn-add-discount'); }
    else { setChargesOpen(true); focusSoon(`f-${field}`); }
  };
  const firstBlocker = invalidCount > 0 ? null : alloc.blockers[0];
  const reason = invalidCount > 0 ? 'Fix the highlighted field first.' : firstBlocker?.message;
  const semanticIssues = r.issues;

  return (
    <section className="claim" aria-labelledby="claim-title">
      <div className="workspace">
        <div className="main-col">
          <h1 id="claim-title" className="screen-title">Who had what?</h1>

          <ReceiptStrip bill={bill} dispatch={dispatch} reward={reward} onViewReceipt={onViewReceipt} />
          {reward && r.merchantConfirmed && <PointsRescueCard entry={reward} onOpen={onOpenRewards} sample={sample} />}

          <CoreCheck check={check} receipt={r} onFix={fix} onToggle={() => setChargesOpen(o => !o)} open={chargesOpen} issues={semanticIssues} dispatch={dispatch} />
          {chargesOpen && <BillEditor receipt={r} dispatch={dispatch} check={check} />}

          <PaidRow receipt={r} check={check} dispatch={dispatch} />
          {alloc.needsEqualCharges && (
            <div className="notice notice-warning">
              <Icon name="alert" />
              <div>
                <p>Food after discounts is {formatMoney(0)}, so tax, service and tip can’t be shared by food.</p>
                <button id="btn-equal-charges" type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'SET_CHARGE_BASIS', basis: 'equalConfirmed' })}>Split remaining charges equally among all diners</button>
              </div>
            </div>
          )}

          <Diners bill={bill} dispatch={dispatch} names={names} prefs={prefs} onPref={onPref} demo={demo} />

          <section className="items" aria-labelledby="items-title">
            <div className="section-head">
              <h2 id="items-title">Claim your food</h2>
              <p className="muted small" aria-live="polite">{progressText(alloc)}</p>
            </div>
            {!bill.diners.length && <p className="notice notice-plain">Add the people at the table above, then tap who had each item.</p>}
            {r.items.map(item => (
              <ItemCard key={item.id} item={item} bill={bill} alloc={alloc} dispatch={dispatch}
                editing={!!editing[item.id]} setEditing={v => setEditing(e => ({ ...e, [item.id]: v }))} />
            ))}
            <AddItem dispatch={dispatch} />
          </section>

          {!demo && (
            <div className="device-opts">
              <label className="check">
                <input type="checkbox" checked={prefs.rememberDraft} onChange={e => onPref({ rememberDraft: e.target.checked })} />
                Keep a local draft of this bill on this device
              </label>
              <p className="field-hint">Saves items, charges, claims and names only — no image, receipt text, order details or payment info. {prefs.saveFailed ? <strong className="warn-text">Saving failed; this session still works in memory.</strong> : null}</p>
            </div>
          )}
        </div>

        <aside className="side-col" aria-labelledby="summary-title">
          <Summary bill={bill} alloc={alloc} reason={reason} onSettle={onSettle} onFix={() => fix(firstBlocker?.field)} canFix={!!firstBlocker?.field} />
        </aside>
      </div>

      <div className="dock" role="region" aria-label="Split status">
        <div className="dock-inner">
          <p className="dock-status">{alloc.ready && !invalidCount ? `${formatMoney(alloc.reimbursementCents)} to get back` : reason}</p>
          <div className="dock-actions">
            {(!alloc.ready || invalidCount > 0) && firstBlocker?.field && <button type="button" className="btn btn-secondary btn-small" onClick={() => fix(firstBlocker.field)}>Fix bill</button>}
            <button type="button" className="btn btn-primary" disabled={!alloc.ready || invalidCount > 0} onClick={onSettle}>Review split <Icon name="arrow" /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

function progressText(alloc) {
  const total = alloc.units.length;
  if (!total) return 'No items yet.';
  const left = total - alloc.claimedUnits;
  return `${alloc.claimedUnits} of ${total} units claimed · ${left} remaining`;
}

function ReceiptStrip({ bill, dispatch, reward, onViewReceipt }) {
  const r = bill.receipt;
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(r.merchant);
  useEffect(() => setName(r.merchant), [r.merchant]);
  const src = bill.source;
  const sourceLabel = src.kind === 'image' ? 'Scanned image' : src.kind === 'text' ? (src.sampleText ? 'Sample text — not a scan' : 'Pasted text') : src.kind === 'draft' ? 'Local draft' : 'Entered manually';
  return (
    <div className="strip card">
      <div className="strip-main">
        <div className="strip-merchant">
          {edit ? (
            <form className="inline-form" onSubmit={e => { e.preventDefault(); dispatch({ type: 'SET_MERCHANT', merchant: name }); setEdit(false); }}>
              <label htmlFor="f-merchant" className="sr-only">Restaurant name</label>
              <input id="f-merchant" value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus />
              <button className="btn btn-secondary btn-small" type="submit">Save</button>
            </form>
          ) : (
            <>
              <strong className="merchant-name">{r.merchant || 'Restaurant not recognized'}</strong>
              <button type="button" className="btn-text btn-small" onClick={() => setEdit(true)}>{r.merchant ? 'Edit' : 'Add name'}</button>
            </>
          )}
        </div>
        <div className="strip-total">
          <span className="muted small">Receipt total</span>
          <strong className="amount">{r.receiptTotalCents === null ? '—' : formatMoney(r.receiptTotalCents)}</strong>
        </div>
      </div>
      <div className="strip-meta">
        <span className="tag">{sourceLabel}</span>
        {r.sampleDisclaimer && <span className="tag tag-warn">Fictional sample receipt</span>}
        {(src.kind === 'image' || src.rawText) && <button type="button" className="btn-text btn-small" onClick={onViewReceipt}>View source</button>}
      </div>
      {r.merchant && reward && !r.merchantConfirmed && !edit && (
        <div className="strip-confirm">
          <span>Is this <strong>{reward.name}</strong>?</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'CONFIRM_MERCHANT', confirmed: true })}>Confirm restaurant</button>
        </div>
      )}
    </div>
  );
}

function CoreCheck({ check, receipt, onFix, onToggle, open, issues, dispatch }) {
  const arithmetic = check.blocking.filter(i => !['unknown-line', 'duplicate-field'].includes(i.code));
  const ok = check.arithmeticMatches && !check.blocking.length;
  return (
    <section className={`corecheck card ${ok ? 'ok' : 'warn'}`} aria-labelledby="cc-title">
      <div className="section-head">
        <h2 id="cc-title">CoreCheck · Check the bill</h2>
        <button type="button" className="btn-text btn-small" aria-expanded={open} onClick={onToggle}>{open ? 'Hide bill details' : 'Edit bill'}</button>
      </div>
      {ok ? (
        <p className="status-ok"><Icon name="check" /> {receipt.totalSource === 'manual' ? 'Reviewed bill matches' : 'Amounts match'}</p>
      ) : (
        <ul className="issue-list">
          {arithmetic.map(i => (
            <li key={i.id} className="issue">
              <Icon name="alert" />
              <span>{i.message}</span>
              {i.field && <button type="button" className="btn-text btn-small" onClick={() => onFix(i.field)}>Review</button>}
            </li>
          ))}
          {issues.map(i => (
            <li key={i.id} className={`issue ${i.severity === 'info' ? 'issue-info' : ''}`}>
              <Icon name="alert" />
              <span>
                {i.message}
                {i.line && <code className="source-line">{i.line}</code>}
              </span>
              <span className="row-wrap">
                {i.code === 'duplicate-field' && i.candidates.map((c, n) => (
                  <button key={n} type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'RESOLVE_ISSUE', id: i.id, action: 'choose', cents: c.cents })}>Use {c.label}</button>
                ))}
                {i.code === 'unknown-line' && <button type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'RESOLVE_ISSUE', id: i.id, action: 'add-item' })}>Add as item</button>}
                {i.code !== 'duplicate-field' && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'RESOLVE_ISSUE', id: i.id, action: 'ignore' })}>{i.severity === 'info' ? 'Dismiss' : 'Exclude line'}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="arith muted small">
        Items {formatMoney(check.G)}
        {check.I + check.B + check.U > 0 && <> − savings {formatMoney(check.I + check.B + check.U)}</>}
        {check.T > 0 && <> + tax {formatMoney(check.T)}</>}
        {check.S > 0 && <> + service {formatMoney(check.S)}</>}
        {check.P > 0 && <> + tip {formatMoney(check.P)}</>}
        {' '}= {formatMoney(check.expected)}
        {receipt.receiptTotalCents !== null && <> · receipt {formatMoney(receipt.receiptTotalCents)}</>}
      </p>
      <SavingsFound receipt={receipt} />
    </section>
  );
}

function SavingsFound({ receipt }) {
  if (!receipt.discounts.length) return null;
  const items = new Map(receipt.items.map(i => [i.id, i]));
  return (
    <div className="savings">
      <h3>Savings found</h3>
      <ul>
        {receipt.discounts.map(d => (
          <li key={d.id}>
            <span>{d.label}</span>
            <strong className="amount-sm">{formatMoney(-d.cents)}</strong>
            <span className="muted small savings-scope">
              {d.scope === 'bill' ? `${formatMoney(d.cents)} shared in proportion to food`
                : d.scope === 'item' && items.has(d.itemId) ? `Applies only to ${items.get(d.itemId).name}, split across its units`
                : 'Scope not chosen yet'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BillEditor({ receipt, dispatch, check }) {
  const charge = field => c => dispatch({ type: 'SET_CHARGE', field, cents: c });
  const mismatch = check.blocking.some(i => i.code === 'mismatch');
  const listed = { taxCents: receipt.listed.tax, serviceCents: receipt.listed.service, includedTipCents: receipt.listed.tip };
  return (
    <section className="card editor" aria-labelledby="editor-title">
      <h2 id="editor-title" className="h3">Charges on the receipt</h2>
      <div className="field-grid">
        {['taxCents', 'serviceCents', 'includedTipCents'].map(f => (
          <MoneyField key={f} id={`f-${f}`} label={FIELD_LABELS[f]} cents={receipt[f]} onCommit={charge(f)} highlight={mismatch}
            hint={!listed[f] && receipt[f] === 0 ? 'Not listed on the receipt' : undefined} />
        ))}
        <MoneyField id="f-printedSubtotalCents" label="Printed subtotal (evidence only)" cents={receipt.printedSubtotalCents} allowEmpty onCommit={charge('printedSubtotalCents')}
          hint={check.subtotalBasis === 'gross' ? 'Matches items before discounts' : check.subtotalBasis === 'net' ? 'Matches items after discounts' : check.subtotalBasis === 'itemNet' ? 'Matches items after item discounts' : 'Optional; never added as a charge'} />
        <MoneyField id="f-receiptTotalCents" label="Receipt total" cents={receipt.receiptTotalCents} allowEmpty onCommit={charge('receiptTotalCents')} highlight={mismatch}
          hint={receipt.totalSource === 'manual' ? 'Entered by you' : receipt.totalSource === 'ocr' ? 'Read from the receipt' : 'Required: the total printed on the receipt'} />
      </div>

      <h3>Discounts</h3>
      {receipt.discounts.length === 0 && <p className="muted small">No discounts.</p>}
      <ul className="disc-list">
        {receipt.discounts.map(d => (
          <li key={d.id} className="disc-row">
            <MoneyField id={`disc-amt-${d.id}`} label={d.label} cents={d.cents} onCommit={c => dispatch({ type: 'UPDATE_DISCOUNT', id: d.id, patch: { cents: c } })} />
            <div className="field">
              <label htmlFor={`disc-scope-${d.id}`}>Applies to</label>
              <select id={`disc-scope-${d.id}`} value={d.scope === 'item' && receipt.items.some(i => i.id === d.itemId) ? `item:${d.itemId}` : d.scope === 'bill' ? 'bill' : ''}
                aria-invalid={d.scope !== 'bill' && !(d.scope === 'item' && receipt.items.some(i => i.id === d.itemId)) || undefined}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'bill') dispatch({ type: 'UPDATE_DISCOUNT', id: d.id, patch: { scope: 'bill' } });
                  else if (v.startsWith('item:')) dispatch({ type: 'UPDATE_DISCOUNT', id: d.id, patch: { scope: 'item', itemId: v.slice(5) } });
                }}>
                <option value="" disabled>Choose…</option>
                <option value="bill">Whole bill (shared by food)</option>
                {receipt.items.map(i => <option key={i.id} value={`item:${i.id}`}>Only {i.name}</option>)}
              </select>
            </div>
            <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'DELETE_DISCOUNT', id: d.id })} aria-label={`Remove discount ${d.label}`}>Remove</button>
          </li>
        ))}
      </ul>
      <button id="btn-add-discount" type="button" className="btn-text" onClick={() => dispatch({ type: 'ADD_DISCOUNT', cents: 0, scope: 'bill', label: 'Discount' })}><Icon name="plus" /> Add discount</button>
    </section>
  );
}

function PaidRow({ receipt, check, dispatch }) {
  const p = check.paid;
  const total = receipt.receiptTotalCents;
  return (
    <section className={`paid card ${p.state === 'ok' ? 'ok' : ''}`} aria-labelledby="paid-title">
      <h2 id="paid-title" className="h3">Final amount paid</h2>
      <div className="paid-row">
        <MoneyField id="f-paid" label="Amount charged to your card or paid in cash" cents={receipt.finalPaidCents} allowEmpty
          onCommit={c => dispatch({ type: 'SET_PAID', cents: c })} hint="Includes any tip you added." />
        {total !== null && receipt.finalPaidCents === null && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'SET_PAID', cents: total })}>Same as receipt ({formatMoney(total)})</button>
        )}
      </div>
      {receipt.extraTipCents > 0 && (
        <p className="small">Extra tip added after the receipt: <strong>{formatMoney(receipt.extraTipCents)}</strong>{' '}
          <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'CLEAR_EXTRA_TIP' })}>Undo</button></p>
      )}
      {(p.state === 'more' || p.state === 'reclassify') && (
        <div className="notice notice-warning">
          <Icon name="alert" />
          <div>
            <p>You paid {formatMoney(p.delta)} more than the {formatMoney(/** @type {number} */ (total))} receipt total.</p>
            <div className="row-wrap">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'CLASSIFY_EXTRA_TIP' })}>The extra {formatMoney(p.delta)} was tip</button>
              <button type="button" className="btn-text btn-small" onClick={() => document.getElementById('f-receiptTotalCents')?.focus() ?? document.getElementById('f-paid')?.focus()}>Correct the amounts instead</button>
            </div>
          </div>
        </div>
      )}
      {p.state === 'less' && (
        <p className="notice notice-warning"><Icon name="alert" /> The paid amount is {formatMoney(p.delta)} below the receipt total. Check the total, or add a missing discount.</p>
      )}
      {p.state === 'unconfirmed' && (
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'CONFIRM_PAID' })}><Icon name="check" /> Confirm {formatMoney(/** @type {number} */ (receipt.finalPaidCents))} paid</button>
      )}
      {p.state === 'ok' && <p className="status-ok"><Icon name="check" /> {formatMoney(/** @type {number} */ (receipt.finalPaidCents))} paid, confirmed</p>}
      {p.state === 'waiting' && <p className="muted small">Enter the receipt total first.</p>}
    </section>
  );
}

function Diners({ bill, dispatch, names, prefs, onPref, demo }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(/** @type {string|null} */ (null));
  const [renameText, setRenameText] = useState('');
  const taken = new Set(bill.diners.map(d => d.name.toLowerCase()));
  const reusable = names.filter(n => !taken.has(n.toLowerCase())).slice(0, 8);
  const full = bill.diners.length >= MAX_DINERS;
  const add = (n) => {
    const clean = n.replace(/\s+/g, ' ').trim();
    if (!clean) { setError('Enter a name.'); return; }
    if (taken.has(clean.toLowerCase())) { setError(`${clean} is already at the table.`); return; }
    if (full) { setError(`Up to ${MAX_DINERS} people.`); return; }
    dispatch({ type: 'ADD_DINER', name: clean });
    setName(''); setError('');
  };
  return (
    <section className="diners card" aria-labelledby="diners-title">
      <h2 id="diners-title" className="h3">At the table</h2>
      {bill.diners.length > 0 && (
        <ul className="diner-list">
          {[...bill.diners].sort((a, b) => a.order - b.order).map(d => (
            <li key={d.id} className="diner">
              {renaming === d.id ? (
                <form className="inline-form" onSubmit={e => { e.preventDefault(); dispatch({ type: 'RENAME_DINER', id: d.id, name: renameText }); setRenaming(null); }}>
                  <label htmlFor={`rn-${d.id}`} className="sr-only">New name for {d.name}</label>
                  <input id={`rn-${d.id}`} value={renameText} maxLength={40} onChange={e => setRenameText(e.target.value)} autoFocus />
                  <button type="submit" className="btn btn-secondary btn-small">Save</button>
                  <button type="button" className="btn-text btn-small" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className="avatar" aria-hidden="true">{initials(d.name)}</span>
                  <span className="diner-name">{d.name}</span>
                  {d.id === bill.payerId && <span className="tag tag-accent">Paid</span>}
                  <span className="diner-actions">
                    <button type="button" className="btn-text btn-small" onClick={() => { setRenaming(d.id); setRenameText(d.name); }} aria-label={`Rename ${d.name}`}>Rename</button>
                    <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'REMOVE_DINER', id: d.id })} aria-label={`Remove ${d.name}`}>Remove</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="add-diner" onSubmit={e => { e.preventDefault(); add(name); }}>
        <div className="field grow">
          <label htmlFor="f-add-diner">Add a person</label>
          <input id="f-add-diner" value={name} maxLength={40} autoComplete="off" placeholder="Name"
            aria-invalid={!!error || undefined} aria-describedby={error ? 'diner-err' : undefined}
            onChange={e => { setName(e.target.value); setError(''); }} disabled={full} />
          {error && <p id="diner-err" className="field-error">{error}</p>}
        </div>
        <button type="submit" className="btn btn-secondary" disabled={full}><Icon name="plus" /> Add</button>
      </form>
      {reusable.length > 0 && (
        <div className="reuse">
          <span className="muted small">Add again:</span>
          {reusable.map(n => <button key={n} type="button" className="chip chip-quiet" onClick={() => add(n)}>{n}</button>)}
        </div>
      )}
      {bill.diners.length > 0 && (
        <div className="field payer-field">
          <label htmlFor="f-payer">Who paid the bill?</label>
          <select id="f-payer" value={bill.payerId ?? ''} onChange={e => dispatch({ type: 'SET_PAYER', id: e.target.value })}
            aria-invalid={!bill.payerId || undefined}>
            {!bill.payerId && <option value="" disabled>Choose…</option>}
            {[...bill.diners].sort((a, b) => a.order - b.order).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}
      {!demo && (
        <label className="check">
          <input type="checkbox" checked={prefs.rememberNames} onChange={e => onPref({ rememberNames: e.target.checked })} />
          Remember names on this device
        </label>
      )}
    </section>
  );
}

function ItemCard({ item, bill, alloc, dispatch, editing, setEditing }) {
  const units = alloc.units.filter(u => u.itemId === item.id);
  const diners = [...bill.diners].sort((a, b) => a.order - b.order);
  const notice = bill.notices[item.id];
  const needs = item.needsReview || alloc.check.blocking.some(i => i.field === `item:${item.id}`);
  return (
    <article className={`item card ${needs ? 'needs' : ''}`} aria-labelledby={`item-${item.id}-name`}>
      <div className="item-head">
        <div>
          <h3 id={`item-${item.id}-name`} className="item-name">{item.name}</h3>
          <p className="muted small">{item.quantity > 1 ? `${item.quantity} units · ${formatMoney(item.grossCents)} line total` : '1 unit'}</p>
        </div>
        <div className="item-right">
          <strong className="amount-md">{formatMoney(item.grossCents)}</strong>
          <button type="button" className="btn-text btn-small" aria-expanded={editing} onClick={() => setEditing(!editing)} aria-label={`${editing ? 'Done editing' : 'Edit'} ${item.name}`}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      </div>
      {item.needsReview && (
        <div className="notice notice-warning">
          <Icon name="alert" />
          <div>
            <p>{item.reviewReason || 'Check this line.'}</p>
            {item.sourceLine && <code className="source-line">{item.sourceLine}</code>}
            <div className="row-wrap">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit line</button>
              <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'MARK_ITEM_OK', id: item.id })}>It’s correct</button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <p className="notice notice-plain small">{notice} <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'DISMISS_NOTICE', id: item.id })}>OK</button></p>
      )}
      {editing && <ItemEditor item={item} dispatch={dispatch} />}
      {diners.length > 0 && (
        <ul className="units">
          {units.map(u => <UnitClaim key={u.key} unit={u} item={item} diners={diners} owners={bill.claims[u.key] ?? []} dispatch={dispatch} />)}
        </ul>
      )}
    </article>
  );
}

function ItemEditor({ item, dispatch }) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(String(item.quantity));
  const qtyOk = /^\d{1,2}$/.test(qty) && Number(qty) >= 1 && Number(qty) <= 20;
  return (
    <div className="item-editor">
      <div className="field">
        <label htmlFor={`item-name-${item.id}`}>Description</label>
        <input id={`item-name-${item.id}`} value={name} maxLength={60} onChange={e => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && dispatch({ type: 'UPDATE_ITEM', id: item.id, patch: { name } })} />
      </div>
      <div className="field field-qty">
        <label htmlFor={`item-qty-${item.id}`}>Quantity</label>
        <input id={`item-qty-${item.id}`} inputMode="numeric" value={qty} aria-invalid={!qtyOk || undefined}
          aria-describedby={`item-qty-${item.id}-msg`}
          onChange={e => setQty(e.target.value)}
          onBlur={() => qtyOk && Number(qty) !== item.quantity && dispatch({ type: 'UPDATE_ITEM', id: item.id, patch: { quantity: Number(qty) } })}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <p id={`item-qty-${item.id}-msg`} className={qtyOk ? 'field-hint' : 'field-error'}>{qtyOk ? 'Changing it clears this line’s claims.' : 'Whole number from 1 to 20.'}</p>
      </div>
      <MoneyField id={`item-amount-${item.id}`} label="Line total (all units)" cents={item.grossCents}
        onCommit={c => dispatch({ type: 'UPDATE_ITEM', id: item.id, patch: { grossCents: c } })} />
      <button type="button" className="btn-text btn-small danger-text" onClick={() => dispatch({ type: 'DELETE_ITEM', id: item.id })}>Delete line</button>
    </div>
  );
}

function UnitClaim({ unit, item, diners, owners, dispatch }) {
  const set = new Set(owners);
  const label = item.quantity > 1 ? `Unit ${unit.index + 1} of ${item.quantity}` : null;
  const share = owners.length > 1 ? `Shared ${owners.length} ways` : null;
  const unitName = item.quantity > 1 ? `${item.name} ${unit.index + 1} of ${item.quantity}` : item.name;
  return (
    <li className={`unit ${owners.length ? '' : 'unit-open'}`}>
      <div className="unit-head">
        <span className="small">{label && <strong>{label}</strong>}{label && ' · '}{formatMoney(unit.grossCents)}{share && ` · ${share}`}</span>
        {!owners.length && <span className="tag tag-warn">Needs owner</span>}
      </div>
      <div className="chips" role="group" aria-label={`Who had ${unitName}`}>
        {diners.map((d, i) => {
          const on = set.has(d.id);
          return (
            <button key={d.id} id={i === 0 ? `unit-${unit.key}` : undefined} type="button" className={`chip ${on ? 'chip-on' : ''}`}
              aria-pressed={on} onClick={() => dispatch({ type: 'TOGGLE_CLAIM', key: unit.key, dinerId: d.id })}>
              <span className="avatar avatar-sm" aria-hidden="true">{on ? <Icon name="check" size={14} /> : initials(d.name)}</span>
              <span className="chip-name">{d.name}</span>
            </button>
          );
        })}
      </div>
      <div className="unit-actions">
        {diners.length > 1 && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'SHARE_ALL', key: unit.key })} aria-label={`Share ${unitName} with everyone`}>Share with everyone</button>}
        {owners.length > 0 && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'CLEAR_CLAIM', key: unit.key })} aria-label={`Clear owners of ${unitName}`}>Clear</button>}
      </div>
    </li>
  );
}

function AddItem({ dispatch }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [cents, setCents] = useState(/** @type {number|null} */ (null));
  const [err, setErr] = useState('');
  if (!open) return <button id="btn-add-item" type="button" className="btn-text" onClick={() => setOpen(true)}><Icon name="plus" /> Add item</button>;
  return (
    <form className="card item-editor add-item" onSubmit={e => {
      e.preventDefault();
      const q = Number(qty);
      if (!name.trim()) return setErr('Enter a description.');
      if (!Number.isInteger(q) || q < 1 || q > 20) return setErr('Quantity must be 1–20.');
      if (cents === null) return setErr('Enter the line total.');
      dispatch({ type: 'ADD_ITEM', name, quantity: q, grossCents: cents });
      setName(''); setQty('1'); setCents(null); setErr(''); setOpen(false);
    }}>
      <h3>New item</h3>
      <div className="field"><label htmlFor="new-item-name">Description</label><input id="new-item-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="field field-qty"><label htmlFor="new-item-qty">Quantity</label><input id="new-item-qty" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></div>
      <MoneyField id="new-item-amount" label="Line total (all units)" cents={cents} allowEmpty onCommit={setCents} />
      {err && <p className="field-error" role="alert">{err}</p>}
      <div className="row-wrap">
        <button type="submit" className="btn btn-secondary">Add item</button>
        <button type="button" className="btn-text" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function Summary({ bill, alloc, reason, onSettle, onFix, canFix }) {
  const ready = alloc.ready && !reason?.startsWith('Fix the highlighted');
  return (
    <div className="summary card">
      <h2 id="summary-title" className="h3">Your split</h2>
      {ready ? (
        <>
          <p className="summary-hero"><span className="amount">{formatMoney(alloc.reimbursementCents)}</span> to get back</p>
          <ul className="summary-list">
            {alloc.people.map(p => (
              <li key={p.id}><span>{p.name}{p.isPayer ? ' (paid)' : ''}</span><strong className="amount-sm">{formatMoney(p.totalCents)}</strong></li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="muted small">Food subtotals so far (before discounts and charges). Final amounts appear when everything is claimed and checked.</p>
          <ul className="summary-list">
            {alloc.provisional.map(p => <li key={p.id}><span>{p.name}</span><span className="amount-sm">{formatMoney(p.foodCents)}</span></li>)}
            {alloc.unclaimedFoodCents > 0 && <li className="muted"><span>Unclaimed food</span><span className="amount-sm">{formatMoney(alloc.unclaimedFoodCents)}</span></li>}
          </ul>
          {alloc.unclaimed.length > 0 && alloc.unclaimed.length <= 3 && (
            <p className="small">Still unclaimed: {alloc.unclaimed.map(u => u.quantity > 1 ? `${u.name} ${u.index + 1} of ${u.quantity}` : u.name).join(', ')}</p>
          )}
          {reason && <p className="summary-reason" id="settle-reason"><Icon name="alert" /> {reason}</p>}
        </>
      )}
      <div className="summary-actions">
        <button type="button" className="btn btn-primary btn-block" disabled={!ready} aria-describedby={!ready && reason ? 'settle-reason' : undefined} onClick={onSettle}>Review split <Icon name="arrow" /></button>
        {!ready && canFix && <button type="button" className="btn btn-secondary btn-block" onClick={onFix}>Fix bill</button>}
      </div>
    </div>
  );
}
