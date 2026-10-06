import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'reactstrap';
import ShareConsiderationModal from '../../Components/Common/ShareConsiderationModal';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import SharePageStrip from '../../Components/Common/SharePageStrip';
import ClubSourceTable from '../../Components/Common/ClubSourceTable';
import {
  getCompany, getShareTxn, getShareTxnList, getOfficialList, createShareTransfer, createShareClubTransfer,
} from '../../helpers/backend_helper';
import './ShareTransferPage.css';

const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };
const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const mkBlock = (txn) => ({
  id: `${Date.now()}-${Math.random()}`,
  txn,
  transferQty: '',
  transferorCertNo: '',
  transferorInstalment: 'NO',
  transferorPayDate: '',
  transferorInstalmtDoc: null,
  transferorStampDuty: '',
  transferorStampDutyDate: '',
  transferorStampDutyAmt: '',
  transferorStampDutyDoc: null,
  transferorRemarks: '',
  transfereeFolioNo: '',
  transfereeCertNo: '',
  transfereeInstalment: 'NO',
  transfereePayDate: '',
  transfereeInstalmtDoc: null,
  transfereeStampDuty: '',
  transfereeStampDutyDate: '',
  transfereeStampDutyAmt: '',
  transfereeStampDutyDoc: null,
  transfereeRemarks: '',
  transfereeConsid: { cash: 0, oc: 0 },
  transferorConsid: { cash: 0, oc: 0 },
  showModal: null,
});

// ── Consideration Modal ───────────────────────────────────────────────────────

const TransferArrow = React.memo(() => (
  <div className="stp-arrow-col">
    <div className="stp-arrow-wrap">
      <div className="stp-arrow-circle"><i className="ri-arrow-right-line" /></div>
      <div className="stp-arrow-line" />
    </div>
  </div>
));

// ── Shares Input (isolated so typing never re-renders TransferBlock) ──────────
const SharesInput = React.memo(({ maxQty, initialQty, onCommit }) => {
  const [val, setVal] = useState(initialQty ?? '');
  const debRef = useRef(null);

  const handleChange = e => {
    const v = e.target.value;
    setVal(v);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => onCommit(v), 300);
  };

  return (
    <div className="stp-field">
      <label className="stp-lbl">No. of Shares <span className="stp-req">*</span></label>
      <input className="stp-input" type="number" min="1" max={maxQty}
        value={val} onChange={handleChange} placeholder={`Max ${maxQty}`} />
      <span className="stp-err" style={{ visibility: Number(val) > maxQty ? 'visible' : 'hidden' }}>
        Exceeds {maxQty}
      </span>
    </div>
  );
});

