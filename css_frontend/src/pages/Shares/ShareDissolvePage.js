import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'reactstrap';
import ShareConsiderationModal from '../../Components/Common/ShareConsiderationModal';
import { toast } from 'react-toastify';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import SharePageStrip from '../../Components/Common/SharePageStrip';
import ClubSourceTable from '../../Components/Common/ClubSourceTable';
import {
  getCompany, getOfficialList, createShareDissolve,
} from '../../helpers/backend_helper';
import './ShareDissolvePage.css';

const SHARE_TYPE_LABELS = { NORMAL: 'Ordinary', BONUS: 'Bonus', GUARANTEE: 'Guarantee' };
const fmt2   = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Group source txns by per_share
const computePriceGroups = (txns) => {
  const map = new Map();
  txns.forEach(t => {
    const ps  = Number(t.per_share || 0);
    const key = ps.toFixed(6);
    if (!map.has(key)) map.set(key, { perShare: ps, txns: [], totalShares: 0, totalPaidup: 0 });
    const g = map.get(key);
    g.txns.push(t);
    g.totalShares += Number(t.no_of_shares || 0);
    g.totalPaidup += Number(t.paidup_share_capital || 0);
  });
  return Array.from(map.values());
};

const mkTransferee = (perShare = 0) => ({
  id:              `t-${Date.now()}-${Math.random()}`,
  officialId:      '',
  folioNo:         '',
  certNo:          '',
  noOfShares:      '',
  issuedCapital:   '',
  cash:            '',
  oc:              '',
  noConsideration: false,
  hasInstalment:   'NO',
  instalmentDate:  '',
  instalmentDoc:   null,
  stampDuty:       'NO',
  stampDutyDate:   '',
  stampDutyAmt:    '',
  stampDutyDoc:    null,
  remarks:         '',
  perShare,
});

