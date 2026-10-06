import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Container, Card, Spinner, Modal, ModalHeader, ModalBody } from 'reactstrap';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import {
  getCompany,
  getEntityShareList,
  getOfficialList,
  getShareTxnList,
  getShareTxn,
  getEntityShareDecimalSettings,
  retainShareTxn,
  retainClubShareTxn,
  retainDissolveShareTxn,
  retainBuybackShareTxn,
  retainReplacementShareTxn,
  retainSplitShareTxn,
  retainCombineShareTxn,
  retainReclassShareTxn,
  getShareholderHistory,
} from '../../helpers/backend_helper';
import './EntitySharesPage.css';
import './ShareholderSharesListPage.css';

const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };


function ConsidTooltip({ cash, oc, noC, fmtFn, dec }) {
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);
  const total = cash + oc;

  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ left: r.right, top: r.top });
    }
  };

  return (
    <>
      <span ref={ref} className="ssl-consid-wrap" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
        <span className="ssl-num ssl-consid-total" style={{ color: total > 0 ? '#0ab39c' : '#878a99', fontWeight: 600 }}>
          {total > 0 ? fmtFn(total, dec) : noC ? '—' : fmtFn(0, dec)}
        </span>
      </span>
      {pos && ReactDOM.createPortal(
        <div className="ssl-consid-tip ssl-consid-tip--portal" style={{ left: pos.left, top: pos.top }}>
          <span className="ssl-consid-tip-row"><b>Cash:</b> {fmtFn(cash, dec)}</span>
          <span className="ssl-consid-tip-row"><b>Otherwise In Cash:</b> {fmtFn(oc, dec)}</span>
          <span className="ssl-consid-tip-row"><b>No Consideration:</b> {noC ? 'Yes' : '0'}</span>
        </div>,
        document.body
      )}
    </>
  );
}

const TX_TYPE_LABELS = {
  ALLOTMENT: 'Allotment', TRANSFER: 'Transfer', TRANSMISSION: 'Transmission',
  CONVERSION: 'Conversion', REDEMPTION: 'Redemption', BUYBACK: 'Buy Back',
  BONUS: 'Bonus', OPENING: 'Opening',
};

const fmt = (v, dec = 0) =>
  v == null ? '—' : Number(v).toLocaleString(undefined, {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  });

const txBadgeCls = (type) => {
  const map = {
    ALLOTMENT: 'allotment', OPENING: 'allotment',
    TRANSFER: 'transfer', BONUS: 'bonus',
    TRANSMISSION: 'transmission', CONVERSION: 'conversion',
    REDEMPTION: 'redemption', BUYBACK: 'buyback',
  };
  return `ssl-tx-badge ${map[type] || 'default'}`;
};

const statusCls = (s) => {
  const map = {
    VALID: 'valid', ACTIVE: 'active',
    INVALID: 'invalid', CEASED: 'ceased', CANCELLED: 'cancelled',
    DRAFT: 'draft',
  };
  return `ssl-status-badge ${map[s] || 'default'}`;
};

// ── View Transaction Modal ────────────────────────────────────────────────────
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtV = (v, d = 2) => v == null || v === '' || Number(v) === 0 ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

