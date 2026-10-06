'use strict';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'reactstrap';
import ShareConsiderationModal from '../../Components/Common/ShareConsiderationModal';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import SharePageStrip from '../../Components/Common/SharePageStrip';
import ClubSourceTable from '../../Components/Common/ClubSourceTable';
import { getCompany, createShareCancel } from '../../helpers/backend_helper';
import './ShareCancelPage.css';

const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };
const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

// Factory for per-cert cancel state
const mkCancelRow = (txn) => ({
  id:           `cr-${txn.share_transaction_id}`,
  txn,
  cancelShares: '',
  // consideration for the REMAINING (new) cert
  remCash:         null,   // null = unset (defaults to remPaidup in display)
  remOC:           0,
  remNoConsid:     false,
  showRemModal:    false,
  newCertNo:       '',
  newFolioNo:      txn.folio_no || '',
});

// ── Club Cancel Panel ─────────────────────────────────────────────────────────
const ClubCancelPanel = ({
  sourceTxns, allTxns, excludedIds, onToggleSource, holderName,
  cancelShares, onChangeCancelShares,
  newCertNo, onChangeCertNo,
  remCash, remOC, remNoConsid,
  showModal, onShowModal, onSaveModal,
}) => {
  const totalShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
  const totalPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const perShare    = totalShares > 0 ? totalPaidup / totalShares : 0;

  const cancelQty    = Number(cancelShares) || 0;
  const balQty       = totalShares - cancelQty;
  const isOver       = cancelQty > totalShares;
  const isFull       = cancelQty > 0 && cancelQty >= totalShares;
  const cancelIssued = cancelQty * perShare;
  const cancelPaid   = cancelQty * perShare;
  const balIssued    = balQty * perShare;
  const balPaid      = balQty * perShare;

  const remIsUnset = !remNoConsid && (remCash === null || (Number(remCash||0) === 0 && Number(remOC||0) === 0));
  const remConsid  = remNoConsid ? 0 : (remIsUnset ? balPaid : Number(remCash||0) + Number(remOC||0));
  const remIsPaid  = !remNoConsid && balPaid > 0 && remConsid >= balPaid;
  const initCash   = remIsUnset ? balPaid : Number(remCash||0);

  return (
    <>
    <ClubSourceTable txns={allTxns} excludedIds={excludedIds} onToggle={onToggleSource} holderName={holderName} />
    <div className="scp-club-card">
      {/* Cancel inputs */}
      <div className="scp-section-hdr scp-section-hdr--cancel">
        <i className="ri-scissors-cut-line" /> Cancelled Portion
      </div>
      <div className="scp-cancel-fields">
        <div className="scp-field-group">
          <label className="scp-lbl">Shares to Cancel <span className="scp-req">*</span></label>
          <div className="scp-shares-input-wrap">
            <input
              className={`scp-input scp-input--num${isOver ? ' scp-input--err' : ''}`}
              type="number" min="0" max={totalShares} step="1"
              value={cancelShares}
              onChange={e => onChangeCancelShares(e.target.value)}
              placeholder="0"
            />
            <span className="scp-shares-of">/ {fmtNum(totalShares, 0)}</span>
          </div>
          {isOver && <span className="scp-err-msg">Exceeds pool ({fmtNum(totalShares, 0)})</span>}
        </div>
        <div className="scp-field-group">
          <label className="scp-lbl">Per Share (wtd avg)</label>
          <input className="scp-input scp-input--readonly" readOnly value={fmt2(perShare)} />
        </div>
        <div className="scp-field-group">
          <label className="scp-lbl">Issued Capital</label>
          <input className="scp-input scp-input--readonly" readOnly value={fmt2(cancelIssued)} />
        </div>
        <div className="scp-field-group">
          <label className="scp-lbl">Paid-up Capital</label>
          <input className="scp-input scp-input--readonly" readOnly value={fmt2(cancelPaid)} />
        </div>
      </div>

      {/* Status bar */}
      <div className={`scp-status-bar${isFull ? ' scp-status-bar--full' : !isOver && cancelQty > 0 ? ' scp-status-bar--partial' : ''}`}>
        {cancelQty === 0
          ? <><i className="ri-information-line" /> Enter shares to cancel above</>
          : isFull
            ? <><i className="ri-checkbox-circle-line" /> Full club cancellation — all {fmtNum(totalShares, 0)} shares cancelled</>
            : isOver
              ? <><i className="ri-error-warning-line" /> Over by {fmtNum(cancelQty - totalShares, 0)} shares</>
              : <><i className="ri-file-list-3-line" /> Partial — {fmtNum(balQty, 0)} shares remain → new cert required</>
        }
      </div>

      {/* Balance cert (partial only) */}
      {!isFull && balQty > 0 && cancelQty > 0 && (
        <div className="scp-remaining-section">
          <div className="scp-section-hdr scp-section-hdr--remain">
            <i className="ri-file-add-line" /> Balance Cert ({fmtNum(balQty, 0)} shares)
          </div>
          <div className="scp-cancel-fields">
            <div className="scp-field-group">
              <label className="scp-lbl">Balance Shares</label>
              <input className="scp-input scp-input--readonly" readOnly value={fmtNum(balQty, 0)} />
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">Per Share</label>
              <input className="scp-input scp-input--readonly" readOnly value={fmt2(perShare)} />
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">Issued Capital</label>
              <input className="scp-input scp-input--readonly" readOnly value={fmt2(balIssued)} />
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">Paid-up Capital</label>
              <input className="scp-input scp-input--readonly" readOnly value={fmt2(balPaid)} />
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">Consideration Paid</label>
              <button
                className={`scp-consid-btn${remNoConsid ? ' scp-consid-btn--no' : remIsPaid ? ' scp-consid-btn--ok' : remConsid > 0 ? ' scp-consid-btn--set' : ''}`}
                onClick={onShowModal}
              >
                <i className="ri-copper-coin-line" />
                {remNoConsid ? 'No Consideration' : <>{fmt2(remConsid)} / {fmt2(balPaid)} <i className="ri-pencil-line" /></>}
              </button>
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">New Cert No. <span className="scp-req">*</span></label>
              <input
                className="scp-input"
                value={newCertNo}
                onChange={e => onChangeCertNo(e.target.value)}
                placeholder="e.g. C001-R"
              />
            </div>
          </div>
        </div>
      )}

      {/* Consideration modal */}
      {showModal && (
        <ShareConsiderationModal
          open={showModal}
          onClose={() => onSaveModal(null)}
          partyLabel="Balance Cert"
          srcCash={0} srcOC={0} allocCash={0} allocOC={0}
          initialCash={initCash}
          initialOC={remOC || 0}
          initialNoConsid={remNoConsid}
          showNoConsidCheckbox={true}
          onSave={({ cash, oc, noConsideration }) => onSaveModal({ cash, oc, noConsideration })}
        />
      )}
    </div>
    </>
  );
};

