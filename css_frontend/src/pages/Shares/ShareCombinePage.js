'use strict';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'reactstrap';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import SharePageStrip from '../../Components/Common/SharePageStrip';
import ClubSourceTable from '../../Components/Common/ClubSourceTable';
import { getCompany, createShareCombine } from '../../helpers/backend_helper';
import './ShareCombinePage.css';

const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareCombinePage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate      = useNavigate();
  const { state }     = useLocation();

  const allTxns = useMemo(() => state?.txns || [], [state]);
  const share   = state?.share || null;

  const [company, setCompany] = useState(state?.company || null);
  const [loading, setLoading] = useState(!state?.company);
  const [saving,  setSaving]  = useState(false);

  // Header fields
  const [combineNo,   setCombineNo]   = useState('');
  const [combineDate, setCombineDate] = useState('');
  const [remarks,     setRemarks]     = useState('');

  // Combined cert fields
  const [newCertNo,  setNewCertNo]  = useState('');
  const [newFolioNo, setNewFolioNo] = useState('');
  const [distFrom,   setDistFrom]   = useState('');
  const [distTo,     setDistTo]     = useState('');

  // Certs the user unticked — left out of the combine
  const [excluded, setExcluded] = useState([]);
  const toggleSource = useCallback((id) =>
    setExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]), []);

  useEffect(() => {
    if (!allTxns.length) { navigate(-1); return; }
    if (company) { setLoading(false); return; }
    getCompany(entity_id)
      .then(r => setCompany(r?.data || r))
      .finally(() => setLoading(false));
  }, [entity_id, allTxns, navigate]);

  const sources  = allTxns.filter(t => !excluded.includes(t.share_transaction_id));
  const qty      = sources.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
  const enough   = sources.length >= 2;

  // Per share is never changed: one line of the new cert per company share pool (= per share)
  const lines = useMemo(() => {
    const byPool = {};
    const out = [];
    for (const t of sources) {
      const k = String(t.company_share_id);
      if (!byPool[k]) { byPool[k] = { perShare: Number(t.per_share || 0), certs: [], qty: 0, issued: 0, paidup: 0 }; out.push(byPool[k]); }
      const l = byPool[k];
      l.certs.push(t.share_cert_no || '—');
      l.qty    += Number(t.no_of_shares         || 0);
      l.issued += Number(t.issued_share_capital || 0);
      l.paidup += Number(t.paidup_share_capital || 0);
    }
    return out;
  }, [sources]);

  const handleSave = useCallback(async () => {
    if (!combineDate)      { toast.error('Date of transaction is required'); return; }
    if (!enough)           { toast.error('Select at least 2 certificates to combine'); return; }
    if (!newCertNo.trim()) { toast.error('Combined new cert no. is required'); return; }

    setSaving(true);
    try {
      await createShareCombine({
        entity_id,
        source_txn_ids:   sources.map(t => t.share_transaction_id),
        combine_no:       combineNo || undefined,
        combine_date:     combineDate,
        remarks:          remarks || undefined,
        new_cert_no:      newCertNo.trim(),
        new_folio_no:     newFolioNo.trim() || undefined,
        distinctive_from: distFrom.trim() || undefined,
        distinctive_to:   distTo.trim()   || undefined,
      });
      toast.success('Combine saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to save combine');
    } finally {
      setSaving(false);
    }
  }, [entity_id, combineNo, combineDate, remarks, newCertNo, newFolioNo, distFrom, distTo, sources, enough, navigate]);

  if (loading) return (
    <div className="page-content">
      <Container fluid>
        <div className="scb-loading"><Spinner size="sm" /> Loading…</div>
      </Container>
    </div>
  );
  if (!allTxns.length) return null;

  const firstTxn    = allTxns[0];
  const companyName = company?.name || '—';
  const _rawST      = share?.share_type || firstTxn?.share_type || '';
  const currency    = share?.currency   || firstTxn?.currency   || '—';
  const shareType   = SHARE_TYPE_LABELS[_rawST] || _rawST || '—';
  const scType      = share?.share_class?.sc_type || firstTxn?.share_class?.sc_type || null;

  return (
    <div className="page-content">
      <Container fluid>
        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel={`Combine · ${sources.length} cert${sources.length !== 1 ? 's' : ''}`}
          actionIcon="ri-merge-cells-horizontal"
          actionVariant="cancel"
          onBack={() => navigate(-1)}
        />

        {/* ── Details card ── */}
        <div className="scb-details-card">
          <div className="scb-details-row">
            <div className="scb-field-group">
              <label className="scb-lbl">Combine No.</label>
              <input className="scb-input" value={combineNo} onChange={e => setCombineNo(e.target.value)} placeholder="e.g. COM-001" />
            </div>
            <div className="scb-field-group">
              <label className="scb-lbl">Date of Transaction <span className="scb-req">*</span></label>
              <DatePickerInput value={combineDate} onChange={e => setCombineDate(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="scb-field-group scb-field-group--remarks">
              <label className="scb-lbl">Remarks</label>
              <input className="scb-input" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
        </div>

        {/* ── Certs to combine ── */}
        <ClubSourceTable
          txns={allTxns}
          excludedIds={excluded}
          onToggle={toggleSource}
          holderName={firstTxn.official_entity?.name}
          poolNote={false}
        />

        {/* ── Combined cert ── */}
        <div className="scb-card">
          <div className="scb-section-hdr">
            <i className="ri-merge-cells-horizontal" /> Combined Certificate
          </div>
          <div className="scb-fields">
            <div className="scb-field-group">
              <label className="scb-lbl">Combine New Share Cert <span className="scb-req">*</span></label>
              <input className="scb-input" value={newCertNo} onChange={e => setNewCertNo(e.target.value)} placeholder={`e.g. ${firstTxn.share_cert_no || 's'}-C`} />
            </div>
            <div className="scb-field-group">
              <label className="scb-lbl">Folio No.</label>
              <input className="scb-input" value={newFolioNo} onChange={e => setNewFolioNo(e.target.value)} placeholder={firstTxn.folio_no || ''} />
            </div>
            <div className="scb-field-group">
              <label className="scb-lbl">Distinctive From</label>
              <input className="scb-input" value={distFrom} onChange={e => setDistFrom(e.target.value)} placeholder="e.g. 1" />
            </div>
            <div className="scb-field-group">
              <label className="scb-lbl">Distinctive To</label>
              <input className="scb-input" value={distTo} onChange={e => setDistTo(e.target.value)} placeholder="e.g. 100" />
            </div>
          </div>
          {enough && (
            <>
              <div className="scb-table-wrap">
                <table className="scb-table">
                  <thead>
                    <tr>
                      <th>Cert No.</th>
                      <th>From Certs</th>
                      <th className="scb-r">No. of Shares</th>
                      <th className="scb-r">Issued Capital</th>
                      <th className="scb-r">Paid-up Capital</th>
                      <th className="scb-r">Per Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.perShare + '-' + l.certs.join()}>
                        <td className="scb-cert">{newCertNo.trim() || '—'}</td>
                        <td>{l.certs.join(' + ')}</td>
                        <td className="scb-num">{fmtNum(l.qty)}</td>
                        <td className="scb-num">{fmt2(l.issued)}</td>
                        <td className="scb-num">{fmt2(l.paidup)}</td>
                        <td className="scb-num">{fmt4(l.perShare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="scb-note scb-note--ok">
                <i className="ri-checkbox-circle-line" />
                {lines.length > 1
                  ? ` Per share values are kept as they are, so the new cert has ${lines.length} lines (one per per share). Company shares are not affected.`
                  : ' Company shares are not affected.'}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="scb-footer">
          <div className="scb-footer-summary">
            <span className="scb-sum-chip">
              <i className="ri-file-paper-2-line" /> Combining: {sources.map(t => t.share_cert_no || '—').join(' + ') || '—'}
            </span>
            {enough && (
              <span className="scb-sum-chip scb-sum-chip--ok">
                <i className="ri-merge-cells-horizontal" /> {fmtNum(qty)} shares into {newCertNo.trim() || 'new cert'}
              </span>
            )}
          </div>
          <div className="scb-footer-actions">
            <button className="scb-btn-cancel" onClick={() => navigate(-1)} disabled={saving}>Cancel</button>
            <button className="scb-btn-save" onClick={handleSave} disabled={saving || !combineDate || !enough || !newCertNo.trim()}>
              {saving ? <><Spinner size="sm" /> Saving…</> : <><i className="ri-save-line" /> Save Combine</>}
            </button>
          </div>
        </div>

      </Container>
    </div>
  );
};

export default ShareCombinePage;
