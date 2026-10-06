import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Card, CardBody, Row, Col, Input, Spinner, Button } from 'reactstrap';
import { toast } from 'react-toastify';
import BreadCrumb from '../../Components/Common/BreadCrumb';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import EntityLookupModal from '../../Components/Common/EntityLookupModal';
import RepresentativePickerModal from '../../Components/Common/RepresentativePickerModal';
import IndividualDetailPanel from './IndividualDetailPanel';
import CompanyDetailPanel from './CompanyDetailPanel';
import './OfficialFormPage.css';
import {
  getOfficial,
  getOfficialMasterList,
  getOfficialList,
  getIndividual,
  getCompany,
  createOfficial,
  updateOfficial,
} from '../../helpers/backend_helper';

// ── Helpers (mirrors OfficialFormPage) ────────────────────────────────────────
const AVATAR_COLORS = ['#405189','#0ab39c','#6559cc','#f7b84b','#299cdb','#f06548'];
const avatarColor   = (n = '') => AVATAR_COLORS[(n.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials      = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const SEC_COLORS = ['#405189', '#0ab39c', '#6559cc', '#f7b84b'];
const SecHead = ({ num, title }) => {
  const color = SEC_COLORS[(parseInt(num, 10) - 1) % SEC_COLORS.length];
  return (
    <div className="aop-sec-head">
      <div className="aop-sec-num" style={{ background: color, boxShadow: `0 2px 8px ${color}66` }}>{num}</div>
      <div className="aop-sec-title" style={{ color }}>{title}</div>
      <div className="aop-sec-line" style={{ background: `linear-gradient(to right, ${color}55, transparent)` }}></div>
    </div>
  );
};

const BLANK_DATES = {
  appointmentType: 'Proposed',
  appointmentDate: '',
  cessationType:   'Proposed',
  cessationDate:   '',
};

const DateWithRadio = ({ title, required, typeKey, dateKey, vals, onChange }) => (
  <div className="aop-date-grp">
    <div className="aop-date-row">
      <span className="aop-date-title">
        {title}{required && <span> *</span>}
      </span>
      <div className="aop-radio-group">
        {['Proposed', 'Effective'].map(opt => (
          <label key={opt} className="aop-radio-opt">
            <input
              type="radio"
              name={typeKey}
              value={opt}
              checked={vals[typeKey] === opt}
              onChange={() => onChange(typeKey, opt)} />
            {opt}
          </label>
        ))}
      </div>
      <div className="aop-date-pick">
        <span className="aop-role-date-lbl">Date</span>
        <DatePickerInput
          value={vals[dateKey]}
          onChange={e => onChange(dateKey, e.target.value)} />
      </div>
    </div>
  </div>
);

const BrowseField = ({ label, onClick }) => (
  <div className="aop-browse">
    <button className="aop-browse-btn" onClick={onClick}>
      <i className="ri-search-eye-line" style={{ fontSize: 14 }}></i>
      {label}
    </button>
    <span className="aop-browse-hint">Search and choose from the full list</span>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────
const SubOfficialFormPage = () => {
  useCollapseSidebar();
  const { parentSlug, parentOfficialId, childSlug, official_id } = useParams();
  const navigate = useNavigate();
  const { state: navState } = useLocation();
  const isEdit   = !!official_id;

  // Context
  const [parentOfficial, setParentOfficial] = useState(null);
  const [childMaster,    setChildMaster]    = useState(null);
  const [parentMaster,   setParentMaster]   = useState(null);
  const [pageLoading,    setPageLoading]    = useState(true);

  // Representative mode — when childSlug === 'representatives', picker shows
  // officials from cs_officials of the director's company instead of entity table
  const isRepMode = childSlug === 'representatives';
  // Alternate Director To — picker shows the other directors of the same company
  const isAltMode = childSlug === 'alternate-director-to';
  const usePicker = isRepMode || isAltMode;

  // Section 1 — entity selection
  const [eType,         setEType]         = useState('INDIVIDUAL');
  const [lookupOpen,    setLookupOpen]    = useState(false);
  const [selEntity,     setSelEntity]     = useState(null);
  const [entityDetail,  setEntityDetail]  = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Rep picker (only used when isRepMode)
  const [repPickerOpen,       setRepPickerOpen]       = useState(false);
  const [repOfficials,        setRepOfficials]        = useState([]);
  const [repOfficialsLoading, setRepOfficialsLoading] = useState(false);
  const [assignedRepIds,      setAssignedRepIds]      = useState([]);

  // Already-assigned sub-official entity IDs for non-rep mode (proxy / nominator exclusion)
  const [assignedSubIds, setAssignedSubIds] = useState([]);

  // Section 2 — dates
  const [dates, setDates] = useState({ ...BLANK_DATES });
  const setDate = (k, v) => setDates(d => ({ ...d, [k]: v }));

  const [saving, setSaving] = useState(false);

  // ── Load context ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setPageLoading(true);
      try {
        const [parentRes, mastersRes] = await Promise.all([
          getOfficial(parentOfficialId),
          getOfficialMasterList({ page: 1, limit: 200 }),
        ]);
        if (parentRes?.status) setParentOfficial(parentRes.data);
        const masters = mastersRes?.data?.data || mastersRes?.data || [];
        setChildMaster(masters.find(m => m.official_master_slug === childSlug)  || null);
        setParentMaster(masters.find(m => m.official_master_slug === parentSlug) || null);
      } catch {
        toast.error('Failed to load context');
      } finally {
        setPageLoading(false);
      }
    };
    load();
  }, [parentOfficialId, childSlug, parentSlug]);

  // ── Edit: load existing record ───────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      try {
        const res = await getOfficial(official_id);
        if (!res?.status) return;
        const rec   = res.data;
        const type    = rec.official_type || rec.official_entity?.entity_type || 'INDIVIDUAL';
        setEType(type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL');
        const dr = (rec.date_records || []).find(d => d.is_main_role === '1') || rec.date_record || {};
        setDates({
          appointmentType: (dr.is_appt_proposed  ?? 1) ? 'Proposed' : 'Effective',
          appointmentDate: (dr.appointment_date  || '').slice(0, 10),
          cessationType:   (dr.is_ceased_proposed ?? 1) ? 'Proposed' : 'Effective',
          cessationDate:   (dr.ceased_date        || '').slice(0, 10),
        });
        if (rec.official_entity) {
          setSelEntity(rec.official_entity);
          loadEntityDetail(rec.official_entity_id, type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL');
        }
      } catch {
        toast.error('Failed to load record');
      }
    };
    load();
  }, [isEdit, official_id]); // eslint-disable-line

  const loadEntityDetail = async (entityId, type) => {
    if (!entityId) return;
    setDetailLoading(true);
    try {
      const fn  = type === 'COMPANY' ? getCompany : getIndividual;
      const res = await fn(entityId);
      setEntityDetail(res?.status ? (res.data ?? null) : null);
    } catch {
      setEntityDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Alternate mode: load the company's directors (main records) as the principal options
  useEffect(() => {
    if (!isAltMode || !parentOfficial?.entity_id) return;
    setRepOfficialsLoading(true);
    getOfficialList({ entity_id: parentOfficial.entity_id, official_master_slug: parentSlug, is_ref_id: 0, limit: 500 })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        setRepOfficials(Array.isArray(data) ? data : []);
      })
      .catch(() => setRepOfficials([]))
      .finally(() => setRepOfficialsLoading(false));
  }, [isAltMode, parentOfficial?.entity_id, parentSlug]); // eslint-disable-line

  // Load officials of the director's company to show in rep picker
  useEffect(() => {
    if (!isRepMode || !parentOfficial?.official_entity_id) return;
    setRepOfficialsLoading(true);
    getOfficialList({ entity_id: parentOfficial.official_entity_id, official_master_slug: 'representatives', limit: 200 })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        setRepOfficials(Array.isArray(data) ? data : []);
      })
      .catch(() => setRepOfficials([]))
      .finally(() => setRepOfficialsLoading(false));
  }, [isRepMode, parentOfficial?.official_entity_id]); // eslint-disable-line

  // Fetch already-assigned representatives for this parent official so they can be excluded from the picker
  useEffect(() => {
    if (!isRepMode || !parentOfficialId) return;
    getOfficialList({ reference_official_id: parentOfficialId, official_master_slug: 'representatives', limit: 200 })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        const ids  = (Array.isArray(data) ? data : [])
          .filter(r => !isEdit || String(r.official_id) !== String(official_id))
          .map(r => String(r.official_entity_id))
          .filter(Boolean);
        setAssignedRepIds(ids);
      })
      .catch(() => setAssignedRepIds([]));
  }, [isRepMode, parentOfficialId, isEdit, official_id]); // eslint-disable-line

  // Fetch already-assigned sub-officials for proxy/nominator so they're excluded from EntityLookupModal
  useEffect(() => {
    if (isRepMode || !parentOfficialId || !childSlug) return;
    getOfficialList({ reference_official_id: parentOfficialId, official_master_slug: childSlug, limit: 200 })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        const ids  = (Array.isArray(data) ? data : [])
          .filter(r => !isEdit || String(r.official_id) !== String(official_id))
          .map(r => String(r.official_entity_id))
          .filter(Boolean);
        setAssignedSubIds(ids);
      })
      .catch(() => setAssignedSubIds([]));
  }, [isRepMode, parentOfficialId, childSlug, isEdit, official_id]); // eslint-disable-line

  const clearEntity = () => { setSelEntity(null); setEntityDetail(null); };

  const handleRepOfficialSelect = (rec) => {
    const entityRow = rec.official_entity;
    const type      = rec.official_type || entityRow?.entity_type || 'INDIVIDUAL';
    const dr        = rec.date_record || {};
    setEType(type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL');
    setSelEntity(entityRow);
    setRepPickerOpen(false);
    loadEntityDetail(entityRow.entity_id, type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL');
    if (isAltMode) return;   // alternate link has its own appointment dates
    setDates({
      appointmentType: (dr.is_appt_proposed  ?? 1) ? 'Proposed' : 'Effective',
      appointmentDate: (dr.appointment_date  || '').slice(0, 10),
      cessationType:   (dr.is_ceased_proposed ?? 1) ? 'Proposed' : 'Effective',
      cessationDate:   (dr.ceased_date        || '').slice(0, 10),
    });
  };

  const handleEntitySelect = (ent) => {
    setSelEntity(ent);
    setLookupOpen(false);
    loadEntityDetail(ent.entity_id, eType);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selEntity)              { toast.error('Please choose an entity');         return; }
    if (!dates.appointmentDate)  { toast.error('Date of Appointment is required'); return; }
    if (!parentOfficial)         { toast.error('Parent official not loaded');       return; }

    setSaving(true);
    try {
      const payload = {
        entity_id:             parentOfficial.entity_id,
        official_entity_id:    selEntity.entity_id,
        official_type:         eType,
        official_master_id:    childMaster?.official_master_id || null,
        official_master_slug:  childSlug,
        is_ref_id:             1,
        reference_official_id: Number(parentOfficialId),
        main_date: {
          official_master_slug: childSlug,
          appointment_date:     dates.appointmentDate || null,
          ceased_date:          dates.cessationDate   || null,
          is_appt_proposed:     dates.appointmentType === 'Proposed' ? 1 : 0,
          is_ceased_proposed:   dates.cessationType   === 'Proposed' ? 1 : 0,
        },
      };

      const res = isEdit
        ? await updateOfficial(official_id, payload)
        : await createOfficial(payload);

      if (res?.status === false || res?.statusCode >= 400) {
        toast.error(res?.message || `Failed to ${isEdit ? 'update' : 'save'}`);
        return;
      }

      toast.success(`${childLabel} ${isEdit ? 'updated' : 'saved'} successfully`);
      goBack();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : (err?.message || `Failed to ${isEdit ? 'update' : 'save'}`));
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const companyName  = parentOfficial?.entity?.name          || '—';
  const parentName   = parentOfficial?.official_entity?.name || '—';
  const childLabel   = childMaster?.official_master_name     || childSlug;
  const parentLabel  = parentMaster?.official_master_name    || parentSlug;
  const baseRoute    = `/officials/${parentSlug}/${parentOfficialId}/${childSlug}`;
  // Opened from the parent's Edit page (Linked Officials) → go back there after save / cancel
  const goBack       = () => navState?.returnTo
    ? navigate(navState.returnTo, { state: navState.returnState })
    : navigate(baseRoute);
  const pageTitle    = `${isEdit ? 'Edit' : 'Add'} ${childLabel}`;

  document.title = `${pageTitle} | ASR CSS`;

  if (pageLoading) {
    return (
      <div className="page-content">
        <Container fluid>
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spinner />
            <p className="mt-3 text-muted">Loading…</p>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="page-content">
      <Container fluid>
        <BreadCrumb title={pageTitle} pageTitle={`${parentLabel} › ${parentName}`} />

        {/* ── Context: gradient bg + glass chips (compact) ── */}
        {parentOfficial && (
          <div style={{
            borderRadius: 10,
            background: `linear-gradient(135deg, ${avatarColor(companyName)} 0%, #6559cc 50%, #299cdb 100%)`,
            padding: '10px 16px',
            marginBottom: 16,
            boxShadow: '0 4px 18px rgba(64,81,137,0.24)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', right: -30, top: -35, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: -20, bottom: -30, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>

              {/* Company chip */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '5px 12px',
              }}>
                <i className="ri-building-2-line" style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }}></i>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Company</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', lineHeight: 1.3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</div>
                </div>
              </div>

              <i className="ri-arrow-right-s-line" style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}></i>

              {/* Parent official chip */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '5px 12px',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: '#fff',
                }}>
                  {initials(parentName)}
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>{parentLabel}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', lineHeight: 1.3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentName}</div>
                </div>
              </div>

              <i className="ri-arrow-right-s-line" style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}></i>

              {/* Action chip */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.32)', borderRadius: 8, padding: '5px 12px',
              }}>
                <i className={isEdit ? 'ri-edit-line' : 'ri-user-add-line'} style={{ fontSize: 14, color: '#fff' }}></i>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>{isEdit ? 'Edit' : 'Add'} {childLabel}</div>
              </div>

              {/* Back to list */}
              <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <button
                  onClick={() => navigate(baseRoute)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)',
                    color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    backdropFilter: 'blur(6px)',
                  }}>
                  <i className="ri-list-check" style={{ fontSize: 13 }}></i>
                  {childLabel} List
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ── Section 1: Choose Entity ── */}
        <Card className="mb-3">
          <CardBody>
            <SecHead num="1" title={isEdit
              ? `${childLabel} — ${eType === 'INDIVIDUAL' ? 'Individual' : 'Company'}`
              : childLabel} />

            {/* INDIVIDUAL / COMPANY toggle — add mode, non-rep only */}
            {!isEdit && !usePicker && (
              <div className="aop-seg">
                <button
                  className={`aop-seg-btn ${eType === 'INDIVIDUAL' ? 'active' : ''}`}
                  onClick={() => { setEType('INDIVIDUAL'); clearEntity(); }}>
                  <i className="ri-user-line"></i>Individual
                </button>
                <button
                  className={`aop-seg-btn ${eType === 'COMPANY' ? 'active' : ''}`}
                  onClick={() => { setEType('COMPANY'); clearEntity(); }}>
                  <i className="ri-building-line"></i>Company
                </button>
              </div>
            )}

            {/* Browse button — before selection */}
            {!selEntity && !detailLoading && (
              <BrowseField
                label={isRepMode
                  ? 'Select Representative'
                  : isAltMode
                    ? 'Select Director'
                    : `Select ${eType === 'INDIVIDUAL' ? 'Individual' : 'Company'}`}
                onClick={() => usePicker ? setRepPickerOpen(true) : setLookupOpen(true)} />
            )}

            {/* Loading state */}
            {detailLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, fontSize: 12.5, color: '#878a99', border: '1px solid var(--vz-border-color)', borderRadius: 10, marginTop: 14 }}>
                <span className="spinner-border spinner-border-sm"></span>
                Loading {eType === 'COMPANY' ? 'company' : 'individual'} details…
              </div>
            )}

            {/* Company detail panel */}
            {eType === 'COMPANY' && !detailLoading && selEntity && (
              <CompanyDetailPanel
                detail={entityDetail}
                onClear={!isEdit ? clearEntity : undefined}
                onSwap={!isEdit ? () => (usePicker ? setRepPickerOpen(true) : setLookupOpen(true)) : undefined}
                swapLabel="Change Company" />
            )}

            {/* Individual detail panel */}
            {eType === 'INDIVIDUAL' && selEntity && !detailLoading && (
              <IndividualDetailPanel
                detail={entityDetail}
                idTypes={[]}
                overrides={{}}
                onChange={() => {}}
                onClear={!isEdit ? clearEntity : undefined}
                onSwap={!isEdit ? () => (usePicker ? setRepPickerOpen(true) : setLookupOpen(true)) : undefined}
                swapLabel="Change Individual" />
            )}
          </CardBody>
        </Card>

        {/* ── Section 2: Dates ── */}
        <Card className="mb-3">
          <CardBody>
            <SecHead num="2" title="Date of Appointment / Cessation" />
            <DateWithRadio
              title="Date of Appointment"
              required
              typeKey="appointmentType"
              dateKey="appointmentDate"
              vals={dates}
              onChange={setDate} />
            <DateWithRadio
              title="Date of Cessation"
              typeKey="cessationType"
              dateKey="cessationDate"
              vals={dates}
              onChange={setDate} />
          </CardBody>
        </Card>

        {/* ── Action buttons ── */}
        <div className="d-flex justify-content-end gap-2 mb-4">
          <Button color="light" disabled={saving} onClick={goBack}>
            <i className="ri-arrow-left-line me-1"></i>Cancel
          </Button>
          <Button
            style={{ background: '#0ab39c', borderColor: '#0ab39c', minWidth: 150 }}
            className="d-flex align-items-center gap-1"
            disabled={saving}
            onClick={handleSave}>
            {saving ? <Spinner size="sm" /> : <i className="ri-save-line"></i>}
            {isEdit ? `Update ${childLabel}` : `Save ${childLabel}`}
          </Button>
        </div>

      </Container>

      {/* Entity lookup — used for proxy / nominator and any non-rep child slug */}
      {!usePicker && (
        <EntityLookupModal
          isOpen={lookupOpen}
          onClose={() => setLookupOpen(false)}
          onSelect={handleEntitySelect}
          entityType={eType}
          title={`Select ${eType === 'COMPANY' ? 'Company' : 'Individual'}`}
          excludeEntityIds={[
            parentOfficial?.entity_id,
            parentOfficial?.official_entity_id,
            ...assignedSubIds,
          ].filter(Boolean)}
        />
      )}

      {/* Representative picker — lists officials from director's company */}
      {isRepMode && (
        <RepresentativePickerModal
          isOpen={repPickerOpen}
          onClose={() => setRepPickerOpen(false)}
          onSelect={handleRepOfficialSelect}
          officials={repOfficials}
          loading={repOfficialsLoading}
          excludeIds={[
            ...assignedRepIds,
            ...(selEntity ? [String(selEntity.entity_id)] : []),
          ]}
        />
      )}

      {/* Alternate Director To — choose the principal from the company's other directors */}
      {isAltMode && (
        <RepresentativePickerModal
          isOpen={repPickerOpen}
          onClose={() => setRepPickerOpen(false)}
          onSelect={handleRepOfficialSelect}
          officials={repOfficials}
          loading={repOfficialsLoading}
          title="Choose Director"
          nameLabel="Director"
          emptyText="No other active directors in this company."
          excludeIds={[
            String(parentOfficial?.official_entity_id),
            ...(selEntity ? [String(selEntity.entity_id)] : []),
          ]}
        />
      )}
    </div>
  );
};

export default SubOfficialFormPage;
