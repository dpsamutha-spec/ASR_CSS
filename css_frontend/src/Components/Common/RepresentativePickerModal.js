/**
 * RepresentativePickerModal
 * ─────────────────────────
 * Popup for selecting a representative official from a pre-loaded list of
 * cs_officials records. Mirrors EntityLookupModal's table/search/pagination UI.
 *
 * Props:
 *   isOpen    {bool}      — controls visibility
 *   onClose   {fn}        — called on cancel / backdrop click
 *   onSelect  {fn(rec)}   — called with the chosen official record
 *   officials {array}     — pre-loaded cs_officials records
 *   loading   {bool}      — true while parent is fetching officials
 */

import React, { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, Spinner } from 'reactstrap';

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#405189', '#0ab39c', '#6559cc', '#f7b84b', '#299cdb', '#f06548'];
const avatarColor   = (n = '') => AVATAR_COLORS[(n.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials      = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const buildPageNumbers = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '…', total);
  } else if (current >= total - 3) {
    pages.push(1, '…', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '…', current - 1, current, current + 1, '…', total);
  }
  return pages;
};

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  .elm-toolbar { display:flex; gap:10px; align-items:center; padding:12px 16px; border-bottom:1px solid var(--vz-border-color); flex-wrap:wrap; }
  .elm-srch    { position:relative; flex:1; min-width:200px; }
  .elm-srch input  { padding-left:34px; font-size:13px; }
  .elm-srch i      { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#878a99; font-size:15px; pointer-events:none; }
  .elm-srch .elm-clr { position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:#878a99; font-size:15px; cursor:pointer; padding:0; line-height:1; }
  .elm-srch .elm-clr:hover { color:#405189; }
  .elm-table-wrap { overflow-x:auto; }
  .elm-table      { width:100%; font-size:12.5px; border-collapse:collapse; }
  .elm-table thead th { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#878a99; padding:9px 12px; white-space:nowrap; background:var(--vz-light,#f8f9fa); border-bottom:1px solid var(--vz-border-color); }
  .elm-table tbody td { padding:10px 12px; border-bottom:1px solid var(--vz-border-color,#e9ebec); vertical-align:middle; }
  .elm-table tbody tr { cursor:pointer; transition:background .1s; }
  .elm-table tbody tr:hover     { background:var(--vz-light,#f8f9fa); }
  .elm-table tbody tr.elm-sel   { background:rgba(64,81,137,.08); }
  .elm-table tbody tr:last-child td { border-bottom:none; }
  .elm-av   { width:30px; height:30px; border-radius:7px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff; flex-shrink:0; vertical-align:middle; margin-right:9px; }
  .elm-name { font-weight:600; color:var(--vz-body-color); }
  .elm-sts  { font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
  .elm-id-lbl { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#878a99; background:var(--vz-light,#f8f9fa); border:1px solid var(--vz-border-color); border-radius:4px; padding:1px 5px; white-space:nowrap; margin-right:5px; }
  .elm-radio  { width:15px; height:15px; accent-color:#405189; cursor:pointer; }
  .elm-state  { text-align:center; padding:36px 20px; color:#878a99; }
  .elm-state i { font-size:32px; display:block; margin-bottom:8px; opacity:.25; }
  .elm-state p { font-size:12.5px; margin:0; }
  .elm-pager      { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid var(--vz-border-color); flex-wrap:wrap; gap:8px; }
  .elm-pager-info { font-size:11.5px; color:#878a99; }
  .elm-pager-btns { display:flex; gap:3px; align-items:center; }
  .elm-pg-btn     { width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:6px; border:1px solid var(--vz-border-color); background:transparent; font-size:12px; font-weight:600; cursor:pointer; color:var(--vz-body-color); transition:all .13s; }
  .elm-pg-btn:hover    { border-color:#405189; color:#405189; background:rgba(64,81,137,.06); }
  .elm-pg-btn.active   { background:#405189; border-color:#405189; color:#fff; }
  .elm-pg-btn:disabled { opacity:.4; cursor:default; pointer-events:none; }
  .elm-pg-ellipsis    { font-size:12px; color:#878a99; padding:0 3px; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

// title / nameLabel / emptyText let other official pickers reuse this modal
// (e.g. choosing the principal director for "Alternate Director To")
const RepresentativePickerModal = ({
  isOpen, onClose, onSelect, officials = [], loading = false, excludeIds = [],
  title = 'Select Representative', nameLabel = 'Representative',
  emptyText = 'No representatives saved for this entity yet.',
}) => {
  const [search, setSearch] = useState('');
  const [sel,    setSel]    = useState(null);
  const [page,   setPage]   = useState(1);

  useEffect(() => {
    if (isOpen) { setSearch(''); setSel(null); setPage(1); }
  }, [isOpen]);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search]);

  const filtered   = officials.filter(rec => {
    if (excludeIds.includes(String(rec.official_entity?.entity_id))) return false;
    const dr = rec.date_record || {};
    if (dr.ceased_date) return false;   // exclude ceased
    if (search && !(rec.official_entity?.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const from       = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to         = Math.min(page * PAGE_SIZE, filtered.length);

  const goPage = (p) => { if (p >= 1 && p <= totalPages && p !== page) setPage(p); };
  const pageNums = buildPageNumbers(page, totalPages);

  const handleConfirm = () => {
    if (!sel) return;
    onSelect(sel);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{css}</style>
      <Modal isOpen={isOpen} toggle={onClose} centered size="lg">
        <ModalHeader toggle={onClose} style={{ fontSize: 14, fontWeight: 700 }}>
          <i className="ri-user-star-line me-2" style={{ color: '#405189' }}></i>
          {title}
        </ModalHeader>

        <div className="elm-toolbar">
          <div className="elm-srch">
            <i className="ri-search-line"></i>
            <Input bsSize="sm" placeholder="Search by name…" value={search}
              onChange={e => setSearch(e.target.value)} autoFocus />
            {search && (
              <button className="elm-clr" onClick={() => setSearch('')}>
                <i className="ri-close-line"></i>
              </button>
            )}
          </div>
        </div>

        <ModalBody style={{ padding: 0, maxHeight: '55vh', overflowY: 'auto' }}>
          {loading ? (
            <div className="elm-state">
              <Spinner />
              <p style={{ marginTop: 10 }}>Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="elm-state">
              <i className="ri-user-search-line"></i>
              <p>{search ? `No results for "${search}"` : emptyText}</p>
            </div>
          ) : (
            <div className="elm-table-wrap">
              <table className="elm-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}></th>
                    <th>{nameLabel}</th>
                    <th>Type</th>
                    <th>ID / UEN</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(rec => {
                    const isSel = sel?.official_id === rec.official_id;
                    const name  = rec.official_entity?.name || '—';
                    const isInd = rec.official_type === 'INDIVIDUAL';
                    const idNo  = rec.identification?.uen_no || rec.identification?.id_number || '';
                    const idLbl = rec.identification?.id_type?.id_name || (isInd ? 'ID' : 'UEN');
                    return (
                      <tr key={rec.official_id} className={isSel ? 'elm-sel' : ''}
                        onClick={() => setSel(rec)}>
                        <td>
                          <input type="radio" className="elm-radio" checked={isSel}
                            onChange={() => setSel(rec)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span className="elm-av" style={{ background: avatarColor(name) }}>
                              {initials(name)}
                            </span>
                            <div className="elm-name">{name}</div>
                          </div>
                        </td>
                        <td>
                          <span className="elm-sts" style={
                            isInd
                              ? { background: 'rgba(64,81,137,.12)', color: '#405189' }
                              : { background: 'rgba(10,179,156,.12)', color: '#0ab39c' }
                          }>
                            <i className={`${isInd ? 'ri-user-line' : 'ri-building-line'} me-1`}></i>
                            {isInd ? 'Individual' : 'Company'}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          {idNo ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <span className="elm-id-lbl">{idLbl}</span>
                              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{idNo}</span>
                            </span>
                          ) : (
                            <span style={{ color: '#878a99' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ModalBody>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="elm-pager">
            <div className="elm-pager-info">
              Showing <strong>{from}–{to}</strong> of <strong>{filtered.length}</strong> representatives
            </div>
            <div className="elm-pager-btns">
              <button className="elm-pg-btn" onClick={() => goPage(1)} disabled={page === 1}>
                <i className="ri-skip-left-line"></i>
              </button>
              <button className="elm-pg-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>
                <i className="ri-arrow-left-s-line"></i>
              </button>
              {pageNums.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} className="elm-pg-ellipsis">…</span>
                ) : (
                  <button key={n} className={`elm-pg-btn ${n === page ? 'active' : ''}`}
                    onClick={() => goPage(n)}>{n}</button>
                )
              )}
              <button className="elm-pg-btn" onClick={() => goPage(page + 1)} disabled={page === totalPages}>
                <i className="ri-arrow-right-s-line"></i>
              </button>
              <button className="elm-pg-btn" onClick={() => goPage(totalPages)} disabled={page === totalPages}>
                <i className="ri-skip-right-line"></i>
              </button>
            </div>
          </div>
        )}

        <ModalFooter style={{ gap: 8 }}>
          <span style={{ fontSize: 12, color: '#878a99', flex: 1 }}>
            {sel
              ? <><i className="ri-checkbox-circle-fill me-1" style={{ color: '#0ab39c' }}></i>Selected: <strong>{sel.official_entity?.name}</strong></>
              : 'Click a row to select'}
          </span>
          <Button color="light" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm"
            style={{ background: '#405189', borderColor: '#405189', minWidth: 100 }}
            onClick={handleConfirm}
            disabled={!sel}>
            <i className="ri-check-line me-1"></i>Select
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default RepresentativePickerModal;
