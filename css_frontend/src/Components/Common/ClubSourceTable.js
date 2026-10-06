import React from 'react';
import './ClubSourceTable.css';

const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Club-mode source picker shared by the share modules (cancel, dissolve, buyback, transfer).
 * Every cert of the holder is listed; unticked certs are left out of the club pool.
 *
 * Props
 *   txns        object[]  all candidate source transactions
 *   excludedIds any[]     share_transaction_ids the user has unticked
 *   onToggle    fn(id)    tick / untick one cert
 *   holderName  string    optional chip in the header
 *   minSelected number    minimum certs a club needs (default 2)
 *   poolNote    bool      show the weighted-per-share note for mixed prices (default true)
 */
const ClubSourceTable = ({ txns, excludedIds, onToggle, holderName, minSelected = 2, poolNote = true }) => {
  const selected = txns.filter(t => !excludedIds.includes(t.share_transaction_id));
  const shares   = selected.reduce((s, t) => s + Number(t.no_of_shares         || 0), 0);
  const issued   = selected.reduce((s, t) => s + Number(t.issued_share_capital || 0), 0);
  const paidup   = selected.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const wtdPS    = shares > 0 ? paidup / shares : 0;
  const mixedPS  = new Set(selected.map(t => Number(t.per_share || 0).toFixed(8))).size > 1;

  return (
    <div className="cst-card">
      <div className="cst-hdr">
        <i className="ri-file-paper-2-line" /> Current Share Certificates
        {holderName && <span className="cst-holder-chip"><i className="ri-user-line" /> {holderName}</span>}
      </div>
      <div className="cst-table-wrap">
        <table className="cst-table">
          <thead>
            <tr>
              <th className="cst-sel">Select</th>
              <th>Cert No.</th>
              <th>Folio No.</th>
              <th className="cst-r">No. of Shares</th>
              <th className="cst-r">Issued Capital</th>
              <th className="cst-r">Paid-up Capital</th>
              <th className="cst-r">Per Share</th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => {
              const id = t.share_transaction_id;
              const checked = !excludedIds.includes(id);
              return (
                <tr key={id} className={checked ? '' : 'cst-row--off'} onClick={() => onToggle(id)}>
                  <td className="cst-sel">
                    <input type="checkbox" checked={checked} onChange={() => onToggle(id)} onClick={e => e.stopPropagation()} />
                  </td>
                  <td className="cst-cert">{t.share_cert_no || '—'}</td>
                  <td>{t.folio_no || '—'}</td>
                  <td className="cst-num">{fmtNum(t.no_of_shares)}</td>
                  <td className="cst-num">{fmt2(t.issued_share_capital)}</td>
                  <td className="cst-num">{fmt2(t.paidup_share_capital)}</td>
                  <td className="cst-num">{fmt4(t.per_share)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td colSpan={2}>Total Selected ({selected.length})</td>
              <td className="cst-num">{fmtNum(shares)}</td>
              <td className="cst-num">{fmt2(issued)}</td>
              <td className="cst-num">{fmt2(paidup)}</td>
              <td className="cst-num">{fmt4(wtdPS)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {selected.length < minSelected ? (
        <div className="cst-note cst-note--err">
          <i className="ri-error-warning-line" /> Select at least {minSelected} certificates.
        </div>
      ) : mixedPS && poolNote ? (
        <div className="cst-note">
          <i className="ri-information-line" /> Certificates have different per share values. They are pooled at a weighted per share of <strong>{fmt4(wtdPS)}</strong>, so company shares are updated.
        </div>
      ) : null}
    </div>
  );
};

export default ClubSourceTable;