// ── Transfer Block ────────────────────────────────────────────────────────────
const TransferBlock = React.memo(({ block, blockId, onUpdate, onRemove, canRemove, shareholders, transfereeId, onTransfereeChange, isUbo, onUboChange, isMultiple, index, torCombineActiveCert, teeCombineActiveCert }) => {
  const { txn } = block;

  // Stable per-block handlers so child components never get new function references
  const handleUpdate = useCallback((updates) => onUpdate(blockId, updates), [onUpdate, blockId]);
  const handleRemove = useCallback(() => onRemove(blockId), [onRemove, blockId]);

  // Stable refs so handleQtyCommit never changes identity (keeps SharesInput from re-rendering)
  const txnRef      = useRef(txn);
  const onUpdateRef = useRef(handleUpdate);
  useEffect(() => { txnRef.current = txn; onUpdateRef.current = handleUpdate; });

  // Equalize column heights; re-run when stamp duty conditional rows appear/disappear
  const threeColRef = useRef(null);
  useEffect(() => {
    const el = threeColRef.current;
    if (!el) return;
    const cols = el.querySelectorAll(':scope > .stp-col-balance, :scope > .stp-col-transferee, :scope > .stp-col-summary');
    cols.forEach(c => { c.style.minHeight = ''; });
    let maxH = 0;
    cols.forEach(c => { maxH = Math.max(maxH, c.offsetHeight); });
    cols.forEach(c => { c.style.minHeight = maxH + 'px'; });
  }, [block.transferorStampDuty, block.transfereeStampDuty]);

  const handleQtyCommit = useCallback((val) => {
    const t = txnRef.current;
    if (!t) return;
    const total = Number(t.no_of_shares || 1);
    const q   = Math.min(Number(val || 0), total);
    const r   = q / total;
    const sc  = Number(t.cash || 0), so = Number(t.otherwise_cash || 0);
    const tc  = parseFloat((sc * r).toFixed(2));
    const to_ = parseFloat((so * r).toFixed(2));
    onUpdateRef.current({
      transferQty:      val,
      transfereeConsid: { cash: tc,                                           oc: to_ },
      transferorConsid: { cash: parseFloat((sc - tc).toFixed(2)), oc: parseFloat((so - to_).toFixed(2)) },
    });
  }, []); // stable forever — refs handle live values

  const maxQty    = Number(txn?.no_of_shares || 0);
  const qty       = Number(block.transferQty || 0);
  const balQty    = Math.max(0, maxQty - qty);
  const perSh     = Number(txn?.per_share || 0);
  const issuedAmt = qty * perSh;
  const tcTotal   = block.transfereeConsid.cash + block.transfereeConsid.oc;
  const torTotal  = block.transferorConsid.cash + block.transferorConsid.oc;
  const srcConsid = Number(txn?.cash || 0) + Number(txn?.otherwise_cash || 0);
  const transferorEntityId   = txn?.official_entity_id;
  const eligibleShareholders = shareholders.filter(s => String(s.official_entity_id) !== String(transferorEntityId));
  const selectedTransferee   = eligibleShareholders.find(s => String(s.official_id) === transfereeId);
  const transferorName       = txn?.official_entity?.name || '—';
  const shareClass           = txn?.share_class?.sc_name || '—';
  const shareType            = SHARE_TYPE_LABELS[txn?.share_type] || '—';

  return (
    <div className="stp-block">
      {/* Transferor strip */}
      <div className="stp-tor-strip">
        {isMultiple && <span className="stp-txn-badge">#{index + 1}</span>}
        <div className="stp-tor-identity">
          <div className="stp-tor-avatar"><i className="ri-user-line" /></div>
          <div>
            <div className="stp-tor-name">{transferorName}</div>
            <div className="stp-tor-role">Transferor · Current Holder</div>
          </div>
        </div>
        <div className="stp-tor-stats">
          {[
            { label: 'Cert No.',      val: txn?.share_cert_no || '—' },
            { label: 'Folio No.',     val: txn?.folio_no      || '—' },
            { label: 'No. of Shares', val: fmtNum(txn?.no_of_shares), hi: true },
            { label: 'Per Share',     val: fmtNum(txn?.per_share, 4) },
            { label: 'Consideration Paid-up', val: fmt2(srcConsid) },
            { label: 'Txn Date',      val: fmtDate(txn?.share_header?.transaction_date) },
          ].map(s => (
            <div className="stp-tor-stat" key={s.label}>
              <span className="stp-tor-stat-lbl">{s.label}</span>
              <span className={`stp-tor-stat-val${s.hi ? ' stp-tor-stat-val--hi' : ''}`}>{s.val}</span>
            </div>
          ))}
        </div>
        {canRemove && (
          <button className="stp-block-remove" onClick={handleRemove} title="Remove this block">
            <i className="ri-close-circle-line" />
          </button>
        )}
      </div>

      {/* 3 columns */}
      <div className="stp-three-col" ref={threeColRef}>

        {/* Col 1 — Balance */}
        <div className="stp-col-balance">
          <div className="stp-card stp-card--balance">
            <div className="stp-card-hdr stp-card-hdr--balance">
              <i className="ri-scales-3-line" /> Transferor Balance
            </div>
            <div className="stp-form-grid">
              <div className="stp-field">
                <label className="stp-lbl">Folio No.</label>
                <input className="stp-input stp-input--ro" readOnly value={txn?.folio_no || ''} placeholder="—" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Cert No. {balQty > 0 && !torCombineActiveCert && <span className="stp-req">*</span>}</label>
                <input
                  className={`stp-input${(balQty <= 0 || torCombineActiveCert) ? ' stp-input--ro' : ''}`}
                  value={balQty <= 0 ? '' : (torCombineActiveCert || block.transferorCertNo)}
                  onChange={e => balQty > 0 && !torCombineActiveCert && handleUpdate({ transferorCertNo: e.target.value })}
                  placeholder={balQty <= 0 ? 'No balance' : 'e.g. C001-B'}
                  readOnly={balQty > 0 && !!torCombineActiveCert}
                  disabled={balQty <= 0}
                />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Balance Share</label>
                <input className="stp-input stp-input--ro" readOnly value={fmtNum(balQty)} placeholder="—" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Balance Consideration</label>
                <button
                  className={`stp-consid-edit-btn stp-consid-edit-btn--balance${qty <= 0 ? ' stp-consid-edit-btn--disabled' : ''}`}
                  disabled={qty <= 0}
                  onClick={() => qty > 0 && handleUpdate({ showModal: 'transferor' })}
                >
                  <i className="ri-money-dollar-circle-line" />{fmt2(torTotal)} / {fmt2(torTotal)}<i className="ri-pencil-line stp-edit-icon" />
                </button>
              </div>
            </div>

            {/* Installment / Partial section */}
            <div className="stp-sub-section">
              <div className="stp-sub-section-hdr"><i className="ri-calendar-schedule-line" /> Transferor Installment / Partial Payments</div>
              <div className="stp-form-grid">
                <div className="stp-field">
                  <label className="stp-lbl">Installment/Partial Payments <span className="stp-req">*</span></label>
                  <select className="stp-input" value={block.transferorInstalment} onChange={e => handleUpdate({ transferorInstalment: e.target.value })}>
                    <option value="NO">NO</option><option value="YES">YES</option>
                  </select>
                </div>
                <div className="stp-field">
                  <label className="stp-lbl">Upload Document</label>
                  <input className="stp-input stp-input--file" type="file" onChange={e => handleUpdate({ transferorInstalmtDoc: e.target.files?.[0] || null })} />
                </div>
                <div className="stp-field">
                  <label className="stp-lbl">Payment Date</label>
                  <DatePickerInput value={block.transferorPayDate} onChange={e => handleUpdate({ transferorPayDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
                </div>
              </div>
            </div>

            {/* Stamp Duty section */}
            <div className="stp-sub-section">
              <div className="stp-sub-section-hdr"><i className="ri-government-line" /> Transferor Stamp Duty Payment</div>
              <div className="stp-form-grid">
                <div className="stp-field">
                  <label className="stp-lbl">Stamp Duty Payment <span className="stp-req">*</span></label>
                  <select className="stp-input" value={block.transferorStampDuty} onChange={e => handleUpdate({ transferorStampDuty: e.target.value })}>
                    <option value="">Choose</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </select>
                </div>
                {block.transferorStampDuty === 'YES' && <>
                  <div className="stp-field">
                    <label className="stp-lbl">Stamp Duty Payment Date</label>
                    <DatePickerInput value={block.transferorStampDutyDate} onChange={e => handleUpdate({ transferorStampDutyDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
                  </div>
                  <div className="stp-field">
                    <label className="stp-lbl">Upload Document</label>
                    <input className="stp-input stp-input--file" type="file" onChange={e => handleUpdate({ transferorStampDutyDoc: e.target.files?.[0] || null })} />
                  </div>
                  <div className="stp-field">
                    <label className="stp-lbl">Stamp Duty Payment Amount</label>
                    <input className="stp-input" type="number" min="0" value={block.transferorStampDutyAmt} onChange={e => handleUpdate({ transferorStampDutyAmt: e.target.value })} placeholder="0.00" />
                  </div>
                </>}
                <div className="stp-field">
                  <label className="stp-lbl">Transferor Remarks</label>
                  <textarea className="stp-textarea" rows={2} value={block.transferorRemarks} onChange={e => handleUpdate({ transferorRemarks: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <TransferArrow />

        {/* Col 2 — Transferee */}
        <div className="stp-col-transferee">
          <div className="stp-card stp-card--transferee">
            <div className="stp-card-hdr stp-card-hdr--transferee">
              <i className="ri-user-received-line" /> Transferee
              {selectedTransferee && <span className="stp-card-hdr-name">{selectedTransferee.official_entity?.name}</span>}
            </div>
            <div className="stp-form-grid">
              <div className="stp-field">
                <label className="stp-lbl">Folio No. <span className="stp-req">*</span></label>
                <input className="stp-input" value={block.transfereeFolioNo} onChange={e => handleUpdate({ transfereeFolioNo: e.target.value })} placeholder="e.g. F002" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Cert No. {!teeCombineActiveCert && <span className="stp-req">*</span>}</label>
                <input
                  className={`stp-input${teeCombineActiveCert ? ' stp-input--ro' : ''}`}
                  value={teeCombineActiveCert || block.transfereeCertNo}
                  onChange={e => !teeCombineActiveCert && handleUpdate({ transfereeCertNo: e.target.value })}
                  placeholder="e.g. C002"
                  readOnly={!!teeCombineActiveCert}
                />
              </div>
              <SharesInput maxQty={maxQty} initialQty={block.transferQty} onCommit={handleQtyCommit} />
              <div className="stp-field">
                <label className="stp-lbl">Consideration Paid</label>
                <button
                  className={`stp-consid-edit-btn stp-consid-edit-btn--transferee${qty <= 0 ? ' stp-consid-edit-btn--disabled' : ''}`}
                  onClick={() => qty > 0 && handleUpdate({ showModal: 'transferee' })}
                  disabled={qty <= 0}
                >
                  <i className="ri-money-dollar-circle-line" />
                  {fmt2(tcTotal)} / {fmt2(tcTotal)}
                  <i className="ri-pencil-line stp-edit-icon" style={{ opacity: qty > 0 ? 1 : 0 }} />
                </button>
              </div>
            </div>

            {/* Installment / Partial section */}
            <div className="stp-sub-section">
              <div className="stp-sub-section-hdr"><i className="ri-calendar-schedule-line" /> Transferee Installment / Partial Payments</div>
              <div className="stp-form-grid">
                <div className="stp-field">
                  <label className="stp-lbl">Installment/Partial Payments <span className="stp-req">*</span></label>
                  <select className="stp-input" value={block.transfereeInstalment} onChange={e => handleUpdate({ transfereeInstalment: e.target.value })}>
                    <option value="NO">NO</option><option value="YES">YES</option>
                  </select>
                </div>
                <div className="stp-field">
                  <label className="stp-lbl">Upload Document</label>
                  <input className="stp-input stp-input--file" type="file" onChange={e => handleUpdate({ transfereeInstalmtDoc: e.target.files?.[0] || null })} />
                </div>
                <div className="stp-field">
                  <label className="stp-lbl">Payment Date</label>
                  <DatePickerInput value={block.transfereePayDate} onChange={e => handleUpdate({ transfereePayDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
                </div>
              </div>
            </div>

            {/* Stamp Duty section */}
            <div className="stp-sub-section">
              <div className="stp-sub-section-hdr"><i className="ri-government-line" /> Transferee Stamp Duty Payment</div>
              <div className="stp-form-grid">
                <div className="stp-field">
                  <label className="stp-lbl">Stamp Duty Payment <span className="stp-req">*</span></label>
                  <select className="stp-input" value={block.transfereeStampDuty} onChange={e => handleUpdate({ transfereeStampDuty: e.target.value })}>
                    <option value="">Choose</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </select>
                </div>
                {block.transfereeStampDuty === 'YES' && <>
                  <div className="stp-field">
                    <label className="stp-lbl">Stamp Duty Payment Date</label>
                    <DatePickerInput value={block.transfereeStampDutyDate} onChange={e => handleUpdate({ transfereeStampDutyDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
                  </div>
                  <div className="stp-field">
                    <label className="stp-lbl">Upload Document</label>
                    <input className="stp-input stp-input--file" type="file" onChange={e => handleUpdate({ transfereeStampDutyDoc: e.target.files?.[0] || null })} />
                  </div>
                  <div className="stp-field">
                    <label className="stp-lbl">Stamp Duty Payment Amount</label>
                    <input className="stp-input" type="number" min="0" value={block.transfereeStampDutyAmt} onChange={e => handleUpdate({ transfereeStampDutyAmt: e.target.value })} placeholder="0.00" />
                  </div>
                </>}
                <div className="stp-field">
                  <label className="stp-lbl">Transferee Remarks</label>
                  <textarea className="stp-textarea" rows={2} value={block.transfereeRemarks} onChange={e => handleUpdate({ transfereeRemarks: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Col 3 — Summary */}
        <div className={isMultiple ? 'stp-col-summary stp-col-summary--flow' : 'stp-col-summary'}>
          <div className="stp-summary-card">
            <div className="stp-summary-title"><i className="ri-file-list-3-line" /> Transfer Summary</div>

            {/* Parties */}
            <div className="stp-sum-parties">
              <span className="stp-sum-party stp-sum-party--tor">{transferorName}</span>
              <i className="ri-arrow-right-line stp-sum-party-arrow" />
              <span className="stp-sum-party stp-sum-party--tee">
                {selectedTransferee ? selectedTransferee.official_entity?.name : <span className="stp-sum-empty">Not selected</span>}
              </span>
            </div>

            {/* Balance Visual */}
            <div className="stp-sum-bal-visual">
              <div className="stp-sum-bal-tile">
                <span className="stp-sum-bal-lbl">Original</span>
                <span className="stp-sum-bal-num">{fmtNum(maxQty)}</span>
              </div>
              <span className="stp-sum-bal-op">−</span>
              <div className="stp-sum-bal-tile">
                <span className="stp-sum-bal-lbl">Transferring</span>
                <span className="stp-sum-bal-num stp-sum-bal-num--out">{fmtNum(qty || 0)}</span>
              </div>
              <span className="stp-sum-bal-op">=</span>
              <div className="stp-sum-bal-tile">
                <span className="stp-sum-bal-lbl">Remaining</span>
                <span className={`stp-sum-bal-num ${balQty === 0 ? 'stp-sum-bal-num--zero' : 'stp-sum-bal-num--in'}`}>{fmtNum(balQty)}</span>
              </div>
            </div>

            {/* Transfer Numbers */}
            <div className="stp-sum-stat"><span>Per Share</span><strong>{fmtNum(perSh, 4)}</strong></div>
            <div className="stp-sum-stat"><span>Issued Capital</span><strong className="stp-sum-stat-val--yellow">{qty > 0 ? `${txn?.currency || 'SGD'} ${fmt2(issuedAmt)}` : '—'}</strong></div>

            <div className="stp-sum-divider" />

            {/* Transferee Consideration */}
            <div className="stp-sum-consid-hdr stp-sum-consid-hdr--tee">
              <i className="ri-user-received-line" /> Transferee Consideration
            </div>
            <div className="stp-sum-stat stp-sum-stat--sm"><span>Cash</span><span>{fmt2(block.transfereeConsid.cash)}</span></div>
            <div className="stp-sum-stat stp-sum-stat--sm"><span>Otherwise in Cash</span><span>{fmt2(block.transfereeConsid.oc)}</span></div>
            <div className="stp-sum-stat stp-sum-stat--sm stp-sum-stat--bold"><span>Total</span><strong className="stp-sum-stat-val--green">{fmt2(tcTotal)}</strong></div>

            <div className="stp-sum-divider" />

            {/* Balance Consideration */}
            <div className="stp-sum-consid-hdr stp-sum-consid-hdr--bal">
              <i className="ri-scales-3-line" /> Balance Consideration
            </div>
            <div className="stp-sum-stat stp-sum-stat--sm"><span>Cash</span><span>{fmt2(block.transferorConsid.cash)}</span></div>
            <div className="stp-sum-stat stp-sum-stat--sm"><span>Otherwise in Cash</span><span>{fmt2(block.transferorConsid.oc)}</span></div>
            <div className="stp-sum-stat stp-sum-stat--sm stp-sum-stat--bold" style={{ paddingBottom: 10 }}><span>Total</span><strong className="stp-sum-stat-val--red">{fmt2(torTotal)}</strong></div>
          </div>
        </div>

      </div>

      {(() => {
        const isTransferee = block.showModal === 'transferee';
        const srcCash  = Number(txn?.cash || 0);
        const srcOC    = Number(txn?.otherwise_cash || 0);
        const allocCash = isTransferee ? 0 : block.transfereeConsid.cash;
        const allocOC   = isTransferee ? 0 : block.transfereeConsid.oc;
        const balCash   = Math.max(0, srcCash - allocCash);
        const balOC     = Math.max(0, srcOC - allocOC);
        const total     = Number(txn?.no_of_shares || 1);
        const qty       = Number(block.transferQty || 0);
        const ratio     = qty / total;
        const initCash  = isTransferee ? srcCash * ratio : balCash;
        const initOC    = isTransferee ? srcOC   * ratio : balOC;
        return (
          <ShareConsiderationModal
            open={!!block.showModal}
            onClose={() => handleUpdate({ showModal: null })}
            partyLabel={isTransferee ? 'Transferee' : 'Transferor'}
            srcCash={srcCash}
            srcOC={srcOC}
            allocCash={allocCash}
            allocOC={allocOC}
            initialCash={initCash}
            initialOC={initOC}
            onSave={({ cash, oc }) => {
              const vals = { cash, oc };
              if (block.showModal === 'transferee') handleUpdate({ transfereeConsid: vals });
              else                                  handleUpdate({ transferorConsid: vals });
            }}
          />
        );
      })()}
    </div>
  );
});

// ── Club Transfer Panel ───────────────────────────────────────────────────────
const ClubTransferPanel = ({ blocks, shareholders, transfereeId, clubState, onUpdate, typeOfValue }) => {
  const upd = useCallback((updates) => onUpdate(updates), [onUpdate]);
  const isDiff = typeOfValue === 'different';

  const totalShares = blocks.reduce((s, b) => s + Number(b.txn?.no_of_shares || 0), 0);
  const totalCash   = blocks.reduce((s, b) => s + Number(b.txn?.cash || 0), 0);
  const totalOC     = blocks.reduce((s, b) => s + Number(b.txn?.otherwise_cash || 0), 0);
  const totalConsid = totalCash + totalOC;
  const totalIssued = blocks.reduce((s, b) => s + Number(b.txn?.issued_share_capital || 0), 0);
  const weightedPS  = totalShares > 0 ? totalConsid / totalShares : 0;

  const teeQty    = Math.min(Math.max(0, Number(clubState.transfereeQty || 0)), totalShares);
  const balQty    = Math.max(0, totalShares - teeQty);

  // "Same" mode — pro-rata split
  const teeRatio      = totalShares > 0 ? teeQty / totalShares : 0;
  const teeConsidSame = parseFloat((totalConsid * teeRatio).toFixed(2));
  const balConsidSame = parseFloat((totalConsid - teeConsidSame).toFixed(2));

  // "Different" mode — user enters paid-up for transferee directly
  const teePaidup  = isDiff ? Math.min(Number(clubState.transfereePaidup  || 0), totalConsid) : teeConsidSame;
  const teeIssued  = isDiff ? Math.min(Number(clubState.transfereeIssued  || 0), totalIssued) : teeConsidSame;
  const balPaidup  = parseFloat((totalConsid - teePaidup).toFixed(2));
  const balIssued  = parseFloat((totalIssued - teeIssued).toFixed(2));
  const teePerShare = teeQty > 0 ? teePaidup / teeQty : 0;
  const balPerShare = balQty > 0 ? balPaidup / balQty : 0;

  const teeConsid = isDiff ? teePaidup : teeConsidSame;
  const balConsid = isDiff ? balPaidup : balConsidSame;

  const selectedTransferee = shareholders.find(s => String(s.official_id) === String(transfereeId));
  const firstTxn = blocks[0]?.txn;

  return (
    <div className="stp-club-panel">

      {/* ── Source certs table ── */}
      <div className="stp-club-box">
        <div className="stp-club-box-hdr">
          <i className="ri-stack-line" /> Club Pool — Source Certificates
          <span className="stp-club-box-badge">{blocks.length} certs</span>
        </div>
        <div className="stp-tbl-scroll">
          <table className="stp-club-tbl">
            <thead>
              <tr>
                <th>Share Cert No.</th>
                <th>Per Share</th>
                <th>No. of Shares</th>
                {isDiff && <th>Paid-up Capital</th>}
                {isDiff && <th>Issued Capital</th>}
                <th>Consideration Paid-up</th>
                <th>Transaction Date</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => {
                const t = b.txn;
                const c = Number(t?.cash || 0) + Number(t?.otherwise_cash || 0);
                return (
                  <tr key={b.id} className="stp-club-src-row">
                    <td><span className="stp-combine-cert">{t?.share_cert_no || '—'}</span></td>
                    <td>{fmtNum(t?.per_share, 2)}</td>
                    <td><strong>{fmtNum(t?.no_of_shares)}</strong></td>
                    {isDiff && <td>{fmt2(c)}</td>}
                    {isDiff && <td>{fmt2(t?.issued_share_capital || 0)}</td>}
                    <td>{fmt2(c)} / {fmt2(c)}</td>
                    <td>{fmtDate(t?.share_header?.transaction_date)}</td>
                  </tr>
                );
              })}

              {/* Total row */}
              <tr className="stp-club-total-row">
                <td><strong>Total Current Shares</strong></td>
                <td><strong>{fmtNum(weightedPS, 2)}</strong></td>
                <td><strong>{fmtNum(totalShares)}</strong></td>
                {isDiff && <td><strong>{fmt2(totalConsid)}</strong></td>}
                {isDiff && <td><strong>{fmt2(totalIssued)}</strong></td>}
                <td><strong>{fmt2(totalConsid)} / {fmt2(totalConsid)}</strong></td>
                <td />
              </tr>

              {/* Transferee row */}
              <tr className="stp-club-tee-row">
                <td><strong className="stp-club-tee-lbl"><i className="ri-user-received-line" /> Transferee</strong></td>
                <td>{isDiff ? fmtNum(teePerShare, 2) : fmtNum(weightedPS, 2)}</td>
                <td className="stp-club-qty-cell">
                  <input
                    className="stp-club-qty-input"
                    type="number" min="0" max={totalShares}
                    value={clubState.transfereeQty}
                    onChange={e => upd({ transfereeQty: e.target.value })}
                    placeholder={`Max ${totalShares}`}
                  />
                  {Number(clubState.transfereeQty) > totalShares && (
                    <span className="stp-club-qty-err">Exceeds {totalShares}</span>
                  )}
                </td>
                {isDiff && (
                  <td>
                    <input className="stp-club-qty-input stp-club-diff-input"
                      type="number" min="0"
                      value={clubState.transfereePaidup}
                      onChange={e => upd({ transfereePaidup: e.target.value })}
                      placeholder="Paid-up" />
                  </td>
                )}
                {isDiff && (
                  <td>
                    <input className="stp-club-qty-input stp-club-diff-input"
                      type="number" min="0"
                      value={clubState.transfereeIssued}
                      onChange={e => upd({ transfereeIssued: e.target.value })}
                      placeholder="Issued" />
                  </td>
                )}
                <td>
                  <span className="stp-club-consid-pill stp-club-consid-pill--tee">
                    <i className="ri-money-dollar-circle-line" /> {fmt2(teeConsid)} / {fmt2(teeConsid)}
                  </span>
                </td>
                <td />
              </tr>

              {/* Balance row */}
              <tr className="stp-club-bal-row">
                <td><span className="stp-club-bal-lbl"><i className="ri-scales-3-line" /> Transferor Balance Share</span></td>
                <td>{isDiff ? fmtNum(balPerShare, 2) : fmtNum(weightedPS, 2)}</td>
                <td><strong>{fmtNum(balQty)}</strong></td>
                {isDiff && <td>{fmt2(balPaidup)}</td>}
                {isDiff && <td>{fmt2(balIssued)}</td>}
                <td>
                  <span className="stp-club-consid-pill stp-club-consid-pill--bal">
                    <i className="ri-money-dollar-circle-line" /> {fmt2(balConsid)} / {fmt2(balConsid)}
                  </span>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Transferee + Balance cards ── */}
      <div className="stp-club-cards">

        {/* Transferee card */}
        <div className="stp-card stp-card--transferee">
          <div className="stp-card-hdr stp-card-hdr--transferee">
            <i className="ri-user-received-line" /> Transferee
            {selectedTransferee && <span className="stp-card-hdr-name">{selectedTransferee.official_entity?.name}</span>}
          </div>
          <div className="stp-form-grid">
            <div className="stp-field">
              <label className="stp-lbl">Folio No. <span className="stp-req">*</span></label>
              <input className="stp-input" value={clubState.transfereeFolioNo}
                onChange={e => upd({ transfereeFolioNo: e.target.value })} placeholder="e.g. F002" />
            </div>
            <div className="stp-field">
              <label className="stp-lbl">Cert No. <span className="stp-req">*</span></label>
              <input className="stp-input" value={clubState.transfereeCertNo}
                onChange={e => upd({ transfereeCertNo: e.target.value })} placeholder="e.g. C002" />
            </div>
            <div className="stp-field">
              <label className="stp-lbl">Installment/Partial Payments <span className="stp-req">*</span></label>
              <select className="stp-input" value={clubState.transfereeInstalment}
                onChange={e => upd({ transfereeInstalment: e.target.value })}>
                <option value="NO">NO</option><option value="YES">YES</option>
              </select>
            </div>
            {clubState.transfereeInstalment === 'YES' && <>
              <div className="stp-field">
                <label className="stp-lbl">Upload Document</label>
                <input className="stp-input stp-input--file" type="file"
                  onChange={e => upd({ transfereeInstalmtDoc: e.target.files?.[0] || null })} />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Payment Date</label>
                <DatePickerInput value={clubState.transfereePayDate}
                  onChange={e => upd({ transfereePayDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
              </div>
            </>}
            <div className="stp-field">
              <label className="stp-lbl">Stamp Duty Payment <span className="stp-req">*</span></label>
              <select className="stp-input" value={clubState.transfereeStampDuty}
                onChange={e => upd({ transfereeStampDuty: e.target.value })}>
                <option value="">Choose</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
              </select>
            </div>
            {clubState.transfereeStampDuty === 'YES' && <>
              <div className="stp-field">
                <label className="stp-lbl">Stamp Duty Date</label>
                <DatePickerInput value={clubState.transfereeStampDutyDate}
                  onChange={e => upd({ transfereeStampDutyDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Stamp Duty Amount</label>
                <input className="stp-input" type="number" min="0" value={clubState.transfereeStampDutyAmt}
                  onChange={e => upd({ transfereeStampDutyAmt: e.target.value })} placeholder="0.00" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Upload Document</label>
                <input className="stp-input stp-input--file" type="file"
                  onChange={e => upd({ transfereeStampDutyDoc: e.target.files?.[0] || null })} />
              </div>
            </>}
            <div className="stp-field">
              <label className="stp-lbl">Transferee Remarks</label>
              <textarea className="stp-textarea" rows={2} value={clubState.transfereeRemarks}
                onChange={e => upd({ transfereeRemarks: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Balance card */}
        <div className="stp-card stp-card--balance">
          <div className="stp-card-hdr stp-card-hdr--balance">
            <i className="ri-scales-3-line" /> Transferor Balance
          </div>
          <div className="stp-form-grid">
            <div className="stp-field">
              <label className="stp-lbl">Folio No.</label>
              <input className="stp-input stp-input--ro" readOnly value={firstTxn?.folio_no || ''} placeholder="—" />
            </div>
            <div className="stp-field">
              <label className="stp-lbl">Cert No. {balQty > 0 && <span className="stp-req">*</span>}</label>
              <input
                className={`stp-input${balQty <= 0 ? ' stp-input--ro' : ''}`}
                value={balQty <= 0 ? '' : clubState.balanceCertNo}
                onChange={e => balQty > 0 && upd({ balanceCertNo: e.target.value })}
                placeholder={balQty <= 0 ? 'No balance' : 'e.g. C001-B'}
                disabled={balQty <= 0}
              />
            </div>
            <div className="stp-field">
              <label className="stp-lbl">Installment/Partial Payments <span className="stp-req">*</span></label>
              <select className="stp-input" value={clubState.transferorInstalment}
                onChange={e => upd({ transferorInstalment: e.target.value })}>
                <option value="NO">NO</option><option value="YES">YES</option>
              </select>
            </div>
            {clubState.transferorInstalment === 'YES' && <>
              <div className="stp-field">
                <label className="stp-lbl">Upload Document</label>
                <input className="stp-input stp-input--file" type="file"
                  onChange={e => upd({ transferorInstalmtDoc: e.target.files?.[0] || null })} />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Payment Date</label>
                <DatePickerInput value={clubState.transferorPayDate}
                  onChange={e => upd({ transferorPayDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
              </div>
            </>}
            <div className="stp-field">
              <label className="stp-lbl">Stamp Duty Payment <span className="stp-req">*</span></label>
              <select className="stp-input" value={clubState.transferorStampDuty}
                onChange={e => upd({ transferorStampDuty: e.target.value })}>
                <option value="">Choose</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
              </select>
            </div>
            {clubState.transferorStampDuty === 'YES' && <>
              <div className="stp-field">
                <label className="stp-lbl">Stamp Duty Date</label>
                <DatePickerInput value={clubState.transferorStampDutyDate}
                  onChange={e => upd({ transferorStampDutyDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Stamp Duty Amount</label>
                <input className="stp-input" type="number" min="0" value={clubState.transferorStampDutyAmt}
                  onChange={e => upd({ transferorStampDutyAmt: e.target.value })} placeholder="0.00" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Upload Document</label>
                <input className="stp-input stp-input--file" type="file"
                  onChange={e => upd({ transferorStampDutyDoc: e.target.files?.[0] || null })} />
              </div>
            </>}
            <div className="stp-field">
              <label className="stp-lbl">Transferor Remarks</label>
              <textarea className="stp-textarea" rows={2} value={clubState.transferorRemarks}
                onChange={e => upd({ transferorRemarks: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Summary widget */}
        <div className="stp-summary-card stp-club-summary-card">
          <div className="stp-summary-title"><i className="ri-merge-cells-horizontal" /> Club Transfer Summary</div>
          <div className="stp-sum-bal-visual">
            <div className="stp-sum-bal-tile">
              <span className="stp-sum-bal-lbl">Pool</span>
              <span className="stp-sum-bal-num">{fmtNum(totalShares)}</span>
            </div>
            <span className="stp-sum-bal-op">−</span>
            <div className="stp-sum-bal-tile">
              <span className="stp-sum-bal-lbl">Transferring</span>
              <span className="stp-sum-bal-num stp-sum-bal-num--out">{fmtNum(teeQty)}</span>
            </div>
            <span className="stp-sum-bal-op">=</span>
            <div className="stp-sum-bal-tile">
              <span className="stp-sum-bal-lbl">Balance</span>
              <span className={`stp-sum-bal-num ${balQty === 0 ? 'stp-sum-bal-num--zero' : 'stp-sum-bal-num--in'}`}>{fmtNum(balQty)}</span>
            </div>
          </div>
          <div className="stp-sum-divider" />
          {isDiff
            ? <><div className="stp-sum-stat"><span>Tee Per Share</span><strong>{fmtNum(teePerShare, 4)}</strong></div>
                <div className="stp-sum-stat"><span>Bal Per Share</span><strong>{fmtNum(balPerShare, 4)}</strong></div></>
            : <div className="stp-sum-stat"><span>Weighted Avg / Share</span><strong>{fmtNum(weightedPS, 4)}</strong></div>
          }
          <div className="stp-sum-stat"><span>Sources Clubbed</span><strong>{blocks.length} certs</strong></div>
          <div className="stp-sum-divider" />
          <div className="stp-sum-consid-hdr stp-sum-consid-hdr--tee"><i className="ri-user-received-line" /> Transferee</div>
          <div className="stp-sum-stat stp-sum-stat--sm"><span>Shares</span><span>{fmtNum(teeQty)}</span></div>
          <div className="stp-sum-stat stp-sum-stat--sm stp-sum-stat--bold"><span>Consideration</span><strong className="stp-sum-stat-val--green">{fmt2(teeConsid)}</strong></div>
          <div className="stp-sum-divider" />
          <div className="stp-sum-consid-hdr stp-sum-consid-hdr--bal"><i className="ri-scales-3-line" /> Balance</div>
          <div className="stp-sum-stat stp-sum-stat--sm"><span>Shares</span><span>{fmtNum(balQty)}</span></div>
          <div className="stp-sum-stat stp-sum-stat--sm stp-sum-stat--bold" style={{ paddingBottom: 10 }}><span>Consideration</span><strong className="stp-sum-stat-val--red">{fmt2(balConsid)}</strong></div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareTransferPage = () => {
  useCollapseSidebar();
  const { entity_id, txn_id } = useParams();
  const navigate               = useNavigate();
  const { state }              = useLocation();

  const [company,      setCompany]      = useState(state?.company || null);
  const [txn,          setTxn]          = useState(state?.txn     || null);
  const [share,        setShare]        = useState(state?.share   || null);
  const [shareholders, setShareholders] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [blocks,       setBlocks]       = useState([]);

  // Global shared fields
  const [transferMode,  setTransferMode]  = useState('separate');
  const [transferDate,  setTransferDate]  = useState('');
  const [transferNo,    setTransferNo]    = useState('');
  const [transfereeId,  setTransfereeId]  = useState('');
  const [isUbo,           setIsUbo]           = useState(false);
  const [transfereeCerts, setTransfereeCerts] = useState([]);
  const [torCombine,      setTorCombine]      = useState(false);
  const [torCombineCertId,setTorCombineCertId]= useState(null);
  const [teeCombine,      setTeeCombine]      = useState(false);
  const [teeCombineCertId,setTeeCombineCertId]= useState(null);

  // Club Transfer state
  const [typeOfValue, setTypeOfValue] = useState('same');
  const [clubState, setClubState] = useState({
    transfereeQty: '', transfereePaidup: '', transfereeIssued: '',
    transfereeFolioNo: '', transfereeCertNo: '', balanceCertNo: '',
    transfereeInstalment: 'NO', transfereePayDate: '', transfereeInstalmtDoc: null,
    transfereeStampDuty: '', transfereeStampDutyDate: '', transfereeStampDutyAmt: '', transfereeStampDutyDoc: null,
    transfereeRemarks: '',
    transferorInstalment: 'NO', transferorPayDate: '', transferorInstalmtDoc: null,
    transferorStampDuty: '', transferorStampDutyDate: '', transferorStampDutyAmt: '', transferorStampDutyDoc: null,
    transferorRemarks: '',
  });
  const updateClubState = useCallback((updates) => setClubState(prev => ({ ...prev, ...updates })), []);

  const isClubMode = transferMode === 'club' && blocks.length > 1;

  // Club: certs the user unticked in the source table — left out of the pool
  const [clubExcluded, setClubExcluded] = useState([]);
  const toggleClubSource = useCallback((id) =>
    setClubExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]), []);
  const clubBlocks = blocks.filter(b => !clubExcluded.includes(b.txn?.share_transaction_id));

  // Fetch transferee's existing VALID holdings when transferee selection changes
  useEffect(() => {
    if (!transfereeId || shareholders.length === 0) { setTransfereeCerts([]); return; }
    const sh = shareholders.find(s => String(s.official_id) === String(transfereeId));
    if (!sh?.official_entity_id) { setTransfereeCerts([]); return; }
    getShareTxnList(entity_id, {
      official_entity_id: sh.official_entity_id,
      transaction_status: 'IN',
      limit: 500,
    })
      .then(res => {
        const all  = res?.data?.data || res?.data || [];
        const txns = Array.isArray(all) ? all.filter(t => t.status !== 'INVALID') : [];
        setTransfereeCerts(txns);
      })
      .catch(() => setTransfereeCerts([]));
  }, [transfereeId, shareholders, entity_id]); // eslint-disable-line

  const updateBlock = useCallback((id, updates) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const removeBlock = useCallback((id) => setBlocks(prev => prev.filter(b => b.id !== id)), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const initTxns = state?.txns || (state?.txn ? [state.txn] : []);
      const [txnRes, shRes, compRes] = await Promise.all([
        initTxns.length === 0 && txn_id ? getShareTxn(txn_id) : Promise.resolve(null),
        getOfficialList({ entity_id, official_master_slug: 'shareholders', limit: 500 }).catch(() => ({})),
        company ? Promise.resolve({ data: company }) : getCompany(entity_id),
      ]);
      let loadedTxns = initTxns;
      if (txnRes) { const t = txnRes?.data || txnRes; setTxn(t); loadedTxns = [t]; }
      if (!company) setCompany(compRes?.data || compRes || null);
      setShareholders(shRes?.data?.data || shRes?.data || []);
      if (loadedTxns.length > 0) setBlocks(loadedTxns.map(mkBlock));
    } catch { toast.error('Failed to load data'); }
    finally   { setLoading(false); }
  }, [entity_id, txn_id]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const companyName  = company?.name || '—';
  const firstTxn     = blocks[0]?.txn || txn;
  const currency     = share?.currency || firstTxn?.company_share?.currency || '—';
  const shareType    = SHARE_TYPE_LABELS[share?.share_type || firstTxn?.share_type] || '—';
  const scType       = share?.share_class?.sc_type || firstTxn?.share_class?.sc_type || '';
  const isMultiple   = blocks.length > 1;
  const activeCount  = blocks.filter(b => Number(b.transferQty) > 0).length;

  const handleSubmitAll = async () => {
    if (!transferDate) { toast.error('Transfer date is required'); return; }
    if (!transfereeId) { toast.error('Select a transferee'); return; }

    // Only process blocks that have a quantity entered — skip the rest
    let activeBlocks = blocks.filter(b => Number(b.transferQty) > 0);
    if (activeBlocks.length === 0) { toast.error('Enter shares to transfer for at least one allotment'); return; }

    // When transferor combine is active, process the combine-target block first so the
    // backend creates the combine OUT row before secondary blocks try to locate it.
    if (torCombine && torCombineCertId) {
      const baseIdx = activeBlocks.findIndex(b => String(b.txn?.share_transaction_id) === String(torCombineCertId));
      if (baseIdx > 0) {
        const [baseBlock] = activeBlocks.splice(baseIdx, 1);
        activeBlocks = [baseBlock, ...activeBlocks];
      }
    }

    for (let i = 0; i < activeBlocks.length; i++) {
      const b    = activeBlocks[i];
      const cert = b.txn?.share_cert_no || `#${i + 1}`;
      if (Number(b.transferQty) > Number(b.txn?.no_of_shares || 0)) {
        toast.error(`Allotment ${cert}: Quantity exceeds available shares`); return;
      }
      const balQty = Number(b.txn?.no_of_shares || 0) - Number(b.transferQty);
      if (balQty > 0 && !torCombine && !b.transferorCertNo?.trim()) {
        toast.error(`Allotment ${cert}: Transferor Cert No. is required`); return;
      }
      if (!b.transfereeFolioNo?.trim()) {
        toast.error(`Allotment ${cert}: Transferee Folio No. is required`); return;
      }
      if (!teeCombine && !b.transfereeCertNo?.trim()) {
        toast.error(`Allotment ${cert}: Transferee Cert No. is required`); return;
      }
    }
    setSaving(true);
    try {
      for (const b of activeBlocks) {
        const torSD = b.transferorStampDuty === 'YES';
        const teeSD = b.transfereeStampDuty === 'YES';

        const fields = {
          entity_id:                    Number(entity_id),
          source_txn_id:                b.txn?.share_transaction_id,
          transferee_official_id:       Number(transfereeId),
          transfer_date:                transferDate,
          transfer_no:                  transferNo                || null,
          transfer_qty:                 Number(b.transferQty),
          is_ubo:                       isUbo ? 1 : 0,

          // ── Transferee ──────────────────────────────────────────────────────
          transferee_folio_no:          b.transfereeFolioNo       || null,
          transferee_cert_no:           b.transfereeCertNo        || null,
          transferee_cash:              b.transfereeConsid.cash,
          transferee_oc:                b.transfereeConsid.oc,
          transferee_no_consideration:  0,
          transferee_has_instalment:    b.transfereeInstalment,
          transferee_instalment_date:   b.transfereeInstalment === 'YES' ? (b.transfereePayDate || null) : null,
          transferee_stamp_duty:        teeSD ? 1 : 0,
          transferee_stamp_duty_date:   teeSD ? (b.transfereeStampDutyDate || null) : null,
          transferee_stamp_duty_amount: teeSD ? (b.transfereeStampDutyAmt  || null) : null,
          transferee_remarks:           b.transfereeRemarks       || null,

          // ── Transferor ──────────────────────────────────────────────────────
          transferor_cert_no:           b.transferorCertNo        || null,
          transferor_cash:              b.transferorConsid.cash,
          transferor_oc:                b.transferorConsid.oc,
          transferor_has_instalment:    b.transferorInstalment,
          transferor_instalment_date:   b.transferorInstalment === 'YES' ? (b.transferorPayDate || null) : null,
          transferor_stamp_duty:        torSD ? 1 : 0,
          transferor_stamp_duty_date:   torSD ? (b.transferorStampDutyDate || null) : null,
          transferor_stamp_duty_amount: torSD ? (b.transferorStampDutyAmt  || null) : null,
          transferor_remarks:           b.transferorRemarks       || null,

          // ── Combine Holdings ─────────────────────────────────────────────────
          transferor_combine:           torCombine ? 1 : 0,
          transferor_combine_txn_id:    torCombine && torCombineCertId ? Number(torCombineCertId) : null,
          transferee_combine:           teeCombine ? 1 : 0,
          transferee_combine_txn_id:    teeCombine && teeCombineCertId ? Number(teeCombineCertId) : null,
        };

        const hasFiles = b.transferorInstalmtDoc || b.transferorStampDutyDoc
                      || b.transfereeInstalmtDoc || b.transfereeStampDutyDoc;

        if (hasFiles) {
          const fd = new FormData();
          Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) fd.append(k, v); });
          if (b.transferorInstalmtDoc)  fd.append('transferor_instalment_doc',  b.transferorInstalmtDoc);
          if (b.transferorStampDutyDoc) fd.append('transferor_stamp_duty_doc',  b.transferorStampDutyDoc);
          if (b.transfereeInstalmtDoc)  fd.append('transferee_instalment_doc',  b.transfereeInstalmtDoc);
          if (b.transfereeStampDutyDoc) fd.append('transferee_stamp_duty_doc',  b.transfereeStampDutyDoc);
          await createShareTransfer(fd);
        } else {
          await createShareTransfer(fields);
        }
      }
      toast.success(`${activeBlocks.length} transfer${activeBlocks.length > 1 ? 's' : ''} saved successfully`);
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save transfer');
    } finally { setSaving(false); }
  };

  // ── Club transfer submit ───────────────────────────────────────────────────
  const handleSubmitClub = async () => {
    if (!transferDate) { toast.error('Transfer date is required'); return; }
    if (!transfereeId)  { toast.error('Select a transferee'); return; }
    if (!clubState.transfereeQty || Number(clubState.transfereeQty) <= 0) {
      toast.error('Enter quantity to transfer to transferee'); return;
    }
    if (!clubState.transfereeCertNo?.trim()) { toast.error('Transferee Cert No. is required'); return; }
    if (!clubState.transfereeFolioNo?.trim()) { toast.error('Transferee Folio No. is required'); return; }
    if (clubBlocks.length < 2) { toast.error('Select at least 2 certificates for a club transfer'); return; }

    const totalShares = clubBlocks.reduce((s, b) => s + Number(b.txn?.no_of_shares || 0), 0);
    const teeQty = Number(clubState.transfereeQty);
    if (teeQty > totalShares) { toast.error(`Quantity (${teeQty}) exceeds pool total (${totalShares})`); return; }

    setSaving(true);
    try {
      const torSD = clubState.transferorStampDuty === 'YES';
      const teeSD = clubState.transfereeStampDuty === 'YES';

      const payload = {
        entity_id:                    Number(entity_id),
        source_txn_ids:               clubBlocks.map(b => b.txn?.share_transaction_id).filter(Boolean),
        transferee_official_id:       Number(transfereeId),
        transfer_date:                transferDate,
        transfer_no:                  transferNo || null,
        transfer_qty:                 teeQty,
        type_of_value:                typeOfValue,
        // Different mode amounts
        transferee_paidup:            typeOfValue === 'different' ? Number(clubState.transfereePaidup || 0) : undefined,
        transferee_issued:            typeOfValue === 'different' ? Number(clubState.transfereeIssued || 0) : undefined,
        // Cert & folio
        transferee_folio_no:          clubState.transfereeFolioNo  || null,
        transferee_cert_no:           clubState.transfereeCertNo   || null,
        balance_cert_no:              clubState.balanceCertNo      || null,
        // Instalment
        transferee_has_instalment:    clubState.transfereeInstalment,
        transferor_has_instalment:    clubState.transferorInstalment,
        // Stamp duty — transferee
        transferee_stamp_duty:        teeSD ? 1 : 0,
        transferee_stamp_duty_date:   teeSD ? (clubState.transfereeStampDutyDate || null) : null,
        transferee_stamp_duty_amount: teeSD ? (clubState.transfereeStampDutyAmt  || null) : null,
        // Stamp duty — transferor
        transferor_stamp_duty:        torSD ? 1 : 0,
        transferor_stamp_duty_date:   torSD ? (clubState.transferorStampDutyDate || null) : null,
        transferor_stamp_duty_amount: torSD ? (clubState.transferorStampDutyAmt  || null) : null,
        // Remarks
        transferee_remarks:           clubState.transfereeRemarks  || null,
        transferor_remarks:           clubState.transferorRemarks  || null,
      };

      await createShareClubTransfer(payload);
      toast.success('Club transfer saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save club transfer');
    } finally { setSaving(false); }
  };

  return (
    <div className="page-content">
      <Container fluid>

        {/* Company strip */}
        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel="Transfer"
          actionIcon="ri-swap-line"
          actionVariant="transfer"
          extraChip={
            !isMultiple && firstTxn?.share_cert_no
              ? <><i className="ri-arrow-right-s-line sps-sep" /><span className="sps-chip sps-chip--cert"><i className="ri-file-text-line" />Cert {firstTxn.share_cert_no}</span></>
              : isMultiple
                ? <span className="sps-chip sps-chip--count"><i className="ri-stack-line" />{blocks.length} Allotments</span>
                : null
          }
          onBack={() => navigate(`/company/${entity_id}/shares/shareholder-register`)}
        />

        <div className="stp-canvas">

        {/* Global Transfer Date / No. strip */}
        {!loading && (
          <div className="stp-global-strip">
            <div className="stp-global-strip-label">
              <i className="ri-calendar-event-line" /> Transfer Details
            </div>

            <div className="stp-global-strip-fields">
              {/* Transfer Mode — inside fields so it shares align-items: flex-end */}
              <div className="stp-mode-switch">
                <span className="stp-mode-switch-lbl">Transfer Mode</span>
                <div className="stp-mode-tabs">
                  {[
                    { value: 'separate', icon: 'ri-split-cells-horizontal', label: 'Separate' },
                    { value: 'club',     icon: 'ri-merge-cells-horizontal',  label: 'Club'     },
                  ].map(m => (
                    <button
                      key={m.value}
                      className={`stp-mode-tab${transferMode === m.value ? ' stp-mode-tab--active' : ''}`}
                      onClick={() => setTransferMode(m.value)}
                      type="button"
                    >
                      <i className={m.icon} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {transferMode === 'club' && <>
                <div className="stp-global-strip-sep" />
                <div className="stp-field">
                  <label className="stp-lbl">Type of Value</label>
                  <select className="stp-input" value={typeOfValue}
                    onChange={e => { setTypeOfValue(e.target.value); updateClubState({ transfereePaidup: '', transfereeIssued: '' }); }}>
                    <option value="same">Same</option>
                    <option value="different">Different</option>
                  </select>
                </div>
              </>}
              <div className="stp-global-strip-sep" />
              <div className="stp-field">
                <label className="stp-lbl">Transfer Date <span className="stp-req">*</span></label>
                <DatePickerInput value={transferDate} onChange={e => setTransferDate(e?.target?.value ?? e)} placeholder="DD/MM/YYYY" bsSize="" />
              </div>
              <div className="stp-field">
                <label className="stp-lbl">Transfer No.</label>
                <input className="stp-input" value={transferNo} onChange={e => setTransferNo(e.target.value)} placeholder="e.g. T001" />
              </div>
              <div className="stp-global-strip-sep" />
              <div className="stp-field stp-field--transferee-select">
                <label className="stp-lbl">Transferee (Shareholder) <span className="stp-req">*</span></label>
                <select className="stp-input" value={transfereeId} onChange={e => setTransfereeId(e.target.value)}>
                  <option value="">— Select shareholder —</option>
                  {shareholders
                    .filter(s => String(s.official_entity_id) !== String(blocks[0]?.txn?.official_entity_id))
                    .map(s => (
                      <option key={s.official_id} value={s.official_id}>
                        {s.official_entity?.name || `Official #${s.official_id}`}
                      </option>
                    ))}
                </select>
                {/* {transfereeId && shareholders.find(s => String(s.official_id) === transfereeId) && (
                  <span className="stp-selected-hint">
                    <i className="ri-check-line" />
                    {shareholders.find(s => String(s.official_id) === transfereeId)?.official_entity?.name}
                  </span>
                )} */}
              </div>
              <div className="stp-field stp-field--ubo">
                <label className="stp-lbl">Beneficial Owner (UBO)</label>
                <label className="stp-toggle">
                  <input type="checkbox" checked={isUbo} onChange={e => setIsUbo(e.target.checked)} />
                  <span className="stp-toggle-track"><span className="stp-toggle-thumb" /></span>
                  <span className="stp-toggle-lbl">{isUbo ? 'Yes' : 'No'}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── Global Combine Panel — hidden in club mode ── */}
        {!isClubMode && <div className="stp-combine-panel">
          {/* Compact toggle bar — always visible */}
          <div className="stp-combine-bar">
            <i className="ri-merge-cells-horizontal stp-combine-bar-icon" />
            <span className="stp-combine-bar-title">Combine Holdings</span>
            <div className="stp-combine-bar-sep" />
            <label className="stp-combine-toggle">
              <input type="checkbox" checked={torCombine}
                onChange={e => { setTorCombine(e.target.checked); setTorCombineCertId(null); }} />
              <span className="stp-combine-toggle-track"><span className="stp-combine-toggle-thumb" /></span>
              <span className="stp-combine-toggle-lbl"><i className="ri-scales-3-line" /> Transferor</span>
            </label>
            <div className="stp-combine-bar-sep" />
            <label className="stp-combine-toggle stp-combine-toggle--tee">
              <input type="checkbox" checked={teeCombine}
                onChange={e => { setTeeCombine(e.target.checked); setTeeCombineCertId(null); }} />
              <span className="stp-combine-toggle-track"><span className="stp-combine-toggle-thumb" /></span>
              <span className="stp-combine-toggle-lbl"><i className="ri-user-received-line" /> Transferee</span>
            </label>
          </div>

          {/* Tables — only visible when a toggle is on */}
          {(torCombine || teeCombine) && (
            <div className="stp-combine-cols">
              {torCombine && (
                <div className="stp-combine-side stp-combine-side--tor">
                  <div className="stp-combine-side-title"><i className="ri-scales-3-line" /> Transferor Holdings</div>
                  <div className="stp-tbl-scroll">
                    <table className="stp-combine-tbl">
                      <thead><tr><th>Share Cert No.</th><th>Per Share</th><th>No. of Shares</th><th>Issued Capital</th><th>Cash Paid-up</th><th>Consideration Paid-up</th><th>Combine</th></tr></thead>
                      <tbody>
                        {blocks.map(b => b.txn).filter(t => t && t.status === 'VALID').map(t => (
                          <tr key={t.share_transaction_id} className={torCombineCertId === t.share_transaction_id ? 'stp-combine-row--selected' : ''}>
                            <td><span className="stp-combine-cert">{t.share_cert_no || '—'}</span></td>
                            <td>{fmtNum(t.per_share, 4)}</td>
                            <td><strong>{fmtNum(t.no_of_shares)}</strong></td>
                            <td>{fmt2(Number(t.per_share || 0) * Number(t.no_of_shares || 0))}</td>
                            <td>{fmt2(t.cash || 0)}</td>
                            <td>{fmt2(Number(t.cash || 0) + Number(t.otherwise_cash || 0))}</td>
                            <td className="stp-combine-radio-td">
                              <input type="radio" name="tor-combine"
                                checked={torCombineCertId === t.share_transaction_id}
                                onChange={() => setTorCombineCertId(t.share_transaction_id)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {teeCombine && (
                <div className="stp-combine-side stp-combine-side--tee">
                  <div className="stp-combine-side-title"><i className="ri-user-received-line" /> Transferee Holdings</div>
                  <div className="stp-tbl-scroll">
                    <table className="stp-combine-tbl stp-combine-tbl--tee">
                      <thead><tr><th>Share Cert No.</th><th>Per Share</th><th>No. of Shares</th><th>Issued Capital</th><th>Cash Paid-up</th><th>Consideration Paid-up</th><th>Combine</th></tr></thead>
                      <tbody>
                        {transfereeCerts.length === 0
                          ? <tr><td colSpan={7} className="stp-combine-empty">No existing holdings found for this transferee</td></tr>
                          : transfereeCerts.map(t => (
                            <tr key={t.share_transaction_id} className={teeCombineCertId === t.share_transaction_id ? 'stp-combine-row--selected' : ''}>
                              <td><span className="stp-combine-cert">{t.share_cert_no || '—'}</span></td>
                              <td>{fmtNum(t.per_share, 4)}</td>
                              <td><strong>{fmtNum(t.no_of_shares)}</strong></td>
                              <td>{fmt2(Number(t.per_share || 0) * Number(t.no_of_shares || 0))}</td>
                              <td>{fmt2(t.cash || 0)}</td>
                              <td>{fmt2(Number(t.cash || 0) + Number(t.otherwise_cash || 0))}</td>
                              <td className="stp-combine-radio-td">
                                <input type="radio" name="tee-combine"
                                  checked={teeCombineCertId === t.share_transaction_id}
                                  onChange={() => setTeeCombineCertId(t.share_transaction_id)} />
                              </td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>}

        {loading ? (
          <div className="stp-loader"><Spinner color="primary" /> Loading...</div>
        ) : (
          <>
            {isClubMode ? (
              <>
              <ClubSourceTable
                txns={blocks.map(b => b.txn).filter(Boolean)}
                excludedIds={clubExcluded}
                onToggle={toggleClubSource}
                holderName={firstTxn?.official_entity?.name}
              />
              <ClubTransferPanel
                blocks={clubBlocks}
                shareholders={shareholders}
                transfereeId={transfereeId}
                clubState={clubState}
                onUpdate={updateClubState}
                typeOfValue={typeOfValue}
              />
              </>
            ) : (
            <>
            {(() => {
              const torCombineBaseTxn = torCombine && torCombineCertId
                ? blocks.find(b => String(b.txn?.share_transaction_id) === String(torCombineCertId))?.txn
                : null;
              const teeCombineBaseTxn = teeCombine && teeCombineCertId
                ? transfereeCerts.find(t => String(t.share_transaction_id) === String(teeCombineCertId))
                : null;
              return blocks.map((block, i) => {
                const blockPerShare = Number(block.txn?.per_share || 0);
                const torCombineActiveCert = torCombineBaseTxn && Number(torCombineBaseTxn.per_share || 0) === blockPerShare
                  ? (torCombineBaseTxn.share_cert_no || null)
                  : null;
                const teeCombineActiveCert = teeCombineBaseTxn && Number(teeCombineBaseTxn.per_share || 0) === blockPerShare
                  ? (teeCombineBaseTxn.share_cert_no || null)
                  : null;
                return (
                  <TransferBlock
                    key={block.id}
                    index={i}
                    block={block}
                    blockId={block.id}
                    onUpdate={updateBlock}
                    onRemove={removeBlock}
                    canRemove={isMultiple}
                    shareholders={shareholders}
                    transfereeId={transfereeId}
                    onTransfereeChange={setTransfereeId}
                    isUbo={isUbo}
                    onUboChange={setIsUbo}
                    isMultiple={isMultiple}
                    torCombineActiveCert={torCombineActiveCert}
                    teeCombineActiveCert={teeCombineActiveCert}
                  />
                );
              });
            })()}

            </>
            )}

            {/* Bottom row — shared for both separate and club modes */}
            <div className="stp-bottom-row">
              <div className="stp-bottom-left">
                {!isClubMode && isMultiple && (
                  <div className="stp-bottom-count">
                    <i className="ri-stack-line" />
                    <strong>{activeCount}</strong> of <strong>{blocks.length}</strong> ready to transfer
                  </div>
                )}
              </div>
              <div className="stp-bottom-actions">
                <button className="stp-btn-cancel" onClick={() => navigate(`/company/${entity_id}/shares/shareholder-register`)}>
                  <i className="ri-arrow-left-line" /> Back
                </button>
                <button className="stp-btn-submit" onClick={isClubMode ? handleSubmitClub : handleSubmitAll}
                  disabled={saving || (!isClubMode && activeCount === 0)}>
                  {saving
                    ? <><Spinner size="sm" /> Saving...</>
                    : isClubMode
                      ? <><i className="ri-merge-cells-horizontal" /> Submit Club Transfer</>
                      : <><i className="ri-swap-line" /> Submit {isMultiple ? `${activeCount} Transfer${activeCount !== 1 ? 's' : ''}` : 'Transfer'}</>
                  }
                </button>
              </div>
            </div>
          </>
        )}

        </div>{/* /stp-canvas */}
      </Container>
    </div>
  );
};

export default ShareTransferPage;
