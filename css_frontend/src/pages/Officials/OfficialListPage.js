import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Container, Card, CardBody, Button, Input, Spinner,
  Modal, ModalHeader, ModalBody, ModalFooter,
} from 'reactstrap';
import classnames from 'classnames';
import { toast } from 'react-toastify';
import BreadCrumb from '../../Components/Common/BreadCrumb';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import { getOfficialList, getOfficialMasterList, deleteOfficial } from '../../helpers/backend_helper';
import './OfficialListPage.css';
import './OfficialFormPage.css';
import '../Individual/IndividualList.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#405189','#0ab39c','#6559cc','#f7b84b','#299cdb','#f06548'];
const AVATAR_GRAD   = ['#6b7fc8','#2dcbb0','#8a7fd8','#f5c560','#4db5e8','#f5876b'];
const avatarColor     = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const avatarGradient  = (name = '') => { const i = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length; return `linear-gradient(135deg, ${AVATAR_COLORS[i]} 0%, ${AVATAR_GRAD[i]} 100%)`; };
const initials        = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtDate       = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const OT_COLORS = ['#405189','#0ab39c','#6559cc','#f7b84b','#299cdb','#f06548','#e91e63','#20c997','#fd7e14','#6c757d'];
const OT_ICONS  = ['ri-user-star-line','ri-group-line','ri-shield-user-line','ri-file-search-line','ri-briefcase-line','ri-user-line','ri-account-circle-line','ri-team-line','ri-building-line','ri-profile-line'];


// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtType   = (t) => t === 'INDIVIDUAL' ? 'Individual' : t === 'COMPANY' ? 'Company' : t === 'JOINT' ? 'Joint' : t === 'SUB_FUND' ? 'Sub Fund' : '—';
const typeIcon  = (t) => t === 'INDIVIDUAL' ? 'ri-user-line' : t === 'JOINT' ? 'ri-group-line' : t === 'SUB_FUND' ? 'ri-funds-line' : 'ri-building-line';
const typeColor = (t) => t === 'INDIVIDUAL' ? '#405189' : t === 'JOINT' ? '#6559cc' : t === 'SUB_FUND' ? '#f7b84b' : '#0ab39c';

// For joint / sub-fund umbrella shareholders, build display name + clientNo from child member records
const isMultiMember = (rec) => rec.official_type === 'JOINT' || (rec.official_type === 'SUB_FUND' && !rec.official_entity_id);
const jointName     = (rec) => (rec.joint_members || []).map(m => m.official_entity?.name || '').filter(Boolean).join(' + ') || '—';
const jointClientNo = (rec) => (rec.joint_members || []).map(m => m.official_entity?.client_no || '').filter(Boolean).join(', ');
const recName     = (rec) => isMultiMember(rec) ? jointName(rec)     : (rec.official_entity?.name      || '—');
const recClientNo = (rec) => isMultiMember(rec) ? jointClientNo(rec) : (rec.official_entity?.client_no || '');

const PROP_TYPE_META = {
  NOMINEE:     { label: 'Nominee',     color: '#6559cc', icon: 'ri-user-star-line' },
  NON_NOMINEE: { label: 'Non-Nominee', color: '#0ab39c', icon: 'ri-user-line' },
  TRUST:       { label: 'Trustee',     color: '#f7b84b', icon: 'ri-shield-user-line' },
};

const ShareholderPropTag = ({ type }) => {
  const meta = PROP_TYPE_META[type];
  if (!meta) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '1px 6px',
      borderRadius: 20, border: `1px solid ${meta.color}44`,
      background: meta.color + '18', color: meta.color,
    }}>
      <i className={meta.icon} style={{ fontSize: 10 }}></i>
      {meta.label}
    </span>
  );
};

// ── Skeleton rows ─────────────────────────────────────────────────────────────
const SkeletonRows = () => (
  <>
    {[...Array(5)].map((_, i) => (
      <tr key={i} className="olp-skel">
        {[...Array(7)].map((__, j) => (
          <td key={j}><div style={{ width: j === 1 ? 160 : j === 2 ? 80 : j === 3 ? 120 : j === 6 ? 70 : 90 }}></div></td>
        ))}
      </tr>
    ))}
  </>
);

