import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '../domain/money.js';
import { FIELD_LABELS } from '../domain/receipt.js';
import { MAX_DINERS } from '../state.js';
import { AnimatedMoney, Avatar, Burst, Dialog, Icon, MoneyField, ProgressRing, SplitBar, personColor } from './ui.jsx';
import { RewardsSpotlight } from './Rewards.jsx';

const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Move focus to a correction control after React renders it. */
function focusSoon(id) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: prefersReduced() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }));
}

export default function Claim({ bill, alloc, dispatch, demo, names, prefs, onPref, announce, onSettle, invalidCount, onViewReceipt, rewards, onRewardsDetails, onRewardsPick, sample }) {
  const r = bill.receipt;
  // Receipt details stay tucked away unless there's nothing to split yet (manual entry).
  const [chargesOpen, setChargesOpen] = useState(() => r.items.length === 0);
  const [editing, setEditing] = useState(/** @type {Record<string, boolean>} */ ({}));
  const check = alloc.check;
  const diners = [...bill.diners].sort((a, b) => a.order - b.order);

  const fix = (field) => {
    if (!field) return;
    if (field.startsWith('item:')) {
      const id = field.slice(5);
      setEditing(e => ({ ...e, [id]: true }));
      focusSoon(`item-amount-${id}`);
    } else if (field.startsWith('unit:')) focusSoon(`unit-${field.slice(5)}`);
    else if (field.startsWith('issue:')) focusSoon(`issue-${field.slice(6)}`);
    else if (field.startsWith('discount:')) { setChargesOpen(true); focusSoon(`disc-scope-${field.slice(9)}`); }
    else if (field === 'paid') focusSoon('f-tip');
    else if (field === 'diners') focusSoon('f-add-diner');
    else if (field === 'payer') focusSoon(`payer-${diners[0]?.id}`);
    else if (field === 'items') { setChargesOpen(true); focusSoon('btn-add-item'); }
    else if (field === 'chargeBasis') focusSoon('btn-equal-charges');
    else if (field === 'discounts') { setChargesOpen(true); focusSoon('btn-add-discount'); }
    else { setChargesOpen(true); focusSoon(`f-${field}`); }
  };
  const invalid = invalidCount > 0;
  const firstBlocker = invalid ? null : alloc.blockers[0];
  const reason = invalid ? 'Fix the highlighted field first.' : firstBlocker?.message ?? '';
  const ready = alloc.ready && !invalid;

  return (
    <section className="claim" aria-labelledby="claim-title">
      <div className="workspace">
        <div className="main-col">
          <h1 id="claim-title" className="screen-title reveal">{diners.length ? 'Your split is ready' : 'Who’s splitting?'}</h1>

          <ReceiptHeader bill={bill} alloc={alloc} dispatch={dispatch} onViewReceipt={onViewReceipt} />

          <People bill={bill} diners={diners} dispatch={dispatch} names={names} prefs={prefs} onPref={onPref} demo={demo} />

          <TipPanel receipt={r} check={check} dispatch={dispatch} />

          <ReceiptCheck check={check} receipt={r} onFix={fix} onToggle={() => setChargesOpen(o => !o)} open={chargesOpen} dispatch={dispatch} />
          {chargesOpen && <BillEditor receipt={r} dispatch={dispatch} check={check} />}

          <div className="reveal" style={{ '--i': 4 }}>
            <RewardsSpotlight result={rewards} merchant={r.merchant} sample={sample} onDetails={onRewardsDetails} onPick={onRewardsPick} compact />
          </div>

          <section className="items" aria-labelledby="items-title">
            <div className="section-head">
              <h2 id="items-title">Who had what? <span className="optional">optional</span></h2>
              <p className="pill-stat" aria-live="polite">{progressText(alloc)}</p>
            </div>
            <p className="muted small">{diners.length ? 'Tap people on anything one person had. Everything you don’t tap is split evenly.' : 'Add people above — everything is split evenly until you tap who had what.'}</p>
            {r.items.map((item, i) => (
              <ItemCard key={item.id} index={i} item={item} bill={bill} diners={diners} alloc={alloc} dispatch={dispatch}
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

        <aside className="side-col" aria-label="Your split">
          <Summary alloc={alloc} ready={ready} reason={reason} onSettle={onSettle} onFix={() => fix(firstBlocker?.field)} canFix={!!firstBlocker?.field} />
        </aside>
      </div>

      {/* Portaled to <body> so no animated ancestor can become its containing block. */}
      {createPortal(<div className="dock" role="region" aria-label="Split status">
        <div className="dock-inner">
          <ProgressRing value={alloc.claimedUnits} max={alloc.requiredUnits} size={44} stroke={5} done={ready}>
            {ready ? <Icon name="check" size={18} /> : <span className="ring-mini">{alloc.claimedUnits}/{alloc.requiredUnits}</span>}
          </ProgressRing>
          <p className="dock-status">{ready ? <><strong><AnimatedMoney cents={alloc.reimbursementCents} /></strong> to get back</> : reason}</p>
          <div className="dock-actions">
            {!ready && firstBlocker?.field && <button type="button" className="btn btn-secondary btn-small" onClick={() => fix(firstBlocker.field)}>Fix</button>}
            <button type="button" className="btn btn-primary btn-small" disabled={!ready} onClick={onSettle}>Send requests <Icon name="arrow" size={16} /></button>
          </div>
        </div>
      </div>, document.body)}
    </section>
  );
}

function progressText(alloc) {
  const total = alloc.requiredUnits;
  if (!alloc.units.length) return 'No items yet';
  const left = total - alloc.claimedUnits;
  return left ? `${alloc.claimedUnits} of ${total} tapped · ${left} split evenly` : `All ${total} tapped`;
}

function ReceiptHeader({ bill, alloc, dispatch, onViewReceipt }) {
  const r = bill.receipt;
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(r.merchant);
  useEffect(() => setName(r.merchant), [r.merchant]);
  const src = bill.source;
  const sourceLabel = src.kind === 'image' ? 'Scanned' : src.kind === 'text' ? (src.sampleText ? 'Sample text — not a scan' : 'Pasted text') : src.kind === 'draft' ? 'Local draft' : 'Entered manually';
  const count = r.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="receipt-head card reveal">
      <div className="receipt-head-main">
        <span className="receipt-icon" aria-hidden="true"><Icon name="receipt" size={24} /></span>
        <div className="receipt-name">
          {edit ? (
            <form className="inline-form" onSubmit={e => { e.preventDefault(); dispatch({ type: 'SET_MERCHANT', merchant: name }); setEdit(false); }}>
              <label htmlFor="f-merchant" className="sr-only">Restaurant name</label>
              <input id="f-merchant" value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus />
              <button className="btn btn-primary btn-small" type="submit">Save</button>
              <button className="btn-text btn-small" type="button" onClick={() => { setName(r.merchant); setEdit(false); }}>Cancel</button>
            </form>
          ) : (
            <>
              <p className="merchant-name">{r.merchant || 'Restaurant not recognized'}</p>
              <button type="button" className="btn-text btn-small" onClick={() => setEdit(true)} aria-label={r.merchant ? `Edit restaurant name, ${r.merchant}` : 'Add restaurant name'}><Icon name="edit" size={16} /> {r.merchant ? 'Edit' : 'Add name'}</button>
            </>
          )}
          <p className="muted small receipt-meta">
            {[r.dateText, r.timeText, count ? `${count} ${count === 1 ? 'item' : 'items'}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="receipt-total">
          <span className="muted small">Receipt total</span>
          <strong className="amount-lg">{r.receiptTotalCents === null ? '—' : formatMoney(r.receiptTotalCents)}</strong>
        </div>
      </div>
      <div className="tag-row">
        <span className="tag">{sourceLabel}</span>
        {r.sampleDisclaimer && <span className="tag tag-warn">Fictional sample receipt</span>}
        {alloc.check.arithmeticMatches && <span className="tag tag-ok"><Icon name="check" size={12} /> Adds up</span>}
        {(src.kind === 'image' || src.rawText) && <button type="button" className="btn-text btn-small" onClick={onViewReceipt}><Icon name="image" size={16} /> View source</button>}
      </div>
    </div>
  );
}

function People({ bill, diners, dispatch, names, prefs, onPref, demo }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(/** @type {string|null} */ (null));
  const taken = new Set(diners.map(d => d.name.toLowerCase()));
  const reusable = names.filter(n => !taken.has(n.toLowerCase())).slice(0, 8);
  const full = diners.length >= MAX_DINERS;
  const add = (n) => {
    const clean = n.replace(/\s+/g, ' ').trim();
    if (!clean) { setError('Enter a name.'); return; }
    if (taken.has(clean.toLowerCase())) { setError(`${clean} is already at the table.`); return; }
    if (full) { setError(`Up to ${MAX_DINERS} people.`); return; }
    dispatch({ type: 'ADD_DINER', name: clean });
    setName(''); setError('');
  };
  const editing = diners.find(d => d.id === editId) ?? null;
  return (
    <section className="people card reveal" style={{ '--i': 2 }} aria-labelledby="people-title">
      <div className="section-head">
        <h2 id="people-title">Who’s at the table?</h2>
        <span className="pill-stat">{diners.length} {diners.length === 1 ? 'person' : 'people'}</span>
      </div>
      {diners.length < 2 && (
        <div className="quick-people" role="group" aria-label="How many people?">
          <span className="muted small">How many people?</span>
          {[2, 3, 4, 5, 6].map(n => (
            <button key={n} type="button" className="quick-n" onClick={() => dispatch({ type: 'QUICK_PEOPLE', count: n })} aria-label={`${n} people`}>{n}</button>
          ))}
        </div>
      )}
      {diners.length > 0 && (
        <ul className="people-list">
          {diners.map(d => (
            <li key={d.id}>
              <button type="button" className="person-pill" style={{ '--pc': personColor(d.order) }} onClick={() => setEditId(d.id)} aria-label={`${d.name}${d.id === bill.payerId ? ', paid the bill' : ''}. Edit`}>
                <Avatar name={d.name} order={d.order} size={30} payer={d.id === bill.payerId} />
                <span className="person-name">{d.name}</span>
                <Icon name="edit" size={14} className="person-edit" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="add-diner" onSubmit={e => { e.preventDefault(); add(name); }}>
        <div className="field grow">
          <label htmlFor="f-add-diner" className="sr-only">Add a person</label>
          <input id="f-add-diner" value={name} maxLength={40} autoComplete="off" placeholder={full ? 'Table is full' : diners.length ? 'Add someone by name' : 'Or add names'}
            aria-invalid={!!error || undefined} aria-describedby={error ? 'diner-err' : undefined}
            onChange={e => { setName(e.target.value); setError(''); }} disabled={full} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={full} aria-label="Add person"><Icon name="plus" /> Add</button>
      </form>
      {error && <p id="diner-err" className="field-error" role="alert">{error}</p>}
      {reusable.length > 0 && (
        <div className="reuse">
          <span className="muted small">Add again:</span>
          {reusable.map(n => <button key={n} type="button" className="chip-btn chip-btn-sm" onClick={() => add(n)}><Icon name="plus" size={14} /> {n}</button>)}
        </div>
      )}
      {diners.length > 0 && (
        <fieldset className="payer-pick">
          <legend>Who paid the bill?</legend>
          <div className="payer-options">
            {diners.map(d => (
              <label key={d.id} className={`payer-option ${d.id === bill.payerId ? 'is-on' : ''}`} style={{ '--pc': personColor(d.order) }}>
                <input id={`payer-${d.id}`} type="radio" name="payer" checked={d.id === bill.payerId} onChange={() => dispatch({ type: 'SET_PAYER', id: d.id })} />
                <Icon name="crown" size={14} /> {d.name}
              </label>
            ))}
          </div>
          {!bill.payerId && <p className="field-error">Choose who paid.</p>}
        </fieldset>
      )}
      {!demo && (
        <label className="check">
          <input type="checkbox" checked={prefs.rememberNames} onChange={e => onPref({ rememberNames: e.target.checked })} />
          Remember names on this device
        </label>
      )}
      <PersonDialog person={editing} bill={bill} diners={diners} dispatch={dispatch} onClose={() => setEditId(null)} />
    </section>
  );
}

function PersonDialog({ person, bill, diners, dispatch, onClose }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (person) { setText(person.name); setErr(''); } }, [person?.id]);
  return (
    <Dialog open={!!person} onClose={onClose} title={person ? `Edit ${person.name}` : 'Edit person'} icon="users">
      {person && (
        <form className="person-form" onSubmit={e => {
          e.preventDefault();
          const clean = text.replace(/\s+/g, ' ').trim();
          if (!clean) return setErr('Enter a name.');
          if (diners.some(d => d.id !== person.id && d.name.toLowerCase() === clean.toLowerCase())) return setErr(`${clean} is already at the table.`);
          dispatch({ type: 'RENAME_DINER', id: person.id, name: clean });
          onClose();
        }}>
          <div className="field">
            <label htmlFor="rename-input">Name</label>
            <input id="rename-input" value={text} maxLength={40} autoComplete="off" onChange={e => { setText(e.target.value); setErr(''); }}
              aria-invalid={!!err || undefined} aria-describedby={err ? 'rename-err' : undefined} />
            {err && <p id="rename-err" className="field-error">{err}</p>}
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn btn-primary">Save name</button>
            {bill.payerId !== person.id && <button type="button" className="btn btn-secondary" onClick={() => { dispatch({ type: 'SET_PAYER', id: person.id }); onClose(); }}><Icon name="crown" size={16} /> {person.name} paid</button>}
            <button type="button" className="btn btn-danger" onClick={() => { dispatch({ type: 'REMOVE_DINER', id: person.id }); onClose(); }}><Icon name="trash" size={16} /> Remove</button>
          </div>
          <p className="small muted">Removing someone returns their items to unclaimed.</p>
        </form>
      )}
    </Dialog>
  );
}

function ReceiptCheck({ check, receipt, onFix, onToggle, open, dispatch }) {
  const notes = [...receipt.issues, ...check.issues.filter(i => !receipt.issues.includes(i) && i.severity === 'info')];
  const blocking = check.blocking;
  const adj = check.adjustmentCents;
  const status = blocking.length ? 'warn' : check.arithmeticMatches ? 'ok' : 'info';
  const headline = blocking.length ? blocking[0].message
    : check.arithmeticMatches ? (receipt.totalSource === 'manual' ? 'Your bill adds up' : 'Every line adds up to the printed total')
    : receipt.receiptTotalCents === null ? `Total ${formatMoney(check.total)} (from the items)`
    : `Using the printed total · ${formatMoney(Math.abs(adj))} difference shared fairly`;
  return (
    <section className={`corecheck card reveal ${status}`} style={{ '--i': 3 }} aria-labelledby="cc-title">
      <div className="section-head">
        <h2 id="cc-title" className="cc-line"><span className={`status-dot ${status === 'ok' ? 'ok' : 'warn'}`} aria-hidden="true" /> <span className="cc-text">{headline}</span></h2>
        <button type="button" className="btn-text btn-small" aria-expanded={open} onClick={onToggle}>{open ? 'Hide receipt details' : 'Receipt details'}</button>
      </div>
      {blocking.length > 0 && blocking[0].field && (
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onFix(blocking[0].field)}>Fix it</button>
      )}
      {open && (
        <>
          <p className="arith">
            <span>Items {formatMoney(check.G)}</span>
            {check.I + check.B > 0 && <span>− savings {formatMoney(check.I + check.B)}</span>}
            {check.T > 0 && <span>+ tax {formatMoney(check.T)}</span>}
            {check.S > 0 && <span>+ service & fees {formatMoney(check.S)}</span>}
            {check.P > 0 && <span>+ tip {formatMoney(check.P)}</span>}
            {adj !== 0 && <span>{adj > 0 ? '+' : '−'} unread difference {formatMoney(Math.abs(adj))}</span>}
            <span className="arith-eq">= {formatMoney(check.total)}</span>
          </p>
          {notes.length > 0 && (
            <ul className="issue-list">
              {notes.map(i => (
                <li key={i.id} id={`issue-${i.id}`} tabIndex={-1} className="issue issue-info">
                  <Icon name="info" />
                  <span>
                    {i.message}
                    {i.line && <code className="source-line">{i.line}</code>}
                  </span>
                  <span className="row-wrap">
                    {i.code === 'duplicate-field' && i.candidates.filter(c => c.cents !== i.chosen).map((c, n) => (
                      <button key={n} type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'RESOLVE_ISSUE', id: i.id, action: 'choose', cents: c.cents })}>Use {c.label}</button>
                    ))}
                    {i.code === 'unknown-line' && <button type="button" className="btn btn-secondary btn-small" onClick={() => dispatch({ type: 'RESOLVE_ISSUE', id: i.id, action: 'add-item' })}>Add as item</button>}
                    {receipt.issues.includes(i) && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'RESOLVE_ISSUE', id: i.id, action: 'ignore' })}>Dismiss</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <SavingsFound receipt={receipt} />
        </>
      )}
    </section>
  );
}


function SavingsFound({ receipt }) {
  if (!receipt.discounts.length) return null;
  const items = new Map(receipt.items.map(i => [i.id, i]));
  return (
    <div className="savings">
      <h3><Icon name="sparkle" size={16} /> Savings found</h3>
      <ul>
        {receipt.discounts.map(d => (
          <li key={d.id}>
            <span>{d.label}</span>
            <strong className="amount-sm savings-amt">{formatMoney(-d.cents)}</strong>
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
            <button type="button" className="btn-text btn-small danger-text" onClick={() => dispatch({ type: 'DELETE_DISCOUNT', id: d.id })} aria-label={`Remove discount ${d.label}`}><Icon name="trash" size={16} /> Remove</button>
          </li>
        ))}
      </ul>
      <button id="btn-add-discount" type="button" className="btn-text" onClick={() => dispatch({ type: 'ADD_DISCOUNT', cents: 0, scope: 'bill', label: 'Discount' })}><Icon name="plus" size={18} /> Add discount</button>
    </section>
  );
}

function TipPanel({ receipt, check, dispatch }) {
  const [open, setOpen] = useState(receipt.extraTipCents > 0);
  return (
    <section className="paid card reveal" style={{ '--i': 2 }} aria-labelledby="paid-title">
      <div className="paid-summary">
        <div>
          <p className="muted small" id="paid-title">Paid</p>
          <p className="paid-amount"><AnimatedMoney cents={check.paidCents} className="amount-lg" /></p>
          <p className="muted small">{receipt.extraTipCents > 0 ? `${formatMoney(check.total)} receipt + ${formatMoney(receipt.extraTipCents)} tip you added` : 'Receipt total'}</p>
        </div>
        {!open && <button type="button" className="btn btn-secondary btn-small" onClick={() => { setOpen(true); focusSoon('f-tip'); }}><Icon name="plus" size={16} /> Add a tip</button>}
      </div>
      {open && (
        <div className="tip-fields">
          <MoneyField id="f-tip" label="Tip you added on the card" cents={receipt.extraTipCents || null} allowEmpty placeholder="0.00"
            onCommit={c => dispatch({ type: 'SET_TIP', cents: c ?? 0 })} hint="Shared in proportion to what each person had." />
          <div className="tip-quick" role="group" aria-label="Quick tip">
            {[15, 18, 20].map(pct => {
              const c = Math.round(check.total * pct / 100);
              return <button key={pct} type="button" className="chip-btn chip-btn-sm" onClick={() => dispatch({ type: 'SET_TIP', cents: c })}>{pct}% · {formatMoney(c)}</button>;
            })}
            {receipt.extraTipCents > 0 && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'SET_TIP', cents: 0 })}>No tip</button>}
          </div>
        </div>
      )}
    </section>
  );
}

function ItemCard({ item, index, bill, diners, alloc, dispatch, editing, setEditing }) {
  const units = alloc.units.filter(u => u.itemId === item.id);
  const notice = bill.notices[item.id];
  const needs = item.needsReview || alloc.check.blocking.some(i => i.field === `item:${item.id}`);
  const claimed = units.filter(u => (bill.claims[u.key] ?? []).length || u.grossCents === 0).length;
  const done = units.length > 0 && claimed === units.length;
  return (
    <article className={`item card reveal ${needs ? 'needs' : ''} ${done ? 'is-done' : ''}`} style={{ '--i': Math.min(index, 8) }} aria-labelledby={`item-${item.id}-name`}>
      <div className="item-head">
        <div className="item-title">
          <span className={`item-check ${done ? 'on' : ''}`} aria-hidden="true"><Icon name="check" size={14} /></span>
          <div>
            <h3 id={`item-${item.id}-name`} className="item-name">{item.name}</h3>
            <p className="muted small">{item.quantity > 1 ? `${item.quantity} units · ${formatMoney(item.grossCents)} line total` : '1 unit'}</p>
          </div>
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
          onBlur={() => {
            if (!name.trim()) { setName(item.name); return; }
            if (name !== item.name) dispatch({ type: 'UPDATE_ITEM', id: item.id, patch: { name } });
          }} />
      </div>
      <div className="field field-qty">
        <label htmlFor={`item-qty-${item.id}`}>Quantity</label>
        <input id={`item-qty-${item.id}`} inputMode="numeric" value={qty} aria-invalid={!qtyOk || undefined}
          aria-describedby={`item-qty-${item.id}-msg`}
          onChange={e => setQty(e.target.value)}
          onBlur={() => { if (qtyOk && Number(qty) !== item.quantity) dispatch({ type: 'UPDATE_ITEM', id: item.id, patch: { quantity: Number(qty) } }); else if (!qtyOk) setQty(String(item.quantity)); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <p id={`item-qty-${item.id}-msg`} className={qtyOk ? 'field-hint' : 'field-error'}>{qtyOk ? 'Changing it clears this line’s claims.' : 'Whole number from 1 to 20.'}</p>
      </div>
      <MoneyField id={`item-amount-${item.id}`} label="Line total (all units)" cents={item.grossCents}
        onCommit={c => dispatch({ type: 'UPDATE_ITEM', id: item.id, patch: { grossCents: c } })} />
      <div className="row-wrap">
        <button type="button" className="btn-text btn-small danger-text" onClick={() => dispatch({ type: 'DELETE_ITEM', id: item.id })}><Icon name="trash" size={16} /> Delete line</button>
      </div>
    </div>
  );
}

function UnitClaim({ unit, item, diners, owners, dispatch }) {
  const set = new Set(owners);
  const free = unit.grossCents === 0;
  const label = item.quantity > 1 ? `Unit ${unit.index + 1} of ${item.quantity}` : null;
  const unitName = item.quantity > 1 ? `${item.name} ${unit.index + 1} of ${item.quantity}` : item.name;
  const ownerList = diners.filter(d => set.has(d.id));
  return (
    <li className={`unit ${owners.length || free ? '' : 'unit-open'}`}>
      <div className="unit-head">
        <span className="small unit-label">{label && <strong>{label}</strong>}{label && ' · '}{formatMoney(unit.grossCents)}{owners.length > 1 && <span className="split-pill">÷{owners.length}</span>}</span>
        {!owners.length && (free ? <span className="tag">Free</span> : <span className="tag">Split evenly</span>)}
      </div>
      <div className="owner-bar" aria-hidden="true">
        {ownerList.map(d => <span key={d.id} style={{ background: personColor(d.order) }} />)}
      </div>
      <div className="chips" role="group" aria-label={`Who had ${unitName}`}>
        {diners.map((d, i) => {
          const on = set.has(d.id);
          return (
            <button key={d.id} id={i === 0 ? `unit-${unit.key}` : undefined} type="button" className={`chip ${on ? 'chip-on' : ''}`}
              style={{ '--pc': personColor(d.order) }}
              aria-pressed={on} onClick={() => dispatch({ type: 'TOGGLE_CLAIM', key: unit.key, dinerId: d.id })}>
              <span className="chip-dot" aria-hidden="true">{on ? <Icon name="check" size={13} /> : d.name[0].toUpperCase()}</span>
              <span className="chip-name">{d.name}</span>
            </button>
          );
        })}
      </div>
      {(diners.length > 1 || owners.length > 0) && (
        <div className="unit-actions">
          {diners.length > 1 && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'SHARE_ALL', key: unit.key })} aria-label={`Share ${unitName} with everyone`}><Icon name="users" size={15} /> Share with everyone</button>}
          {owners.length > 0 && <button type="button" className="btn-text btn-small" onClick={() => dispatch({ type: 'CLEAR_CLAIM', key: unit.key })} aria-label={`Clear owners of ${unitName}`}>Clear</button>}
        </div>
      )}
    </li>
  );
}

function AddItem({ dispatch }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [cents, setCents] = useState(/** @type {number|null} */ (null));
  const [err, setErr] = useState('');
  if (!open) return <button id="btn-add-item" type="button" className="add-item-btn" onClick={() => setOpen(true)}><Icon name="plus" /> Add an item</button>;
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
        <button type="submit" className="btn btn-primary btn-small">Add item</button>
        <button type="button" className="btn-text btn-small" onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
      </div>
    </form>
  );
}

function Summary({ alloc, ready, reason, onSettle, onFix, canFix }) {
  const [burst, setBurst] = useState(0);
  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current && !prefersReduced()) setBurst(b => b + 1);
    wasReady.current = ready;
  }, [ready]);
  const people = ready ? alloc.people.map(p => ({ ...p, cents: p.totalCents })) : alloc.provisional.map(p => ({ ...p, cents: p.foodCents }));
  const segments = people.map(p => ({ id: p.id, cents: p.cents, color: personColor(p.order) }));
  return (
    <div className={`summary card ${ready ? 'is-ready' : ''}`}>
      <div className="summary-top">
        <span className="burst-anchor">
          <ProgressRing value={alloc.claimedUnits} max={alloc.requiredUnits} size={72} stroke={7} done={ready}>
            {ready ? <Icon name="check" size={26} /> : <span><strong>{alloc.claimedUnits}</strong>/{alloc.requiredUnits}</span>}
          </ProgressRing>
          <Burst fire={burst} />
        </span>
        <div>
          <h2 className="h3">Your split</h2>
          <p className="muted small">{!ready ? 'Add people to see shares' : alloc.unclaimed.length ? `${alloc.unclaimed.length} untapped item${alloc.unclaimed.length === 1 ? '' : 's'} split evenly` : 'Everyone’s items are tapped'}</p>
        </div>
      </div>
      {ready && <p className="summary-hero"><AnimatedMoney cents={alloc.reimbursementCents} className="amount-xl" /> <span>to get back</span></p>}
      <SplitBar segments={segments} label={people.map(p => `${p.name} ${formatMoney(p.cents)}`).join(', ')} />
      <ul className="summary-list">
        {people.map((p, i) => (
          <li key={p.id}>
            <span className="dot" style={{ background: segments[i].color }} aria-hidden="true" />
            <span className="summary-name">{p.name}{p.isPayer ? ' (paid)' : ''}</span>
            <AnimatedMoney cents={p.cents} className="amount-sm" />
          </li>
        ))}
      </ul>
      {!ready && reason && <p className="summary-reason" id="settle-reason"><Icon name="alert" size={16} /> {reason}</p>}
      <div className="summary-actions">
        <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!ready} aria-describedby={!ready && reason ? 'settle-reason' : undefined} onClick={onSettle}>Send requests <Icon name="arrow" /></button>
        {!ready && canFix && <button type="button" className="btn btn-secondary btn-block" onClick={onFix}>Fix it</button>}
      </div>
    </div>
  );
}
