'use strict';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'reactstrap';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import SharePageStrip from '../../Components/Common/SharePageStrip';
import { getCompany, createShareSplit } from '../../helpers/backend_helper';
import './ShareSplitPage.css';

const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtNum = (v, d = 2) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };

let rowSeq = 0;
const mkRow = () => ({ key: ++rowSeq, certNo: '', folioNo: '', shares: '', distFrom: '', distTo: '' });

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareSplitPage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate      = useNavigate();
  const { state }     = useLocation();

  // Single opens with one cert, "All" opens with every cert of the holder
  const txns  = useMemo(() => state?.txns || (state?.txn ? [state.txn] : []), [state]);
  const share = state?.share || null;
  const multi = txns.length > 1;

  const [company, setCompany] = useState(state?.company || null);
  const [loading, setLoading] = useState(!state?.company);
  const [saving,  setSaving]  = useState(false);

  // Header fields
  const [splitNo,   setSplitNo]   = useState('');
  const [splitDate, setSplitDate] = useState('');
  const [remarks,   setRemarks]   = useState('');

  // separate: exactly one source cert  ·  club: two or more pooled at a weighted per share
  const [splitMode,   setSplitMode]   = useState(multi ? 'club' : 'separate');
  const [selectedIds, setSelectedIds] = useState(() => txns.map(t => t.share_transaction_id));

  // New cert rows — a split needs at least two
  const [rows, setRows] = useState(() => [mkRow(), mkRow()]);

  useEffect(() => {
    if (!txns.length) { navigate(-1); return; }
    if (company) { setLoading(false); return; }
    getCompany(entity_id)
      .then(r => setCompany(r?.data || r))
      .finally(() => setLoading(false));
  }, [entity_id, txns, navigate]);

  const isClub  = splitMode === 'club';
  const sources = useMemo(
    () => txns.filter(t => selectedIds.includes(t.share_transaction_id)),
    [txns, selectedIds]
  );

  const srcShares = sources.reduce((s, t) => s + Number(t.no_of_shares         || 0), 0);
  const srcIssued = sources.reduce((s, t) => s + Number(t.issued_share_capital || 0), 0);
  const srcPaidup = sources.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const issuedPS  = srcShares > 0 ? srcIssued / srcShares : 0;
  const paidPS    = srcShares > 0 ? srcPaidup / srcShares : 0;
  const newPS     = isClub ? paidPS : Number(sources[0]?.per_share || 0);
  const mixedPS   = new Set(sources.map(t => Number(t.per_share || 0).toFixed(8))).size > 1;

  const allocated = useMemo(() => rows.reduce((s, r) => s + (Number(r.shares) || 0), 0), [rows]);
  const remaining = srcShares - allocated;
  const balanced  = srcShares > 0 && Math.abs(remaining) < 0.0001;
  const srcOk     = isClub ? sources.length >= 2 : sources.length === 1;

  // Duplicate cert nos within the form
  const dupCertKeys = useMemo(() => {
    const seen = {};
    const dups = new Set();
    for (const r of rows) {
      const k = r.certNo.trim().toLowerCase();
      if (!k) continue;
      if (seen[k]) { dups.add(seen[k]); dups.add(r.key); } else seen[k] = r.key;
    }
    return dups;
  }, [rows]);

  const changeMode = (mode) => {
    setSplitMode(mode);
    // Separate keeps only the first selected cert; club starts with all of them
    setSelectedIds(mode === 'separate'
      ? [selectedIds[0] ?? txns[0].share_transaction_id]
      : txns.map(t => t.share_transaction_id));
  };

  const toggleSource = (id) => {
    if (!isClub) { setSelectedIds([id]); return; }
    setSelectedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  };

  const updateRow = (key, field, value) =>
    setRows(rs => rs.map(r => (r.key === key ? { ...r, [field]: value } : r)));
  const addRow    = () => setRows(rs => [...rs, mkRow()]);
  const removeRow = (key) => setRows(rs => (rs.length > 2 ? rs.filter(r => r.key !== key) : rs));

  // Put whatever is still unallocated into this row
  const fillRemaining = (key) => setRows(rs => {
    const others = rs.filter(r => r.key !== key).reduce((s, r) => s + (Number(r.shares) || 0), 0);
    const rest   = srcShares - others;
    return rs.map(r => (r.key === key ? { ...r, shares: rest > 0 ? String(rest) : '' } : r));
  });

  const handleSave = useCallback(async () => {
    if (!splitDate) { toast.error('Date of transaction is required'); return; }
    if (!srcOk) { toast.error(isClub ? 'Select at least two certificates for a club split' : 'Select one certificate to split'); return; }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.certNo.trim())        { toast.error(`Cert #${i + 1}: new cert no. is required`); return; }
      if (!(Number(r.shares) > 0)) { toast.error(`Cert ${r.certNo.trim()}: no. of shares is required`); return; }
    }
    if (dupCertKeys.size) { toast.error('Each new cert no. must be unique'); return; }
    if (!balanced) { toast.error(`New certs must total ${fmtNum(srcShares, 0)} shares`); return; }

    setSaving(true);
    try {
      await createShareSplit({
        entity_id,
        source_txn_ids: sources.map(t => t.share_transaction_id),
        split_mode:     splitMode,
        split_no:       splitNo || undefined,
        split_date:     splitDate,
        remarks:        remarks || undefined,
        splits:         rows.map(r => ({
          cert_no:          r.certNo.trim(),
          folio_no:         r.folioNo.trim() || undefined,
          no_of_shares:     Number(r.shares),
          distinctive_from: r.distFrom.trim() || undefined,
          distinctive_to:   r.distTo.trim()   || undefined,
        })),
      });
      toast.success(isClub ? 'Club split saved successfully' : 'Split saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to save split');
    } finally {
      setSaving(false);
    }
  }, [entity_id, splitNo, splitDate, remarks, splitMode, isClub, sources, srcOk, rows, dupCertKeys, balanced, srcShares, navigate]);

  if (loading) return (
    <div className="page-content">
      <Container fluid>
        <div className="ssp-loading"><Spinner size="sm" /> Loading…</div>
      </Container>
    </div>
  );
  if (!txns.length) return null;

  const firstTxn    = txns[0];
  const companyName = company?.name || '—';
  const _rawST      = share?.share_type || firstTxn?.share_type || '';
  const currency    = share?.currency   || firstTxn?.currency   || '—';
  const shareType   = SHARE_TYPE_LABELS[_rawST] || _rawST || '—';
  const scType      = share?.share_class?.sc_type || firstTxn?.share_class?.sc_type || null;
  const folioHint   = sources[0]?.folio_no || firstTxn?.folio_no || '';
  const certHint    = sources[0]?.share_cert_no || 's';

  const allFilled = rows.every(r => r.certNo.trim() && Number(r.shares) > 0);

  return (
    <div className="page-content">
      <Container fluid>
        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel={isClub
            ? `Club Split · ${sources.length} cert${sources.length !== 1 ? 's' : ''}`
            : `Split Share Cert · ${sources[0]?.share_cert_no || '—'}`}
          actionIcon="ri-git-branch-line"
          actionVariant="cancel"
          onBack={() => navigate(-1)}
        />

        {/* ── Details card ── */}
        <div className="ssp-details-card">
          <div className="ssp-details-row">
            <div className="ssp-field-group">
              <label className="ssp-lbl">Transaction No.</label>
              <input className="ssp-input" value={splitNo} onChange={e => setSplitNo(e.target.value)} placeholder="e.g. SPL-001" />
            </div>
            <div className="ssp-field-group">
              <label className="ssp-lbl">Date of Transaction <span className="ssp-req">*</span></label>
              <DatePickerInput value={splitDate} onChange={e => setSplitDate(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="ssp-field-group ssp-field-group--remarks">
              <label className="ssp-lbl">Remarks</label>
              <input className="ssp-input" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes" />
            </div>
            {multi && (
              <div className="ssp-field-group">
                <label className="ssp-lbl">Split Mode</label>
                <div className="ssp-mode-pills">
                  <button type="button" className={`ssp-mode-pill${!isClub ? ' ssp-mode-pill--active' : ''}`} onClick={() => changeMode('separate')}>
                    Separate
                  </button>
                  <button type="button" className={`ssp-mode-pill${isClub ? ' ssp-mode-pill--active' : ''}`} onClick={() => changeMode('club')}>
                    Club Split
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Current certificates ── */}
        <div className="ssp-card">
          <div className="ssp-section-hdr ssp-section-hdr--src">
            <i className="ri-file-paper-2-line" /> Current Share Certificates
            <span className="ssp-holder-chip"><i className="ri-user-line" /> {firstTxn.official_entity?.name || '—'}</span>
          </div>
          <div className="ssp-table-wrap">
            <table className="ssp-table ssp-table--src">
              <thead>
                <tr>
                  {multi && <th className="ssp-sel-col">Select</th>}
                  <th>Cert No.</th>
                  <th>Folio No.</th>
                  <th className="th-right">No. of Shares</th>
                  <th className="th-right">Issued Capital</th>
                  <th className="th-right">Paid-up Capital</th>
                  <th className="th-right">Per Share</th>
                </tr>
              </thead>
              <tbody>
                {txns.map(t => {
                  const checked = selectedIds.includes(t.share_transaction_id);
                  return (
                    <tr key={t.share_transaction_id} className={multi && !checked ? 'ssp-src-row--off' : ''} onClick={multi ? () => toggleSource(t.share_transaction_id) : undefined}>
                      {multi && (
                        <td className="ssp-sel-col">
                          <input
                            type={isClub ? 'checkbox' : 'radio'}
                            name="ssp-src"
                            checked={checked}
                            onChange={() => toggleSource(t.share_transaction_id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                      )}
                      <td className="ssp-src-cert">{t.share_cert_no || '—'}</td>
                      <td>{t.folio_no || '—'}</td>
                      <td className="ssp-num">{fmtNum(t.no_of_shares, 0)}</td>
                      <td className="ssp-num">{fmt2(t.issued_share_capital)}</td>
                      <td className="ssp-num">{fmt2(t.paidup_share_capital)}</td>
                      <td className="ssp-num">{fmt4(t.per_share)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  {multi && <td />}
                  <td colSpan={2} className="ssp-total-lbl">Total Selected ({sources.length})</td>
                  <td className="ssp-num">{fmtNum(srcShares, 0)}</td>
                  <td className="ssp-num">{fmt2(srcIssued)}</td>
                  <td className="ssp-num">{fmt2(srcPaidup)}</td>
                  <td className="ssp-num">{fmt4(newPS)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {isClub && sources.length >= 2 && (
            <div className="ssp-note ssp-note--club">
              <i className="ri-information-line" />
              {mixedPS
                ? <> Certificates have different per share values. They are pooled at a weighted per share of <strong>{fmt4(newPS)}</strong>, so company shares are updated.</>
                : <> Certificates are pooled into one new company share entry at <strong>{fmt4(newPS)}</strong> per share.</>}
            </div>
          )}
          {isClub && sources.length < 2 && (
            <div className="ssp-note ssp-note--err"><i className="ri-error-warning-line" /> Select at least two certificates for a club split.</div>
          )}
        </div>

        {/* ── New certificates ── */}
        <div className="ssp-card">
          <div className="ssp-section-hdr">
            <i className="ri-git-branch-line" /> New Certificates ({rows.length})
          </div>

          <div className="ssp-table-wrap">
            <table className="ssp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>New Cert No. <span className="ssp-req">*</span></th>
                  <th>Folio No.</th>
                  <th>No. of Shares <span className="ssp-req">*</span></th>
                  <th className="th-right">Issued Capital</th>
                  <th className="th-right">Paid-up Capital</th>
                  <th className="th-right">Per Share</th>
                  <th>Distinctive From</th>
                  <th>Distinctive To</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const qty = Number(r.shares) || 0;
                  const isDup = dupCertKeys.has(r.key);
                  return (
                    <tr key={r.key}>
                      <td className="ssp-idx">{i + 1}</td>
                      <td>
                        <input
                          className={`ssp-input${isDup ? ' ssp-input--err' : ''}`}
                          value={r.certNo}
                          onChange={e => updateRow(r.key, 'certNo', e.target.value)}
                          placeholder={`e.g. ${certHint}-${i + 1}`}
                        />
                        {isDup && <span className="ssp-row-err">Duplicate cert no.</span>}
                      </td>
                      <td>
                        <input className="ssp-input" value={r.folioNo} onChange={e => updateRow(r.key, 'folioNo', e.target.value)} placeholder={folioHint} />
                      </td>
                      <td>
                        <div className="ssp-qty-wrap">
                          <input
                            className="ssp-input ssp-input--num"
                            type="number"
                            min="0"
                            value={r.shares}
                            onChange={e => updateRow(r.key, 'shares', e.target.value)}
                            placeholder="0"
                          />
                          {remaining > 0 && !qty && (
                            <button type="button" className="ssp-fill-btn" onClick={() => fillRemaining(r.key)} title="Use remaining shares">
                              {fmtNum(remaining, 0)}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="ssp-num">{fmt2(qty * issuedPS)}</td>
                      <td className="ssp-num">{fmt2(qty * paidPS)}</td>
                      <td className="ssp-num">{fmt4(newPS)}</td>
                      <td>
                        <input className="ssp-input ssp-input--dist" value={r.distFrom} onChange={e => updateRow(r.key, 'distFrom', e.target.value)} placeholder="e.g. 1" />
                      </td>
                      <td>
                        <input className="ssp-input ssp-input--dist" value={r.distTo} onChange={e => updateRow(r.key, 'distTo', e.target.value)} placeholder="e.g. 100" />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ssp-remove-btn"
                          onClick={() => removeRow(r.key)}
                          disabled={rows.length <= 2}
                          title={rows.length <= 2 ? 'A split needs at least two certificates' : 'Remove'}
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="button" className="ssp-add-btn" onClick={addRow}>
            <i className="ri-add-line" /> Add Certificate
          </button>

          <div className={`ssp-balance${balanced ? ' ssp-balance--ok' : remaining < 0 ? ' ssp-balance--err' : ''}`}>
            {balanced ? (
              <><i className="ri-checkbox-circle-line" /> All {fmtNum(srcShares, 0)} shares allocated.{isClub ? ' Company shares are updated for the club split.' : ' Company shares are not affected.'}</>
            ) : remaining > 0 ? (
              <><i className="ri-information-line" /> {fmtNum(remaining, 0)} of {fmtNum(srcShares, 0)} shares still to allocate</>
            ) : (
              <><i className="ri-error-warning-line" /> Over-allocated by {fmtNum(-remaining, 0)} shares</>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="ssp-footer">
          <div className="ssp-footer-summary">
            <span className="ssp-sum-chip">
              <i className="ri-file-paper-2-line" /> Splitting: {sources.map(t => t.share_cert_no || '—').join(', ') || '—'} ({fmtNum(srcShares, 0)} shares)
            </span>
            <span className={`ssp-sum-chip${balanced ? ' ssp-sum-chip--ok' : ''}`}>
              <i className="ri-git-branch-line" /> {fmtNum(allocated, 0)} into {rows.length} certs
            </span>
          </div>
          <div className="ssp-footer-actions">
            <button className="ssp-btn-cancel" onClick={() => navigate(-1)} disabled={saving}>Cancel</button>
            <button className="ssp-btn-save" onClick={handleSave} disabled={saving || !splitDate || !srcOk || !balanced || !allFilled || dupCertKeys.size > 0}>
              {saving ? <><Spinner size="sm" /> Saving…</> : <><i className="ri-save-line" /> {isClub ? 'Save Club Split' : 'Save Split'}</>}
            </button>
          </div>
        </div>

      </Container>
    </div>
  );
};

export default ShareSplitPage;