// ── Cancel Row Block ──────────────────────────────────────────────────────────
const CancelRowBlock = ({ row, onUpdate }) => {
  const upd = (changes) => onUpdate(row.id, changes);
  const txn = row.txn;

  const srcShares = Number(txn.no_of_shares        || 0);
  const srcPS     = Number(txn.per_share            || 0);
  const srcIssued = Number(txn.issued_share_capital || 0);
  const srcPaidup = Number(txn.paidup_share_capital || 0);
  const srcCash   = Number(txn.cash                 || 0);
  const srcOC     = Number(txn.otherwise_cash       || 0);

  const cancelQty = Number(row.cancelShares) || 0;
  const remQty    = srcShares - cancelQty;
  const isFull    = cancelQty >= srcShares;
  const isOver    = cancelQty > srcShares;

  // Cancelled portion
  const cancelIssued = cancelQty * srcPS;
  const cancelPaidup = cancelQty * srcPS;

  // Remaining cert
  const remIssued  = remQty * srcPS;
  const remPaidup  = remQty * srcPS;
  // treat null OR 0+0 (never opened modal) as "unset" → default to fully paid
  const remIsUnset  = !row.remNoConsid && (row.remCash === null || (Number(row.remCash || 0) === 0 && Number(row.remOC || 0) === 0));
  const remConsid   = row.remNoConsid ? 0 : (remIsUnset ? remPaidup : Number(row.remCash || 0) + Number(row.remOC || 0));
  const remIsPaid   = !row.remNoConsid && remPaidup > 0 && remConsid >= remPaidup;

  const initRemCash = remIsUnset ? remPaidup : Number(row.remCash || 0);
  const initRemOC   = row.remOC;

  return (
    <div className={`scp-cert-row${isOver ? ' scp-cert-row--over' : ''}`}>

      {/* ── LEFT: Source cert info ── */}
      <div className="scp-src-panel">
        {/* Cert badge */}
        <div className="scp-src-badge">
          <i className="ri-file-paper-2-line" />
          <div className="scp-src-badge-info">
            <span className="scp-src-cert">Cert: {txn.share_cert_no || '—'}</span>
            {txn.folio_no && <span className="scp-src-folio">Folio: {txn.folio_no}</span>}
          </div>
        </div>
        {/* Shareholder */}
        <div className="scp-src-holder">
          <i className="ri-user-line" />
          <span className="scp-src-holder-name">{txn.official_entity?.name || '—'}</span>
        </div>
        {/* Stats */}
        <div className="scp-src-stats">
          <div className="scp-src-stat">
            <span className="scp-src-stat-lbl">No. of Shares</span>
            <span className="scp-src-stat-val">{fmtNum(srcShares, 0)}</span>
          </div>
          <div className="scp-src-stat">
            <span className="scp-src-stat-lbl">Per Share</span>
            <span className="scp-src-stat-val">{fmt2(srcPS)}</span>
          </div>
          <div className="scp-src-stat">
            <span className="scp-src-stat-lbl">Issued Capital</span>
            <span className="scp-src-stat-val">{fmt2(srcIssued)}</span>
          </div>
          <div className="scp-src-stat">
            <span className="scp-src-stat-lbl">Paid-up Capital</span>
            <span className="scp-src-stat-val">{fmt2(srcPaidup)}</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Cancellation inputs ── */}
      <div className="scp-cancel-panel">

        {/* ── Cancelled portion ── */}
        <div className="scp-section-hdr scp-section-hdr--cancel">
          <i className="ri-scissors-cut-line" /> Cancelled Portion
        </div>

        <div className="scp-cancel-fields">
          <div className="scp-field-group">
            <label className="scp-lbl">Shares to Cancel <span className="scp-req">*</span></label>
            <div className="scp-shares-input-wrap">
              <input
                className={`scp-input scp-input--num${isOver ? ' scp-input--err' : ''}`}
                type="number" min="0" max={srcShares} step="1"
                value={row.cancelShares}
                onChange={e => upd({ cancelShares: e.target.value })}
                placeholder="0"
              />
              <span className="scp-shares-of">/ {fmtNum(srcShares, 0)}</span>
            </div>
            {isOver && <span className="scp-err-msg">Exceeds source ({fmtNum(srcShares, 0)})</span>}
          </div>

          <div className="scp-field-group">
            <label className="scp-lbl">Issued Capital</label>
            <input className="scp-input scp-input--readonly" readOnly value={fmt2(cancelIssued)} />
          </div>

          <div className="scp-field-group">
            <label className="scp-lbl">Per Share</label>
            <input className="scp-input scp-input--readonly" readOnly value={fmt2(srcPS)} />
          </div>

          <div className="scp-field-group">
            <label className="scp-lbl">Consideration Paid</label>
            <input className="scp-input scp-input--readonly" readOnly value={fmt2(cancelPaidup)} />
          </div>
        </div>

        {/* ── Status bar ── */}
        <div className={`scp-status-bar${isFull ? ' scp-status-bar--full' : remQty > 0 && cancelQty > 0 ? ' scp-status-bar--partial' : ''}`}>
          {cancelQty === 0
            ? <><i className="ri-information-line" /> Enter shares to cancel above</>
            : isFull
              ? <><i className="ri-checkbox-circle-line" /> Full cancellation — all {fmtNum(srcShares, 0)} shares will be cancelled</>
              : isOver
                ? <><i className="ri-error-warning-line" /> Over-cancel by {fmtNum(cancelQty - srcShares, 0)} shares</>
                : <><i className="ri-file-list-3-line" /> Partial — {fmtNum(remQty, 0)} shares remain → new cert required</>
          }
        </div>

        {/* ── Remaining cert (only when partial) ── */}
        {!isFull && remQty > 0 && cancelQty > 0 && (
          <div className="scp-remaining-section">
            <div className="scp-section-hdr scp-section-hdr--remain">
              <i className="ri-file-add-line" /> Remaining Cert ({fmtNum(remQty, 0)} shares)
            </div>

            <div className="scp-cancel-fields">
              <div className="scp-field-group">
                <label className="scp-lbl">New Shares</label>
                <input className="scp-input scp-input--readonly" readOnly value={fmtNum(remQty, 0)} />
              </div>
              <div className="scp-field-group">
                <label className="scp-lbl">Issued Capital</label>
                <input className="scp-input scp-input--readonly" readOnly value={fmt2(remIssued)} />
              </div>
              <div className="scp-field-group">
                <label className="scp-lbl">Per Share</label>
                <input className="scp-input scp-input--readonly" readOnly value={fmt2(srcPS)} />
              </div>
              <div className="scp-field-group">
                <label className="scp-lbl">Consideration Paid</label>
                <button
                  className={`scp-consid-btn${row.remNoConsid ? ' scp-consid-btn--no' : remIsPaid ? ' scp-consid-btn--ok' : remConsid > 0 ? ' scp-consid-btn--set' : ''}`}
                  onClick={() => upd({ showRemModal: true })}
                >
                  <i className="ri-copper-coin-line" />
                  {row.remNoConsid
                    ? 'No Consideration'
                    : <>{fmt2(remConsid)} / {fmt2(remPaidup)} <i className="ri-pencil-line" /></>
                  }
                </button>
              </div>
              <div className="scp-field-group">
                <label className="scp-lbl">New Cert No. <span className="scp-req">*</span></label>
                <input
                  className="scp-input"
                  value={row.newCertNo}
                  onChange={e => upd({ newCertNo: e.target.value })}
                  placeholder="e.g. C001-R"
                />
              </div>
              <div className="scp-field-group">
                <label className="scp-lbl">Folio No.</label>
                <input
                  className="scp-input scp-input--readonly"
                  readOnly
                  value={row.newFolioNo || '—'}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Consideration modal — remaining cert ── */}
        {row.showRemModal && (
          <ShareConsiderationModal
            open={row.showRemModal}
            onClose={() => upd({ showRemModal: false })}
            partyLabel="Remaining Cert"
            srcCash={srcCash}
            srcOC={srcOC}
            allocCash={0}
            allocOC={0}
            initialCash={row.remCash !== null ? row.remCash : initRemCash}
            initialOC={row.remOC     || initRemOC}
            initialNoConsid={row.remNoConsid}
            showNoConsidCheckbox={true}
            onSave={({ cash, oc, noConsideration }) =>
              upd({ remCash: cash, remOC: oc, remNoConsid: noConsideration, showRemModal: false })
            }
          />
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareCancelPage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate       = useNavigate();
  const { state }      = useLocation();

  const allTxns = state?.txns || (state?.txn ? [state.txn] : []);

  const [company, setCompany] = useState(state?.company || null);
  const [share]               = useState(state?.share   || null);
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState(false);

  const [cancelNo,          setCancelNo]          = useState('');
  const [cancelDate,        setCancelDate]        = useState('');
  const [remarks,           setRemarks]           = useState('');

  const [cancelRows, setCancelRows] = useState(() => allTxns.map(mkCancelRow));

  // Cancel mode: 'separate' (one card per cert) | 'club' (pooled)
  const [cancelMode, setCancelMode] = useState('separate');

  // Club: certs the user unticked in the source table — left out of the pool
  const [clubExcluded, setClubExcluded] = useState([]);
  const toggleClubSource = useCallback((id) =>
    setClubExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]), []);
  const sourceTxns = cancelMode === 'club'
    ? allTxns.filter(t => !clubExcluded.includes(t.share_transaction_id))
    : allTxns;

  // Club cancel state
  const [clubCancelShares, setClubCancelShares] = useState('');
  const [clubNewCertNo,    setClubNewCertNo]    = useState('');
  const [clubRemCash,      setClubRemCash]      = useState(null);
  const [clubRemOC,        setClubRemOC]        = useState(0);
  const [clubRemNoConsid,  setClubRemNoConsid]  = useState(false);
  const [clubShowModal,    setClubShowModal]    = useState(false);

  const updateRow = useCallback((rowId, changes) =>
    setCancelRows(prev => prev.map(r => r.id === rowId ? { ...r, ...changes } : r)), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!company) {
        const res = await getCompany(entity_id);
        setCompany(res?.data || res || null);
      }
    } catch { toast.error('Failed to load company'); }
    finally   { setLoading(false); }
  }, [entity_id]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const companyName = company?.name || '—';
  const firstTxn    = allTxns[0];
  const currency    = share?.currency || firstTxn?.company_share?.currency || '—';
  const shareType   = SHARE_TYPE_LABELS[share?.share_type || firstTxn?.share_type] || '—';
  const scType      = share?.share_class?.sc_type || firstTxn?.share_class?.sc_type || '';
  const holderName  = firstTxn?.official_entity?.name || '—';

  const totalSrcShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
  const totalCancel    = cancelRows.reduce((s, r) => s + (Number(r.cancelShares) || 0), 0);

  // Club computed
  const clubTotalPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const clubPerShare    = totalSrcShares > 0 ? clubTotalPaidup / totalSrcShares : 0;
  const clubCancelQty   = Number(clubCancelShares) || 0;
  const clubBalQty      = totalSrcShares - clubCancelQty;
  const clubBalPaidup   = clubBalQty * clubPerShare;
  const clubRemIsUnset  = !clubRemNoConsid && (clubRemCash === null || (Number(clubRemCash||0) === 0 && Number(clubRemOC||0) === 0));

  const handleSave = async () => {
    if (!cancelDate) { toast.error('Cancel date is required'); return; }

    setSaving(true);
    try {
      if (cancelMode === 'club') {
        if (sourceTxns.length < 2) { toast.error('Select at least 2 certificates for a club cancel'); setSaving(false); return; }
        if (!clubCancelQty || clubCancelQty <= 0) { toast.error('Shares to cancel is required'); setSaving(false); return; }
        if (clubCancelQty > totalSrcShares) { toast.error(`Cannot cancel more than ${totalSrcShares} shares`); setSaving(false); return; }
        if (clubBalQty > 0 && !clubNewCertNo.trim()) { toast.error('New cert no. is required when shares remain'); setSaving(false); return; }

        const clubRemCashVal = clubRemNoConsid ? 0 : (clubRemIsUnset ? clubBalPaidup : Number(clubRemCash||0));
        const clubRemOCVal   = clubRemNoConsid ? 0 : Number(clubRemOC||0);

        await createShareCancel({
          entity_id,
          cancel_no:              cancelNo || null,
          cancel_date:            cancelDate,
          remarks:                remarks.trim() || null,
          affects_company_shares: 1,
          cancel_mode:            'club',
          items:                  sourceTxns.map(t => ({ source_txn_id: t.share_transaction_id })),
          club_cancel_shares:     clubCancelQty,
          club_new_cert_no:       clubBalQty > 0 ? clubNewCertNo.trim() : null,
          club_new_folio_no:      sourceTxns[0]?.folio_no || null,
          club_rem_cash:          clubRemCashVal,
          club_rem_oc:            clubRemOCVal,
          club_rem_no_consideration: clubRemNoConsid ? 1 : 0,
        });
      } else {
        // ── Separate mode validation ──
        for (let i = 0; i < cancelRows.length; i++) {
          const r = cancelRows[i];
          const srcQ = Number(r.txn.no_of_shares || 0);
          const canQ = Number(r.cancelShares) || 0;

          if (!canQ || canQ <= 0) {
            toast.error(`Cert ${r.txn.share_cert_no || i + 1}: Shares to cancel is required`);
            setSaving(false); return;
          }
          if (canQ > srcQ) {
            toast.error(`Cert ${r.txn.share_cert_no || i + 1}: Cannot cancel more than ${srcQ} shares`);
            setSaving(false); return;
          }
          if (canQ < srcQ && !r.newCertNo.trim()) {
            toast.error(`Cert ${r.txn.share_cert_no || i + 1}: New cert no. is required for partial cancellation`);
            setSaving(false); return;
          }
        }

        const items = cancelRows.map(r => {
          const srcPS  = Number(r.txn.per_share || 0);
          const canQty = Number(r.cancelShares) || 0;
          const remQty = Number(r.txn.no_of_shares || 0) - canQty;
          return {
            source_txn_id:          r.txn.share_transaction_id,
            no_of_shares_cancelled: canQty,
            per_share:              srcPS,
            ...(remQty > 0 ? {
              new_cert_no:          r.newCertNo.trim(),
              new_folio_no:         r.newFolioNo.trim() || null,
              rem_cash:             r.remNoConsid ? 0 : (r.remCash === null || (Number(r.remCash||0) === 0 && Number(r.remOC||0) === 0) ? remQty * srcPS : Number(r.remCash||0)),
              rem_oc:               r.remNoConsid ? 0 : Number(r.remOC || 0),
              rem_no_consideration: r.remNoConsid ? 1 : 0,
            } : {}),
          };
        });

        await createShareCancel({
          entity_id,
          cancel_no:              cancelNo || null,
          cancel_date:            cancelDate,
          remarks:                remarks.trim() || null,
          affects_company_shares: 0,
          cancel_mode:            'separate',
          items,
        });
      }

      toast.success('Share cancellation saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : err?.message || 'Failed to save cancellation');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content">
        <Container fluid>
          <div className="scp-loading"><Spinner /> Loading…</div>
        </Container>
      </div>
    );
  }

  if (!allTxns.length) {
    return (
      <div className="page-content">
        <Container fluid>
          <div className="scp-loading">No source certificates provided.</div>
        </Container>
      </div>
    );
  }

  return (
    <div className="page-content">
      <Container fluid>

        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel={`Cancel · ${allTxns.length} cert${allTxns.length !== 1 ? 's' : ''}`}
          actionIcon="ri-scissors-cut-line"
          actionVariant="cancel"
          onBack={() => navigate(-1)}
        />

        {/* ── Cancel details ── */}
        <div className="scp-details-card">
          <div className="scp-details-row">
            <div className="scp-field-group">
              <label className="scp-lbl">Cancellation No.</label>
              <input
                className="scp-input"
                value={cancelNo}
                onChange={e => setCancelNo(e.target.value)}
                placeholder="e.g. CAN001"
              />
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">Cancellation Date <span className="scp-req">*</span></label>
              <DatePickerInput value={cancelDate} onChange={e => setCancelDate(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="scp-field-group scp-field-group--remarks">
              <label className="scp-lbl">Remarks</label>
              <input
                className="scp-input"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <div className="scp-field-group">
              <label className="scp-lbl">Cancel Mode</label>
              <div className="scp-mode-pills">
                <button type="button"
                  className={`scp-mode-pill${cancelMode === 'separate' ? ' scp-mode-pill--active' : ''}`}
                  onClick={() => setCancelMode('separate')}
                >
                  Separate
                </button>
                <button type="button"
                  className={`scp-mode-pill${cancelMode === 'club' ? ' scp-mode-pill--active' : ''}`}
                  onClick={() => setCancelMode('club')}
                >
                  Club Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Cert rows / Club panel ── */}
        {cancelMode === 'club' ? (
          <ClubCancelPanel
            sourceTxns={sourceTxns}
            allTxns={allTxns}
            excludedIds={clubExcluded}
            onToggleSource={toggleClubSource}
            holderName={holderName}
            cancelShares={clubCancelShares}
            onChangeCancelShares={setClubCancelShares}
            newCertNo={clubNewCertNo}
            onChangeCertNo={setClubNewCertNo}
            remCash={clubRemCash}
            remOC={clubRemOC}
            remNoConsid={clubRemNoConsid}
            showModal={clubShowModal}
            onShowModal={() => setClubShowModal(true)}
            onSaveModal={result => {
              if (result) { setClubRemCash(result.cash); setClubRemOC(result.oc); setClubRemNoConsid(result.noConsideration); }
              setClubShowModal(false);
            }}
          />
        ) : (
          <div className="scp-cert-list">
            {cancelRows.map(row => (
              <CancelRowBlock key={row.id} row={row} onUpdate={updateRow} />
            ))}
          </div>
        )}

        {/* ── Summary + Save ── */}
        <div className="scp-footer">
          <div className="scp-footer-summary">
            {cancelMode === 'club' ? (
              <>
                <span className="scp-sum-chip">
                  <i className="ri-scissors-cut-line" /> {fmtNum(clubCancelQty, 0)} of {fmtNum(totalSrcShares, 0)} cancelled ({sourceTxns.length} cert{sourceTxns.length !== 1 ? 's' : ''})
                </span>
                {clubBalQty > 0 && (
                  <span className="scp-sum-chip scp-sum-chip--remain">
                    <i className="ri-file-list-3-line" /> {fmtNum(clubBalQty, 0)} balance
                  </span>
                )}
                <span className="scp-sum-chip" style={{ background: '#eef2ff', color: '#405189', borderColor: '#c7d0f5' }}>
                  <i className="ri-shuffle-line" /> Club Cancel
                </span>
              </>
            ) : (
              <>
                <span className="scp-sum-chip">
                  <i className="ri-scissors-cut-line" /> {fmtNum(totalCancel, 0)} of {fmtNum(totalSrcShares, 0)} shares cancelled
                </span>
                <span className="scp-sum-chip scp-sum-chip--remain">
                  <i className="ri-file-list-3-line" /> {fmtNum(totalSrcShares - totalCancel, 0)} remaining
                </span>
              </>
            )}
          </div>
          <div className="scp-footer-actions">
            <button className="scp-btn-cancel" onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </button>
            <button className="scp-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving…</> : <><i className="ri-save-line" /> Save Cancellation</>}
            </button>
          </div>
        </div>

      </Container>
    </div>
  );
};

export default ShareCancelPage;