// ── Single official actions ───────────────────────────────────────────────────
const ActButtons = ({ rec, slug, entity, officialTypes, showTypes = [], navigate, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const btnRef          = React.useRef();
  const menuRef         = React.useRef();

  // Nominator only for nominees: shareholders with NOMINEE property type, and
  // directors holding an active "Nominee Director" sub role (appointed, not ceased)
  // Alternate Director To only for directors holding an active "Alternate / Substitute Director" sub role
  const today = new Date().toISOString().slice(0, 10);
  const hasActiveSubRole = (subSlug) => (rec.date_records || []).some(d =>
    d.official_master_slug === subSlug &&
    d.appointment_date &&
    (!d.ceased_date || String(d.ceased_date).slice(0, 10) > today)
  );
  const effectiveShowTypes = showTypes.filter(st => {
    const s = slug?.toLowerCase() || '';
    if (st.key === 'nominator') {
      if (s.includes('shareholder')) return rec.shareholder_property_type === 'NOMINEE';
      if (s.includes('director'))    return hasActiveSubRole('nominee-director');
    }
    if (st.key === 'alternate-director-to') return hasActiveSubRole('alternate-substitute-director');
    return true;
  });

  React.useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggleMore = (e) => {
    e.stopPropagation();
    if (!open) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 140 });
    }
    setOpen(o => !o);
  };

  const pick = (childSlugTarget) => {
    setOpen(false);
    navigate(`/officials/${slug}/${rec.official_id}/${childSlugTarget}`);
  };

  return (
    <div className="olp-act-wrap">
      <button
        className="olp-act edit"
        title="Edit"
        onClick={() => navigate(`/officials/${slug}/edit/${rec.official_id}`, { state: { entity, officialTypes } })}>
        <i className="ri-pencil-line"></i>
      </button>
      <button className="olp-act delete" title="Remove" onClick={() => onDelete(rec)}>
        <i className="ri-delete-bin-line"></i>
      </button>

      {effectiveShowTypes.length > 0 && (
        <>
          <button ref={btnRef} className="olp-act more" title="More" onClick={toggleMore}>
            <i className="ri-more-2-fill"></i>
          </button>
          {open && createPortal(
            <div ref={menuRef} className="olp-more-menu" style={{ top: pos.top, left: pos.left }}>
              {effectiveShowTypes.map(st => (
                <div key={st.key} className="olp-more-item" onClick={() => pick(st.key)}>
                  <i className="ri-user-add-line"></i> {st.label}
                </div>
              ))}
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
};

// ── Table view ────────────────────────────────────────────────────────────────
const CHIP_ICON = {
  proxy:           'ri-shield-user-line',
  nominator:       'ri-user-star-line',
  representatives: 'ri-group-line',
  'alternate-director-to': 'ri-user-shared-line',
};
const CHIP_SHORT = {
  proxy:           'Proxy',
  nominator:       'Nom.',
  representatives: 'Rep.',
  'alternate-director-to': 'Alt. To',
};

const SubChips = ({ officialId, slug, showTypes, subMap, navigate }) => {
  const counts = subMap[officialId] || {};
  const chips  = showTypes.filter(st => counts[st.key] > 0);
  if (!chips.length) return null;
  return (
    <>
      {chips.map(st => {
        const color = st.color || '#6559cc';
        const light = st.light || (color + '18');
        const icon  = CHIP_ICON[st.key] || st.icon || 'ri-user-line';
        const count = counts[st.key];
        return (
          <span key={st.key}
            onClick={e => { e.stopPropagation(); navigate(`/officials/${slug}/${officialId}/${st.key}`); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              cursor: 'pointer', userSelect: 'none',
              padding: '1px 5px 1px 4px', borderRadius: 20,
              background: light, color, border: `1px solid ${color}44`,
              fontSize: 10, fontWeight: 600,
            }}>
            <i className={icon} style={{ fontSize: 10 }}></i>
            {st.label}
            <span style={{
              background: color, color: '#fff',
              borderRadius: '50%', minWidth: 14, height: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8.5, fontWeight: 800, lineHeight: 1, padding: '0 2px',
            }}>{count}</span>
          </span>
        );
      })}
    </>
  );
};

const TableView = ({ list, loading, slug, entity, officialTypes, showTypes, navigate, onDelete, subMap = {} }) => (
  <div className="olp-table-wrap">
    <table className="olp-table">
      <thead>
        <tr>
          <th style={{ width: 46 }}>#</th>
          <th>Name</th>
          <th>Type</th>
          <th>Identification</th>
          <th>Appointment</th>
          <th>Cessation</th>
          <th>Status</th>
          <th style={{ width: 90, textAlign: 'center' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <SkeletonRows />
        ) : list.length === 0 ? null : list.map((rec, idx) => {
          const isJoint  = isMultiMember(rec);
          const members  = isJoint ? (rec.joint_members || []) : [];
          const name     = recName(rec);
          const clientNo = recClientNo(rec);
          const mainDate = (rec.date_records || []).find(d => d.is_main_role === '1');
          const ceased   = !!mainDate?.ceased_date;
          const apptDt   = mainDate?.appointment_date;
          const ceasedDt = mainDate?.ceased_date;
          const idNo     = rec.identification?.id_number || '—';
          const idLabel  = rec.identification?.id_type?.id_name || '';
          return (
            <tr key={rec.official_id} className={ceased ? 'row-ceased' : 'row-active'}>
              <td style={{ color: '#878a99', fontSize: 12 }}>{idx + 1}</td>
              <td>
                {isJoint ? (
                  /* Joint / Sub Fund Umbrella: numbered member list */
                  <div className="olp-name-cell" style={{ alignItems: 'flex-start' }}>
                    <div className="olp-avatar" style={{ background: typeColor(rec.official_type), flexShrink: 0, marginTop: 2 }}>
                      <i className={`${rec.official_type === 'SUB_FUND' ? 'ri-funds-line' : 'ri-group-line'}`} style={{ fontSize: 13, color: '#fff' }}></i>
                    </div>
                    <div className="olp-name-text">
                      <ol style={{ margin: 0, paddingLeft: 16, fontSize: 13, fontWeight: 600, color: 'var(--vz-body-color)' }}>
                        {members.map(m => <li key={m.official_id}>{m.official_entity?.name || '—'}</li>)}
                      </ol>
                      <small style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                        {slug?.toLowerCase().includes('shareholder') && (
                          <ShareholderPropTag type={rec.shareholder_property_type} />
                        )}
                        <SubChips officialId={rec.official_id} slug={slug} showTypes={showTypes} subMap={subMap} navigate={navigate} />
                      </small>
                    </div>
                  </div>
                ) : (
                  /* Normal single entity */
                  <div className="olp-name-cell">
                    <div className="olp-avatar" style={{ background: avatarColor(name) }}>{initials(name)}</div>
                    <div className="olp-name-text">
                      <b>{name}</b>
                      <small style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        {clientNo && <span>{clientNo}</span>}
                        {slug?.toLowerCase().includes('shareholder') && (
                          <ShareholderPropTag type={rec.shareholder_property_type} />
                        )}
                        <SubChips officialId={rec.official_id} slug={slug} showTypes={showTypes} subMap={subMap} navigate={navigate} />
                      </small>
                    </div>
                  </div>
                )}
              </td>
              <td>
                <span className="olp-type-badge" style={{ color: typeColor(rec.official_type), background: typeColor(rec.official_type) + '18', borderColor: typeColor(rec.official_type) + '33' }}>
                  <i className={typeIcon(rec.official_type)}></i>
                  {fmtType(rec.official_type)}
                </span>
              </td>
              <td>
                {isJoint ? (
                  /* Joint: numbered ID list per member */
                  members.some(m => m.official_entity?.client_no) ? (
                    <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--vz-body-color)' }}>
                      {members.map(m => (
                        <li key={m.official_id} style={{ whiteSpace: 'nowrap' }}>
                          {m.official_entity?.client_no || '—'}
                        </li>
                      ))}
                    </ol>
                  ) : <span style={{ color: '#878a99', fontSize: 12 }}>—</span>
                ) : rec.identification ? (
                  <div className="olp-id-cell">
                    {idLabel && <span className="olp-id-type">{idLabel}</span>}
                    <span className="olp-id-no">{idNo}</span>
                  </div>
                ) : <span style={{ color: '#878a99', fontSize: 12 }}>—</span>}
              </td>
              <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(apptDt)}</td>
              <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(ceasedDt)}</td>
              <td>
                <span className={`olp-badge ${ceased ? 'ceased' : 'active'}`}>
                  {ceased ? 'Ceased' : 'Active'}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <ActButtons rec={rec} slug={slug} entity={entity}
                  officialTypes={officialTypes} showTypes={showTypes}
                  navigate={navigate} onDelete={onDelete} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ── Card / Grid view ──────────────────────────────────────────────────────────
const GridView = ({ list, slug, entity, officialTypes, showTypes, navigate, onDelete, subMap = {} }) => (
  <div className="olp-grid">
    {list.map(rec => {
      const isJoint  = isMultiMember(rec);
      const members  = isJoint ? (rec.joint_members || []) : [];
      const name     = recName(rec);
      const clientNo = recClientNo(rec);
      const mainDate = (rec.date_records || []).find(d => d.is_main_role === '1');
      const ceased   = !!mainDate?.ceased_date;
      const apptDt   = mainDate?.appointment_date;
      const ceasedDt = mainDate?.ceased_date;
      const barColor = ceased ? '#f06548' : '#0ab39c';
      const idNo     = rec.identification?.id_number || null;
      const idLabel  = rec.identification?.id_type?.id_name || '';
      return (
        <div key={rec.official_id} className="olp-card">
          <div className="olp-card-bar" style={{ background: barColor }} />
          <div className="olp-card-top">
            <div className="olp-card-avatar" style={{ background: isJoint ? typeColor(rec.official_type) : avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isJoint ? <i className="ri-group-line" style={{ fontSize: 15, color: '#fff' }}></i> : initials(name)}
            </div>
            {isJoint ? (
              <ol style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, fontWeight: 600, color: 'var(--vz-body-color)' }}>
                {members.map(m => <li key={m.official_id}>{m.official_entity?.name || '—'}</li>)}
              </ol>
            ) : (
              <div className="olp-card-name">{name}</div>
            )}
            <div className="olp-card-id" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {!isJoint && clientNo && <span>{clientNo}</span>}
              {slug?.toLowerCase().includes('shareholder') && (
                <ShareholderPropTag type={rec.shareholder_property_type} />
              )}
              <SubChips officialId={rec.official_id} slug={slug} showTypes={showTypes} subMap={subMap} navigate={navigate} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span className="olp-type-badge" style={{ color: typeColor(rec.official_type), background: typeColor(rec.official_type) + '18', borderColor: typeColor(rec.official_type) + '33' }}>
                <i className={typeIcon(rec.official_type)}></i>
                {fmtType(rec.official_type)}
              </span>
              <span className={`olp-badge ${ceased ? 'ceased' : 'active'}`}>
                {ceased ? 'Ceased' : 'Active'}
              </span>
            </div>
            {!isJoint && idNo && (
              <div className="olp-id-cell" style={{ marginTop: 6 }}>
                {idLabel && <span className="olp-id-type">{idLabel}</span>}
                <span className="olp-id-no">{idNo}</span>
              </div>
            )}
          </div>
          <div className="olp-card-body">
            <div className="olp-card-row">
              <span className="olp-card-lbl"><i className="ri-calendar-check-line me-1"></i>Appointed</span>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{fmtDate(apptDt)}</span>
            </div>
            <div className="olp-card-row">
              <span className="olp-card-lbl"><i className="ri-calendar-close-line me-1"></i>Ceased</span>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{fmtDate(ceasedDt)}</span>
            </div>
          </div>
          <div className="olp-card-footer">
            <ActButtons rec={rec} slug={slug} entity={entity}
              officialTypes={officialTypes} showTypes={showTypes}
              navigate={navigate} onDelete={onDelete} />
          </div>
        </div>
      );
    })}
  </div>
);

// ── Rich view ─────────────────────────────────────────────────────────────────
const RichSkeleton = () => (
  <div className="il-rich-list">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="il-rich-skel-card">
        <div className="il-rich-skel-top">
          <div className="il-rich-skel-avatar" />
          <div className="il-rich-skel-body">
            <div className="il-rich-skel-line" style={{ width: '45%' }} />
            <div className="il-rich-skel-line" style={{ width: '30%', marginTop: 3 }} />
          </div>
          <div className="il-rich-skel-right">
            <div className="il-rich-skel-line" style={{ width: 58, height: 20, borderRadius: 20 }} />
            <div className="il-rich-skel-line" style={{ width: 68 }} />
          </div>
        </div>
        <div className="il-rich-skel-grid">
          {[...Array(4)].map((__, j) => (
            <div key={j} className="il-rich-skel-cell">
              <div className="il-rich-skel-line" style={{ width: '50%', height: 8 }} />
              <div className="il-rich-skel-line" style={{ width: '75%' }} />
            </div>
          ))}
        </div>
        <div className="il-rich-skel-foot" />
      </div>
    ))}
  </div>
);

const RichView = ({ list, slug, entity, officialTypes, showTypes, navigate, onDelete, subMap = {} }) => (
  <div className="il-rich-list">
    {list.map((rec, idx) => {
      const isJoint   = isMultiMember(rec);
      const members   = isJoint ? (rec.joint_members || []) : [];
      const name      = recName(rec);
      const clientNo  = recClientNo(rec);
      const mainDate  = (rec.date_records || []).find(d => d.is_main_role === '1');
      const ceased    = !!mainDate?.ceased_date;
      const apptDt    = mainDate?.appointment_date;
      const ceasedDt  = mainDate?.ceased_date;
      const idNo      = rec.identification?.id_number;
      const idLabel   = rec.identification?.id_type?.id_name || '';
      const statusCls = ceased ? 'ceased' : 'active';

      return (
        <div key={rec.official_id} className={`il-rich-card ${statusCls}`}>
          <div className="il-rich-top">
            <div className="il-rich-top-row">
              <span className="il-rich-serial">{idx + 1}</span>

              {/* Avatar */}
              {isJoint ? (
                <div className="il-rich-avatar" style={{ background: typeColor(rec.official_type), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={`${rec.official_type === 'SUB_FUND' ? 'ri-funds-line' : 'ri-group-line'}`} style={{ color: '#fff', fontSize: 18 }}></i>
                </div>
              ) : (
                <div className="il-rich-avatar" style={{ background: avatarGradient(name) }}>
                  {initials(name)}
                </div>
              )}

              {/* Name block */}
              <div className="il-rich-body">
                {isJoint ? (
                  <ol style={{ margin: 0, paddingLeft: 16, fontSize: 13, fontWeight: 600, color: 'var(--vz-body-color)', lineHeight: 1.6 }}>
                    {members.map(m => <li key={m.official_id}>{m.official_entity?.name || '—'}</li>)}
                  </ol>
                ) : (
                  <div className="il-rich-name">{name}</div>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                  {!isJoint && clientNo && (
                    <span className="il-rich-former" style={{ fontStyle: 'normal' }}>{clientNo}</span>
                  )}
                  {slug?.toLowerCase().includes('shareholder') && (
                    <ShareholderPropTag type={rec.shareholder_property_type} />
                  )}
                  <SubChips officialId={rec.official_id} slug={slug} showTypes={showTypes} subMap={subMap} navigate={navigate} />
                </div>
              </div>

              {/* Mid section */}
              <div className="il-rich-mid">
                <div className="il-rich-mid-item">
                  <span className="il-rich-mid-lbl">Entity Type</span>
                  <span className="il-rich-mid-val" style={{ color: typeColor(rec.official_type), fontWeight: 600 }}>
                    <i className={typeIcon(rec.official_type)} style={{ marginRight: 4 }}></i>
                    {fmtType(rec.official_type)}
                  </span>
                </div>
                <div className="il-rich-mid-item">
                  <span className="il-rich-mid-lbl">{isJoint ? 'Client No.' : (idLabel || 'ID Number')}</span>
                  {isJoint ? (
                    <span className={`il-rich-mid-val${clientNo ? '' : ' empty'}`}>
                      {clientNo || 'Not provided'}
                    </span>
                  ) : (
                    <span className={`il-rich-mid-val${idNo ? '' : ' empty'}`}>{idNo || 'Not provided'}</span>
                  )}
                </div>
                <div className="il-rich-mid-item">
                  <span className="il-rich-mid-lbl">Appointed</span>
                  <span className={`il-rich-mid-val${apptDt ? '' : ' empty'}`}>{fmtDate(apptDt)}</span>
                </div>
                <div className="il-rich-mid-item">
                  <span className="il-rich-mid-lbl">Ceased</span>
                  <span className={`il-rich-mid-val${ceasedDt ? '' : ' empty'}`}>{fmtDate(ceasedDt)}</span>
                </div>
              </div>

              {/* Right: status */}
              <div className="il-rich-right">
                <span className={`olp-badge ${statusCls}`}>{ceased ? 'Ceased' : 'Active'}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="il-rich-foot">
              <span className="il-rich-foot-date">
                <i className="ri-calendar-check-line" />
                Appointed {fmtDate(apptDt)}
              </span>
              <div style={{ marginLeft: 'auto' }}>
                <ActButtons rec={rec} slug={slug} entity={entity}
                  officialTypes={officialTypes} showTypes={showTypes}
                  navigate={navigate} onDelete={onDelete} />
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ label, slug, entity, officialTypes, navigate }) => (
  <div className="olp-empty">
    <div className="olp-empty-icon"><i className="ri-user-search-line"></i></div>
    <h6>No {label.toLowerCase()} found</h6>
    <p>No officials on record for this type.</p>
    <button
      className="btn btn-warning btn-sm d-flex align-items-center gap-1"
      onClick={() => navigate(`/officials/${slug}/add`, { state: { entity, officialTypes } })}>
      <i className="ri-add-line"></i> Add First {label}
    </button>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────
const OfficialListPage = () => {
  useCollapseSidebar();
  const { slug }  = useParams();
  const { state } = useLocation();
  const navigate  = useNavigate();

  // sessionStorage backup so entity header survives breadcrumb / back navigation
  const entity = state?.entity || JSON.parse(sessionStorage.getItem('aop_list_entity') || 'null');
  const officialTypes = state?.officialTypes || JSON.parse(sessionStorage.getItem('aop_list_otypes') || '[]');
  useEffect(() => {
    if (state?.entity) sessionStorage.setItem('aop_list_entity', JSON.stringify(state.entity));
    if (state?.officialTypes?.length) sessionStorage.setItem('aop_list_otypes', JSON.stringify(state.officialTypes));
  }, [state]);

  const [resolvedOT, setResolvedOT] = useState(
    officialTypes.find(o => o.key === slug) || null
  );
  const [allTypes, setAllTypes] = useState(officialTypes);

  const [list,         setList]        = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [viewMode,     setViewMode]    = useState('rich');
  const [deleteTarget, setDelTarget]   = useState(null);
  const [deleting,     setDeleting]    = useState(false);

  // sub-official count map: { [reference_official_id]: { [slug]: count } }
  const [subMap, setSubMap] = useState({});

  // Always refresh official types from the master list — the copy passed in
  // navigation state / sessionStorage can be stale (e.g. a newly seeded sub-type)
  useEffect(() => {
    getOfficialMasterList({ page: 1, limit: 200, is_parent: 0, order: 'official_order:ASC' })
      .then(res => {
        const data  = res?.data?.data || res?.data || [];
        const found = data.find(item => item.official_master_slug === slug);
        if (found && !resolvedOT) setResolvedOT({
          id:               found.official_master_id,
          key:              found.official_master_slug,
          label:            found.official_master_name,
          isRepresentative: !!found.is_representative,
        });
        if (!data.length) return;
        setAllTypes(prev => data.map((item, idx) => {
          const known = prev.find(p => p.key === item.official_master_slug);   // keep its icon / colour
          return {
            id:               item.official_master_id,
            key:              item.official_master_slug,
            label:            item.official_master_name,
            icon:             known?.icon  || OT_ICONS[idx % OT_ICONS.length],
            color:            known?.color || OT_COLORS[idx % OT_COLORS.length],
            light:            known?.light || OT_COLORS[idx % OT_COLORS.length] + '1f',
            isRepresentative: !!item.is_representative,
            isShow:           !!item.is_show,
            parentSlugs:      item.parent_slugs ? item.parent_slugs.split(',').map(s => s.trim()) : [],
          };
        }));
      })
      .catch(() => {});
  }, [slug]); // eslint-disable-line

  // Fetch officials for this type
  const fetchList = useCallback(async () => {
    if (!entity?.id || !resolvedOT?.id) return;
    setLoading(true);
    try {
      const res  = await getOfficialList({ entity_id: entity.id, official_master_id: resolvedOT.id, is_ref_id: 0, limit: 500 });
      const data = res?.data?.data || res?.data || [];
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      toast.error('Failed to load officials');
    } finally {
      setLoading(false);
    }
  }, [entity?.id, resolvedOT?.id]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Fetch sub-official count map
  useEffect(() => {
    if (!entity?.id) return;
    getOfficialList({ entity_id: entity.id, is_ref_id: 1, limit: 1000 })
      .then(res => {
        const data = res?.data?.data || res?.data || [];
        const map  = {};
        (Array.isArray(data) ? data : []).forEach(r => {
          const parentId = r.reference_official_id;
          const s        = r.official_master_slug;
          if (!parentId || !s) return;
          if (!map[parentId]) map[parentId] = {};
          map[parentId][s] = (map[parentId][s] || 0) + 1;
        });
        setSubMap(map);
      })
      .catch(() => {});
  }, [entity?.id]); // eslint-disable-line

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const name = deleteTarget.official_entity?.name || 'this official';
    try {
      await deleteOfficial(deleteTarget.official_id);
      toast.success(`${name} removed`);
      setList(prev => prev.filter(r => r.official_id !== deleteTarget.official_id));
      setDelTarget(null);
    } catch {
      toast.error('Failed to remove official');
    } finally {
      setDeleting(false);
    }
  };

  // Filter by search
  const filterBySearch = (arr) => {
    if (!search.trim()) return arr;
    const q = search.toLowerCase();
    return arr.filter(r =>
      (r.official_entity?.name || '').toLowerCase().includes(q) ||
      (r.official_entity?.client_no || '').toLowerCase().includes(q)
    );
  };

  const label               = resolvedOT?.label || slug.charAt(0).toUpperCase() + slug.slice(1);
  const mergedOfficialTypes = allTypes.length ? allTypes : officialTypes;

  // hidden (is_show=0) sub-types + representatives for representative-type officials
  const showTypes = (() => {
    const base    = mergedOfficialTypes.filter(o => !o.isShow && Array.isArray(o.parentSlugs) && o.parentSlugs.includes(slug));
    const repType = resolvedOT?.isRepresentative ? mergedOfficialTypes.find(o => o.key === 'representatives') : null;
    return repType ? [...base, repType] : base;
  })();

  const filteredList = filterBySearch(list);

  document.title = `${label} | ASR CSS`;

  return (
    <div className="page-content">
      <Container fluid>
        <BreadCrumb title={label} pageTitle="Officials" />

        {/* Entity header */}
        {entity && (
          <div className="aop-entity-header">
            <div className="aop-entity-hero">
              <div className="aop-entity-av" style={{ background: avatarColor(entity.companyName) }}>{initials(entity.companyName)}</div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <div className="aop-entity-name">{entity.companyName}</div>
                <div className="aop-entity-badges">
                  {entity.clientNo && entity.clientNo !== '—' && (
                    <span className="aop-entity-badge">{entity.clientNo}</span>
                  )}
                  {entity.regNo && (
                    <span className="aop-entity-badge">{entity.regNo}</span>
                  )}
                  {entity.status && (
                    <span className={`aop-entity-badge aop-entity-badge-status-${entity.status.toLowerCase()}`}>
                      {entity.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 280px)' }}>
          {/* Toolbar */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--vz-border-color)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
              <i className="ri-search-line" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#878a99', fontSize: 13, pointerEvents: 'none' }}></i>
              <Input bsSize="sm" style={{ paddingLeft: 28 }} placeholder="Search name, client no…"
                value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="ms-auto d-flex align-items-center gap-2">
              {/* Record count */}
              <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(64,81,137,.1)', color: '#405189', borderRadius: 10, padding: '2px 8px' }}>
                {filteredList.length} {filteredList.length === 1 ? 'record' : 'records'}
              </span>

              {/* View toggle */}
              <span style={{ fontSize: 11, fontWeight: 600, color: '#405189', background: 'rgba(64,81,137,.08)', borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                {viewMode === 'table' ? 'Normal View' : viewMode === 'rich' ? 'Rich View' : 'Grid View'}
              </span>
              <div className="btn-group" role="group">
                <button type="button"
                  className={classnames('btn btn-sm', viewMode === 'table' ? 'btn-success' : 'btn-outline-success')}
                  title="Normal view" onClick={() => setViewMode('table')}>
                  <i className="ri-list-unordered"></i>
                </button>
                <button type="button"
                  className={classnames('btn btn-sm', viewMode === 'rich' ? 'btn-success' : 'btn-outline-success')}
                  title="Rich view" onClick={() => setViewMode('rich')}>
                  <i className="ri-file-list-3-line"></i>
                </button>
                <button type="button"
                  className={classnames('btn btn-sm', viewMode === 'card' ? 'btn-success' : 'btn-outline-success')}
                  title="Grid view" onClick={() => setViewMode('card')}>
                  <i className="ri-grid-fill"></i>
                </button>
              </div>

              <button
                className="btn btn-warning btn-sm d-flex align-items-center gap-1"
                onClick={() => navigate(`/officials/${slug}/add`, { state: { entity, officialTypes: mergedOfficialTypes } })}>
                <i className="ri-add-line"></i>
                Add {label}
              </button>
              <button
                className="btn btn-secondary btn-sm d-flex align-items-center gap-1"
                onClick={() => navigate(`/officials/entity`)}>
                <i className="ri-arrow-right-line"></i>
                Go to Officials
              </button>
            </div>
          </div>

          <CardBody className="p-0" style={{ flex: 1 }}>

            {loading ? (
              viewMode === 'table' ? (
                <div className="olp-table-wrap">
                  <table className="olp-table">
                    <thead>
                      <tr>
                        <th style={{ width: 46 }}>#</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Identification</th>
                        <th>Appointment</th>
                        <th>Cessation</th>
                        <th>Status</th>
                        <th style={{ width: 90, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody><SkeletonRows /></tbody>
                  </table>
                </div>
              ) : viewMode === 'rich' ? (
                <RichSkeleton />
              ) : (
                <div style={{ textAlign: 'center', padding: 48 }}><Spinner /></div>
              )
            ) : filteredList.length === 0 ? (
              <EmptyState label={label} slug={slug} entity={entity}
                officialTypes={mergedOfficialTypes} navigate={navigate} />
            ) : viewMode === 'table' ? (
              <TableView list={filteredList} loading={false} slug={slug}
                entity={entity} officialTypes={mergedOfficialTypes} showTypes={showTypes}
                navigate={navigate} onDelete={setDelTarget} subMap={subMap} />
            ) : viewMode === 'rich' ? (
              <RichView list={filteredList} slug={slug}
                entity={entity} officialTypes={mergedOfficialTypes} showTypes={showTypes}
                navigate={navigate} onDelete={setDelTarget} subMap={subMap} />
            ) : (
              <GridView list={filteredList} slug={slug}
                entity={entity} officialTypes={mergedOfficialTypes} showTypes={showTypes}
                navigate={navigate} onDelete={setDelTarget} subMap={subMap} />
            )}

          </CardBody>
        </Card>
      </Container>

      {/* Delete confirm modal */}
      <Modal isOpen={!!deleteTarget} toggle={() => setDelTarget(null)} centered size="sm" modalClassName="zoomIn">
        <ModalHeader toggle={() => setDelTarget(null)} style={{ border: 'none', paddingBottom: 0 }} />
        <ModalBody>
          <div className="olp-del-modal">
            <div className="olp-del-icon"><i className="ri-delete-bin-5-line"></i></div>
            <h5>Remove Official?</h5>
            <p>
              <strong>{deleteTarget?.official_entity?.name}</strong> will be removed from this record.
              <br />This cannot be undone.
            </p>
          </div>
        </ModalBody>
        <ModalFooter style={{ border: 'none', justifyContent: 'center', gap: 10 }}>
          <Button color="light" size="sm" onClick={() => setDelTarget(null)} disabled={deleting}>Cancel</Button>
          <Button color="danger" size="sm" onClick={handleDelete} disabled={deleting}
            className="d-flex align-items-center gap-1">
            {deleting
              ? <><Spinner size="sm" /> Removing…</>
              : <><i className="ri-delete-bin-line"></i> Remove</>}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default OfficialListPage;