const ViewTxnModal = ({ txn, share, company, onClose }) => {
  if (!txn) return null;
  const txType  = txn.share_header?.extra_type_of_transaction;
  const txColor = txn.share_header?.transaction_type?.t_type_color || '#405189';

  return (
    <Modal isOpen toggle={onClose} centered size="lg" contentClassName="vtm-modal">
      <ModalHeader toggle={onClose} className="vtm-header" style={{ borderBottom: `3px solid ${txColor}` }}>
        <div className="vtm-title-wrap">
          <div className="vtm-title-icon" style={{ background: `${txColor}18`, color: txColor }}>
            <i className="ri-file-list-3-line" />
          </div>
          <div>
            <div className="vtm-title">Transaction Details</div>
            <div className="vtm-subtitle">{fmtD(txn.share_header?.transaction_date)}</div>
          </div>
          {txType && (
            <span className="vtm-type-chip" style={{ background: `${txColor}15`, color: txColor, border: `1.5px solid ${txColor}30` }}>
              {TX_TYPE_LABELS[txType] || txType}
            </span>
          )}
        </div>
      </ModalHeader>

      <ModalBody className="vtm-body">

        {/* ── Key figures banner ── */}
        <div className="vtm-banner">
          <div className="vtm-banner-stat">
            <i className="ri-stack-line" style={{ color: txColor }} />
            <div>
              <span>No. of Shares</span>
              <b style={{ color: txColor }}>{fmtV(txn.no_of_shares, 0)}</b>
            </div>
          </div>
          <div className="vtm-banner-stat">
            <i className="ri-bank-line" style={{ color: '#c49a0a' }} />
            <div>
              <span>Issued Capital</span>
              <b style={{ color: '#c49a0a' }}>{fmtV(txn.issued_share_capital)}</b>
            </div>
          </div>
          <div className="vtm-banner-stat">
            <i className="ri-money-dollar-circle-line" style={{ color: '#0ab39c' }} />
            <div>
              <span>Paid-up Capital</span>
              <b style={{ color: '#0ab39c' }}>{fmtV(txn.paidup_share_capital)}</b>
            </div>
          </div>
          <div className="vtm-banner-stat">
            <i className="ri-coin-line" style={{ color: '#405189' }} />
            <div>
              <span>Consideration</span>
              <b style={{ color: '#405189' }}>{fmtV(txn.transactional_consideration)}</b>
            </div>
          </div>
        </div>

        <div className="vtm-sections">

          {/* ── Company ── */}
          <div className="vtm-card">
            <div className="vtm-card-title"><i className="ri-building-4-line" /> Company Details</div>
            <div className="vtm-row">
              <div className="vtm-field vtm-field--wide">
                <div className="vtm-label">Company Name</div>
                <div className="vtm-val vtm-val--name">{company?.name || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">UEN / Reg No.</div>
                <div className="vtm-val vtm-val--mono">{company?.identifications?.[0]?.uen_no || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Currency / Class</div>
                <div className="vtm-val">{share?.currency || '—'} · {SHARE_TYPE_LABELS[share?.share_type] || share?.share_type || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Class Type</div>
                <div className="vtm-val">{share?.share_class?.sc_type || share?.share_class?.name || '—'}</div>
              </div>
            </div>
          </div>

          {/* ── Shareholder ── */}
          <div className="vtm-card">
            <div className="vtm-card-title"><i className="ri-user-line" /> Shareholder</div>
            <div className="vtm-row">
              <div className="vtm-field vtm-field--wide">
                <div className="vtm-label">Name</div>
                <div className="vtm-val vtm-val--name">{txn.official_entity?.name || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Client No.</div>
                <div className="vtm-val">{txn.official_entity?.client_no || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Type</div>
                <div className="vtm-val">{txn.official_type || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">UBO</div>
                <div className="vtm-val">
                  <span className={`vtm-badge ${txn.is_ubo ? 'vtm-badge--yes' : 'vtm-badge--no'}`}>
                    {txn.is_ubo ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Transaction ── */}
          <div className="vtm-card">
            <div className="vtm-card-title"><i className="ri-file-list-3-line" /> Transaction Info</div>
            <div className="vtm-row">
              <div className="vtm-field">
                <div className="vtm-label">Folio No.</div>
                <div className="vtm-val vtm-val--mono">{txn.folio_no || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Cert No.</div>
                <div className="vtm-val vtm-val--mono">{txn.share_cert_no || '—'}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Per Share</div>
                <div className="vtm-val">{fmtV(txn.per_share, 4)}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Status</div>
                <div className="vtm-val">
                  <span className={statusCls(txn.status)}>{txn.status || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Consideration ── */}
          <div className="vtm-card">
            <div className="vtm-card-title"><i className="ri-money-dollar-circle-line" /> Consideration</div>
            <div className="vtm-row">
              <div className="vtm-field">
                <div className="vtm-label">Cash</div>
                <div className="vtm-val">{fmtV(txn.cash)}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Otherwise in Cash</div>
                <div className="vtm-val">{fmtV(txn.otherwise_cash)}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">Total (C+OC)</div>
                <div className="vtm-val vtm-val--total">{fmtV(txn.transactional_consideration)}</div>
              </div>
              <div className="vtm-field">
                <div className="vtm-label">No Consideration</div>
                <div className="vtm-val">
                  <span className={`vtm-badge ${txn.no_consideration ? 'vtm-badge--yes' : 'vtm-badge--no'}`}>
                    {txn.no_consideration ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </ModalBody>
    </Modal>
  );
};

// ── Transaction actions dropdown ─────────────────────────────────────────────
const TxnActionsDropdown = ({ txn, onView, onPayments, onTransfer, onTransferAll, onDissolve, onDissolveAll, onCancel, onCancelAll, onBuyback, onBuybackAll, onReplacement, onSplit, onSplitAll, onCombine, onReclassify, onRetain, onHistory, hasMultipleAllotments: hasMultipleShares }) => {
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuPos) return;
    const handler = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setMenuPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuPos]);

  const isTransfer     = txn?.share_header?.extra_type_of_transaction === 'TRANSFER';
  const isClubTransfer = txn?.share_header?.extra_type_of_transaction === 'CLUB_TRANSFER';
  const isDissolveIn   = txn?.share_header?.extra_type_of_transaction === 'DISSOLVE' || txn?.share_header?.extra_type_of_transaction === 'CLUB_DISSOLVE';
  const isBuybackIn     = (txn?.share_header?.extra_type_of_transaction === 'BUYBACK' || txn?.share_header?.extra_type_of_transaction === 'CLUB_BUYBACK') && txn?.transaction_status === 'IN';
  const isReplacementIn = (txn?.share_header?.extra_type_of_transaction === 'REPLACEMENT' || txn?.share_header?.extra_type_of_transaction === 'REPLACEMENT_COMBINE') && txn?.transaction_status === 'IN';
  const isSplitIn       = (txn?.share_header?.extra_type_of_transaction === 'SPLIT' || txn?.share_header?.extra_type_of_transaction === 'CLUB_SPLIT') && txn?.transaction_status === 'IN';
  const isCombineIn     = txn?.share_header?.extra_type_of_transaction === 'COMBINE' && txn?.transaction_status === 'IN';
  const isReclassIn     = txn?.share_header?.extra_type_of_transaction === 'RECLASSIFICATION' && txn?.transaction_status === 'IN';
  const isInOrNone     = txn?.transaction_status === 'IN' || txn?.transaction_status === 'NONE';
  const isValid        = txn?.status === 'VALID';

  // Grouped transaction actions — easy to extend with new modules
  const txnGroups = [
    ...(isValid && isInOrNone && onTransfer ? [{ label: 'Transfer', icon: 'ri-swap-line',         onSingle: onTransfer, onAll: hasMultipleShares && onTransferAll ? onTransferAll : null }] : []),
    ...(isValid && isInOrNone && onDissolve ? [{ label: 'Dissolve', icon: 'ri-user-shared-line', onSingle: onDissolve, onAll: hasMultipleShares && onDissolveAll ? onDissolveAll : null }] : []),
    ...(isValid && isInOrNone && onCancel   ? [{ label: 'Cancel',   icon: 'ri-scissors-cut-line', onSingle: onCancel,  onAll: hasMultipleShares && onCancelAll   ? onCancelAll   : null }] : []),
    ...(isValid && isInOrNone && onBuyback  ? [{ label: 'Buy Back', icon: 'ri-buy-line',           onSingle: onBuyback, onAll: hasMultipleShares && onBuybackAll  ? onBuybackAll  : null }] : []),
    ...(isValid && isInOrNone && onSplit    ? [{ label: 'Split',    icon: 'ri-git-branch-line',    onSingle: onSplit,   onAll: hasMultipleShares && onSplitAll    ? onSplitAll    : null }] : []),
  ];

  const showRetain = (isTransfer || isClubTransfer || isDissolveIn || isBuybackIn || isReplacementIn || isSplitIn || isCombineIn || isReclassIn) && isValid && onRetain;

  const infoCount = 3 + (isValid && isInOrNone && onReplacement ? 1 : 0) + (isValid && isInOrNone && onCombine && hasMultipleShares ? 1 : 0) + (isValid && isInOrNone && onReclassify ? 1 : 0);
  const estimatedHeight =
    infoCount * 34 +
    (txnGroups.length > 0 ? 9 + txnGroups.length * 40 : 0) +
    (showRetain ? 9 + 34 : 0) + 12;

  return (
    <div className="ssl-actions-wrap">
      <button className="ssl-action-btn" ref={btnRef} onClick={() => {
        if (menuPos) { setMenuPos(null); return; }
        const rect = btnRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < estimatedHeight + 8) {
          setMenuPos({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right });
        } else {
          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
      }}>
        Options <i className="ri-arrow-down-s-line" />
      </button>
      {menuPos && ReactDOM.createPortal(
        <div className="ssl-actions-menu" style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right }}>

          {/* ── Info actions ── */}
          {[
            { label: 'View',                      icon: 'ri-eye-line',                 action: onView,        show: true },
            { label: 'Shareholder History',        icon: 'ri-history-line',             action: onHistory,     show: true },
            { label: 'Payments',                   icon: 'ri-money-dollar-circle-line', action: onPayments,    show: true },
            { label: 'Replacement for Lost Cert',  icon: 'ri-file-copy-2-line',         action: onReplacement, show: !!(isValid && isInOrNone && onReplacement) },
            { label: 'Reclassification',           icon: 'ri-exchange-line',            action: onReclassify,  show: !!(isValid && isInOrNone && onReclassify) },
            { label: 'Combine Shares',             icon: 'ri-merge-cells-horizontal',   action: onCombine,     show: !!(isValid && isInOrNone && onCombine && hasMultipleShares) },
          ].filter(i => i.show).map(item => (
            <button key={item.label} className="ssl-actions-item"
              onMouseDown={() => { item.action(); setMenuPos(null); }}>
              <i className={item.icon} /> {item.label}
            </button>
          ))}

          {/* ── Transaction groups: each row has Single + All pill ── */}
          {txnGroups.length > 0 && (
            <>
              <div className="ssl-actions-divider" />
              {txnGroups.map(g => (
                <div key={g.label} className="ssl-actions-group-row">
                  <span className="ssl-actions-group-lbl">
                    {g.label}
                  </span>
                  <div className="ssl-actions-group-btns">
                    <button className="ssl-actions-pill"
                      onMouseDown={() => { g.onSingle(); setMenuPos(null); }}>
                      Single
                    </button>
                    {g.onAll && (
                      <button className="ssl-actions-pill ssl-actions-pill--all"
                        onMouseDown={() => { g.onAll(); setMenuPos(null); }}>
                        All
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Retain (conditional) ── */}
          {showRetain && (
            <>
              <div className="ssl-actions-divider" />
              <button className="ssl-actions-item ssl-actions-item--danger"
                onMouseDown={() => { onRetain(); setMenuPos(null); }}>
                <i className="ri-arrow-go-back-line" />
                Retain
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// ── Per-group table ──────────────────────────────────────────────────────────
const ShareGroup = ({ share, transactions, onAddAllotment, entityId, company, dec, onRefresh }) => {
  const navigate    = useNavigate();
  const [collapsed,    setCollapsed]    = useState(false);
  const [viewTxn,      setViewTxn]      = useState(null);
  const [retainTxn,     setRetainTxn]     = useState(null);
  const [retaining,     setRetaining]     = useState(false);
  const [retainClubTxn,     setRetainClubTxn]     = useState(null);
  const [retainingClub,     setRetainingClub]     = useState(false);
  const [retainDissolveTxn, setRetainDissolveTxn] = useState(null);
  const [retainingDissolve, setRetainingDissolve] = useState(false);
  const [retainBuybackTxn,     setRetainBuybackTxn]     = useState(null);
  const [retainingBuyback,     setRetainingBuyback]     = useState(false);
  const [retainReplacementTxn, setRetainReplacementTxn] = useState(null);
  const [retainingReplacement, setRetainingReplacement] = useState(false);
  const [retainSplitTxn,       setRetainSplitTxn]       = useState(null);
  const [retainingSplit,       setRetainingSplit]       = useState(false);
  const [retainCombineTxn,     setRetainCombineTxn]     = useState(null);
  const [retainingCombine,     setRetainingCombine]     = useState(false);
  const [retainReclassTxn,     setRetainReclassTxn]     = useState(null);
  const [retainingReclass,     setRetainingReclass]     = useState(false);
  const [retainSrcTxns,     setRetainSrcTxns]     = useState([]);
  const [loadingRetainSrc,  setLoadingRetainSrc]  = useState(false);

  const fetchRetainSrcTxns = useCallback(async (ids) => {
    if (!ids || ids.length === 0) { setRetainSrcTxns([]); return; }
    setLoadingRetainSrc(true);
    try {
      const results = await Promise.all(ids.map(id => getShareTxn(id)));
      setRetainSrcTxns(results.map(r => r?.data || r).filter(Boolean));
    } catch { setRetainSrcTxns([]); }
    finally { setLoadingRetainSrc(false); }
  }, []);
  const [historyTxn,   setHistoryTxn]   = useState(null);
  const [historyRows,  setHistoryRows]  = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const totals = useMemo(() => transactions
    .filter(t => t.status === 'VALID')
    .reduce(
      (acc, t) => ({
        qty:    acc.qty    + Number(t.no_of_shares        || 0),
        issued: acc.issued + Number(t.issued_share_capital || 0),
        paidup: acc.paidup + Number(t.paidup_share_capital || 0),
      }),
      { qty: 0, issued: 0, paidup: 0 }
    ), [transactions]);

  const handleRetainConfirm = async () => {
    if (!retainTxn) return;
    setRetaining(true);
    try {
      await retainShareTxn(retainTxn.share_transaction_id);
      toast.success('Shares retained — transfer reversed successfully');
      setRetainTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to retain shares');
    } finally {
      setRetaining(false);
    }
  };

  const handleRetainClubConfirm = async () => {
    if (!retainClubTxn) return;
    setRetainingClub(true);
    try {
      await retainClubShareTxn(retainClubTxn.share_transaction_id);
      toast.success('Club transfer reversed successfully');
      setRetainClubTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to reverse club transfer');
    } finally {
      setRetainingClub(false);
    }
  };

  const handleRetainDissolveConfirm = async () => {
    if (!retainDissolveTxn) return;
    setRetainingDissolve(true);
    try {
      await retainDissolveShareTxn(retainDissolveTxn.share_transaction_id);
      toast.success('Dissolve reversed successfully');
      setRetainDissolveTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to reverse dissolve');
    } finally {
      setRetainingDissolve(false);
    }
  };

  const handleRetainBuybackConfirm = async () => {
    if (!retainBuybackTxn) return;
    setRetainingBuyback(true);
    try {
      await retainBuybackShareTxn(retainBuybackTxn.share_transaction_id);
      toast.success('Buyback reversed successfully');
      setRetainBuybackTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to reverse buyback');
    } finally {
      setRetainingBuyback(false);
    }
  };

  const handleRetainReplacementConfirm = async () => {
    if (!retainReplacementTxn) return;
    setRetainingReplacement(true);
    try {
      await retainReplacementShareTxn(retainReplacementTxn.share_transaction_id);
      toast.success('Replacement retained successfully');
      setRetainReplacementTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to retain replacement');
    } finally {
      setRetainingReplacement(false);
    }
  };

  const handleRetainSplitConfirm = async () => {
    if (!retainSplitTxn) return;
    setRetainingSplit(true);
    try {
      await retainSplitShareTxn(retainSplitTxn.share_transaction_id);
      toast.success('Split retained successfully');
      setRetainSplitTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to retain split');
    } finally {
      setRetainingSplit(false);
    }
  };

  const handleRetainCombineConfirm = async () => {
    if (!retainCombineTxn) return;
    setRetainingCombine(true);
    try {
      await retainCombineShareTxn(retainCombineTxn.share_transaction_id);
      toast.success('Combine retained successfully');
      setRetainCombineTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to retain combine');
    } finally {
      setRetainingCombine(false);
    }
  };

  const handleRetainReclassConfirm = async () => {
    if (!retainReclassTxn) return;
    setRetainingReclass(true);
    try {
      await retainReclassShareTxn(retainReclassTxn.share_transaction_id);
      toast.success('Reclassification retained successfully');
      setRetainReclassTxn(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to retain reclassification');
    } finally {
      setRetainingReclass(false);
    }
  };

  const handleOpenHistory = async (txn) => {
    setHistoryTxn(txn);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await getShareholderHistory(txn.official_entity_id, entityId);
      setHistoryRows(res?.data?.data || res?.data || []);
    } catch {
      toast.error('Failed to load shareholder history');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <>
    <div className="ssl-group es-group-box">
      {/* Group header */}
      <div className="es-group-box-header ssl-group-hdr" onClick={() => setCollapsed(c => !c)}>

        {/* Left — chips, allowed to wrap */}
        <div className="ssl-hdr-left">
          <div className="es-gt-chip identity">
            <i className="ri-layout-grid-line" />
            <div>
              <span>Currency / Class</span>
              <b>
                {share.currency || 'SGD'} &middot; {SHARE_TYPE_LABELS[share.share_type] || share.share_type || 'Ordinary'}
                {share.share_class?.sc_type && <span className="es-sc-type-tag">{share.share_class.sc_type}</span>}
              </b>
            </div>
          </div>

          <i className="ri-arrow-right-s-line es-group-sep-arrow" />

          <div className="es-group-totals">
            <div className="es-gt-chip shares">
              <i className="ri-stack-line" />
              <div><span>Total Shares</span><b>{fmt(share.number_of_shares, dec.shares)}</b></div>
            </div>
            <div className="es-gt-chip issued">
              <i className="ri-bank-line" />
              <div><span>Issued Capital</span><b>{fmt(share.issued_share_capital, dec.issued)}</b></div>
            </div>
            <div className="es-gt-chip paidup">
              <i className="ri-money-dollar-circle-line" />
              <div><span>Paid-up</span><b>{fmt(share.paid_up_capital, dec.paid)}</b></div>
            </div>
          </div>

        </div>

        {/* Right — always pinned, never wraps */}
        <div className="ssl-hdr-right" onClick={e => e.stopPropagation()}>
          <button
            className="ssl-add-allotment-btn"
            onClick={e => { e.stopPropagation(); onAddAllotment(share); }}>
            <i className="ri-add-line" /> Add Allotment
          </button>
          <i className={`ri-arrow-${collapsed ? 'down' : 'up'}-s-line es-group-chevron`}
             style={{ pointerEvents: 'none' }} />
        </div>

      </div>

      {/* Rows */}
      <div className={`es-group-rows${collapsed ? ' es-group-rows--collapsed' : ''}`}>
        <div className="ssl-rows-inner">
        <div className="ssl-table-wrap">
          <table className="ssl-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Shareholder</th>
                <th>Folio No.</th>
                <th>Cert No.</th>
                <th className="th-right">No. of Shares</th>
                <th className="th-right">Issued Capital</th>
                <th className="th-right">Consideration</th>
                <th className="th-right">Per Share</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr className="ssl-empty-row">
                  <td colSpan={11}>
                    <i className="ri-file-list-3-line" />
                    No transactions yet.{' '}
                    <button className="btn btn-link btn-sm p-0"
                      style={{ color: '#0ab39c', fontWeight: 600, fontSize: 13 }}
                      onClick={() => onAddAllotment(share)}>
                      + Add Allotment
                    </button>
                  </td>
                </tr>
              ) : (
                <>
                  {transactions.map((t, i) => {
                    const isInvalid = t.status === 'INVALID';
                    const txColor   = t.share_header?.transaction_type?.t_type_color;
                    const rowStyle  = isInvalid
                      ? { background: 'rgba(231,76,94,0.06)' }
                      : txColor ? { background: `${txColor}12` } : undefined;
                    return (
                    <tr key={t.share_transaction_id || i} style={rowStyle} className={isInvalid ? 'ssl-row--invalid' : ''}>
                      <td className="ssl-date-cell">{t.share_header?.transaction_date || '—'}</td>
                      <td>
                        {(() => {
                          const txType = t.share_header?.extra_type_of_transaction;
                          const isTransfer = txType === 'TRANSFER';
                          // Resolve from/to names regardless of which side of the transfer this row is
                          const fromName = isTransfer
                            ? (t.transaction_status === 'NONE' ? t.official_entity?.name : t.transferor_entity?.name)
                            : null;
                          const toName = isTransfer
                            ? (t.transaction_status === 'NONE' ? t.transferee_entity?.name : t.official_entity?.name)
                            : null;
                          const roleLabel = isTransfer
                            ? (t.transaction_status === 'NONE' ? { label: 'Balance', cls: 'ssl-role--balance' }
                             : t.transaction_status === 'IN'   ? { label: 'Received', cls: 'ssl-role--received' }
                             : null)
                            : null;
                          return (
                            <div className="ssl-type-col">
                              <span className={txBadgeCls(txType)}>
                                {TX_TYPE_LABELS[txType] || txType || '—'}
                              </span>
                              {(roleLabel || (isTransfer && fromName && toName)) && (
                                <div className="ssl-type-sub">
                                  {roleLabel && (
                                    <span className={`ssl-role-pill ${roleLabel.cls}`}>{roleLabel.label}</span>
                                  )}
                                  {isTransfer && fromName && toName && (
                                    <span className="ssl-transfer-flow">
                                      <span className="ssl-transfer-flow-name ssl-transfer-flow-from">{fromName}</span>
                                      <i className="ri-arrow-right-line ssl-transfer-flow-arrow" />
                                      <span className="ssl-transfer-flow-name ssl-transfer-flow-to">{toName}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <div className="ssl-shareholder-name">{t.official_entity?.name || '—'}</div>
                      </td>
                      <td><span className="ssl-num--muted">{t.folio_no || '—'}</span></td>
                      <td><span className="ssl-num--muted">{t.share_cert_no || '—'}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="ssl-num" style={{ color: '#405189' }}>{fmt(t.no_of_shares, dec.shares)}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="ssl-num">{fmt(t.issued_share_capital, dec.issued)}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <ConsidTooltip
                          cash={Number(t.cash || 0)}
                          oc={Number(t.otherwise_cash || 0)}
                          noC={!!t.no_consideration}
                          fmtFn={fmt}
                          dec={dec.paid}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="ssl-num" style={{ fontWeight: 700, color: '#405189' }}>{fmt(t.per_share, Math.max(dec.paid, 4))}</span>
                      </td>
                      <td><span className={statusCls(t.status)}>{t.status || '—'}</span></td>
                      <td>
                        <TxnActionsDropdown
                          txn={t}
                          onView={() => setViewTxn(t)}
                          onHistory={() => handleOpenHistory(t)}
                          onPayments={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/payments/${t.share_transaction_id}`,
                            { state: { txn: t, share, company } }
                          )}
                          onTransfer={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/transfer/${t.share_transaction_id}`,
                            { state: { txn: t, share, company } }
                          )}
                          hasMultipleAllotments={transactions.filter(x =>
                            String(x.official_entity_id) === String(t.official_entity_id) &&
                            x.status === 'VALID' &&
                            (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                          ).length > 1}
                          onTransferAll={() => {
                            const shareholderTxns = transactions.filter(x =>
                              String(x.official_entity_id) === String(t.official_entity_id) &&
                              x.status === 'VALID' &&
                              (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                            );
                            navigate(
                              `/company/${entityId}/shares/shareholder-register/transfer`,
                              { state: { txns: shareholderTxns, share, company } }
                            );
                          }}
                          onDissolve={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/dissolve`,
                            { state: { txns: [t], share, company } }
                          )}
                          onDissolveAll={() => {
                            const shareholderTxns = transactions.filter(x =>
                              String(x.official_entity_id) === String(t.official_entity_id) &&
                              x.status === 'VALID' &&
                              (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                            );
                            navigate(
                              `/company/${entityId}/shares/shareholder-register/dissolve`,
                              { state: { txns: shareholderTxns, share, company } }
                            );
                          }}
                          onCancel={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/cancel`,
                            { state: { txns: [t], share, company } }
                          )}
                          onCancelAll={() => {
                            const shareholderTxns = transactions.filter(x =>
                              String(x.official_entity_id) === String(t.official_entity_id) &&
                              x.status === 'VALID' &&
                              (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                            );
                            navigate(
                              `/company/${entityId}/shares/shareholder-register/cancel`,
                              { state: { txns: shareholderTxns, share, company } }
                            );
                          }}
                          onBuyback={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/buyback`,
                            { state: { txns: [t], share, company } }
                          )}
                          onBuybackAll={() => {
                            const shareholderTxns = transactions.filter(x =>
                              String(x.official_entity_id) === String(t.official_entity_id) &&
                              x.status === 'VALID' &&
                              (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                            );
                            navigate(
                              `/company/${entityId}/shares/shareholder-register/buyback`,
                              { state: { txns: shareholderTxns, share, company } }
                            );
                          }}
                          onReplacement={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/replacement`,
                            { state: { txn: t, share, company } }
                          )}
                          onSplit={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/split`,
                            { state: { txns: [t], share, company } }
                          )}
                          onReclassify={() => navigate(
                            `/company/${entityId}/shares/shareholder-register/reclassification`,
                            { state: { txn: t, share, company } }
                          )}
                          onCombine={() => {
                            const shareholderTxns = transactions.filter(x =>
                              String(x.official_entity_id) === String(t.official_entity_id) &&
                              x.status === 'VALID' &&
                              (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                            );
                            navigate(
                              `/company/${entityId}/shares/shareholder-register/combine`,
                              { state: { txns: shareholderTxns, share, company } }
                            );
                          }}
                          onSplitAll={() => {
                            const shareholderTxns = transactions.filter(x =>
                              String(x.official_entity_id) === String(t.official_entity_id) &&
                              x.status === 'VALID' &&
                              (x.transaction_status === 'IN' || x.transaction_status === 'NONE')
                            );
                            navigate(
                              `/company/${entityId}/shares/shareholder-register/split`,
                              { state: { txns: shareholderTxns, share, company } }
                            );
                          }}
                          onRetain={t.status === 'VALID' && t.share_header?.extra_type_of_transaction === 'TRANSFER'
                            ? () => { setRetainTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_share_id ? [t.old_share_id] : []); }
                            : t.status === 'VALID' && t.share_header?.extra_type_of_transaction === 'CLUB_TRANSFER'
                            ? () => { setRetainClubTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : t.status === 'VALID' && (t.share_header?.extra_type_of_transaction === 'DISSOLVE' || t.share_header?.extra_type_of_transaction === 'CLUB_DISSOLVE')
                            ? () => { setRetainDissolveTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : t.status === 'VALID' && (t.share_header?.extra_type_of_transaction === 'BUYBACK' || t.share_header?.extra_type_of_transaction === 'CLUB_BUYBACK') && t.transaction_status === 'IN'
                            ? () => { setRetainBuybackTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : t.status === 'VALID' && (t.share_header?.extra_type_of_transaction === 'REPLACEMENT' || t.share_header?.extra_type_of_transaction === 'REPLACEMENT_COMBINE') && t.transaction_status === 'IN'
                            ? () => { setRetainReplacementTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : t.status === 'VALID' && (t.share_header?.extra_type_of_transaction === 'SPLIT' || t.share_header?.extra_type_of_transaction === 'CLUB_SPLIT') && t.transaction_status === 'IN'
                            ? () => { setRetainSplitTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : t.status === 'VALID' && t.share_header?.extra_type_of_transaction === 'COMBINE' && t.transaction_status === 'IN'
                            ? () => { setRetainCombineTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : t.status === 'VALID' && t.share_header?.extra_type_of_transaction === 'RECLASSIFICATION' && t.transaction_status === 'IN'
                            ? () => { setRetainReclassTxn(t); setRetainSrcTxns([]); fetchRetainSrcTxns(t.old_data?.source_txn_ids || []); }
                            : undefined}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Usage summary below table ── */}
        {(() => {
          const totalShares = Number(share.number_of_shares    || 0);
          const totalIssued = Number(share.issued_share_capital || 0);
          const totalPaidup = Number(share.paid_up_capital      || 0);
          const pctShares   = totalShares > 0 ? Math.min(100, (totals.qty    / totalShares) * 100) : 0;
          const pctIssued   = totalIssued > 0 ? Math.min(100, (totals.issued / totalIssued) * 100) : 0;
          const pctPaidup   = totalPaidup > 0 ? Math.min(100, (totals.paidup / totalPaidup) * 100) : 0;
          const Bar = ({ label, used, total, pct, d, color }) => (
            <div className="ssl-usage-footer-item">
              <div className="ssl-usage-chip-top">
                <span className="ssl-usage-label">{label}</span>
                <span className="ssl-usage-ratio"><b>{fmt(used, d)}</b><span className="ssl-usage-of"> of </span><span className="ssl-usage-total">{fmt(total, d)}</span></span>
              </div>
              <div className="ssl-usage-bar-track"><div className="ssl-usage-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
            </div>
          );
          return (
            <div className="ssl-usage-footer">
              <div className="ssl-usage-footer-title"><i className="ri-bar-chart-2-line" /> Share Position Summary</div>
              <Bar label="Shares Used"    used={totals.qty}    total={totalShares} pct={pctShares} d={dec.shares} color="linear-gradient(90deg,#405189,#6880c8)" />
              <Bar label="Issued Capital" used={totals.issued} total={totalIssued} pct={pctIssued} d={dec.issued} color="linear-gradient(90deg,#c49a0a,#e0b830)" />
              <Bar label="Paid-up"        used={totals.paidup} total={totalPaidup} pct={pctPaidup} d={dec.paid}   color="linear-gradient(90deg,#0ab39c,#2ecfb8)" />
            </div>
          );
        })()}

        </div>
      </div>
    </div>

    {viewTxn && <ViewTxnModal txn={viewTxn} share={share} company={company} onClose={() => setViewTxn(null)} />}

    {/* ── Shared source-cert restore table ─────────────────────────────────── */}
    {(() => {
      const srcRows = retainSrcTxns;
      const renderSrcTable = (warnMsg, onCancel, onConfirm, confirming, confirmLabel) => (
        <>
          <div className="ssl-retain-src-hdr">
            <i className="ri-refresh-line" /> Shares that will be <strong>restored to VALID</strong>:
          </div>
          {loadingRetainSrc ? (
            <div className="ssl-retain-src-loading"><Spinner size="sm" /> Loading…</div>
          ) : srcRows.length === 0 ? (
            <div className="ssl-retain-src-loading">No source records found.</div>
          ) : (
            <div className="ssl-retain-src-scroll">
              <table className="ssl-retain-src-tbl">
                <thead>
                  <tr>
                    <th>Cert No.</th>
                    <th>Shareholder</th>
                    <th className="ta-r">Shares</th>
                    <th className="ta-r">Per Share</th>
                    <th className="ta-r">Paid-up</th>
                  </tr>
                </thead>
                <tbody>
                  {srcRows.map(s => (
                    <tr key={s.share_transaction_id}>
                      <td>{s.share_cert_no || '—'}</td>
                      <td>{s.official_entity?.name || '—'}</td>
                      <td className="ta-r">{fmtV(s.no_of_shares, 0)}</td>
                      <td className="ta-r">{fmtV(s.per_share, 4)}</td>
                      <td className="ta-r">{fmtV(s.paidup_share_capital)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="ssl-retain-warn">{warnMsg}</div>
          <div className="ssl-retain-actions">
            <button className="ssl-retain-cancel" onClick={onCancel} disabled={confirming}>Cancel</button>
            <button className="ssl-retain-confirm" onClick={onConfirm} disabled={confirming}>
              {confirming ? <><i className="ri-loader-4-line ssl-spin" /> Reversing…</> : <><i className="ri-arrow-go-back-line" /> {confirmLabel}</>}
            </button>
          </div>
        </>
      );

      return (
        <>
          {/* Retain confirm dialog */}
          {retainTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retaining && setRetainTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Retain Shares</div>
                <div className="ssl-retain-body">
                  Reversing the transfer for cert <strong>{retainTxn.share_cert_no || retainTxn.share_transaction_id}</strong>.
                  The original allotment below will be restored.
                </div>
                {renderSrcTable(
                  'This action cannot be undone if the shares have been re-transferred.',
                  () => setRetainTxn(null),
                  handleRetainConfirm,
                  retaining,
                  'Confirm Retain',
                )}
              </div>
            </div>
          )}

          {/* Club Transfer Retain confirm dialog */}
          {retainClubTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingClub && setRetainClubTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Reverse Club Transfer</div>
                <div className="ssl-retain-body">
                  Reversing the club transfer for cert <strong>{retainClubTxn.share_cert_no || retainClubTxn.share_transaction_id}</strong>.
                  The source certificates below will be restored to valid.
                </div>
                {renderSrcTable(
                  'This action cannot be undone if the transferred shares have been further used.',
                  () => setRetainClubTxn(null),
                  handleRetainClubConfirm,
                  retainingClub,
                  'Confirm Reverse',
                )}
              </div>
            </div>
          )}

          {/* Dissolve Retain confirm dialog */}
          {retainDissolveTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingDissolve && setRetainDissolveTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Reverse {retainDissolveTxn.share_header?.extra_type_of_transaction === 'CLUB_DISSOLVE' ? 'Club Dissolve' : 'Dissolve'}</div>
                <div className="ssl-retain-body">
                  Reversing the dissolve for cert <strong>{retainDissolveTxn.share_cert_no || retainDissolveTxn.share_transaction_id}</strong>.
                  The source certificates below will be restored and transferee entries invalidated.
                </div>
                {renderSrcTable(
                  'Cannot be undone if any transferee has already re-transferred or dissolved their shares.',
                  () => setRetainDissolveTxn(null),
                  handleRetainDissolveConfirm,
                  retainingDissolve,
                  'Confirm Reverse',
                )}
              </div>
            </div>
          )}

          {/* Buyback Retain confirm dialog */}
          {retainBuybackTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingBuyback && setRetainBuybackTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Reverse Buyback</div>
                <div className="ssl-retain-body">
                  Reversing the buyback for cert <strong>{retainBuybackTxn.share_cert_no || retainBuybackTxn.share_transaction_id}</strong>.
                  The source certificates below will be restored and buyback entries invalidated.
                </div>
                {renderSrcTable(
                  'Cannot be undone if the remaining certificate has already been used in another transaction.',
                  () => setRetainBuybackTxn(null),
                  handleRetainBuybackConfirm,
                  retainingBuyback,
                  'Confirm Reverse',
                )}
              </div>
            </div>
          )}

          {/* Replacement Retain confirm dialog */}
          {retainReplacementTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingReplacement && setRetainReplacementTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Retain Replacement</div>
                <div className="ssl-retain-body">
                  Retaining the replacement cert <strong>{retainReplacementTxn.share_cert_no || retainReplacementTxn.share_transaction_id}</strong>.
                  The original certificate(s) below will be restored and the replacement entry invalidated.
                </div>
                {renderSrcTable(
                  'Cannot be undone if the replacement certificate has already been used in another transaction.',
                  () => setRetainReplacementTxn(null),
                  handleRetainReplacementConfirm,
                  retainingReplacement,
                  'Confirm Retain',
                )}
              </div>
            </div>
          )}

          {/* Reclassification Retain confirm dialog */}
          {retainReclassTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingReclass && setRetainReclassTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Retain Reclassification</div>
                <div className="ssl-retain-body">
                  Retaining the reclassified cert <strong>{retainReclassTxn.share_cert_no || retainReclassTxn.share_transaction_id}</strong>.
                  The original certificate below will be restored to its old share class, and company shares in both classes go back to their previous values.
                </div>
                {renderSrcTable(
                  'Cannot be undone if the reclassified certificate has already been used in another transaction.',
                  () => setRetainReclassTxn(null),
                  handleRetainReclassConfirm,
                  retainingReclass,
                  'Confirm Retain',
                )}
              </div>
            </div>
          )}

          {/* Combine Retain confirm dialog */}
          {retainCombineTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingCombine && setRetainCombineTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Retain Combine</div>
                <div className="ssl-retain-body">
                  Retaining the combined cert <strong>{retainCombineTxn.share_cert_no || retainCombineTxn.share_transaction_id}</strong>.
                  The original certificates below will be restored and every line of the combined certificate invalidated.
                </div>
                {renderSrcTable(
                  'Cannot be undone if the combined certificate has already been used in another transaction.',
                  () => setRetainCombineTxn(null),
                  handleRetainCombineConfirm,
                  retainingCombine,
                  'Confirm Retain',
                )}
              </div>
            </div>
          )}

          {/* Split Retain confirm dialog */}
          {retainSplitTxn && (
            <div className="ssl-retain-overlay" onClick={() => !retainingSplit && setRetainSplitTxn(null)}>
              <div className="ssl-retain-modal ssl-retain-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="ssl-retain-icon"><i className="ri-arrow-go-back-line" /></div>
                <div className="ssl-retain-title">Retain Split</div>
                <div className="ssl-retain-body">
                  Retaining the split that created cert <strong>{retainSplitTxn.share_cert_no || retainSplitTxn.share_transaction_id}</strong>.
                  The original certificate(s) below will be restored and all certificates from this split invalidated.
                  {retainSplitTxn.share_header?.extra_type_of_transaction === 'CLUB_SPLIT' && ' Company shares will be restored to their values before the club split.'}
                </div>
                {renderSrcTable(
                  'Cannot be undone if any certificate from this split has already been used in another transaction.',
                  () => setRetainSplitTxn(null),
                  handleRetainSplitConfirm,
                  retainingSplit,
                  'Confirm Retain',
                )}
              </div>
            </div>
          )}
        </>
      );
    })()}

    {/* Shareholder History modal */}
    {historyTxn && (
      <div className="ssl-history-overlay" onClick={() => setHistoryTxn(null)}>
        <div className="ssl-history-modal" onClick={e => e.stopPropagation()}>
          <div className="ssl-history-header">
            <div className="ssl-history-title">
              <i className="ri-history-line" />
              Shareholder History
            </div>
            <div className="ssl-history-subtitle">{historyTxn.official_entity?.name || '—'}</div>
            <button className="ssl-history-close" onClick={() => setHistoryTxn(null)}>
              <i className="ri-close-line" />
            </button>
          </div>
          <div className="ssl-history-body">
            {historyLoading ? (
              <div className="ssl-history-loading"><Spinner size="sm" /> Loading history…</div>
            ) : historyRows.length === 0 ? (
              <div className="ssl-history-empty">No transactions found.</div>
            ) : (
              <table className="ssl-history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Cert No.</th>
                    <th>Share Class</th>
                    <th className="th-right">No. of Shares</th>
                    <th className="th-right">Consideration</th>
                    <th className="th-right">Per Share</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h, idx) => {
                    const txType   = h.share_header?.extra_type_of_transaction;
                    const isInvalid = h.status === 'INVALID';
                    const isTransfer = txType === 'TRANSFER';
                    const roleLabel = isTransfer
                      ? (h.transaction_status === 'NONE' ? 'Balance' : h.transaction_status === 'IN' ? 'Received' : null)
                      : null;
                    const consideration = Number(h.cash || 0) + Number(h.otherwise_cash || 0);
                    return (
                      <tr key={h.share_transaction_id} className={isInvalid ? 'ssl-history-row--invalid' : ''}>
                        <td className="ssl-history-seq">{idx + 1}</td>
                        <td className="ssl-history-date">{h.share_header?.transaction_date || '—'}</td>
                        <td>
                          <div className="ssl-history-type-col">
                            <span className={txBadgeCls(txType)}>{TX_TYPE_LABELS[txType] || txType || '—'}</span>
                            {roleLabel && (
                              <span className={`ssl-role-pill ${h.transaction_status === 'NONE' ? 'ssl-role--balance' : 'ssl-role--received'}`}>
                                {roleLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td><span className="ssl-num--muted">{h.share_cert_no || '—'}</span></td>
                        <td><span className="ssl-num--muted">{h.share_class?.sc_name || '—'}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="ssl-num" style={{ color: '#405189' }}>{fmt(h.no_of_shares, dec.shares)}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="ssl-num" style={{ color: consideration > 0 ? '#0ab39c' : '#878a99' }}>
                            {consideration > 0 ? fmt(consideration, dec.paid) : (h.no_consideration ? '—' : fmt(0, dec.paid))}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="ssl-num" style={{ fontWeight: 700, color: '#405189' }}>{fmt(h.per_share, Math.max(dec.paid, 4))}</span>
                        </td>
                        <td><span className={statusCls(h.status)}>{h.status || '—'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────
const ShareholderSharesListPage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate      = useNavigate();

  const globalDecimals = useSelector(s => s.CompanyProfile?.decimals) || { shares: 0, paid: 2, issued: 2 };
  const [entityDecimals, setEntityDecimals] = useState({ shares: null, paid: null, issued: null });
  const effDecimals = {
    shares: entityDecimals.shares !== null ? entityDecimals.shares : globalDecimals.shares,
    paid:   entityDecimals.paid   !== null ? entityDecimals.paid   : globalDecimals.paid,
    issued: entityDecimals.issued !== null ? entityDecimals.issued : globalDecimals.issued,
  };

  const [company,      setCompany]      = useState(null);
  const [shares,       setShares]       = useState([]);
  const [shareholders, setShareholders] = useState([]);
  const [txnMap,       setTxnMap]       = useState({});  // company_share_id → transactions[]
  const [loading,      setLoading]      = useState(true);

  const [fShareholder, setFShareholder] = useState('');
  const [fTxType,      setFTxType]      = useState('');
  const [fCurrency,    setFCurrency]    = useState('');
  const [fClass,       setFClass]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, shareRes, txnRes, shRes, decRes] = await Promise.all([
        getCompany(entity_id),
        getEntityShareList(entity_id, { limit: 500 }),
        getShareTxnList(entity_id, { limit: 1000 }),
        getOfficialList({ entity_id, official_master_slug: 'shareholders', limit: 500 }).catch(() => ({})),
        getEntityShareDecimalSettings(entity_id).catch(() => ({})),
      ]);
      setCompany(compRes?.data || compRes || null);

      const shareList = shareRes?.data?.data || shareRes?.data || [];
      setShares(shareList);

      // Group transactions by company_share_id
      const txns = txnRes?.data?.data || txnRes?.data || [];
      const map  = {};
      shareList.forEach(s => { map[s.id] = []; });
      txns.forEach(t => {
        if (t.transaction_status === 'OUT') return; // OUT rows are internal records, not holdings
        const key = t.company_share_id;
        if (!map[key]) map[key] = [];
        map[key].push(t);
      });
      setTxnMap(map);

      setShareholders(shRes?.data?.data || shRes?.data || []);

      const d = decRes?.data || {};
      setEntityDecimals({
        shares: d.no_of_share_decimal_place   ?? null,
        paid:   d.paid_up_share_decimal_place ?? null,
        issued: d.issued_share_decimal_place  ?? null,
      });
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [entity_id]);

  useEffect(() => { load(); }, [load]);

  const currencies = useMemo(() => [...new Set(shares.map(s => s.currency).filter(Boolean))], [shares]);
  const classes    = useMemo(() => [...new Map(shares.map(s => [s.share_class_id, s.share_class?.name])).entries()].filter(([id]) => id), [shares]);

  // Resolve selected shareholder's entity id for transaction-level filtering
  const selectedEntityId = useMemo(() => {
    if (!fShareholder) return null;
    const sh = shareholders.find(s => String(s.official_id) === fShareholder);
    return sh ? String(sh.official_entity_id) : null;
  }, [fShareholder, shareholders]);

  // Per-group filtered transactions (shareholder + txn type)
  const filteredTxnMap = useMemo(() => {
    if (!selectedEntityId && !fTxType) return txnMap;
    const result = {};
    Object.entries(txnMap).forEach(([shareId, txns]) => {
      result[shareId] = txns.filter(t => {
        if (selectedEntityId && String(t.official_entity_id) !== selectedEntityId) return false;
        if (fTxType && t.share_header?.extra_type_of_transaction !== fTxType) return false;
        return true;
      });
    });
    return result;
  }, [txnMap, selectedEntityId, fTxType]);

  const filteredShares = useMemo(() => shares.filter(s => {
    if (fCurrency && s.currency !== fCurrency) return false;
    if (fClass    && String(s.share_class_id) !== fClass) return false;
    if ((selectedEntityId || fTxType) && (filteredTxnMap[s.id] || []).length === 0) return false;
    return true;
  }), [shares, fCurrency, fClass, selectedEntityId, fTxType, filteredTxnMap]);

  // Merge shares with same currency + share_type + share_class into one group
  const groupedShares = useMemo(() => {
    const map = new Map();
    filteredShares.forEach(s => {
      const key = `${s.currency}__${s.share_type}__${s.share_class_id}`;
      if (!map.has(key)) {
        map.set(key, { rep: s, ids: [], totShares: 0, totIssued: 0, totPaidup: 0 });
      }
      const g = map.get(key);
      g.ids.push(s.id);
      g.totShares += Number(s.number_of_shares    || 0);
      g.totIssued += Number(s.issued_share_capital || 0);
      g.totPaidup += Number(s.paid_up_capital      || 0);
    });
    return [...map.values()].map(g => ({
      ...g.rep,
      number_of_shares:    g.totShares,
      issued_share_capital: g.totIssued,
      paid_up_capital:      g.totPaidup,
      _shareIds:            g.ids,
    }));
  }, [filteredShares]);

  // Combined transaction list per merged group (representative share id as key)
  const groupedTxnMap = useMemo(() => {
    const result = {};
    groupedShares.forEach(gs => {
      const txns = gs._shareIds.flatMap(sid => filteredTxnMap[sid] || []);
      txns.sort((a, b) => {
        const da = a.share_header?.transaction_date || '';
        const db = b.share_header?.transaction_date || '';
        return da.localeCompare(db);
      });
      result[gs.id] = txns;
    });
    return result;
  }, [groupedShares, filteredTxnMap]);

  const handleAddAllotment = (share) => {
    navigate(`/company/${entity_id}/shares/shareholder-register/add`, {
      state: { company_share: share, entity_id: Number(entity_id), company },
    });
  };

  const resetFilters = () => { setFShareholder(''); setFTxType(''); setFCurrency(''); setFClass(''); };

  return (
    <div className="page-content">
      <Container fluid>

        {/* Page Header — outside card, matches EntitySharesPage pattern */}
        <div className="es-page-header">
          <div className="es-page-header-left">
            <div className="es-company-avatar">
              {(company?.name || 'C').charAt(0).toUpperCase()}
            </div>
            <div>
              <Link to={`/company/view/${entity_id}`} className="es-company-name" style={{ textDecoration: 'none' }}>
                {company?.name || '—'}
              </Link>
              <div className="es-company-meta">
                {/* <i className="ri-file-list-3-line" /> Shareholder Shares */}
                {company?.identifications?.[0]?.uen_no && (
                  <>UEN: {company.identifications[0].uen_no}</>
                )}
              </div>
            </div>
          </div>
          <div className="es-page-header-right">
            <button className="btn btn-warning btn-sm d-flex align-items-center gap-1"
              onClick={() => navigate(`/company/${entity_id}/shares`)}>
              <i className="ri-arrow-left-line" /> Company Shares
            </button>
            <button className="btn btn-success btn-sm d-flex align-items-center gap-1"
              onClick={() => navigate(`/company/${entity_id}/shares/shareholder-register/add`, {
                state: { entity_id: Number(entity_id), company },
              })}>
              <i className="ri-add-line" /> Add Share
            </button>
            <button className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              onClick={() => navigate('/officials/shareholders/list', {
                state: {
                  entity: {
                    id:          Number(entity_id),
                    companyName: company?.name || '—',
                    clientNo:    company?.client_no || '—',
                    regNo:       company?.identifications?.[0]?.uen_no || '',
                    status:      company?.status || null,
                  },
                  officialTypes: [],
                },
              })}>
              <i className="ri-group-line" /> Shareholders
            </button>
            <Link to={`/company/view/${entity_id}`}
              className="btn btn-secondary btn-sm d-flex align-items-center gap-1">
              <i className="ri-eye-line" /> View
            </Link>
          </div>
        </div>

        <Card className="es-main-card">

          {/* Filter bar — reuses es-filter-pill style */}
          <div className="ssl-filter-bar">
            <span className="es-filter-label"><i className="ri-filter-3-line" /> Filter By</span>

            <div className="es-filter-pill">
              <span className="es-pill-lbl">Shareholder</span>
              <span className="es-pill-val">{fShareholder ? (shareholders.find(s => String(s.official_id) === fShareholder)?.official_entity?.name || 'Selected') : 'All'}</span>
              <i className="ri-arrow-down-s-line es-pill-arrow" />
              <select className="es-pill-select-overlay" value={fShareholder} onChange={e => setFShareholder(e.target.value)}>
                <option value="">All</option>
                {shareholders.map(s => (
                  <option key={s.official_id} value={s.official_id}>
                    {s.official_entity?.name || `ID ${s.official_id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="es-filter-pill">
              <span className="es-pill-lbl">Txn Type</span>
              <span className="es-pill-val">{TX_TYPE_LABELS[fTxType] || 'All'}</span>
              <i className="ri-arrow-down-s-line es-pill-arrow" />
              <select className="es-pill-select-overlay" value={fTxType} onChange={e => setFTxType(e.target.value)}>
                <option value="">All</option>
                {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="es-filter-pill">
              <span className="es-pill-lbl">Currency</span>
              <span className="es-pill-val">{fCurrency || 'All'}</span>
              <i className="ri-arrow-down-s-line es-pill-arrow" />
              <select className="es-pill-select-overlay" value={fCurrency} onChange={e => setFCurrency(e.target.value)}>
                <option value="">All</option>
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="es-filter-pill">
              <span className="es-pill-lbl">Share Class</span>
              <span className="es-pill-val">{fClass ? (classes.find(([id]) => String(id) === fClass)?.[1] || 'Selected') : 'All'}</span>
              <i className="ri-arrow-down-s-line es-pill-arrow" />
              <select className="es-pill-select-overlay" value={fClass} onChange={e => setFClass(e.target.value)}>
                <option value="">All</option>
                {classes.map(([id, name]) => <option key={id} value={id}>{name || `Class ${id}`}</option>)}
              </select>
            </div>

            <button className="es-filter-reset-btn" title="Reset filters" onClick={resetFilters}>
              <i className="ri-refresh-line" />
            </button>

            {shares.length > 0 && (
              <span className="es-record-badge" style={{ marginLeft: 'auto' }}>
                <i className="ri-stack-line" /> {groupedShares.length} class{groupedShares.length !== 1 ? 'es' : ''}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="ssl-body">
            {loading ? (
              <div className="ssl-loading">
                <Spinner size="sm" style={{ color: '#405189' }} /> Loading...
              </div>
            ) : groupedShares.length === 0 ? (
              <div className="ssl-empty-state">
                <div className="ssl-empty-icon"><i className="ri-file-list-3-line" /></div>
                <h5>No company shares found</h5>
                <p>Add company-level shares first from the Share Register.</p>
                <button className="btn btn-warning btn-sm mt-3 d-inline-flex align-items-center gap-1"
                  onClick={() => navigate(`/company/${entity_id}/shares`)}>
                  <i className="ri-arrow-left-line" /> Go to Share Register
                </button>
              </div>
            ) : (
              groupedShares.map((share, idx) => (
                <React.Fragment key={share.id}>
                  {idx > 0 && (
                    <div className="es-section-divider">
                      <span className="es-divider-line" />
                      <span className="es-divider-dot"><i className="ri-more-line" /></span>
                      <span className="es-divider-line" />
                    </div>
                  )}
                  <ShareGroup
                    share={share}
                    transactions={groupedTxnMap[share.id] || []}
                    onAddAllotment={handleAddAllotment}
                    entityId={entity_id}
                    company={company}
                    dec={effDecimals}
                    onRefresh={load}
                  />
                </React.Fragment>
              ))
            )}
          </div>

        </Card>
      </Container>
    </div>
  );
};

export default ShareholderSharesListPage;
