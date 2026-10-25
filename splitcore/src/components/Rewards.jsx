import React, { useEffect, useMemo, useState } from 'react';
import { DIRECTORY, VERIFIED_ON, receiptDetails, searchDirectory } from '../domain/rewards.js';
import { CopyButton, Dialog, Icon } from './ui.jsx';

const VERIFIED_LABEL = new Date(`${VERIFIED_ON}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function evidenceText(result) {
  if (result.via === 'choice') return 'You chose this restaurant';
  if (result.via === 'website') return `Found ${result.evidence} printed on your receipt`;
  return `Found “${result.evidence}” at the top of your receipt`;
}

/** Brand-neutral monogram tile (no third-party logos). */
export function Monogram({ entry, size = 44 }) {
  const letters = entry.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <span className="monogram" style={{ '--s': `${size}px` }} aria-hidden="true">{letters}</span>;
}

/**
 * Rewards spotlight: shown when the receipt names a supported restaurant, or a quiet
 * "none found" row with a way to choose one.
 */
export function RewardsSpotlight({ result, merchant, sample, onDetails, onPick, compact = false }) {
  const entry = result.entry;
  if (!entry) {
    return (
      <div className="rewards-none">
        <Icon name="gift" />
        <p>{result.via === 'choice' ? 'Rewards lookup turned off for this bill.' : <>No rewards program found for <strong>{merchant || 'this restaurant'}</strong>.</>}</p>
        <button type="button" className="btn-text btn-small" onClick={onPick}>Choose a restaurant</button>
      </div>
    );
  }
  return (
    <section className={`rewards-spot ${compact ? 'rewards-spot-compact' : ''}`} aria-labelledby="rw-title">
      <div className="rewards-glow" aria-hidden="true" />
      <Monogram entry={entry} />
      <div className="rewards-copy">
        <p className="eyebrow"><Icon name="gift" size={14} /> Rewards available</p>
        <h2 id="rw-title">{entry.program}</h2>
        <p className="muted small">{evidenceText(result)}. {entry.claim ? 'You can still ask for points on this visit.' : 'Join to earn on your next order.'}</p>
        {sample && <p className="tag tag-warn">Sample receipt — don’t submit it for points</p>}
      </div>
      <div className="rewards-actions">
        <a className="btn btn-primary btn-small" href={entry.url} target="_blank" rel="noopener noreferrer">
          Join {entry.program} <Icon name="external" size={16} /><span className="sr-only">(opens {entry.name}’s site in a new tab)</span>
        </a>
        <button type="button" className="btn btn-secondary btn-small" onClick={onDetails}>{entry.claim ? 'Add this visit' : 'Details'}</button>
        <button type="button" className="btn-text btn-small" onClick={onPick}>Not {entry.name}?</button>
      </div>
    </section>
  );
}

/** Program details: join link, and verified missed-visit steps where we have them. */
export function RewardsPanel({ entry, receipt, sample, announce }) {
  const pack = receiptDetails(entry, receipt, sample);
  return (
    <div className="rescue-panel">
      <div className="rescue-head">
        <Monogram entry={entry} size={52} />
        <div>
          <p className="eyebrow">{entry.category}</p>
          <p className="rescue-program">{entry.program}</p>
        </div>
      </div>
      {sample && <p className="notice notice-warning"><Icon name="alert" /> Sample only — do not submit this receipt.</p>}
      <a className="btn btn-primary btn-block" href={entry.url} target="_blank" rel="noopener noreferrer">
        Join or sign in to {entry.program} <Icon name="external" size={16} /><span className="sr-only">(opens {entry.name}’s site in a new tab)</span>
      </a>
      <p className="small muted">Signing up happens on {entry.name}’s own site. SplitCore never sees your account.</p>

      {entry.claim ? (
        <>
          <h3>Forgot to scan? Add this visit</h3>
          <ul className="bullets">{entry.claim.requirements.map(t => <li key={t}>{t}</li>)}</ul>
          <ol className="steps-list">{entry.claim.steps.map(t => <li key={t}>{t}</li>)}</ol>
          <ul className="rescue-links">
            {entry.claim.links.map(l => (
              <li key={l.href}>
                <a className="btn btn-secondary" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} <Icon name="external" size={16} /><span className="sr-only">(opens official site in a new tab)</span></a>
                {l.note && <p className="small muted">{l.note}</p>}
              </li>
            ))}
          </ul>
          <h3>Receipt details to enter</h3>
          <dl className="details-grid">
            {pack.rows.map(r => <React.Fragment key={r.label}><dt>{r.label}</dt><dd className={r.value === 'not recognized' ? 'muted' : ''}>{r.value}</dd></React.Fragment>)}
          </dl>
          <p className="small muted">Uses the receipt’s own total, not any tip you added afterward. Missing details stay “not recognized”; check the paper receipt.</p>
          <CopyButton text={pack.text} label="Copy receipt details" announce={announce} />
        </>
      ) : (
        <p className="small">SplitCore has step-by-step missed-visit instructions only for Chick-fil-A, McDonald’s and Wendy’s. For {entry.program}, see {entry.name}’s rewards page for current terms.</p>
      )}
      <p className="small muted">{entry.name} decides eligibility and points; SplitCore doesn’t submit claims or predict points. Link checked {VERIFIED_LABEL}.</p>
    </div>
  );
}

/** Searchable list of supported restaurants. */
export function RestaurantPicker({ open, onClose, onPick, currentId }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const results = useMemo(() => searchDirectory(q), [q]);
  return (
    <Dialog open={open} onClose={onClose} title="Choose the restaurant" icon="search">
      <div className="picker">
        <label htmlFor="picker-q" className="sr-only">Search restaurants</label>
        <div className="search-input">
          <Icon name="search" />
          <input id="picker-q" type="search" placeholder={`Search ${DIRECTORY.length} restaurants`} value={q} autoComplete="off" onChange={e => setQ(e.target.value)} />
        </div>
        <ul className="picker-list" aria-label="Restaurants with rewards programs">
          {results.map(e => (
            <li key={e.id}>
              <button type="button" className={`picker-item ${e.id === currentId ? 'is-current' : ''}`} aria-current={e.id === currentId || undefined} onClick={() => onPick(e.id)}>
                <Monogram entry={e} size={36} />
                <span className="picker-text"><strong>{e.name}</strong><span className="muted small">{e.program} · {e.category}</span></span>
                {e.id === currentId ? <Icon name="check" /> : <Icon name="chevron" />}
              </button>
            </li>
          ))}
          {!results.length && <li className="muted small picker-empty">No supported restaurant matches “{q}”.</li>}
        </ul>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => onPick('none')}>None of these — no rewards</button>
      </div>
    </Dialog>
  );
}
