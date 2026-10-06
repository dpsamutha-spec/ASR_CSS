import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Container, Row, Col, Card, CardBody, Button, Input, Spinner,
} from 'reactstrap';
import { toast } from 'react-toastify';
import BreadCrumb from '../../Components/Common/BreadCrumb';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import EntityLookupModal from '../../Components/Common/EntityLookupModal';
import IndividualDetailPanel from './IndividualDetailPanel';
import CompanyDetailPanel from './CompanyDetailPanel';
import './OfficialFormPage.css';
import {
  getIndividual,
  getCompany,
  getOfficialMasterList,
  getMemberIdTypeList,
  createOfficial,
  updateOfficial,
  getOfficial,
  getCountriesList,
  getOfficialControllerDates,
  getOfficialList,
  deleteOfficial,
} from '../../helpers/backend_helper';
import OfficialContactSection, { BLANK_CONTACT, mapApiContact } from './OfficialContactSection';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#405189','#0ab39c','#6559cc','#f7b84b','#299cdb','#f06548'];
const avatarColor   = (n = '') => AVATAR_COLORS[(n.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials      = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const BLANK_DATES = {
  appointmentType: 'Proposed',
  appointmentDate: '',
  cessationType:   'Proposed',
  cessationDate:   '',
};

// ── Sub-components ────────────────────────────────────────────────────────────
const SEC_COLORS = ['#405189', '#0ab39c', '#6559cc', '#f7b84b'];

// Sub-official groups shown in "Linked Officials" (display order, label, icon, colour)
const LINKED_TYPES = [
  { slug: 'proxy',                 label: 'Proxy',                 icon: 'ri-shield-user-line', color: '#405189' },
  { slug: 'nominator',             label: 'Nominator',             icon: 'ri-user-star-line',   color: '#0ab39c' },
  { slug: 'alternate-director-to', label: 'Alternate Director To', icon: 'ri-user-shared-line', color: '#6559cc' },
  { slug: 'representatives',       label: 'Representatives',       icon: 'ri-group-line',       color: '#f7b84b' },
];
const linkedTypeOf = (slug) =>
  LINKED_TYPES.find(t => t.slug === slug) || { slug, label: slug, icon: 'ri-user-line', color: '#878a99' };

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

const DateWithRadio = ({ title, required, typeKey, dateKey, vals, onChange, namePrefix = '' }) => (
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
              name={namePrefix ? `${namePrefix}__${typeKey}` : typeKey}
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
const OfficialFormPage = () => {
  useCollapseSidebar();
  const { slug, official_id } = useParams();
  const { state }             = useLocation();
  const navigate              = useNavigate();

  const isEdit        = !!official_id;
  const entity        = state?.entity        || JSON.parse(sessionStorage.getItem('aop_list_entity') || 'null');
  const officialTypes = state?.officialTypes || JSON.parse(sessionStorage.getItem('aop_list_otypes') || '[]');
  useEffect(() => {
    if (state?.entity) sessionStorage.setItem('aop_list_entity', JSON.stringify(state.entity));
    if (state?.officialTypes?.length) sessionStorage.setItem('aop_list_otypes', JSON.stringify(state.officialTypes));
  }, [state]);

  const controllerOT = officialTypes.find(o =>
    o.label?.toLowerCase().includes('controller') || o.key?.toLowerCase().includes('controller')
  ) || null;

  const currentOT = slug && slug !== 'all'
    ? officialTypes.find(o => o.key === slug)
      || { key: slug, label: slug.charAt(0).toUpperCase() + slug.slice(1), id: null, isRepresentative: false }
    : null;

  const [selType, setSelType] = useState(slug !== 'all' ? slug : '');
  const resolvedOT = slug !== 'all'
    ? currentOT
    : officialTypes.find(o => o.key === selType) || null;

  const isShareholder = resolvedOT?.key?.toLowerCase().includes('shareholder') ?? false;

  const [pageLoading, setPageLoading] = useState(isEdit);

  // ── Section 1 ─────────────────────────────────────────────────────────────
  const [eType,               setEType]               = useState('INDIVIDUAL');
  const [shareholderPropType, setShareholderPropType] = useState('NON_NOMINEE');
  const [lookupOpen,          setLookupOpen]          = useState(false);
  const [selEntity,           setSelEntity]           = useState(null);
  const [entityDetail,        setEntityDetail]        = useState(null);
  const [detailLoading,       setDetailLoading]       = useState(false);
  const [idTypes,             setIdTypes]             = useState([]);
  const [indOverrides,        setIndOverrides]        = useState({});
  const [contactDetails,      setContactDetails]      = useState({ ...BLANK_CONTACT });
  const [countries,           setCountries]           = useState([]);
  const [existingContacts,    setExistingContacts]    = useState([]);

  // Joint shareholder members
  const BLANK_JOINT_MEMBER   = () => ({ _id: Date.now() + Math.random(), memberType: 'INDIVIDUAL', entity: null, entityDetail: null, loading: false });
  const [jointMembers,    setJointMembers]    = useState([BLANK_JOINT_MEMBER()]);
  const [jointBrowseIdx,  setJointBrowseIdx]  = useState(null);

  const addJointMember     = () => setJointMembers(p => [...p, BLANK_JOINT_MEMBER()]);
  const removeJointMember  = (idx) => setJointMembers(p => p.filter((_, i) => i !== idx));
  const clearJointMember   = (idx) => setJointMembers(p => p.map((m, i) => i === idx ? { ...m, entity: null, entityDetail: null } : m));
  const setJointMemberType = (idx, type) => setJointMembers(p => p.map((m, i) =>
    i === idx ? { ...m, memberType: type, entity: null, entityDetail: null } : m
  ));

  // Sub Fund
  const [vccType, setVccType] = useState('NON_UMBRELLA');
  const BLANK_SUBFUND_MEMBER  = () => ({ _id: Date.now() + Math.random(), entity: null, entityDetail: null, loading: false });
  const [subfundMembers,   setSubfundMembers]   = useState([BLANK_SUBFUND_MEMBER()]);
  const [subfundBrowseIdx, setSubfundBrowseIdx] = useState(null);

  const addSubfundMember    = () => setSubfundMembers(p => [...p, BLANK_SUBFUND_MEMBER()]);
  const removeSubfundMember = (idx) => setSubfundMembers(p => p.filter((_, i) => i !== idx));
  const clearSubfundMember  = (idx) => setSubfundMembers(p => p.map((m, i) => i === idx ? { ...m, entity: null, entityDetail: null } : m));

  const isSubfundUmbrella = eType === 'SUB_FUND' && vccType === 'UMBRELLA';

  // ── Section 2 ─────────────────────────────────────────────────────────────
  const [dates, setDates] = useState({ ...BLANK_DATES });

  // ── Roles ─────────────────────────────────────────────────────────────────
  const [subRoles,      setSubRoles]      = useState([]);
  const [rolesLoading,  setRolesLoading]  = useState(false);
  const [roleDates,     setRoleDates]     = useState({});
  const [parentRoleId,  setParentRoleId]  = useState(resolvedOT?.id ?? null);
  const [savedSubRoles, setSavedSubRoles] = useState([]);
  const [editingRowId,  setEditingRowId]  = useState(null);
  const [editRowData,   setEditRowData]   = useState({ appointmentDate: '', cessationDate: '' });

  // ── Controller ────────────────────────────────────────────────────────────
  const [controllerEnabled, setControllerEnabled] = useState(false);
  const [controllerDates,   setControllerDates]   = useState({ appointmentDate: '', cessationDate: '' });
  const [controllerLoading, setControllerLoading] = useState(false);

  // ── Linked officials (proxy / nominator / alternate director to / representatives) ──
  const [linkedOfficials, setLinkedOfficials] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingLinked,  setDeletingLinked]  = useState(false);
  const [linkedTypes,     setLinkedTypes]     = useState([]);   // sub-official types that apply to this official type

  const [saving, setSaving] = useState(false);
  const skipETypeReset = React.useRef(false);

  // ── Dynamic section numbers ───────────────────────────────────────────────
  const showContact = eType !== 'COMPANY' &&
    (selEntity || (eType === 'JOINT' && jointMembers.some(m => m.entity)) || isSubfundUmbrella);

  const sectionNums = {
    entity:     1,
    contact:    showContact ? 2 : null,
    date:       showContact ? 3 : 2,
    roles:      showContact ? 4 : 3,
    controller: showContact ? 5 : 4,
    linked:     showContact ? 6 : 5,
  };

  // Load sub-officials linked to this official (edit mode)
  const fetchLinkedOfficials = useCallback(() => {
    if (!official_id) return;
    getOfficialList({ reference_official_id: official_id, is_ref_id: 1, limit: 200 })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        setLinkedOfficials(Array.isArray(data) ? data : []);
      })
      .catch(() => setLinkedOfficials([]));
  }, [official_id]);
  useEffect(() => { fetchLinkedOfficials(); }, [fetchLinkedOfficials]);

  // Sub-official types for this official type: hidden types whose parent_slugs include it,
  // plus Representatives when the official type is a representative type
  useEffect(() => {
    if (!isEdit || !slug) return;
    getOfficialMasterList({ page: 1, limit: 200, is_parent: 0 })
      .then(res => {
        const data  = res?.data?.data || res?.data || [];
        const self  = data.find(m => m.official_master_slug === slug);
        const types = data
          .filter(m => !m.is_show && (m.parent_slugs || '').split(',').map(x => x.trim()).includes(slug))
          .map(m => m.official_master_slug);
        if (self?.is_representative) types.push('representatives');
        setLinkedTypes([...new Set(types)]);
      })
      .catch(() => setLinkedTypes([]));
  }, [isEdit, slug]);

  // Some sub-officials need an active sub role on this official (appointed, not ceased)
  const todayStr = new Date().toISOString().slice(0, 10);
  const hasActiveSubRole = (subSlug) => savedSubRoles.some(r =>
    r.official_master_slug === subSlug && r.appointment_date &&
    (!r.ceased_date || String(r.ceased_date).slice(0, 10) > todayStr)
  );
  const isLinkedTypeEligible = (childSlug) => {
    if (childSlug === 'nominator' && slug === 'directors')       return hasActiveSubRole('nominee-director');
    if (childSlug === 'alternate-director-to')                    return hasActiveSubRole('alternate-substitute-director');
    return true;
  };
  const isActiveLinked = (rec) => {
    const dr = (rec.date_records || []).find(d => d.is_main_role === '1') || rec.date_record || {};
    return !dr.ceased_date || String(dr.ceased_date).slice(0, 10) > todayStr;
  };
  // Groups to show: eligible types (even if empty) + any type that already has records
  const linkedGroups = [...new Set([
    ...linkedTypes.filter(isLinkedTypeEligible),
    ...linkedOfficials.map(r => r.official_master_slug),
  ])].sort((a, b) => {
    const ia = LINKED_TYPES.findIndex(t => t.slug === a);
    const ib = LINKED_TYPES.findIndex(t => t.slug === b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const removeLinkedOfficial = async (rec) => {
    setDeletingLinked(true);
    try {
      await deleteOfficial(rec.official_id);
      toast.success(`${rec.official_entity?.name || 'Official'} removed`);
      setConfirmDeleteId(null);
      fetchLinkedOfficials();
    } catch {
      toast.error('Failed to remove');
    } finally {
      setDeletingLinked(false);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    getCountriesList({ page: 1, limit: 300 })
      .then(res => {
        const list = res?.data?.data ?? res?.data ?? [];
        setCountries(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getMemberIdTypeList({ limit: 200, is_deleted: false })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        setIdTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => setIdTypes([]));
  }, []);

  useEffect(() => {
    if (!isEdit) setParentRoleId(resolvedOT?.id ?? null);
  }, [resolvedOT?.id]); // eslint-disable-line

  useEffect(() => {
    if (!parentRoleId) { setSubRoles([]); return; }
    setRolesLoading(true);
    getOfficialMasterList({ is_parent: parentRoleId, limit: 200, order: 'official_order:ASC' })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        setSubRoles(Array.isArray(data) ? data : []);
      })
      .catch(() => setSubRoles([]))
      .finally(() => setRolesLoading(false));
  }, [parentRoleId]);

  // ── Edit mode load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setPageLoading(true);
    getOfficial(official_id)
      .then(async res => {
        const rec = res?.data ?? res;
        if (!rec) return;

        if (rec.official_master_id) setParentRoleId(rec.official_master_id);

        const et = rec.official_type || 'INDIVIDUAL';
        skipETypeReset.current = true;
        setEType(et);
        if (rec.shareholder_property_type) setShareholderPropType(rec.shareholder_property_type);

        if (et === 'JOINT' && Array.isArray(rec.joint_members) && rec.joint_members.length) {
          setJointMembers(rec.joint_members.map(m => ({
            _id:          m.official_id,
            memberType:   m.official_type || 'INDIVIDUAL',
            entity:       m.official_entity || null,
            entityDetail: m.official_entity || null,
            loading:      false,
          })));
        }

        if (et === 'SUB_FUND') {
          const storedVcc   = rec.shareholder_property_type;
          const resolvedVcc = (storedVcc === 'UMBRELLA' || storedVcc === 'NON_UMBRELLA')
            ? storedVcc
            : (Array.isArray(rec.joint_members) && rec.joint_members.length ? 'UMBRELLA' : 'NON_UMBRELLA');
          setVccType(resolvedVcc);
          if (resolvedVcc === 'UMBRELLA' && Array.isArray(rec.joint_members) && rec.joint_members.length) {
            setSubfundMembers(rec.joint_members.map(m => ({
              _id:          m.official_id,
              entity:       m.official_entity || null,
              entityDetail: m.official_entity || null,
              loading:      false,
            })));
          }
        }

       if (rec.official_entity_id) {
        const fn = et === 'INDIVIDUAL' ? getIndividual : getCompany;
        fn(rec.official_entity_id).then(r => {
          const d      = r?.data ?? r;
          const detail = d?.data ?? d ?? rec.official_entity;
          setSelEntity(detail);
          setEntityDetail(detail);

          if (et === 'INDIVIDUAL' && rec.identification_id) {
            const idents = detail?.identifications || [];
            if (idents.length) {
              setIndOverrides(prev => ({
                ...prev,
                _identifications: idents.map(i => ({
                  ...i,
                  is_primary: Number(i.identification_id) === Number(rec.identification_id),
                })),
              }));
            }
          }

          // ── Populate existingContacts so the dropdown shows in edit mode ──
          const rawContacts    = detail?.official_company_contacts || [];
          const activeContacts = rawContacts.filter(c => !c.deleted || String(c.deleted) === '0');
          setExistingContacts(activeContacts);

          // If the saved official had a contact, pre-select it in the dropdown.
          // Re-apply the saved contact details on top (API data is authoritative).
          const cc = rec.company_contact || {};
          if (cc.contact_id && activeContacts.length > 0) {
            const matched = activeContacts.find(c => String(c.contact_id) === String(cc.contact_id));
            if (matched) {
              // contactDetails already set above from rec.company_contact — no need to override.
              // The OfficialContactSection will receive existingContacts and can show the picker.
            } else {
              // Contact was deleted or not in active list — keep the saved values as a manual entry.
            }
          } else if (activeContacts.length > 0 && !cc.contact_id) {
            // No saved contact — default to blank so user can pick or enter new
            setContactDetails({ ...BLANK_CONTACT });
          }
        }).catch(() => setSelEntity(rec.official_entity));
      }

        // Contacts
        const cc = rec.company_contact || {};
        if (cc.contact_id) {
          setContactDetails({
            contact_id:    cc.contact_id     || null,
            email:         cc.email          || '',
            mobileCode:    cc.mobile_code    || '+65',
            mobile:        cc.mobile         || '',
            telephoneCode: cc.telephone_code || '+65',
            telephone:     cc.telephone      || '',
            officeCode:    cc.office_code    || '+65',
            office:        cc.office         || '',
            ext:           cc.ext_no         || '',
          });
        } else {
          setContactDetails({ ...BLANK_CONTACT });
        }

        // ── Populate existingContacts from the entity detail fetch ──
        // We do this inside the entity fetch below; store the saved contact_id
        // so we can pre-select it after existing contacts are loaded
        const savedContactId = cc.contact_id || null;

        // Dates
        const allDates = rec.date_records || [];
        const mainRow  = allDates.find(d => d.is_main_role === '1');
        if (mainRow) {
          setDates({
            appointmentType: mainRow.is_appt_proposed   ? 'Proposed' : 'Effective',
            appointmentDate: mainRow.appointment_date?.slice(0, 10) || '',
            cessationType:   mainRow.is_ceased_proposed ? 'Proposed' : 'Effective',
            cessationDate:   mainRow.ceased_date?.slice(0, 10)      || '',
          });
        }

        const subRows = allDates.filter(d => d.is_main_role === '0');
        setSavedSubRoles(subRows);
        setRoleDates({});

        if (rec.entity_id && rec.official_entity_id) {
          getOfficialControllerDates({
            entity_id:            rec.entity_id,
            official_entity_id:   rec.official_entity_id,
            controller_master_id: controllerOT?.id || undefined,
          }).then(r => {
            const ctrl = r?.data;
            if (ctrl?.appointment_date || ctrl?.ceased_date) {
              setControllerEnabled(true);
              setControllerDates({
                appointmentDate: ctrl.appointment_date?.slice(0, 10) || '',
                cessationDate:   ctrl.ceased_date?.slice(0, 10)      || '',
              });
            }
          }).catch(() => {});
        }
      })
      .catch(() => toast.error('Failed to load official'))
      .finally(() => setPageLoading(false));
  }, [official_id]); // eslint-disable-line

  useEffect(() => {
    if (!subRoles.length) return;
    setRoleDates(prev => {
      if (!Object.keys(prev).some(k => isNaN(Number(k)))) return prev;
      const next = {};
      subRoles.forEach(role => {
        const bySlug = prev[role.official_master_slug];
        if (bySlug) next[role.official_master_id] = bySlug;
      });
      return next;
    });
  }, [subRoles]);

  useEffect(() => {
    if (skipETypeReset.current) { skipETypeReset.current = false; return; }
    setSelEntity(null);
    setEntityDetail(null);
    setIndOverrides({});
    setJointMembers([BLANK_JOINT_MEMBER()]);
    setSubfundMembers([BLANK_SUBFUND_MEMBER()]);
    setVccType('NON_UMBRELLA');
    setContactDetails({ ...BLANK_CONTACT });
    setExistingContacts([]);
  }, [eType]); // eslint-disable-line

  // ── Entity select ─────────────────────────────────────────────────────────
  const handleEntitySelect = useCallback(async (row) => {
    if (eType === 'SUB_FUND' && subfundBrowseIdx !== null) {
      const idx = subfundBrowseIdx;
      setLookupOpen(false);
      setSubfundBrowseIdx(null);
      setSubfundMembers(p => p.map((m, i) => i === idx ? { ...m, entity: row, entityDetail: null, loading: true } : m));
      try {
        const res    = await getCompany(row.entity_id);
        const raw    = res?.data ?? res;
        const detail = raw?.data ?? raw ?? row;
        setSubfundMembers(p => p.map((m, i) => i === idx ? { ...m, entityDetail: detail, loading: false } : m));
      } catch {
        setSubfundMembers(p => p.map((m, i) => i === idx ? { ...m, entityDetail: row, loading: false } : m));
      }
      return;
    }

    if (eType === 'JOINT' && jointBrowseIdx !== null) {
      const idx   = jointBrowseIdx;
      const mType = jointMembers[idx]?.memberType || 'INDIVIDUAL';
      setLookupOpen(false);
      setJointBrowseIdx(null);
      setJointMembers(p => p.map((m, i) => i === idx ? { ...m, entity: row, entityDetail: null, loading: true } : m));
      try {
        const fn     = mType === 'INDIVIDUAL' ? getIndividual : getCompany;
        const res    = await fn(row.entity_id);
        const raw    = res?.data ?? res;
        const detail = raw?.data ?? raw ?? row;
        setJointMembers(p => p.map((m, i) => i === idx ? { ...m, entityDetail: detail, loading: false } : m));
      } catch {
        setJointMembers(p => p.map((m, i) => i === idx ? { ...m, entityDetail: row, loading: false } : m));
      }
      return;
    }

    setSelEntity(row);
    setEntityDetail(null);
    setIndOverrides({});
    setControllerEnabled(false);
    setControllerDates({ appointmentDate: '', cessationDate: '' });
    setDetailLoading(true);

    try {
      const fn     = eType === 'INDIVIDUAL' ? getIndividual : getCompany;
      const res    = await fn(row.entity_id);
      const raw    = res?.data ?? res;
      const detail = raw?.data ?? raw ?? row;
      setEntityDetail(detail);

      // Existing contacts
      const rawContacts    = detail?.official_company_contacts || [];
      const activeContacts = rawContacts.filter(c => !c.deleted || String(c.deleted) === '0');
      setExistingContacts(activeContacts);

      if (activeContacts.length > 0) {
        setContactDetails(mapApiContact(activeContacts[0]));
      } else {
        setContactDetails({ ...BLANK_CONTACT });
      }

      if (eType === 'INDIVIDUAL' && row._chosen_ident_id) {
        const idents = detail?.identifications || [];
        setIndOverrides({
          _identifications: idents.map(i => ({
            ...i,
            is_primary: Number(i.identification_id) === Number(row._chosen_ident_id),
          })),
        });
      }
    } catch {
      setEntityDetail(row);
    } finally {
      setDetailLoading(false);
    }

    if (entity?.id && row.entity_id) {
      setControllerLoading(true);
      getOfficialControllerDates({
        entity_id:            entity.id,
        official_entity_id:   row.entity_id,
        controller_master_id: controllerOT?.id || undefined,
      }).then(res => {
        const ctrl = res?.data;
        if (ctrl?.appointment_date || ctrl?.ceased_date) {
          setControllerEnabled(true);
          setControllerDates({
            appointmentDate: ctrl.appointment_date?.slice(0, 10) || '',
            cessationDate:   ctrl.ceased_date?.slice(0, 10)      || '',
          });
        }
      }).catch(() => {}).finally(() => setControllerLoading(false));
    }
  }, [eType, entity, jointBrowseIdx, jointMembers, subfundBrowseIdx]); // eslint-disable-line

  const clearEntity = () => {
    setSelEntity(null);
    setEntityDetail(null);
    setIndOverrides({});
    setControllerEnabled(false);
    setControllerDates({ appointmentDate: '', cessationDate: '' });
    setContactDetails({ ...BLANK_CONTACT });
    setExistingContacts([]);
  };

  const BLANK_ROLE_DATES = { appointmentDate: '', cessationDate: '' };
  const toggleRole  = (id) => setRoleDates(prev => prev[id] ? (({ [id]: _, ...rest }) => rest)(prev) : { ...prev, [id]: { ...BLANK_ROLE_DATES } });
  const setRoleDate = (id, k, v) => setRoleDates(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  const setDate     = (k, v) => setDates(d => ({ ...d, [k]: v }));

  // ── Validation helpers ────────────────────────────────────────────────────
  const validateSubRoleDates = (records) => {
    const bySlug = {};
    for (const r of records) {
      const s = r.official_master_slug;
      if (s) { if (!bySlug[s]) bySlug[s] = []; bySlug[s].push(r); }
    }
    for (const [slug, rows] of Object.entries(bySlug)) {
      const name   = subRoles.find(r => r.official_master_slug === slug)?.official_master_name || slug;
      const sorted = [...rows].sort((a, b) => (a.appointment_date || '').localeCompare(b.appointment_date || ''));
      for (let i = 0; i < sorted.length; i++) {
        const { appointment_date: appt, ceased_date: ceas } = sorted[i];
        if (appt && ceas && appt > ceas)
          return `${name}: Appointment date must be before or equal to cessation date`;
        if (i < sorted.length - 1) {
          const nextAppt = sorted[i + 1].appointment_date;
          if (!ceas)
            return `${name}: Record ${i + 1} must have a cessation date before a new appointment can be added`;
          if (ceas >= nextAppt)
            return `${name}: Record ${i + 2} appointment date (${nextAppt}) must be after record ${i + 1} cessation date (${ceas})`;
        }
      }
    }
    return null;
  };

  const validateInlineEdit = (row, appt, ceas) => {
    if (appt && ceas && appt > ceas) return 'Appointment date must be before or equal to cessation date';
    const neighbours = savedSubRoles
      .filter(r => r.official_master_slug === row.official_master_slug && r.official_date_id !== row.official_date_id)
      .sort((a, b) => (a.appointment_date || '').localeCompare(b.appointment_date || ''));
    for (const other of neighbours) {
      const oAppt = other.appointment_date || '';
      const oCeas = other.ceased_date      || '';
      if (oAppt < (appt || '')) {
        if (oCeas && oCeas >= appt) return `Appointment date must be after the previous cessation date (${oCeas})`;
      } else {
        if (ceas && oAppt && ceas >= oAppt) return `Cessation date must be before the next appointment date (${oAppt})`;
      }
    }
    return null;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isEdit && !resolvedOT)              { toast.error('Please select an official type');           return; }
    if (eType === 'JOINT') {
      if (!jointMembers.length)              { toast.error('Add at least one joint member');            return; }
      if (jointMembers.some(m => !m.entity)) { toast.error('Please select all joint members');         return; }
    } else if (isSubfundUmbrella) {
      if (!subfundMembers.length)            { toast.error('Add at least one Sub Fund company member'); return; }
      if (subfundMembers.some(m => !m.entity)){ toast.error('Please select all Sub Fund company members'); return; }
    } else {
      if (!selEntity)                        { toast.error('Please choose an entity');                  return; }
    }
    if (!dates.appointmentDate) { toast.error('Date of Appointment is required'); return; }

    // Contact validation (only when contact section is shown)
    if (showContact) {
      const emailErr     = contactDetails.email?.trim()     ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDetails.email.trim())         : false;
      const mobileErr    = contactDetails.mobile?.trim()    ? contactDetails.mobile.replace(/\D/g, '').length    !== 8                 : false;
      const telephoneErr = contactDetails.telephone?.trim() ? contactDetails.telephone.replace(/\D/g, '').length !== 8                 : false;
      const officeErr    = contactDetails.office?.trim()    ? contactDetails.office.replace(/\D/g, '').length    !== 8                 : false;
      if (emailErr)     { toast.error('Please enter a valid email address.');         return; }
      if (mobileErr)    { toast.error('Mobile number must be exactly 8 digits.');     return; }
      if (telephoneErr) { toast.error('Telephone number must be exactly 8 digits.');  return; }
      if (officeErr)    { toast.error('Office number must be exactly 8 digits.');     return; }
    }

    // Sub-role date validation
    {
      const allSubRecs = isEdit
        ? [
            ...savedSubRoles.map(r => ({ official_master_slug: r.official_master_slug, appointment_date: r.appointment_date, ceased_date: r.ceased_date })),
            ...Object.keys(roleDates).map(id => {
              const rd = roleDates[id];
              const sr = subRoles.find(r => r.official_master_id === Number(id));
              return { official_master_slug: sr?.official_master_slug || id, appointment_date: rd.appointmentDate || null, ceased_date: rd.cessationDate || null };
            }),
          ]
        : Object.keys(roleDates).map(id => {
            const rd = roleDates[id];
            const sr = subRoles.find(r => r.official_master_id === Number(id));
            return { official_master_slug: sr?.official_master_slug || id, appointment_date: rd.appointmentDate || null, ceased_date: rd.cessationDate || null };
          });
      const err = validateSubRoleDates(allSubRecs);
      if (err) { toast.error(err); return; }
    }

    setSaving(true);
    try {
      const checkedRoles     = Object.keys(roleDates);
      const subRoleDatesEdit = isEdit
        ? [
            ...savedSubRoles.map(row => ({
              official_date_id:     row.official_date_id,
              official_master_slug: row.official_master_slug,
              appointment_date:     row.appointment_date || null,
              ceased_date:          row.ceased_date       || null,
            })),
            ...Object.keys(roleDates).map(roleId => {
              const rd      = roleDates[roleId];
              const subRole = subRoles.find(r => r.official_master_id === Number(roleId));
              return {
                official_master_slug: subRole?.official_master_slug || String(roleId),
                appointment_date:     rd.appointmentDate || null,
                ceased_date:          rd.cessationDate   || null,
              };
            }),
          ]
        : null;

      const mainDate = {
        official_master_slug:  resolvedOT?.key          || null,
        is_appt_proposed:      dates.appointmentType === 'Proposed' ? 1 : 0,
        is_ceased_proposed:    dates.cessationType   === 'Proposed' ? 1 : 0,
        appointment_date:      dates.appointmentDate || null,
        ceased_date:           dates.cessationDate   || null,
        officials_appt_from:   dates.appointmentType || null,
        officials_ceased_from: dates.cessationType   || null,
      };

      const subRoleDates = subRoleDatesEdit ?? checkedRoles.map(roleId => {
        const rd      = roleDates[roleId];
        const subRole = subRoles.find(r => r.official_master_id === Number(roleId));
        return {
          official_master_slug: subRole?.official_master_slug || String(roleId),
          appointment_date:     rd.appointmentDate || null,
          ceased_date:          rd.cessationDate   || null,
        };
      });

      const identList    = eType === 'INDIVIDUAL' ? (indOverrides._identifications ?? entityDetail?.identifications ?? []) : [];
      const primaryIdent = identList.find(i => i.is_primary) || identList[0];
      const identificationId = primaryIdent?.identification_id || null;

      const payload = {
        entity_id:            entity?.id,
        official_entity_id:   (eType === 'JOINT' || isSubfundUmbrella) ? null : selEntity?.entity_id,
        official_master_id:   resolvedOT?.id,
        official_master_slug: resolvedOT?.key || null,
        official_type:             eType,
        shareholder_property_type: eType === 'SUB_FUND'
          ? vccType
          : (isShareholder && shareholderPropType ? shareholderPropType : null),
        identification_id: identificationId,
        joint_members: eType === 'JOINT'
          ? jointMembers.filter(m => m.entity).map(m => ({ member_type: m.memberType, entity_id: m.entity.entity_id }))
          : isSubfundUmbrella
            ? subfundMembers.filter(m => m.entity).map(m => ({ member_type: 'COMPANY', entity_id: m.entity.entity_id }))
            : null,
        main_date:      mainDate,
        sub_role_dates: subRoleDates,
        controller_date: controllerEnabled ? {
          official_master_id: controllerOT?.id || null,
          appointment_date:   controllerDates.appointmentDate || null,
          ceased_date:        controllerDates.cessationDate   || null,
        } : null,
        // Only include contact_details when section is shown (not COMPANY type)
        contact_details: showContact ? {
          contact_id:     contactDetails.contact_id    || null,
          email:          contactDetails.email         || null,
          mobile_code:    contactDetails.mobileCode    || '+65',
          mobile:         contactDetails.mobile        || null,
          telephone_code: contactDetails.telephoneCode || '+65',
          telephone:      contactDetails.telephone     || null,
          office_code:    contactDetails.officeCode    || '+65',
          office:         contactDetails.office        || null,
          ext_no:         contactDetails.ext           || null,
        } : null,
      };

      const res = isEdit
        ? await updateOfficial(official_id, payload)
        : await createOfficial(payload);

      if (res?.status === false || res?.statusCode >= 400) {
        toast.error(res?.message || `Failed to ${isEdit ? 'update' : 'save'} official`); return;
      }

      toast.success(`Official ${isEdit ? 'updated' : 'saved'} successfully`);
      navigate(slug && slug !== 'all' ? `/officials/${slug}/list` : '/officials/entity', { state: { entity, officialTypes } });
    } catch (err) {
      toast.error(typeof err === 'string' ? err : (err?.message || `Failed to ${isEdit ? 'update' : 'save'} official`));
    } finally {
      setSaving(false);
    }
  };

  const pageTitle = isEdit ? `Edit ${resolvedOT?.label || 'Official'}` : `Add ${resolvedOT?.label || 'Official'}`;
  const saveLabel = isEdit ? 'Update Official' : 'Save Official';
  document.title  = `${pageTitle} | ASR CSS`;

  if (pageLoading) {
    return (
      <div className="page-content">
        <Container fluid>
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spinner />
            <p className="mt-3 text-muted">Loading official…</p>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="page-content">
      <Container fluid>
        <BreadCrumb title={pageTitle} pageTitle="Officials" />

        {/* ── Company header ── */}
        {entity && (
          <div className="aop-entity-header">
            <div className="aop-entity-hero">
              <div className="aop-entity-av" style={{ background: avatarColor(entity.companyName) }}>{initials(entity.companyName)}</div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <div className="aop-entity-name">{entity.companyName}</div>
                <div className="aop-entity-badges">
                  {entity.clientNo && entity.clientNo !== '—' && <span className="aop-entity-badge">{entity.clientNo}</span>}
                  {entity.regNo    && <span className="aop-entity-badge">{entity.regNo}</span>}
                  {entity.status   && <span className={`aop-entity-badge aop-entity-badge-status-${entity.status.toLowerCase()}`}>{entity.status}</span>}
                </div>
              </div>
              {slug && slug !== 'all' && (
                <button className="aop-entity-list-btn"
                  onClick={() => navigate(`/officials/${slug}/list`, { state: { entity, officialTypes } })}>
                  <i className="ri-list-check"></i>
                  {resolvedOT?.label || 'Officials'} List
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Official type picker ── */}
        {slug === 'all' && (
          <Card className="mb-3">
            <CardBody>
              <SecHead num="0" title="Official Type" />
              <Row>
                <Col md={4}>
                  <Input type="select" bsSize="sm" value={selType}
                    onChange={e => { setSelType(e.target.value); setSubRoles([]); setRoleDates({}); }}>
                    <option value="">— Select official type —</option>
                    {officialTypes.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </Input>
                </Col>
              </Row>
            </CardBody>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════
            SECTION 1 — Choose Entity
        ══════════════════════════════════════════════════ */}
        <Card className="mb-3">
          <CardBody>
            <SecHead num={sectionNums.entity} title={isEdit
              ? `${resolvedOT?.label || 'Official'} — ${
                  eType === 'INDIVIDUAL' ? 'Individual'
                  : eType === 'JOINT'    ? 'Joint'
                  : eType === 'SUB_FUND' ? 'Sub Fund'
                  : 'Company'
                }`
              : (resolvedOT?.label || 'Official')} />

            {/* Type toggles */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, flexWrap: 'wrap', marginBottom: 14 }}>
              {!isEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#878a99', textTransform: 'uppercase', letterSpacing: '.05em', paddingLeft: 4 }}>Official Type</span>
                  <div className="aop-seg" style={{ marginBottom: 0 }}>
                    <button className={`aop-seg-btn ${eType === 'INDIVIDUAL' ? 'active' : ''}`} onClick={() => setEType('INDIVIDUAL')}>
                      <i className="ri-user-line"></i>Individual
                    </button>
                    <button className={`aop-seg-btn ${eType === 'COMPANY' ? 'active' : ''}`} onClick={() => setEType('COMPANY')}>
                      <i className="ri-building-line"></i>Company
                    </button>
                    {isShareholder && (
                      <>
                        <button className={`aop-seg-btn ${eType === 'JOINT' ? 'active' : ''}`} onClick={() => setEType('JOINT')}>
                          <i className="ri-group-line"></i>Joint
                        </button>
                        <button className={`aop-seg-btn ${eType === 'SUB_FUND' ? 'active' : ''}`} onClick={() => setEType('SUB_FUND')}>
                          <i className="ri-funds-line"></i>Sub Fund
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {!isEdit && isShareholder && (
                <div style={{ width: 1, height: 32, background: 'var(--vz-border-color)', margin: '0 12px', flexShrink: 0 }} />
              )}

              {isShareholder && eType !== 'SUB_FUND' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#878a99', textTransform: 'uppercase', letterSpacing: '.05em', paddingLeft: 4 }}>Shareholder Type</span>
                  <div className="aop-seg" style={{ marginBottom: 0 }}>
                    <button className={`aop-seg-btn ${shareholderPropType === 'NON_NOMINEE' ? 'active' : ''}`} onClick={() => setShareholderPropType(v => v === 'NON_NOMINEE' ? '' : 'NON_NOMINEE')}>
                      <i className="ri-user-line"></i>Non-Nominee
                    </button>
                    <button className={`aop-seg-btn ${shareholderPropType === 'NOMINEE' ? 'active' : ''}`} onClick={() => setShareholderPropType(v => v === 'NOMINEE' ? '' : 'NOMINEE')}>
                      <i className="ri-user-star-line"></i>Nominee
                    </button>
                    <button className={`aop-seg-btn ${shareholderPropType === 'TRUST' ? 'active' : ''}`} onClick={() => setShareholderPropType(v => v === 'TRUST' ? '' : 'TRUST')}>
                      <i className="ri-shield-user-line"></i>Trustee
                    </button>
                  </div>
                </div>
              )}

              {eType === 'SUB_FUND' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#878a99', textTransform: 'uppercase', letterSpacing: '.05em', paddingLeft: 4 }}>VCC Type</span>
                  {isEdit ? (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--vz-body-color)', paddingLeft: 4 }}>
                      <i className={`${vccType === 'UMBRELLA' ? 'ri-stack-line' : 'ri-building-line'} me-1`} style={{ color: '#6559cc' }}></i>
                      {vccType === 'UMBRELLA' ? 'Umbrella VCC' : 'Non-Umbrella VCC'}
                    </span>
                  ) : (
                    <div className="aop-seg" style={{ marginBottom: 0 }}>
                      <button className={`aop-seg-btn ${vccType === 'NON_UMBRELLA' ? 'active' : ''}`} onClick={() => setVccType('NON_UMBRELLA')}>
                        <i className="ri-building-line"></i>Non-Umbrella VCC
                      </button>
                      <button className={`aop-seg-btn ${vccType === 'UMBRELLA' ? 'active' : ''}`} onClick={() => setVccType('UMBRELLA')}>
                        <i className="ri-stack-line"></i>Umbrella VCC
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* JOINT members */}
            {eType === 'JOINT' && (
              <div style={{ marginTop: 14 }}>
                {jointMembers.map((member, idx) => (
                  <div key={member._id} style={{ border: '1px solid var(--vz-border-color)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#878a99', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>Member {idx + 1}</span>
                      {!isEdit && (
                        <div className="aop-seg" style={{ marginBottom: 0 }}>
                          <button className={`aop-seg-btn ${member.memberType === 'INDIVIDUAL' ? 'active' : ''}`} onClick={() => setJointMemberType(idx, 'INDIVIDUAL')}>
                            <i className="ri-user-line"></i>Individual
                          </button>
                          <button className={`aop-seg-btn ${member.memberType === 'COMPANY' ? 'active' : ''}`} onClick={() => setJointMemberType(idx, 'COMPANY')}>
                            <i className="ri-building-line"></i>Company
                          </button>
                        </div>
                      )}
                      {isEdit && <span style={{ fontSize: 11, color: '#878a99', fontStyle: 'italic' }}>{member.memberType === 'INDIVIDUAL' ? 'Individual' : 'Company'}</span>}
                      {!isEdit && jointMembers.length > 1 && (
                        <button style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: 'none', background: '#f065481a', color: '#f06548', cursor: 'pointer', flexShrink: 0 }}
                          onClick={() => removeJointMember(idx)}>
                          <i className="ri-subtract-line" style={{ fontSize: 14 }}></i>
                        </button>
                      )}
                    </div>
                    {member.loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#878a99' }}><span className="spinner-border spinner-border-sm"></span> Loading…</div>}
                    {!member.loading && !member.entity && <BrowseField label={`Select ${member.memberType === 'INDIVIDUAL' ? 'Individual' : 'Company'}`} onClick={() => { setJointBrowseIdx(idx); setLookupOpen(true); }} />}
                    {!member.loading && member.entity && (
                      member.memberType === 'INDIVIDUAL' ? (
                        <IndividualDetailPanel detail={member.entityDetail} idTypes={idTypes} overrides={{}} onChange={() => {}}
                          onClear={() => clearJointMember(idx)} onSwap={() => { setJointBrowseIdx(idx); setLookupOpen(true); }} swapLabel="Change Individual" />
                      ) : (
                        <CompanyDetailPanel detail={member.entityDetail}
                          onClear={() => clearJointMember(idx)} onSwap={() => { setJointBrowseIdx(idx); setLookupOpen(true); }} swapLabel="Change Company" />
                      )
                    )}
                  </div>
                ))}
                {!isEdit && (
                  <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px dashed #0ab39c', borderRadius: 7, background: 'rgba(10,179,156,.04)', color: '#0ab39c', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    onClick={addJointMember}>
                    <i className="ri-add-line"></i>Add Member
                  </button>
                )}
              </div>
            )}

            {/* SUB_FUND Umbrella members */}
            {isSubfundUmbrella && (
              <div style={{ marginTop: 14 }}>
                {subfundMembers.map((member, idx) => (
                  <div key={member._id} style={{ border: '1px solid var(--vz-border-color)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6559cc', textTransform: 'uppercase', letterSpacing: '.05em' }}>Company {idx + 1}</span>
                      {!isEdit && subfundMembers.length > 1 && (
                        <button style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: 'none', background: '#f065481a', color: '#f06548', cursor: 'pointer', flexShrink: 0 }}
                          onClick={() => removeSubfundMember(idx)}>
                          <i className="ri-subtract-line" style={{ fontSize: 14 }}></i>
                        </button>
                      )}
                    </div>
                    {member.loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#878a99' }}><span className="spinner-border spinner-border-sm"></span> Loading…</div>}
                    {!member.loading && !member.entity && <BrowseField label="Select Company" onClick={() => { setSubfundBrowseIdx(idx); setLookupOpen(true); }} />}
                    {!member.loading && member.entity && (
                      <CompanyDetailPanel detail={member.entityDetail}
                        onClear={() => clearSubfundMember(idx)} onSwap={() => { setSubfundBrowseIdx(idx); setLookupOpen(true); }} swapLabel="Change Company" />
                    )}
                  </div>
                ))}
                {!isEdit && (
                  <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px dashed #6559cc', borderRadius: 7, background: 'rgba(101,89,204,.04)', color: '#6559cc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    onClick={addSubfundMember}>
                    <i className="ri-add-line"></i>Add Company
                  </button>
                )}
              </div>
            )}

            {/* Browse button */}
            {!isEdit && eType !== 'JOINT' && !isSubfundUmbrella && !selEntity && !detailLoading && (
              <BrowseField label={`Select ${eType === 'INDIVIDUAL' ? 'Individual' : eType === 'SUB_FUND' ? 'Sub Fund' : 'Company'}`} onClick={() => setLookupOpen(true)} />
            )}

            {/* Company / Sub Fund detail panel */}
            {['COMPANY', 'SUB_FUND'].includes(eType) && !isSubfundUmbrella && detailLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px', fontSize: 12.5, color: '#878a99', border: '1px solid var(--vz-border-color)', borderRadius: 10, marginTop: 14 }}>
                <span className="spinner-border spinner-border-sm"></span> Loading details…
              </div>
            )}
            {['COMPANY', 'SUB_FUND'].includes(eType) && !isSubfundUmbrella && !detailLoading && selEntity && (
              <CompanyDetailPanel detail={entityDetail}
                onClear={!isEdit ? clearEntity : undefined}
                onSwap={!isEdit ? () => setLookupOpen(true) : undefined}
                swapLabel={`Change ${eType === 'SUB_FUND' ? 'Sub Fund' : 'Company'}`} />
            )}

            {/* Individual loading */}
            {eType === 'INDIVIDUAL' && detailLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px', fontSize: 12.5, color: '#878a99', border: '1px solid var(--vz-border-color)', borderRadius: 10, marginTop: 14 }}>
                <span className="spinner-border spinner-border-sm"></span> Loading individual details…
              </div>
            )}

            {/* Individual panel */}
            {eType === 'INDIVIDUAL' && selEntity && !detailLoading && (
              <IndividualDetailPanel detail={entityDetail} idTypes={idTypes} overrides={indOverrides} onChange={setIndOverrides}
                onClear={!isEdit ? clearEntity : undefined}
                onSwap={!isEdit ? () => setLookupOpen(true) : undefined}
                swapLabel="Change Individual" />
            )}
          </CardBody>
        </Card>

        {/* ══════════════════════════════════════════════════
            SECTION 2 — Contact Details
            (only for INDIVIDUAL / JOINT / SUB_FUND after entity selected)
        ══════════════════════════════════════════════════ */}
        {showContact && (
          <Card className="mb-3">
            <CardBody>
              <SecHead num={sectionNums.contact} title="Company Contact Details" />
              <OfficialContactSection
                value={contactDetails}
                onChange={setContactDetails}
                countries={countries}
                existingContacts={existingContacts}
                defaultContactId={contactDetails.contact_id || null} 
              />
            </CardBody>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════
            SECTION — Date of Appointment / Cessation
            num = 3 (with contact) or 2 (without contact)
        ══════════════════════════════════════════════════ */}
        <Card className="mb-3">
          <CardBody>
            <SecHead num={sectionNums.date} title="Date of Appointment / Cessation" />
            <DateWithRadio title="Date of Appointment" required typeKey="appointmentType" dateKey="appointmentDate" vals={dates} onChange={setDate} />
            <DateWithRadio title="Date of Cessation"           typeKey="cessationType"   dateKey="cessationDate"   vals={dates} onChange={setDate} />
          </CardBody>
        </Card>

        {/* ══════════════════════════════════════════════════
            SECTION — Roles (Sub-role)
            num = 4 (with contact) or 3 (without contact)
        ══════════════════════════════════════════════════ */}
        <Card className="mb-3">
          <CardBody>
            <SecHead num={sectionNums.roles} title="Roles (Sub-role)" />
            {isEdit ? (
              rolesLoading ? (
                <div style={{ textAlign: 'center', padding: 18 }}><Spinner size="sm" /></div>
              ) : (
                <>
                  {savedSubRoles.length === 0 ? (
                    <p className="aop-sr-empty" style={{ marginBottom: subRoles.length ? 16 : 0 }}>No sub-roles saved yet.</p>
                  ) : (
                    <table className="aop-sr-table" style={{ marginBottom: subRoles.length ? 20 : 0 }}>
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Appointment Date</th>
                          <th>Cessation Date</th>
                          <th style={{ width: 140 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedSubRoles.map(row => {
                          const roleName      = subRoles.find(r => r.official_master_slug === row.official_master_slug)?.official_master_name || row.official_master_slug;
                          const isEditingThis = editingRowId === row.official_date_id;
                          return (
                            <tr key={row.official_date_id}>
                              <td><span className="aop-sr-role-name">{roleName}</span></td>
                              <td>
                                {isEditingThis
                                  ? <DatePickerInput style={{ width: 160 }} value={editRowData.appointmentDate} onChange={e => setEditRowData(d => ({ ...d, appointmentDate: e.target.value }))} />
                                  : <span className="aop-sr-date-val">{row.appointment_date?.slice(0, 10) || '—'}</span>}
                              </td>
                              <td>
                                {isEditingThis
                                  ? <DatePickerInput style={{ width: 160 }} value={editRowData.cessationDate} onChange={e => setEditRowData(d => ({ ...d, cessationDate: e.target.value }))} />
                                  : <span className="aop-sr-date-val">{row.ceased_date?.slice(0, 10) || '—'}</span>}
                              </td>
                              <td>
                                {isEditingThis ? (
                                  <div className="aop-act-wrap">
                                    <button className="aop-act save" title="Save" onClick={() => {
                                      const err = validateInlineEdit(row, editRowData.appointmentDate, editRowData.cessationDate);
                                      if (err) { toast.error(err); return; }
                                      setSavedSubRoles(prev => prev.map(r => r.official_date_id === row.official_date_id
                                        ? { ...r, appointment_date: editRowData.appointmentDate || null, ceased_date: editRowData.cessationDate || null }
                                        : r));
                                      setEditingRowId(null);
                                    }}><i className="ri-check-line"></i></button>
                                    <button className="aop-act cancel" title="Cancel" onClick={() => setEditingRowId(null)}><i className="ri-close-line"></i></button>
                                  </div>
                                ) : (
                                  <div className="aop-act-wrap">
                                    <button className="aop-act edit" title="Edit" onClick={() => { setEditingRowId(row.official_date_id); setEditRowData({ appointmentDate: row.appointment_date?.slice(0, 10) || '', cessationDate: row.ceased_date?.slice(0, 10) || '' }); }}><i className="ri-pencil-line"></i></button>
                                    <button className="aop-act delete" title="Remove" onClick={() => setSavedSubRoles(prev => prev.filter(r => r.official_date_id !== row.official_date_id))}><i className="ri-delete-bin-line"></i></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {(() => {
                    const addableRoles = subRoles.filter(role => {
                      const latest = savedSubRoles.filter(r => r.official_master_slug === role.official_master_slug).sort((a, b) => (a.appointment_date || '').localeCompare(b.appointment_date || '')).slice(-1)[0];
                      return !latest || !!latest.ceased_date;
                    });
                    if (!addableRoles.length) return null;
                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#878a99', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>New Appointment</span>
                          <div style={{ flex: 1, height: 1, background: 'var(--vz-border-color)' }} />
                        </div>
                        {addableRoles.map(role => {
                          const rid         = role.official_master_id;
                          const checked     = !!roleDates[rid];
                          const rd          = roleDates[rid] || {};
                          const latest      = savedSubRoles.filter(r => r.official_master_slug === role.official_master_slug).sort((a, b) => (a.appointment_date || '').localeCompare(b.appointment_date || '')).slice(-1)[0];
                          const minApptDate = latest?.ceased_date?.slice(0, 10) || '';
                          return (
                            <div key={rid} className={`aop-role-row ${checked ? 'chk' : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleRole(rid)} />
                              <span className="aop-role-row-name" onClick={() => toggleRole(rid)}>
                                {role.official_master_name}
                                {minApptDate && <span style={{ fontSize: 11, color: '#878a99', fontWeight: 400, marginLeft: 8 }}>— appt. must be after {minApptDate}</span>}
                              </span>
                              {checked && (
                                <div className="aop-role-dates">
                                  <span className="aop-role-date-lbl">Appointment</span>
                                  <DatePickerInput style={{ width: 160 }} options={{ minDate: minApptDate || undefined }} value={rd.appointmentDate} onChange={e => setRoleDate(rid, 'appointmentDate', e.target.value)} />
                                  <span className="aop-role-date-lbl">Cessation</span>
                                  <DatePickerInput style={{ width: 160 }} value={rd.cessationDate} onChange={e => setRoleDate(rid, 'cessationDate', e.target.value)} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </>
              )
            ) : (
              slug === 'all' && !selType ? (
                <p style={{ fontSize: 12.5, color: '#878a99', fontStyle: 'italic', margin: 0 }}>Select an official type above to load available sub-roles.</p>
              ) : rolesLoading ? (
                <div style={{ textAlign: 'center', padding: 18 }}><Spinner size="sm" /></div>
              ) : subRoles.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#878a99', margin: 0 }}>No sub-roles configured for this official type.</p>
              ) : (
                <div>
                  {subRoles.map(role => {
                    const rid     = role.official_master_id;
                    const checked = !!roleDates[rid];
                    const rd      = roleDates[rid] || {};
                    return (
                      <div key={rid} className={`aop-role-row ${checked ? 'chk' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleRole(rid)} />
                        <span className="aop-role-row-name" onClick={() => toggleRole(rid)}>{role.official_master_name}</span>
                        {checked && (
                          <div className="aop-role-dates">
                            <span className="aop-role-date-lbl">Appointment</span>
                            <DatePickerInput style={{ width: 160 }} value={rd.appointmentDate} onChange={e => setRoleDate(rid, 'appointmentDate', e.target.value)} />
                            <span className="aop-role-date-lbl">Cessation</span>
                            <DatePickerInput style={{ width: 160 }} value={rd.cessationDate} onChange={e => setRoleDate(rid, 'cessationDate', e.target.value)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </CardBody>
        </Card>

        {/* ══════════════════════════════════════════════════
            SECTION — Controller
            num = 5 (with contact) or 4 (without contact)
        ══════════════════════════════════════════════════ */}
        <Card className="mb-3">
          <CardBody>
            <SecHead num={sectionNums.controller} title="Controller" />
            {controllerLoading ? (
              <div style={{ textAlign: 'center', padding: 18 }}><Spinner size="sm" /></div>
            ) : (
              <div className={`aop-role-row ${controllerEnabled ? 'chk' : ''}`}>
                <input type="checkbox" checked={controllerEnabled}
                  onChange={() => { setControllerEnabled(v => !v); if (controllerEnabled) setControllerDates({ appointmentDate: '', cessationDate: '' }); }} />
                <span className="aop-role-row-name" onClick={() => setControllerEnabled(v => !v)}>Controller</span>
                {controllerEnabled && (
                  <div className="aop-role-dates">
                    <span className="aop-role-date-lbl">Appointment</span>
                    <DatePickerInput style={{ width: 160 }} value={controllerDates.appointmentDate} onChange={e => setControllerDates(d => ({ ...d, appointmentDate: e.target.value }))} />
                    <span className="aop-role-date-lbl">Cessation</span>
                    <DatePickerInput style={{ width: 160 }} value={controllerDates.cessationDate} onChange={e => setControllerDates(d => ({ ...d, cessationDate: e.target.value }))} />
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ══════════════════════════════════════════════════
            SECTION — Linked Officials (edit mode, when any exist)
        ══════════════════════════════════════════════════ */}
        {isEdit && linkedGroups.length > 0 && (
          <Card className="mb-3">
            <CardBody>
              <SecHead num={sectionNums.linked} title="Linked Officials" />
              <div className="aop-lo-groups">
                {linkedGroups.map(childSlug => {
                    const type   = linkedTypeOf(childSlug);
                    const rows   = linkedOfficials.filter(r => r.official_master_slug === childSlug);
                    // Alternate Director To: one principal at a time
                    const canAdd = isLinkedTypeEligible(childSlug) &&
                      !(childSlug === 'alternate-director-to' && rows.some(isActiveLinked));
                    return (
                      <div key={childSlug} className="aop-lo-group" style={{ '--lo-color': type.color }}>
                        <div className="aop-lo-group-hdr">
                          <span className="aop-lo-group-icon"><i className={type.icon}></i></span>
                          <span className="aop-lo-group-title">{type.label}</span>
                          <span className="aop-lo-group-count">{rows.length}</span>
                          {canAdd && (
                            <button type="button" className="aop-lo-add" title={`Add ${type.label}`}
                              onClick={() => navigate(
                                `/officials/${slug}/${official_id}/${childSlug}/add`,
                                { state: { returnTo: `/officials/${slug}/edit/${official_id}`, returnState: state } }
                              )}>
                              <i className="ri-add-line"></i> Add
                            </button>
                          )}
                        </div>
                        {rows.length === 0 && (
                          <div className="aop-lo-empty">No {type.label.toLowerCase()} added yet.</div>
                        )}
                        {rows.map(rec => {
                          const dr         = (rec.date_records || []).find(d => d.is_main_role === '1') || rec.date_record || {};
                          const name       = rec.official_entity?.name || '—';
                          const ceased     = dr.ceased_date?.slice(0, 10);
                          const confirming = confirmDeleteId === rec.official_id;
                          return (
                            <div key={rec.official_id} className={`aop-lo-row${confirming ? ' confirming' : ''}`}>
                              <span className="aop-lo-avatar">{name.charAt(0).toUpperCase()}</span>
                              <div className="aop-lo-info">
                                <span className="aop-lo-name" title={name}>{name}</span>
                                <span className="aop-lo-dates">
                                  <i className="ri-calendar-check-line"></i> Appointed {dr.appointment_date?.slice(0, 10) || '—'}
                                  {ceased && <span className="aop-lo-ceased"> · Ceased {ceased}</span>}
                                </span>
                              </div>
                              {confirming ? (
                                <div className="aop-act-wrap">
                                  <span className="aop-lo-confirm">Remove?</span>
                                  <button className="aop-act save" title="Confirm remove" disabled={deletingLinked}
                                    onClick={() => removeLinkedOfficial(rec)}><i className="ri-check-line"></i></button>
                                  <button className="aop-act cancel" title="Cancel" disabled={deletingLinked}
                                    onClick={() => setConfirmDeleteId(null)}><i className="ri-close-line"></i></button>
                                </div>
                              ) : (
                                <div className="aop-act-wrap">
                                  <button className="aop-act edit" title="Edit"
                                    onClick={() => navigate(
                                      `/officials/${slug}/${official_id}/${childSlug}/edit/${rec.official_id}`,
                                      { state: { returnTo: `/officials/${slug}/edit/${official_id}`, returnState: state } }
                                    )}><i className="ri-pencil-line"></i></button>
                                  <button className="aop-act delete" title="Remove"
                                    onClick={() => setConfirmDeleteId(rec.official_id)}><i className="ri-delete-bin-line"></i></button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Action buttons ── */}
        <div className="d-flex justify-content-end gap-2 mb-4">
          <Button color="light" disabled={saving}
            onClick={() => navigate(slug && slug !== 'all' ? `/officials/${slug}/list` : '/officials/entity', { state: { entity, officialTypes } })}>
            <i className="ri-arrow-left-line me-1"></i>Cancel
          </Button>
          <Button style={{ background: '#0ab39c', borderColor: '#0ab39c', minWidth: 150 }}
            className="d-flex align-items-center gap-1" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <i className="ri-save-line"></i>}
            {saveLabel}
          </Button>
        </div>
      </Container>

      {/* ── Entity lookup modal ── */}
      <EntityLookupModal
        isOpen={lookupOpen}
        onClose={() => { setLookupOpen(false); setJointBrowseIdx(null); setSubfundBrowseIdx(null); }}
        onSelect={handleEntitySelect}
        entityType={
          eType === 'JOINT' && jointBrowseIdx !== null
            ? (jointMembers[jointBrowseIdx]?.memberType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY')
            : isSubfundUmbrella && subfundBrowseIdx !== null
              ? 'COMPANY'
              : (eType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY')
        }
        title={
          eType === 'JOINT' && jointBrowseIdx !== null
            ? `Select ${jointMembers[jointBrowseIdx]?.memberType === 'INDIVIDUAL' ? 'Individual' : 'Company'} — Member ${jointBrowseIdx + 1}`
            : isSubfundUmbrella && subfundBrowseIdx !== null
              ? `Select Company — Sub Fund Member ${subfundBrowseIdx + 1}`
              : `Select ${eType === 'INDIVIDUAL' ? 'Individual' : eType === 'SUB_FUND' ? 'Sub Fund' : 'Company'}`
        }
        excludeEntityId={eType !== 'INDIVIDUAL' ? entity?.id : null}
        filterParams={eType === 'SUB_FUND' ? { bn_name: 'Sub Fund' } : undefined}
      />
    </div>
  );
};

export default OfficialFormPage;
