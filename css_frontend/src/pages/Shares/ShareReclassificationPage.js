'use strict';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'reactstrap';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import SharePageStrip from '../../Components/Common/SharePageStrip';
import {
  getCompany, getShareClassMasterList, createShareReclassification, checkShareFolioNo, checkReplacementCert,
} from '../../helpers/backend_helper';
import './ShareReclassificationPage.css';

const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareReclassificationPage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate      = useNavigate();
  const { state }     = useLocation();

  const txn   = state?.txn   || null;
  const share = state?.share || null;

  const [company,      setCompany]      = useState(state?.company || null);
  const [shareClasses, setShareClasses] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  // Header fields
  const [reclassNo,   setReclassNo]   = useState('');
  const [reclassDate, setReclassDate] = useState('');
  const [remarks,     setRemarks]     = useState('');

  // Target share class — share type stays the same
  const [newClassId, setNewClassId] = useState('');

  // New cert
  const [newCertNo, setNewCertNo] = useState('');
  const [folioNo,   setFolioNo]   = useState('');

  // Live folio duplicate check
  const [folioExists,   setFolioExists]   = useState(false);
  const [checkingFolio, setCheckingFolio] = useState(false);
  const folioTimer = useRef(null);

  // Live cert no. duplicate check — company-wide, the cert being reclassified excluded
  const [certExists,    setCertExists]    = useState(false);
  const [checkingCert,  setCheckingCert]  = useState(false);
  const certTimer = useRef(null);

  const isCertTaken = useCallback(async (certNo) => {
    const res = await checkReplacementCert({ entity_id, cert_no: certNo, source_txn_id: txn.share_transaction_id });
    return !!(res?.data?.exists ?? res?.exists);
  }, [entity_id, txn]);

  useEffect(() => {
    if (!txn) { navigate(-1); return; }
    Promise.allSettled([
      company ? Promise.resolve({ data: company }) : getCompany(entity_id),
      getShareClassMasterList({ page: 1, limit: 200 }),
    ]).then(([c, sc]) => {
      if (!company && c.status === 'fulfilled') setCompany(c.value?.data || c.value);
      if (sc.status === 'fulfilled') setShareClasses(sc.value?.data?.data || sc.value?.data || []);
    }).finally(() => setLoading(false));
  }, [entity_id, txn, navigate]); // eslint-disable-line

  useEffect(() => {
    clearTimeout(folioTimer.current);
    setFolioExists(false);
    if (!folioNo.trim()) return;
    folioTimer.current = setTimeout(async () => {
      setCheckingFolio(true);
      try {
        const res = await checkShareFolioNo({ entity_id, folio_no: folioNo.trim() });
        setFolioExists(!!(res?.data?.exists ?? res?.exists));
      } catch { setFolioExists(false); }
      finally { setCheckingFolio(false); }
    }, 500);
  }, [folioNo, entity_id]);

  useEffect(() => {
    clearTimeout(certTimer.current);
    setCertExists(false);
    if (!newCertNo.trim()) return;
    certTimer.current = setTimeout(async () => {
      setCheckingCert(true);
      try { setCertExists(await isCertTaken(newCertNo.trim())); }
      catch { setCertExists(false); }
      finally { setCheckingCert(false); }
    }, 500);
  }, [newCertNo, isCertTaken]);

  const curClassId = String(txn?.share_class_id ?? '');
  const curType    = txn?.share_type || 'NORMAL';
  const sameAsCurrent = String(newClassId) === curClassId;

  const handleSave = useCallback(async () => {
    if (!newClassId)       { toast.error('Choose the new share class'); return; }
    if (sameAsCurrent)     { toast.error('Choose a share class different from the current one'); return; }
    if (!reclassDate)      { toast.error('Date of transaction is required'); return; }
    if (!folioNo.trim())   { toast.error('Folio no. is required'); return; }
    if (folioExists)       { toast.error('Folio no. already exists'); return; }
    if (!newCertNo.trim()) { toast.error('New share cert no. is required'); return; }
    if (certExists)        { toast.error('Share Cert No already exists!'); return; }

    setSaving(true);
    try {
      await createShareReclassification({
        entity_id,
        source_txn_id:      txn.share_transaction_id,
        new_share_class_id: Number(newClassId),
        reclass_no:         reclassNo || undefined,
        reclass_date:       reclassDate,
        remarks:            remarks || undefined,
        new_cert_no:        newCertNo.trim(),
        new_folio_no:       folioNo.trim(),
      });
      toast.success('Reclassification saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to save reclassification');
    } finally {
      setSaving(false);
    }
  }, [txn, entity_id, newClassId, sameAsCurrent, reclassNo, reclassDate, remarks, newCertNo, certExists, folioNo, folioExists, navigate]);

  if (loading) return (
    <div className="page-content">
      <Container fluid>
        <div className="srcl-loading"><Spinner size="sm" /> Loading…</div>
      </Container>
    </div>
  );
  if (!txn) return null;

  const companyName = company?.name || '—';
  const currency    = share?.currency || txn?.currency || '—';
  const shareType   = SHARE_TYPE_LABELS[curType] || curType;
  const scType      = share?.share_class?.sc_type || txn?.share_class?.sc_type || null;
  const curClass    = shareClasses.find(c => String(c.sc_id) === curClassId);
  const newClass    = shareClasses.find(c => String(c.sc_id) === String(newClassId));

  const qty    = Number(txn.no_of_shares         || 0);
  const issued = Number(txn.issued_share_capital || 0);
  const paidup = Number(txn.paidup_share_capital || 0);
  const consid = Number(txn.cash || 0) + Number(txn.otherwise_cash || 0);

  const fromLabel = `${curClass?.sc_name || txn.share_class?.sc_name || 'Current class'} · ${SHARE_TYPE_LABELS[curType] || curType}`;
  const toLabel   = newClass ? `${newClass.sc_name} · ${SHARE_TYPE_LABELS[curType] || curType}` : null;

  return (
    <div className="page-content">
      <Container fluid>
        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel={`Reclassification · ${txn.share_cert_no || '—'}`}
          actionIcon="ri-exchange-line"
          actionVariant="cancel"
          onBack={() => navigate(-1)}
        />

        {/* ── Details card ── */}
        <div className="srcl-card">
          <div className="srcl-section-hdr"><i className="ri-exchange-line" /> Reclassification Details</div>
          <div className="srcl-grid">
            <div className="srcl-field">
              <label className="srcl-lbl">New Share Class <span className="srcl-req">*</span></label>
              <select className="srcl-input" value={newClassId} onChange={e => setNewClassId(e.target.value)}>
                <option value="">Choose…</option>
                {shareClasses.map(c => (
                  <option key={c.sc_id} value={c.sc_id} disabled={String(c.sc_id) === curClassId}>
                    {c.sc_name}{c.sc_type ? ` (${c.sc_type})` : ''}{String(c.sc_id) === curClassId ? ' — current' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="srcl-field">
              <label className="srcl-lbl">Share Type</label>
              <input className="srcl-input srcl-input--readonly" readOnly value={SHARE_TYPE_LABELS[curType] || curType} />
            </div>
            <div className="srcl-field">
              <label className="srcl-lbl">Date of Transaction <span className="srcl-req">*</span></label>
              <DatePickerInput value={reclassDate} onChange={e => setReclassDate(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="srcl-field">
              <label className="srcl-lbl">Reclassification No.</label>
              <input className="srcl-input" value={reclassNo} onChange={e => setReclassNo(e.target.value)} placeholder="e.g. RCL-001" />
            </div>
            <div className="srcl-field">
              <label className="srcl-lbl">New Share Cert No. <span className="srcl-req">*</span></label>
              <input className={`srcl-input${certExists ? ' srcl-input--err' : ''}`} value={newCertNo} onChange={e => setNewCertNo(e.target.value)} placeholder="e.g. P-001" />
              {checkingCert && <span className="srcl-hint">Checking…</span>}
              {certExists && <span className="srcl-err">Share Cert No already exists!</span>}
            </div>
            <div className="srcl-field">
              <label className="srcl-lbl">Folio No. <span className="srcl-req">*</span></label>
              <input className={`srcl-input${folioExists ? ' srcl-input--err' : ''}`} value={folioNo} onChange={e => setFolioNo(e.target.value)} placeholder="e.g. F-002" />
              {checkingFolio && <span className="srcl-hint">Checking…</span>}
              {folioExists && <span className="srcl-err">Folio No. already exists</span>}
            </div>
            <div className="srcl-field srcl-field--wide">
              <label className="srcl-lbl">Remarks</label>
              <input className="srcl-input" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
        </div>

        {/* ── Certificate being reclassified ── */}
        <div className="srcl-card">
          <div className="srcl-section-hdr srcl-section-hdr--src">
            <i className="ri-file-paper-2-line" /> Certificate
            <span className="srcl-holder-chip"><i className="ri-user-line" /> {txn.official_entity?.name || '—'}</span>
          </div>
          <div className="srcl-table-wrap">
            <table className="srcl-table">
              <thead>
                <tr>
                  <th>Current Cert No.</th>
                  <th>Folio No.</th>
                  <th className="srcl-r">No. of Shares</th>
                  <th className="srcl-r">Issued Capital</th>
                  <th className="srcl-r">Paid-up Capital</th>
                  <th className="srcl-r">Consideration Paid-up</th>
                  <th className="srcl-r">Per Share</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="srcl-cert">{txn.share_cert_no || '—'}</td>
                  <td>{txn.folio_no || '—'}</td>
                  <td className="srcl-num">{fmtNum(qty)}</td>
                  <td className="srcl-num">{fmt2(issued)}</td>
                  <td className="srcl-num">{fmt2(paidup)}</td>
                  <td className="srcl-num">{fmt2(consid || paidup)}</td>
                  <td className="srcl-num">{fmt4(txn.per_share)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={`srcl-note${toLabel && !sameAsCurrent ? '' : ' srcl-note--muted'}`}>
            <i className="ri-information-line" />
            {toLabel && !sameAsCurrent
              ? <> All {fmtNum(qty)} shares move from <strong>{fromLabel}</strong> to <strong>{toLabel}</strong> ({currency}, {fmt4(txn.per_share)} per share). Company shares are updated: {fromLabel} goes down and {toLabel} goes up by {fmtNum(qty)} shares.</>
              : <> Choose the new share class. The whole certificate is reclassified.</>}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="srcl-footer">
          <button className="srcl-btn-cancel" onClick={() => navigate(-1)} disabled={saving}>Cancel</button>
          <button
            className="srcl-btn-save"
            onClick={handleSave}
            disabled={saving || checkingFolio || folioExists || checkingCert || certExists || !newClassId || sameAsCurrent || !reclassDate || !folioNo.trim() || !newCertNo.trim()}
          >
            {saving ? <><Spinner size="sm" /> Saving…</> : <><i className="ri-save-line" /> Save Reclassification</>}
          </button>
        </div>

      </Container>
    </div>
  );
};

export default ShareReclassificationPage;
