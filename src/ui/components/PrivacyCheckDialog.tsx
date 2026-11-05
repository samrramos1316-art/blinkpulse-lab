import { useEffect, useRef, useState } from 'react';
import { networkRecords, pagePolicy } from '../../app/networkLog.ts';
import { PRIVACY_CHECK_COPY } from '../copy.ts';
import { AlertIcon } from '../icons/Icons.tsx';
import {
  cspRule,
  formatBytes,
  formatSeconds,
  summarizeNetwork,
  type NetworkSummary,
} from '../networkSummary.ts';

const REFRESH_MS = 1000;

function PrivacyCheckContent() {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  useEffect(() => {
    const refresh = () => {
      const { requests, refused } = networkRecords();
      setSummary(summarizeNetwork(requests, refused, window.location.origin, performance.now()));
    };
    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const policy = pagePolicy();
  const rule = policy === null ? null : cspRule(policy, 'connect-src');

  return (
    <>
      <h2 id="privacy-check-title" className="section-title" tabIndex={-1}>
        {PRIVACY_CHECK_COPY.title}
      </h2>
      <p>{PRIVACY_CHECK_COPY.intro}</p>
      {summary ? (
        <>
          <dl className="timing__list privacy-check__list">
            <div className="timing__row">
              <dt>Requests to other sites</dt>
              <dd className="tabular">{summary.otherSites.length.toFixed(0)}</dd>
            </div>
            <div className="timing__row">
              <dt>Requests refused by the browser</dt>
              <dd className="tabular">
                {summary.refused.reduce((total, r) => total + r.count, 0).toFixed(0)}
              </dd>
            </div>
            <div className="timing__row">
              <dt>Requests to this site</dt>
              <dd className="tabular">{summary.own.length.toFixed(0)}</dd>
            </div>
            <div className="timing__row">
              <dt>Last request to this site</dt>
              <dd className="tabular">
                {summary.lastOwnMs === null
                  ? '-'
                  : `${formatSeconds(summary.lastOwnMs)} after opening`}
              </dd>
            </div>
            <div className="timing__row">
              <dt>Requests to this site in the last 60 s</dt>
              <dd className="tabular">{summary.ownInLastMinute.toFixed(0)}</dd>
            </div>
            <div className="timing__row">
              <dt>Connection rule of this page</dt>
              <dd>
                <code>{rule ?? PRIVACY_CHECK_COPY.noPolicy}</code>
              </dd>
            </div>
          </dl>

          {summary.otherSites.length > 0 ? (
            <div className="privacy-check__alert" role="alert">
              <AlertIcon size={18} />
              <div>
                <p>{PRIVACY_CHECK_COPY.otherSitesFound}</p>
                <ul className="about__list">
                  {summary.otherSites.map((r) => (
                    <li key={`${r.url}-${String(r.atMs)}`} className="privacy-check__url">
                      {r.url} ({r.kind}, {formatSeconds(r.atMs)} after opening)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p>{PRIVACY_CHECK_COPY.noOtherSites}</p>
          )}

          {summary.refused.length > 0 ? (
            <>
              <h3 className="about__heading">Refused requests</h3>
              <p>{PRIVACY_CHECK_COPY.refusedNote}</p>
              <div className="privacy-check__scroll">
                <table className="tool__table">
                  <thead>
                    <tr>
                      <th scope="col">Address</th>
                      <th scope="col">Rule</th>
                      <th scope="col">Times</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.refused.map((r) => (
                      <tr key={`${r.rule} ${r.url}`}>
                        <td className="privacy-check__url">{r.url}</td>
                        <td>{r.rule}</td>
                        <td className="tabular">{r.count.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <details className="plot__text">
            <summary>Files loaded from this site ({summary.own.length.toFixed(0)})</summary>
            <div className="privacy-check__scroll">
              <table className="tool__table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Type</th>
                    <th scope="col">Size</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.own.map((r) => (
                    <tr key={`${r.path}-${String(r.atMs)}`}>
                      <td className="privacy-check__url">{r.path}</td>
                      <td>{r.kind}</td>
                      <td className="tabular">{formatBytes(r.bytes)}</td>
                      <td className="tabular">{formatSeconds(r.atMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}

      <h3 className="about__heading">What this can't prove</h3>
      <ul className="about__list">
        {PRIVACY_CHECK_COPY.limits.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </>
  );
}

/** Privacy check (SPEC_AMENDMENT_05 Patch H), a modal dialog like About. */
export function PrivacyCheckDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('#privacy-check-title')?.focus();
      d.scrollTop = 0;
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="about card privacy-check"
      aria-labelledby="privacy-check-title"
      onClose={onClose}
    >
      {open ? (
        <>
          <PrivacyCheckContent />
          <div className="setup__actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
