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
import { getCompany, createShareBuyback } from '../../helpers/backend_helper';
import './ShareBuybackPage.css';

const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };
const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

const mkBuybackRow = (txn) => ({
  id:              `bb-${txn.share_transaction_id}`,
  txn,
  boughtShares:    '',
  newCertNo:       '',
  newFolioNo:      '',
  distinctiveFrom: '',
  distinctiveTo:   '',
  remCash:         null,
  remOC:           0,
  remNoConsid:     false,
  showModal:       false,
});

// ── Club Buyback Panel ────────────────────────────────────────────────────────
const ClubBuybackPanel = ({
  sourceTxns, allTxns, excludedIds, onToggleSource, holderName,
  buybackShares, onChangeBuybackShares,
  newCertNo, onChangeCertNo,
  newFolioNo, onChangeFolioNo,
  remCash, remOC, remNoConsid,
  showModal, onShowModal, onSaveModal,
}) => {
  const totalShares = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
  const totalPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const perShare    = totalShares > 0 ? totalPaidup / totalShares : 0;

  const buyQty   = Number(buybackShares) || 0;
  const balQty   = totalShares - buyQty;
  const isOver   = buyQty > totalShares;
  const isFull   = buyQty > 0 && buyQty >= totalShares;
  const balPaidup = balQty * perShare;

  const remIsUnset = !remNoConsid && (remCash === null || (Number(remCash || 0) === 0 && Number(remOC || 0) === 0));
  const remConsid  = remNoConsid ? 0 : (remIsUnset ? balPaidup : Number(remCash || 0) + Number(remOC || 0));
  const remIsPaid  = !remNoConsid && balPaidup > 0 && remConsid >= balPaidup;

  return (
    <>
    <ClubSourceTable txns={allTxns} excludedIds={excludedIds} onToggle={onToggleSource} holderName={holderName} />
    <div className="sbp-club-card">
      <div className="sbp-section-hdr sbp-section-hdr--buy">
        <i className="ri-hand-coin-line" /> Buy Back Portion
      </div>
      <div className="sbp-cancel-fields">
        <div className="sbp-field-group">
          <label className="sbp-lbl">Shares Purchased <span className="sbp-req">*</span></label>
          <div className="sbp-shares-input-wrap">
            <input
              className={`sbp-input sbp-input--num${isOver ? ' sbp-input--err' : ''}`}
              type="number" min="0" max={totalShares} step="1"
              value={buybackShares}
              onChange={e => onChangeBuybackShares(e.target.value)}
              placeholder="0"
            />
            <span className="sbp-shares-of">/ {fmtNum(totalShares, 0)}</span>
          </div>
          {isOver && <span className="sbp-err-msg">Exceeds pool ({fmtNum(totalShares, 0)})</span>}
        </div>
        <div className="sbp-field-group">
          <label className="sbp-lbl">Issued Capital</label>
          <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(buyQty * perShare)} />
        </div>
        <div className="sbp-field-group">
          <label className="sbp-lbl">Per Share (wtd avg)</label>
          <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(perShare)} />
        </div>
        <div className="sbp-field-group">
          <label className="sbp-lbl">Paid-up Capital</label>
          <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(buyQty * perShare)} />
        </div>
      </div>

      <div className={`sbp-status-bar${isFull ? ' sbp-status-bar--full' : !isOver && buyQty > 0 ? ' sbp-status-bar--partial' : ''}`}>
        {buyQty === 0
          ? <><i className="ri-information-line" /> Enter shares to buy back above</>
          : isFull
            ? <><i className="ri-checkbox-circle-line" /> Full club buyback — all {fmtNum(totalShares, 0)} shares purchased</>
            : isOver
              ? <><i className="ri-error-warning-line" /> Over by {fmtNum(buyQty - totalShares, 0)} shares</>
              : <><i className="ri-file-list-3-line" /> Partial — {fmtNum(balQty, 0)} shares remain → new cert required</>
        }
      </div>

      {!isFull && balQty > 0 && buyQty > 0 && (
        <div className="sbp-remaining-section">
          <div className="sbp-section-hdr sbp-section-hdr--remain">
            <i className="ri-file-add-line" /> Balance Cert ({fmtNum(balQty, 0)} shares)
          </div>
          <div className="sbp-cancel-fields">
            <div className="sbp-field-group">
              <label className="sbp-lbl">Balance Shares</label>
              <input className="sbp-input sbp-input--readonly" readOnly value={fmtNum(balQty, 0)} />
            </div>
            <div className="sbp-field-group">
              <label className="sbp-lbl">Issued Capital</label>
              <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(balQty * perShare)} />
            </div>
            <div className="sbp-field-group">
              <label className="sbp-lbl">Per Share</label>
              <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(perShare)} />
            </div>
            <div className="sbp-field-group">
              <label className="sbp-lbl">Consideration Paid</label>
              <button
                type="button"
                className={`sbp-consid-btn${remNoConsid ? ' sbp-consid-btn--no' : remIsPaid ? ' sbp-consid-btn--ok' : remConsid > 0 ? ' sbp-consid-btn--set' : ''}`}
                onClick={onShowModal}
              >
                <i className="ri-copper-coin-line" />
                {remNoConsid ? 'No Consideration' : <>{fmt2(remConsid)} / {fmt2(balPaidup)} <i className="ri-pencil-line" /></>}
              </button>
            </div>
            <div className="sbp-field-group">
              <label className="sbp-lbl">New Cert No. <span className="sbp-req">*</span></label>
              <input className="sbp-input" value={newCertNo} onChange={e => onChangeCertNo(e.target.value)} placeholder="e.g. BB-R001" />
            </div>
            <div className="sbp-field-group">
              <label className="sbp-lbl">New Folio No.</label>
              <input className="sbp-input" value={newFolioNo} onChange={e => onChangeFolioNo(e.target.value)} placeholder={sourceTxns[0]?.folio_no || ''} />
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <ShareConsiderationModal
          open={showModal}
          onClose={() => onSaveModal(null)}
          partyLabel="Balance Cert"
          srcCash={0} srcOC={0} allocCash={0} allocOC={0}
          initialCash={remIsUnset ? balPaidup : Number(remCash || 0)}
          initialOC={remOC}
          initialNoConsid={remNoConsid}
          showNoConsidCheckbox={true}
          onSave={({ cash, oc, noConsideration }) => onSaveModal({ cash, oc, noConsideration })}
        />
      )}
    </div>
    </>
  );
};