// ── Transferee Block ──────────────────────────────────────────────────────────
// psEditable=true  → club dissolve: per_share is an editable input on the tee
// psEditable=false → separate dissolve: per_share locked to price group
// psEditable=true  → club dissolve: per_share is a free editable input
const TransfereeBlock = ({ tee, groupIdx, index, perShare, psEditable, onUpdate, onRemove, canRemove, shareholders, usedIds, transferorEntityId }) => {
  const upd = (changes) => onUpdate(groupIdx, tee.id, changes);
  const effectivePS = psEditable ? Number(tee.perShare || 0) : perShare;
  const paidCapital = Number(tee.noOfShares || 0) * effectivePS;
  const totalConsid = paidCapital;
  const paidConsid  = tee.noConsideration ? 0 : (Number(tee.cash || 0) + Number(tee.oc || 0));

  const [considOpen, setConsidOpen] = useState(false);

  return (
    <div className="sdp-tee-block">
      <div className="sdp-tee-block-hdr">
        <span className="sdp-tee-idx"><i className="ri-user-received-line" /> Transferee {index + 1}</span>
        {canRemove && (
          <button className="sdp-tee-remove" onClick={() => onRemove(groupIdx, tee.id)} title="Remove">
            <i className="ri-close-line" />
          </button>
        )}
      </div>

      <div className="sdp-tee-body">

        {/* Row 1 — Shareholder + Folio */}
        <div className="sdp-tee-row sdp-tee-row--top">
          <div className="sdp-field sdp-field--sh">
            <label className="sdp-lbl">Shareholder <span className="sdp-req">*</span></label>
            <select className="sdp-input" value={tee.officialId} onChange={e => upd({ officialId: e.target.value })}>
              <option value="">Select Shareholder</option>
              {shareholders
                .filter(s => String(s.official_entity_id) !== String(transferorEntityId))
                .map(s => {
                  const already = usedIds.includes(String(s.official_id));
                  return (
                    <option key={s.official_id} value={s.official_id} disabled={already}>
                      {s.official_entity?.name || `Official #${s.official_id}`}{already ? ' (already selected)' : ''}
                    </option>
                  );
                })}
            </select>
          </div>
          <div className="sdp-field sdp-field--folio">
            <label className="sdp-lbl">Folio No. <span className="sdp-req">*</span></label>
            <input className="sdp-input" value={tee.folioNo} onChange={e => upd({ folioNo: e.target.value })} placeholder="e.g. F001" />
          </div>
        </div>

        {/* Row 2 — Cert table (Per Share disabled, Paid Capital auto) */}
        <div className="sdp-cert-tbl-wrap">
          <table className="sdp-cert-tbl">
            <thead>
              <tr>
                <th>New Cert No. <span className="sdp-req">*</span></th>
                <th>No. of Shares <span className="sdp-req">*</span></th>
                <th>Per Share <span className="sdp-req">*</span></th>
                <th>Issued Capital <span className="sdp-req">*</span></th>
                <th>Paid Capital <span className="sdp-req">*</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><input className="sdp-input" value={tee.certNo} onChange={e => upd({ certNo: e.target.value })} placeholder="e.g. C001-D" /></td>
                <td><input className="sdp-input" type="number" min="1" value={tee.noOfShares}
                  onChange={e => {
                    const shares = e.target.value;
                    const auto   = tee.noConsideration ? '' : (Number(shares || 0) * effectivePS).toFixed(2);
                    upd({ noOfShares: shares, cash: auto, oc: '' });
                  }} placeholder="0" /></td>
                <td>
                  {psEditable
                    ? <input className="sdp-input" type="number" min="0" step="0.0001"
                        value={tee.perShare || ''}
                        onChange={e => {
                          const ps   = e.target.value;
                          const auto = tee.noConsideration ? '' : (Number(tee.noOfShares || 0) * Number(ps || 0)).toFixed(2);
                          upd({ perShare: ps, cash: auto, oc: '' });
                        }} placeholder="0.0000" />
                    : <input className="sdp-input sdp-input--ro" readOnly value={fmtNum(effectivePS, 4)} />
                  }
                </td>
                <td><input className="sdp-input sdp-input--ro" readOnly value={fmt2(paidCapital)} /></td>
                <td><input className="sdp-input sdp-input--ro" readOnly value={fmt2(paidCapital)} /></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Row 3 — Consideration */}
        <div className="sdp-section-hdr">Consideration</div>
        <div className="sdp-tee-row sdp-tee-row--mid">
          <div className="sdp-field">
            <label className="sdp-lbl">Consideration Paid</label>
            <button
              type="button"
              className={`sdp-consid-btn${tee.noConsideration ? ' sdp-consid-btn--no' : paidConsid > 0 ? ' sdp-consid-btn--ok' : ''}`}
              onClick={() => setConsidOpen(true)}
              disabled={!tee.noOfShares}
            >
              <i className="ri-money-dollar-circle-line" />
              <span>{tee.noConsideration ? 'No Consideration' : `${fmt2(paidConsid)} / ${fmt2(totalConsid)}`}</span>
              <i className="ri-pencil-line sdp-consid-edit-icon" />
            </button>
          </div>
        </div>

        {/* Consideration Modal — global component */}
        <ShareConsiderationModal
          open={considOpen}
          onClose={() => setConsidOpen(false)}
          onSave={({ cash, oc, noConsideration }) => {
            upd({ cash: noConsideration ? '' : String(cash), oc: noConsideration ? '' : String(oc), noConsideration });
          }}
          partyLabel="Transferee"
          srcCash={totalConsid}
          srcOC={0}
          allocCash={0}
          allocOC={0}
          initialCash={tee.noConsideration ? 0 : Number(tee.cash || 0)}
          initialOC={tee.noConsideration ? 0 : Number(tee.oc || 0)}
          initialNoConsid={tee.noConsideration || false}
          showNoConsidCheckbox={true}
        />

        {/* Row 4 — Partial Payment */}
        <div className="sdp-section-hdr">Partial Payment</div>
        <div className="sdp-tee-row sdp-tee-row--mid">
          <div className="sdp-field">
            <label className="sdp-lbl">Partial Payment <span className="sdp-req">*</span></label>
            <select className="sdp-input" value={tee.hasInstalment} onChange={e => upd({ hasInstalment: e.target.value })}>
              <option value="NO">NO</option>
              <option value="YES">YES</option>
            </select>
          </div>
          <div className="sdp-field sdp-field--file">
            <label className="sdp-lbl">Upload Document</label>
            <input className="sdp-input sdp-input--file" type="file"
              onChange={e => upd({ instalmentDoc: e.target.files?.[0] || null })} />
          </div>
          <div className="sdp-field">
            <label className="sdp-lbl">Payment Date</label>
            <DatePickerInput value={tee.instalmentDate}
              onChange={e => upd({ instalmentDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY"
              disabled={tee.hasInstalment !== 'YES'} />
          </div>
        </div>

        {/* Row 4 — Stamp Duty */}
        <div className="sdp-section-hdr">Transferee Stamp Duty Payment</div>
        <div className="sdp-tee-row sdp-tee-row--mid">
          <div className="sdp-field">
            <label className="sdp-lbl">Stamp Duty <span className="sdp-req">*</span></label>
            <select className="sdp-input" value={tee.stampDuty} onChange={e => upd({ stampDuty: e.target.value })}>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>
          </div>
          <div className="sdp-field sdp-field--file">
            <label className="sdp-lbl">Stamp Duty File</label>
            <input className="sdp-input sdp-input--file" type="file"
              onChange={e => upd({ stampDutyDoc: e.target.files?.[0] || null })} />
          </div>
          {tee.stampDuty === 'YES' && <>
            <div className="sdp-field">
              <label className="sdp-lbl">Stamp Duty Date</label>
              <DatePickerInput value={tee.stampDutyDate}
                onChange={e => upd({ stampDutyDate: e?.target?.value ?? e })} placeholder="DD/MM/YYYY" />
            </div>
            <div className="sdp-field">
              <label className="sdp-lbl">Stamp Duty Amount</label>
              <input className="sdp-input" type="number" min="0" step="0.01" value={tee.stampDutyAmt}
                onChange={e => upd({ stampDutyAmt: e.target.value })} placeholder="0.00" />
            </div>
          </>}
        </div>

        {/* Row 6 — Remarks */}
        <div className="sdp-tee-row sdp-tee-row--remarks">
          <div className="sdp-field sdp-field--full">
            <label className="sdp-lbl">Remarks</label>
            <textarea className="sdp-textarea" rows={2} value={tee.remarks}
              onChange={e => upd({ remarks: e.target.value })} />
          </div>
        </div>

      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ShareDissolvePage = () => {
  useCollapseSidebar();
  const { entity_id } = useParams();
  const navigate       = useNavigate();
  const { state }      = useLocation();

  const allTxns = state?.txns || (state?.txn ? [state.txn] : []);

  const [company,      setCompany]      = useState(state?.company || null);
  const [share]                         = useState(state?.share   || null);
  const [shareholders, setShareholders] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  const [dissolveNo,   setDissolveNo]   = useState('');
  const [dissolveDate, setDissolveDate] = useState('');
  const [dissolveType, setDissolveType] = useState('separate');

  // Club: certs the user unticked in the source table — left out of the pool
  const [clubExcluded, setClubExcluded] = useState([]);
  const toggleClubSource = useCallback((id) =>
    setClubExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]), []);
  const sourceTxns = dissolveType === 'club'
    ? allTxns.filter(t => !clubExcluded.includes(t.share_transaction_id))
    : allTxns;

  // Separate dissolve: teeGroups mirrors price groups, each with own transferees
  const [teeGroups, setTeeGroups] = useState(() =>
    computePriceGroups(allTxns).map(g => ({ ...g, transferees: [mkTransferee()] }))
  );

  const updateTransferee = useCallback((groupIdx, teeId, changes) =>
    setTeeGroups(prev => prev.map((g, gi) => gi !== groupIdx ? g : {
      ...g, transferees: g.transferees.map(t => t.id === teeId ? { ...t, ...changes } : t),
    })), []);

  const removeTransferee = useCallback((groupIdx, teeId) =>
    setTeeGroups(prev => prev.map((g, gi) => gi !== groupIdx ? g : {
      ...g, transferees: g.transferees.filter(t => t.id !== teeId),
    })), []);

  const addTransferee = useCallback((groupIdx) =>
    setTeeGroups(prev => prev.map((g, gi) => gi !== groupIdx ? g : {
      ...g, transferees: [...g.transferees, mkTransferee()],
    })), []);

  // Club dissolve state
  const defaultPS = Number(allTxns[0]?.per_share || 0);
  const [clubTransferees, setClubTransferees] = useState([mkTransferee(defaultPS)]);

  const updateClubTee = useCallback((teeId, changes) =>
    setClubTransferees(prev => prev.map(t => t.id === teeId ? { ...t, ...changes } : t)), []);

  const removeClubTee = useCallback((teeId) =>
    setClubTransferees(prev => prev.filter(t => t.id !== teeId)), []);

  const addClubTee = useCallback(() =>
    setClubTransferees(prev => [...prev, mkTransferee(defaultPS)]), [defaultPS]);

  // Totals (must come before clubPerShare)
  const totalClubShares  = sourceTxns.reduce((s, t) => s + Number(t.no_of_shares || 0), 0);
  const totalClubPaidup  = sourceTxns.reduce((s, t) => s + Number(t.paidup_share_capital || 0), 0);
  const clubAllocated    = clubTransferees.reduce((s, t) => s + (Number(t.noOfShares) || 0), 0);
  const clubRemaining    = totalClubShares - clubAllocated;
  // Weighted average per share = total paid-up ÷ total shares (read-only for all club tees)
  const clubPerShare     = totalClubShares > 0 ? totalClubPaidup / totalClubShares : 0;

  const totalSource    = dissolveType === 'club'
    ? totalClubShares
    : teeGroups.reduce((s, g) => s + g.totalShares, 0);
  const totalAllocated = dissolveType === 'club'
    ? clubAllocated
    : teeGroups.reduce((s, g) => s + g.transferees.reduce((gs, t) => gs + (Number(t.noOfShares) || 0), 0), 0);
  const remaining = totalSource - totalAllocated;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shRes, compRes] = await Promise.all([
        getOfficialList({ entity_id, official_master_slug: 'shareholders', limit: 500 }).catch(() => ({})),
        company ? Promise.resolve({ data: company }) : getCompany(entity_id),
      ]);
      if (!company) setCompany(compRes?.data || compRes || null);
      setShareholders(shRes?.data?.data || shRes?.data || []);
    } catch { toast.error('Failed to load data'); }
    finally   { setLoading(false); }
  }, [entity_id]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const companyName    = company?.name || '—';
  const firstTxn       = allTxns[0];
  const currency       = share?.currency || firstTxn?.company_share?.currency || '—';
  const shareType      = SHARE_TYPE_LABELS[share?.share_type || firstTxn?.share_type] || '—';
  const scType         = share?.share_class?.sc_type || firstTxn?.share_class?.sc_type || '';
  const transferorName = firstTxn?.official_entity?.name || '—';
  const transferorEntityId = firstTxn?.official_entity_id;

  const buildTeeRow = (t, ps) => ({
    official_id:       Number(t.officialId),
    folio_no:          t.folioNo || null,
    cert_no:           t.certNo,
    no_of_shares:      Number(t.noOfShares),
    per_share:         Number(ps),
    issued_capital:    Number(t.noOfShares || 0) * Number(ps),
    paid_capital:      Number(t.noOfShares || 0) * Number(ps),
    cash:              t.noConsideration ? 0 : Number(t.cash || 0),
    oc:                t.noConsideration ? 0 : Number(t.oc   || 0),
    no_consideration:  t.noConsideration ? 1 : 0,
    has_instalment:    t.hasInstalment,
    stamp_duty:        t.stampDuty === 'YES' ? 1 : 0,
    stamp_duty_date:   t.stampDuty === 'YES' ? (t.stampDutyDate || null) : null,
    stamp_duty_amount: t.stampDuty === 'YES' ? (t.stampDutyAmt  || null) : null,
    remarks:           t.remarks || null,
  });

  const handleSave = async () => {
    if (!dissolveDate) { toast.error('Dissolve date is required'); return; }

    if (dissolveType === 'club') {
      // ── Club validation ──────────────────────────────────────────────────
      if (sourceTxns.length < 2) { toast.error('Select at least 2 certificates for a club dissolve'); return; }
      for (let i = 0; i < clubTransferees.length; i++) {
        const t = clubTransferees[i];
        const label = `Transferee ${i + 1}`;
        if (!t.officialId)                            { toast.error(`${label}: Select a shareholder`); return; }
        if (!t.folioNo?.trim())                       { toast.error(`${label}: Folio No. is required`); return; }
        if (!t.certNo?.trim())                        { toast.error(`${label}: Cert No. is required`); return; }
        if (!t.noOfShares || Number(t.noOfShares) <= 0) { toast.error(`${label}: Enter number of shares`); return; }
      }
      if (Math.abs(clubAllocated - totalClubShares) > 0.0001) {
        toast.error(`Total allocated (${fmtNum(clubAllocated)}) must equal source total (${fmtNum(totalClubShares)})`);
        return;
      }
    } else {
      // ── Separate validation ──────────────────────────────────────────────
      for (let gi = 0; gi < teeGroups.length; gi++) {
        const g = teeGroups[gi];
        const groupAllocated = g.transferees.reduce((s, t) => s + (Number(t.noOfShares) || 0), 0);
        for (let i = 0; i < g.transferees.length; i++) {
          const t = g.transferees[i];
          const label = `Price Group ${gi + 1} / Transferee ${i + 1}`;
          if (!t.officialId)       { toast.error(`${label}: Select a shareholder`); return; }
          if (!t.folioNo?.trim())  { toast.error(`${label}: Folio No. is required`); return; }
          if (!t.certNo?.trim())   { toast.error(`${label}: Cert No. is required`); return; }
          if (!t.noOfShares || Number(t.noOfShares) <= 0) { toast.error(`${label}: Enter number of shares`); return; }
          if (!t.stampDuty)        { toast.error(`${label}: Stamp Duty selection is required`); return; }
        }
        if (groupAllocated !== g.totalShares) {
          toast.error(`Price Group ${gi + 1} (@ ${fmtNum(g.perShare, 4)}/share): allocated ${fmtNum(groupAllocated)} but group total is ${fmtNum(g.totalShares)}`);
          return;
        }
      }
      const allFlat = teeGroups.flatMap(g => g.transferees);
      if (allFlat.length !== sourceTxns.length) {
        toast.error(`Separate Dissolve requires exactly ${sourceTxns.length} transferee(s) total`);
        return;
      }
    }

    setSaving(true);
    try {
      const teePayloads = dissolveType === 'club'
        ? clubTransferees.map(t => buildTeeRow(t, clubPerShare))
        : teeGroups.flatMap(g => g.transferees.map(t => buildTeeRow(t, g.perShare)));

      const allTees    = dissolveType === 'club' ? clubTransferees : teeGroups.flatMap(g => g.transferees);
      const hasFiles   = allTees.some(t => t.instalmentDoc || t.stampDutyDoc);

      if (hasFiles) {
        const fd = new FormData();
        fd.append('entity_id',     Number(entity_id));
        fd.append('dissolve_date', dissolveDate);
        fd.append('dissolve_no',   dissolveNo || '');
        fd.append('dissolve_type', dissolveType);
        sourceTxns.forEach(t => fd.append('source_txn_ids[]', t.share_transaction_id));
        fd.append('transferees', JSON.stringify(teePayloads));
        allTees.forEach((t, fi) => {
          if (t.instalmentDoc) fd.append(`instalment_doc_${fi}`, t.instalmentDoc);
          if (t.stampDutyDoc)  fd.append(`stamp_duty_doc_${fi}`,  t.stampDutyDoc);
        });
        await createShareDissolve(fd);
      } else {
        await createShareDissolve({
          entity_id:      Number(entity_id),
          source_txn_ids: sourceTxns.map(t => t.share_transaction_id).filter(Boolean),
          dissolve_date:  dissolveDate,
          dissolve_no:    dissolveNo || null,
          dissolve_type:  dissolveType,
          transferees:    teePayloads,
        });
      }

      toast.success('Dissolve saved successfully');
      navigate(`/company/${entity_id}/shares/shareholder-register`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save dissolve');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="page-content">
        <Container fluid>
          <div className="sdp-loading"><Spinner size="sm" /> Loading…</div>
        </Container>
      </div>
    );
  }

  return (
    <div className="page-content">
      <Container fluid>

        {/* Strip */}
        <SharePageStrip
          companyName={companyName}
          currency={currency}
          shareType={shareType}
          scType={scType}
          actionLabel={`Dissolve · ${allTxns.length} cert${allTxns.length !== 1 ? 's' : ''}`}
          actionIcon="ri-user-shared-line"
          actionVariant="dissolve"
          onBack={() => navigate(`/company/${entity_id}/shares/shareholder-register`)}
        />

        <div className="sdp-canvas">

          {/* Header fields */}
          <div className="sdp-header-strip">
            <div className="sdp-header-strip-label">
              <i className="ri-user-shared-line" /> Dissolve Details
            </div>
            <div className="sdp-header-fields">
              <div className="sdp-field">
                <label className="sdp-lbl">Dissolve No.</label>
                <input className="sdp-input" value={dissolveNo} onChange={e => setDissolveNo(e.target.value)} placeholder="e.g. D001" />
              </div>
              <div className="sdp-field">
                <label className="sdp-lbl">Dissolve Date <span className="sdp-req">*</span></label>
                <DatePickerInput value={dissolveDate}
                  onChange={e => setDissolveDate(e?.target?.value ?? e)} placeholder="DD/MM/YYYY" />
              </div>
              <div className="sdp-type-switch">
                <span className="sdp-type-lbl">Dissolve Type</span>
                <div className="sdp-type-pills">
                  {['separate', 'club'].map(m => (
                    <button key={m} className={`sdp-type-pill${dissolveType === m ? ' sdp-type-pill--active' : ''}`}
                      onClick={() => setDissolveType(m)}>
                      {m === 'separate' ? 'Separate Dissolve' : 'Club Dissolve'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sdp-body">

            {/* ── Separate Dissolve: one card per price group ── */}
            {dissolveType === 'separate' && teeGroups.map((g, gi) => {
              const groupAllocated = g.transferees.reduce((s, t) => s + (Number(t.noOfShares) || 0), 0);
              const groupRemaining = g.totalShares - groupAllocated;
              const isDone = groupRemaining === 0;
              const isOver = groupRemaining < 0;
              const groupUsedIds = (teeIdx) =>
                g.transferees.filter((_, j) => j !== teeIdx).map(t => String(t.officialId)).filter(Boolean);
              const availableShareholders = shareholders.filter(s => String(s.official_entity_id) !== String(transferorEntityId));
              const atMax = g.transferees.length >= availableShareholders.length || isDone;

              return (
                <div key={gi} className={`sdp-pg-row${isDone ? ' sdp-pg-row--done' : isOver ? ' sdp-pg-row--over' : ''}`}>
                  <div className="sdp-pg-label">
                    <span className="sdp-pg-label-num">Price Group {gi + 1}</span>
                    <span className="sdp-pg-label-ps">@ {fmtNum(g.perShare, 4)} / share</span>
                    <span className={`sdp-pg-label-status${isDone ? ' sdp-pg-label-status--done' : isOver ? ' sdp-pg-label-status--over' : ''}`}>
                      {isDone ? `✓ All ${fmtNum(g.totalShares)} shares allocated` : isOver ? `Over by ${fmtNum(Math.abs(groupRemaining))}` : `${fmtNum(groupRemaining)} of ${fmtNum(g.totalShares)} remaining`}
                    </span>
                  </div>
                  <div className="sdp-pg-cols">
                    <div className="sdp-pg-left">
                      <div className="sdp-pg-left-hdr"><i className="ri-file-list-3-line" /> Transferor · {transferorName}</div>
                      <table className="sdp-src-tbl">
                        <thead>
                          <tr>
                            <th>Current Share Cert No.</th>
                            <th className="th-right">No. of Shares</th>
                            <th className="th-right">Issued Share Capital</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.txns.map((t, i) => (
                            <tr key={t.share_transaction_id || i}>
                              <td><span className="sdp-cert-pill">{t.share_cert_no || '—'}</span></td>
                              <td className="th-right">{fmtNum(t.no_of_shares)}</td>
                              <td className="th-right">{fmt2(t.paidup_share_capital)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="sdp-src-total">
                            <td><strong>Previous Paid / Total Paid-up</strong></td>
                            <td className="th-right"><strong>{fmtNum(g.totalShares)}</strong></td>
                            <td className="th-right"><strong>{fmt2(g.totalPaidup)}/{fmt2(g.totalPaidup)}</strong></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="sdp-pg-right">
                      <div className="sdp-pg-right-hdr"><i className="ri-user-received-line" /> Transferee</div>
                      {g.transferees.map((tee, ti) => (
                        <TransfereeBlock
                          key={tee.id}
                          tee={tee}
                          groupIdx={gi}
                          index={ti}
                          perShare={g.perShare}
                          onUpdate={updateTransferee}
                          onRemove={removeTransferee}
                          canRemove={g.transferees.length > 1}
                          shareholders={shareholders}
                          usedIds={groupUsedIds(ti)}
                          transferorEntityId={transferorEntityId}
                        />
                      ))}
                      <button className="sdp-add-tee" onClick={() => addTransferee(gi)} disabled={atMax}
                        title={isDone ? 'All shares fully allocated' : atMax ? 'All available shareholders already added' : undefined}>
                        <i className="ri-add-line" /> Add Transferee
                        {isDone && <span className="sdp-add-tee-max"> (shares fully allocated)</span>}
                        {!isDone && atMax && <span className="sdp-add-tee-max"> (max reached)</span>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── Club Dissolve: pick source certs, then single pooled card ── */}
            {dissolveType === 'club' && (
              <ClubSourceTable txns={allTxns} excludedIds={clubExcluded} onToggle={toggleClubSource} holderName={transferorName} />
            )}
            {dissolveType === 'club' && (() => {
              const isDone = clubRemaining === 0;
              const isOver = clubRemaining < 0;
              const availableShareholders = shareholders.filter(s => String(s.official_entity_id) !== String(transferorEntityId));
              const clubUsedIds = (teeIdx) =>
                clubTransferees.filter((_, j) => j !== teeIdx).map(t => String(t.officialId)).filter(Boolean);
              const atMax = clubTransferees.length >= availableShareholders.length || isDone;

              return (
                <div className={`sdp-pg-row${isDone ? ' sdp-pg-row--done' : isOver ? ' sdp-pg-row--over' : ''}`}>
                  {/* Pool label */}
                  <div className="sdp-pg-label">
                    <span className="sdp-pg-label-num">Club Pool</span>
                    <span className="sdp-pg-label-ps">{sourceTxns.length} cert{sourceTxns.length !== 1 ? 's' : ''} · {fmtNum(totalClubShares)} shares</span>
                    <span className={`sdp-pg-label-status${isDone ? ' sdp-pg-label-status--done' : isOver ? ' sdp-pg-label-status--over' : ''}`}>
                      {isDone ? `✓ All ${fmtNum(totalClubShares)} shares allocated` : isOver ? `Over by ${fmtNum(Math.abs(clubRemaining))}` : `${fmtNum(clubRemaining)} of ${fmtNum(totalClubShares)} remaining`}
                    </span>
                  </div>

                  <div className="sdp-pg-cols">
                    {/* LEFT — all source certs combined */}
                    <div className="sdp-pg-left">
                      <div className="sdp-pg-left-hdr"><i className="ri-file-list-3-line" /> Transferor · {transferorName}</div>
                      <table className="sdp-src-tbl">
                        <thead>
                          <tr>
                            <th>Current Share Cert No.</th>
                            <th className="th-right">Per Share</th>
                            <th className="th-right">No. of Shares</th>
                            <th className="th-right">Issued Share Capital</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceTxns.map((t, i) => (
                            <tr key={t.share_transaction_id || i}>
                              <td><span className="sdp-cert-pill">{t.share_cert_no || '—'}</span></td>
                              <td className="th-right">{fmtNum(t.per_share, 4)}</td>
                              <td className="th-right">{fmtNum(t.no_of_shares)}</td>
                              <td className="th-right">{fmt2(t.paidup_share_capital)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="sdp-src-total">
                            <td colSpan={2}><strong>Total Club Share</strong></td>
                            <td className="th-right"><strong>{fmtNum(totalClubShares)}</strong></td>
                            <td className="th-right"><strong>{fmt2(totalClubPaidup)}</strong></td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="sdp-club-paidup-row">
                              Previous Paid Amount / Total Paid-up Capital: <strong>{fmt2(totalClubPaidup)}/{fmt2(totalClubPaidup)}</strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* RIGHT — club transferees (editable per_share) */}
                    <div className="sdp-pg-right">
                      <div className="sdp-pg-right-hdr"><i className="ri-user-received-line" /> Transferee</div>
                      {clubTransferees.map((tee, ti) => (
                        <TransfereeBlock
                          key={tee.id}
                          tee={tee}
                          groupIdx={0}
                          index={ti}
                          perShare={clubPerShare}
                          onUpdate={(_, id, changes) => updateClubTee(id, changes)}
                          onRemove={(_, id) => removeClubTee(id)}
                          canRemove={clubTransferees.length > 1}
                          shareholders={shareholders}
                          usedIds={clubUsedIds(ti)}
                          transferorEntityId={transferorEntityId}
                        />
                      ))}
                      <button className="sdp-add-tee" onClick={addClubTee} disabled={atMax}
                        title={isDone ? 'All shares fully allocated' : atMax ? 'All available shareholders already added' : undefined}>
                        <i className="ri-add-line" /> Add Transferee
                        {isDone && <span className="sdp-add-tee-max"> (shares fully allocated)</span>}
                        {!isDone && atMax && <span className="sdp-add-tee-max"> (max reached)</span>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

              {/* Summary */}
              <div className="sdp-summary-card">
                <div className="sdp-sum-title"><i className="ri-pie-chart-2-line" /> Dissolve Summary</div>

                <div className="sdp-sum-row">
                  {/* Progress */}
                  <div className="sdp-sum-progress">
                    <div className="sdp-sum-bar">
                      <div className="sdp-sum-bar-fill" style={{
                        width: `${totalSource > 0 ? Math.min(100, (totalAllocated / totalSource) * 100) : 0}%`,
                        background: remaining === 0 ? '#0ab39c' : remaining < 0 ? '#f06548' : '#405189',
                      }} />
                    </div>
                    <span className={`sdp-sum-bar-lbl${remaining === 0 ? ' sdp-sum-bar-lbl--done' : remaining < 0 ? ' sdp-sum-bar-lbl--over' : ''}`}>
                      {remaining === 0 ? `✓ All ${fmtNum(totalSource)} allocated` : remaining < 0 ? `Over by ${fmtNum(Math.abs(remaining))}` : `${fmtNum(remaining)} remaining`}
                    </span>
                  </div>

                  <div className="sdp-sum-vdiv" />

                  {/* Tiles */}
                  <div className="sdp-sum-tile">
                    <span className="sdp-sum-lbl">Source</span>
                    <span className="sdp-sum-num">{fmtNum(totalSource)}</span>
                  </div>
                  <div className="sdp-sum-tile">
                    <span className="sdp-sum-lbl">Allocated</span>
                    <span className={`sdp-sum-num${remaining === 0 ? ' sdp-sum-num--done' : remaining < 0 ? ' sdp-sum-num--over' : ' sdp-sum-num--pending'}`}>{fmtNum(totalAllocated)}</span>
                  </div>
                  <div className="sdp-sum-tile">
                    <span className="sdp-sum-lbl">Remaining</span>
                    <span className={`sdp-sum-num${remaining === 0 ? ' sdp-sum-num--done' : remaining < 0 ? ' sdp-sum-num--over' : ' sdp-sum-num--pending'}`}>{fmtNum(Math.abs(remaining))}</span>
                  </div>

                  <div className="sdp-sum-vdiv" />

                  {/* Meta chips */}
                  <span className={`sdp-sum-meta-badge${dissolveType === 'club' ? ' sdp-sum-meta-badge--club' : ''}`}>
                    <i className="ri-shuffle-line" /> {dissolveType === 'separate' ? 'Separate Dissolve' : 'Club Dissolve'}
                  </span>
                  <span className="sdp-sum-chip"><i className="ri-price-tag-3-line" /> {teeGroups.length} Group{teeGroups.length !== 1 ? 's' : ''}</span>
                  <span className="sdp-sum-chip"><i className="ri-file-list-3-line" /> {sourceTxns.length} Cert{sourceTxns.length !== 1 ? 's' : ''}</span>
                  <span className="sdp-sum-chip"><i className="ri-user-received-line" /> {teeGroups.reduce((s, g) => s + g.transferees.length, 0)} Transferee{teeGroups.reduce((s, g) => s + g.transferees.length, 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div className="sdp-actions">
                <button className="sdp-btn-cancel" onClick={() => navigate(`/company/${entity_id}/shares/shareholder-register`)}>
                  Cancel
                </button>
                <button className="sdp-btn-save" onClick={handleSave} disabled={saving || remaining !== 0}>
                  {saving
                    ? <><i className="ri-loader-4-line sdp-spin" /> Saving…</>
                    : <><i className="ri-check-line" /> Save Dissolve</>}
                </button>
              </div>

          </div>
        </div>
      </Container>
    </div>
  );
};

export default ShareDissolvePage;
