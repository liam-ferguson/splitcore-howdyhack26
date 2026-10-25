import React from 'react';
import { receiptDetails } from '../domain/rewards.js';
import { CopyButton, Icon } from './ui.jsx';

/** Subtle card; never a modal interrupting assignment. */
export function PointsRescueCard({ entry, onOpen, sample }) {
  return (
    <div className="rescue card">
      <span className="rescue-mark" aria-hidden="true"><Icon name="star" size={18} /></span>
      <p>
        <strong>Points Rescue</strong> · Forgot to scan for rewards? {entry.name} has a receipt-claim process.
        {sample && <span className="tag tag-warn">Sample only — do not submit</span>}
      </p>
      <button type="button" className="btn-text btn-small" onClick={onOpen}>See how</button>
    </div>
  );
}

/** Dialog content: official instructions, requirements, verification date, detail pack. */
export function PointsRescuePanel({ entry, receipt, sample, announce }) {
  const pack = receiptDetails(entry, receipt, sample);
  return (
    <div className="rescue-panel">
      {sample && <p className="notice notice-warning"><Icon name="alert" /> Sample only — do not submit this receipt.</p>}
      <p>{entry.program}. The person who paid can ask {entry.name} to add a missed visit. {entry.name} decides eligibility and points; SplitCore doesn’t submit claims or predict points.</p>
      <h3>What {entry.name} asks for</h3>
      <ul className="bullets">{entry.requirements.map(t => <li key={t}>{t}</li>)}</ul>
      <h3>Steps</h3>
      <ul className="bullets">{entry.steps.map(t => <li key={t}>{t}</li>)}</ul>
      <ul className="rescue-links">
        {entry.links.map(l => (
          <li key={l.href}>
            <a className="btn btn-secondary" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} <span className="sr-only">(opens official site in a new tab)</span></a>
            {l.note && <p className="small muted">{l.note}</p>}
          </li>
        ))}
      </ul>
      <h3>Receipt details</h3>
      <dl className="details-grid">
        {pack.rows.map(r => <React.Fragment key={r.label}><dt>{r.label}</dt><dd className={r.value === 'not recognized' ? 'muted' : ''}>{r.value}</dd></React.Fragment>)}
      </dl>
      <p className="small muted">Uses the receipt’s own total, not any tip you added afterward. Missing details stay “not recognized”; check the paper receipt.</p>
      <CopyButton text={pack.text} label="Copy receipt details" announce={announce} />
      <p className="small muted">Policy checked {new Date(`${entry.verifiedOn}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Check the restaurant’s rules; they can change.</p>
    </div>
  );
}