// ── Per-cert buyback row block ────────────────────────────────────────────────
const BuybackRowBlock = ({ row, onChange }) => {
  const { txn } = row;
  const srcShares  = Number(txn.no_of_shares || 0);
  const srcPS      = Number(txn.per_share    || 0);
  const srcIssued  = Number(txn.issued_share_capital || 0);
  const srcPaidup  = Number(txn.paidup_share_capital || 0);

  const boughtQty = Number(row.boughtShares) || 0;
  const remQty    = srcShares - boughtQty;
  const isOver    = boughtQty > srcShares;
  const isFull    = boughtQty > 0 && boughtQty >= srcShares;

  const remPaidup  = remQty * srcPS;
  const remIsUnset = !row.remNoConsid && (row.remCash === null || (Number(row.remCash || 0) === 0 && Number(row.remOC || 0) === 0));
  const remConsid  = row.remNoConsid ? 0 : (remIsUnset ? remPaidup : Number(row.remCash || 0) + Number(row.remOC || 0));
  const remIsPaid  = !row.remNoConsid && remPaidup > 0 && remConsid >= remPaidup;
  const initCash   = remIsUnset ? remPaidup : Number(row.remCash || 0);

  return (
    <div className={`sbp-cert-row${isOver ? ' sbp-cert-row--over' : ''}`}>

      {/* ── LEFT: Source cert info ── */}
      <div className="sbp-src-panel">
        <div className="sbp-src-badge">
          <i className="ri-file-paper-2-line" />
          <div className="sbp-src-badge-info">
            <span className="sbp-src-cert">Cert: {txn.share_cert_no || '—'}</span>
            {txn.folio_no && <span className="sbp-src-folio">Folio: {txn.folio_no}</span>}
          </div>
        </div>
        <div className="sbp-src-holder">
          <i className="ri-user-line" />
          <span className="sbp-src-holder-name">{txn.official_entity?.name || '—'}</span>
        </div>
        <div className="sbp-src-stats">
          <div className="sbp-src-stat"><span className="sbp-src-stat-lbl">No. of Shares</span><span className="sbp-src-stat-val">{fmtNum(srcShares, 0)}</span></div>
          <div className="sbp-src-stat"><span className="sbp-src-stat-lbl">Per Share</span><span className="sbp-src-stat-val">{fmt2(srcPS)}</span></div>
          <div className="sbp-src-stat"><span className="sbp-src-stat-lbl">Issued Capital</span><span className="sbp-src-stat-val">{fmt2(srcIssued)}</span></div>
          <div className="sbp-src-stat"><span className="sbp-src-stat-lbl">Paid-up Capital</span><span className="sbp-src-stat-val">{fmt2(srcPaidup)}</span></div>
          {txn.distinctive_no_from && <div className="sbp-src-stat"><span className="sbp-src-stat-lbl">Dist. From</span><span className="sbp-src-stat-val">{txn.distinctive_no_from}</span></div>}
          {txn.distinctive_no_to   && <div className="sbp-src-stat"><span className="sbp-src-stat-lbl">Dist. To</span><span className="sbp-src-stat-val">{txn.distinctive_no_to}</span></div>}
        </div>
      </div>

      {/* ── RIGHT: Buy back inputs ── */}
      <div className="sbp-buy-panel">

        <div className="sbp-section-hdr sbp-section-hdr--buy">
          <i className="ri-hand-coin-line" /> Buy Back Portion
        </div>

        <div className="sbp-cancel-fields">
          <div className="sbp-field-group">
            <label className="sbp-lbl">Shares Purchased <span className="sbp-req">*</span></label>
            <div className="sbp-shares-input-wrap">
              <input
                className={`sbp-input sbp-input--num${isOver ? ' sbp-input--err' : ''}`}
                type="number" min="0" max={srcShares}
                value={row.boughtShares}
                onChange={e => onChange({ boughtShares: e.target.value })}
                placeholder="0"
              />
              <span className="sbp-shares-of">/ {fmtNum(srcShares, 0)}</span>
            </div>
            {isOver && <span className="sbp-err-msg">Exceeds source ({fmtNum(srcShares, 0)})</span>}
          </div>
          <div className="sbp-field-group">
            <label className="sbp-lbl">Issued Capital</label>
            <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(boughtQty * srcPS)} />
          </div>
          <div className="sbp-field-group">
            <label className="sbp-lbl">Per Share</label>
            <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(srcPS)} />
          </div>
          <div className="sbp-field-group">
            <label className="sbp-lbl">Distinctive No. From</label>
            <input className="sbp-input" value={row.distinctiveFrom} onChange={e => onChange({ distinctiveFrom: e.target.value })} placeholder="e.g. 1" />
          </div>
          <div className="sbp-field-group">
            <label className="sbp-lbl">Distinctive No. To</label>
            <input className="sbp-input" value={row.distinctiveTo} onChange={e => onChange({ distinctiveTo: e.target.value })} placeholder="e.g. 100" />
          </div>
        </div>

        <div className={`sbp-status-bar${isFull ? ' sbp-status-bar--full' : remQty > 0 && boughtQty > 0 ? ' sbp-status-bar--partial' : ''}`}>
          {boughtQty === 0
            ? <><i className="ri-information-line" /> Enter shares to buy back above</>
            : isFull
              ? <><i className="ri-checkbox-circle-line" /> Full buyback — all {fmtNum(srcShares, 0)} shares purchased</>
              : isOver
                ? <><i className="ri-error-warning-line" /> Over-buy by {fmtNum(boughtQty - srcShares, 0)} shares</>
                : <><i className="ri-file-list-3-line" /> Partial — {fmtNum(remQty, 0)} shares remain → new cert required</>
          }
        </div>

        {!isFull && remQty > 0 && boughtQty > 0 && (
          <div className="sbp-remaining-section">
            <div className="sbp-section-hdr sbp-section-hdr--remain">
              <i className="ri-file-add-line" /> Remaining Cert ({fmtNum(remQty, 0)} shares)
            </div>
            <div className="sbp-cancel-fields">
              <div className="sbp-field-group">
                <label className="sbp-lbl">New Shares</label>
                <input className="sbp-input sbp-input--readonly" readOnly value={fmtNum(remQty, 0)} />
              </div>
              <div className="sbp-field-group">
                <label className="sbp-lbl">Issued Capital</label>
                <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(remQty * srcPS)} />
              </div>
              <div className="sbp-field-group">
                <label className="sbp-lbl">Per Share</label>
                <input className="sbp-input sbp-input--readonly" readOnly value={fmt2(srcPS)} />
              </div>
              <div className="sbp-field-group">
                <label className="sbp-lbl">Consideration Paid</label>
                <button
                  type="button"
                  className={`sbp-consid-btn${row.remNoConsid ? ' sbp-consid-btn--no' : remIsPaid ? ' sbp-consid-btn--ok' : remConsid > 0 ? ' sbp-consid-btn--set' : ''}`}
                  onClick={() => onChange({ showModal: true })}
                >
                  <i className="ri-copper-coin-line" />
                  {row.remNoConsid ? 'No Consideration' : <>{fmt2(remConsid)} / {fmt2(remPaidup)} <i className="ri-pencil-line" /></>}
                </button>
              </div>
              <div className="sbp-field-group">
                <label className="sbp-lbl">New Cert No. <span className="sbp-req">*</span></label>
                <input className="sbp-input" value={row.newCertNo} onChange={e => onChange({ newCertNo: e.target.value })} placeholder="e.g. BB-R001" />
              </div>
              <div className="sbp-field-group">
                <label className="sbp-lbl">Folio No.</label>
                <input className="sbp-input sbp-input--readonly" readOnly value={row.newFolioNo || txn.folio_no || '—'} />
              </div>
            </div>
          </div>
        )}

        {row.showModal && (
          <ShareConsiderationModal
            open={row.showModal}
            onClose={() => onChange({ showModal: false })}
            partyLabel="Remaining Cert"
            srcCash={0} srcOC={0} allocCash={0} allocOC={0}
            initialCash={initCash}
            initialOC={row.remOC}
            initialNoConsid={row.remNoConsid}
            showNoConsidCheckbox={true}
            onSave={({ cash, oc, noConsideration }) =>
              onChange({ remCash: cash, remOC: oc, remNoConsid: noConsideration, showModal: false })}
          />
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareBuybackPage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate      = useNavigate();
  const { state }     = useLocation();

  const allTxns = state?.txns || (state?.txn ? [state.txn] : []);

  const [company, setCompany] = useState(state?.company || null);
  const [share]               = useState(state?.share   || null);
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState(false);

  // Header fields
  const [buybackMode, setBuybackMode] = useState('separate');
  const [buybackNo,   setBuybackNo]   = useState('');
  const [buybackDate, setBuybackDate] = useState('');
  const [remarks,     setRemarks]     = useState('');
  const [isTreasury,  setIsTreasury]  = useState(false);

  // Stamp duty
  const [stampDuty,       setStampDuty]       = useState('NO');
  const [stampDutyDate,   setStampDutyDate]   = useState('');
  const [stampDutyAmount, setStampDutyAmount] = useState('');

  // Club mode state
  const [clubBuybackShares, setClubBuybackShares] = useState('');
  const [clubNewCertNo,     setClubNewCertNo]     = useState('');
  const [clubNewFolioNo,    setClubNewFolioNo]    = useState('');
  const [clubRemCash,       setClubRemCash]       = useState(null);
  const [clubRemOC,         setClubRemOC]         = useState(0);
  const [clubRemNoConsid,   setClubRemNoConsid]   = useState(false);
  const [clubShowModal,     setClubShowModal]     = useState(false);

  const [bbRows, setBbRows] = useState(() => allTxns.map(mkBuybackRow));

  // Club: certs the user unticked in the source table — left out of the pool
  const [clubExcluded, setClubExcluded] = useState([]);
  const toggleClubSource = useCallback((id) =>
    setClubExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]), []);
  const sourceTxns = buybackMode === 'club'
    ? allTxns.filter(t => !clubExcluded.includes(t.share_transaction_id))
    : allTxns;

  const updateRow = useCallback((rowId, changes) =>
    setBbRows(prev => prev.map(r => r.id === rowId ? { ...r, ...changes } : r)), []);

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
  const holderName  = firstTxn?.official_entity?.name || '—';
  const currency    = share?.currency || firstTxn?.company_share?.currency || '—';
  const shareType   = SHARE_TYPE_LABELS[share?.share_type || firstTxn?.share_type] || '—';
  const scType      = share?.share_class?.sc_type || firstTxn?.share_class?.sc_type || '';

  const totalSrcShares  = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
  const clubTotalPaidup = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const clubPS          = totalSrcShares > 0 ? clubTotalPaidup / totalSrcShares : 0;
  const clubBuyQty      = Number(clubBuybackShares) || 0;
  const clubBalQty      = totalSrcShares - clubBuyQty;
  const clubBalPaidup   = clubBalQty * clubPS;
  const clubRemIsUnset  = !clubRemNoConsid && (clubRemCash === null || (Number(clubRemCash || 0) === 0 && Number(clubRemOC || 0) === 0));

  const totalBought = buybackMode === 'club'
    ? clubBuyQty
    : bbRows.reduce((s, r) => s + (Number(r.boughtShares) || 0), 0);

  const handleSave = async () => {
    if (!buybackDate) { toast.error('Buyback date is required'); return; }

    setSaving(true);
    try {
      const stampBase = {
        stamp_duty:        stampDuty === 'YES' ? 1 : 0,
        stamp_duty_date:   stampDuty === 'YES' ? stampDutyDate   || null : null,
        stamp_duty_amount: stampDuty === 'YES' ? stampDutyAmount || null : null,
      };

      if (buybackMode === 'club') {
        if (sourceTxns.length < 2) { toast.error('Select at least 2 certificates for a club buy back'); setSaving(false); return; }
        if (!clubBuyQty || clubBuyQty <= 0) { toast.error('Shares to buy back is required'); setSaving(false); return; }
        if (clubBuyQty > totalSrcShares)    { toast.error(`Cannot buy back more than ${totalSrcShares} shares`); setSaving(false); return; }
        if (clubBalQty > 0 && !clubNewCertNo.trim()) { toast.error('New cert no. is required when shares remain'); setSaving(false); return; }

        const remCashVal = clubRemNoConsid ? 0 : (clubRemIsUnset ? clubBalPaidup : Number(clubRemCash || 0));
        const remOCVal   = clubRemNoConsid ? 0 : Number(clubRemOC || 0);

        await createShareBuyback({
          entity_id,
          buyback_no:               buybackNo || null,
          buyback_date:             buybackDate,
          remarks:                  remarks.trim() || null,
          buyback_mode:             'club',
          is_treasury:              0,
          ...stampBase,
          items:                    sourceTxns.map(t => ({ source_txn_id: t.share_transaction_id })),
          club_buyback_shares:      clubBuyQty,
          club_new_cert_no:         clubBalQty > 0 ? clubNewCertNo.trim() : null,
          club_new_folio_no:        clubNewFolioNo.trim() || sourceTxns[0]?.folio_no || null,
          club_rem_cash:            remCashVal,
          club_rem_oc:              remOCVal,
          club_rem_no_consideration: clubRemNoConsid ? 1 : 0,
        });
      } else {
        for (let i = 0; i < bbRows.length; i++) {
          const r    = bbRows[i];
          const srcQ = Number(r.txn.no_of_shares || 0);
          const buyQ = Number(r.boughtShares) || 0;
          if (!buyQ || buyQ <= 0) { toast.error(`Cert ${r.txn.share_cert_no || i + 1}: Shares to buy back is required`); setSaving(false); return; }
          if (buyQ > srcQ)        { toast.error(`Cert ${r.txn.share_cert_no || i + 1}: Cannot buy back more than ${srcQ} shares`); setSaving(false); return; }
          if (srcQ - buyQ > 0 && !r.newCertNo.trim()) { toast.error(`Cert ${r.txn.share_cert_no || i + 1}: New cert no. is required for partial buyback`); setSaving(false); return; }
        }

        const items = bbRows.map(r => {
          const srcPS  = Number(r.txn.per_share || 0);
          const buyQty = Number(r.boughtShares) || 0;
          const remQty = Number(r.txn.no_of_shares || 0) - buyQty;
          const remPup = remQty * srcPS;
          return {
            source_txn_id:        r.txn.share_transaction_id,
            no_of_shares_bought:  buyQty,
            per_share:            srcPS,
            distinctive_from:     r.distinctiveFrom || null,
            distinctive_to:       r.distinctiveTo   || null,
            ...(remQty > 0 ? {
              new_cert_no:          r.newCertNo.trim(),
              new_folio_no:         r.newFolioNo.trim() || null,
              rem_cash:             r.remNoConsid ? 0 : (r.remCash === null || (Number(r.remCash || 0) === 0 && Number(r.remOC || 0) === 0) ? remPup : Number(r.remCash || 0)),
              rem_oc:               r.remNoConsid ? 0 : Number(r.remOC || 0),
              rem_no_consideration: r.remNoConsid ? 1 : 0,
            } : {}),
          };
        });

        await createShareBuyback({
          entity_id,
          buyback_no:   buybackNo  || null,
          buyback_date: buybackDate,
          remarks:      remarks.trim() || null,
          buyback_mode: 'separate',
          is_treasury:  isTreasury ? 1 : 0,
          ...stampBase,
          items,
        });
      }

      toast.success('Share buyback saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : err?.message || 'Failed to save buyback');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="page-content"><Container fluid>
      <div className="sbp-loading"><Spinner /> Loading…</div>
    </Container></div>
  );

  if (!allTxns.length) return (
    <div className="page-content"><Container fluid>
      <div className="sbp-loading">No source certificates provided.</div>
    </Container></div>
  );

  return (
    <div className="page-content">
      <Container fluid>

        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel={`Buy Back · ${allTxns.length} cert${allTxns.length !== 1 ? 's' : ''}`}
          actionIcon="ri-hand-coin-line"
          actionVariant="cancel"
          onBack={() => navigate(-1)}
        />

        {/* ── Header details card (matches cancel page pattern) ── */}
        <div className="sbp-details-card">
          <div className="sbp-details-row">
            <div className="sbp-field-group">
              <label className="sbp-lbl">Transaction No.</label>
              <input className="sbp-input" value={buybackNo} onChange={e => setBuybackNo(e.target.value)} placeholder="e.g. BB001" />
            </div>
            <div className="sbp-field-group">
              <label className="sbp-lbl">Date of Transaction <span className="sbp-req">*</span></label>
              <DatePickerInput value={buybackDate} onChange={e => setBuybackDate(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="sbp-field-group sbp-field-group--remarks">
              <label className="sbp-lbl">Remarks</label>
              <input className="sbp-input" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes" />
            </div>
            {buybackMode !== 'club' && (
              <div className="sbp-field-group">
                <label className="sbp-lbl">Treasury Shares</label>
                <label className="sbp-toggle">
                  <input type="checkbox" checked={isTreasury} onChange={e => setIsTreasury(e.target.checked)} />
                  <span className="sbp-toggle-track"><span className="sbp-toggle-thumb" /></span>
                  <span className="sbp-toggle-lbl">{isTreasury ? 'Treasury' : 'Cancelled from pool'}</span>
                </label>
              </div>
            )}
            <div className="sbp-field-group">
              <label className="sbp-lbl">Buy Back Mode</label>
              <div className="sbp-mode-pills">
                <button type="button"
                  className={`sbp-mode-pill${buybackMode === 'separate' ? ' sbp-mode-pill--active' : ''}`}
                  onClick={() => setBuybackMode('separate')}>Separate</button>
                <button type="button"
                  className={`sbp-mode-pill${buybackMode === 'club' ? ' sbp-mode-pill--active' : ''}`}
                  onClick={() => setBuybackMode('club')}>Club Buy Back</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Cert rows / Club panel ── */}
        {buybackMode === 'club' ? (
          <ClubBuybackPanel
            sourceTxns={sourceTxns}
            allTxns={allTxns}
            excludedIds={clubExcluded}
            onToggleSource={toggleClubSource}
            holderName={holderName}
            buybackShares={clubBuybackShares}
            onChangeBuybackShares={setClubBuybackShares}
            newCertNo={clubNewCertNo}
            onChangeCertNo={setClubNewCertNo}
            newFolioNo={clubNewFolioNo}
            onChangeFolioNo={setClubNewFolioNo}
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
          <div className="sbp-cert-list">
            {bbRows.map(row => (
              <BuybackRowBlock key={row.id} row={row} onChange={changes => updateRow(row.id, changes)} />
            ))}
          </div>
        )}

        {/* ── Stamp Duty ── */}
        <div className="sbp-details-card">
          <div className="sbp-details-row">
            <div className="sbp-field-group">
              <label className="sbp-lbl">Stamp Duty Payment</label>
              <select className="sbp-input" value={stampDuty} onChange={e => setStampDuty(e.target.value)}>
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </div>
            {stampDuty === 'YES' && (
              <>
                <div className="sbp-field-group">
                  <label className="sbp-lbl">Payment Date</label>
                  <DatePickerInput value={stampDutyDate} onChange={e => setStampDutyDate(e.target.value)} placeholder="DD/MM/YYYY" />
                </div>
                <div className="sbp-field-group">
                  <label className="sbp-lbl">Amount</label>
                  <input className="sbp-input" type="number" min="0" value={stampDutyAmount} onChange={e => setStampDutyAmount(e.target.value)} placeholder="0.00" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="sbp-footer">
          <div className="sbp-footer-summary">
            <span className="sbp-sum-chip">
              <i className="ri-hand-coin-line" /> {fmtNum(totalBought, 0)} of {fmtNum(totalSrcShares, 0)} bought back ({sourceTxns.length} cert{sourceTxns.length !== 1 ? 's' : ''})
            </span>
            {totalSrcShares - totalBought > 0 && totalBought > 0 && (
              <span className="sbp-sum-chip sbp-sum-chip--remain">
                <i className="ri-file-list-3-line" /> {fmtNum(totalSrcShares - totalBought, 0)} remaining
              </span>
            )}
            {buybackMode === 'club' && (
              <span className="sbp-sum-chip sbp-sum-chip--club">
                <i className="ri-stack-line" /> Club · {fmt2(clubPS)} wtd avg
              </span>
            )}
            {isTreasury && buybackMode !== 'club' && (
              <span className="sbp-sum-chip sbp-sum-chip--treasury">
                <i className="ri-building-line" /> Treasury
              </span>
            )}
          </div>
          <div className="sbp-footer-actions">
            <button className="sbp-btn-cancel" onClick={() => navigate(-1)} disabled={saving}>Cancel</button>
            <button className="sbp-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving…</> : <><i className="ri-save-line" /> Save Buyback</>}
            </button>
          </div>
        </div>

      </Container>
    </div>
  );
};

export default ShareBuybackPage;
