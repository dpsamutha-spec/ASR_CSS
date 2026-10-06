import React, { useState, useEffect } from 'react';
import * as Yup from 'yup';
import { toast } from 'react-toastify';
import {
  Modal, ModalBody, ModalFooter, ModalHeader,
  Label, Input, Spinner, Row, Col,
  Badge,
} from 'reactstrap';

import MasterDataView from '../../../Components/Common/MasterDataView';
import { getLoggedinUser } from '../../../helpers/api_helper';

import {
  getOfficialMasterList,
  createOfficialMaster,
  updateOfficialMaster,
  deleteOfficialMaster,
  saveOfficialMasterConfig,   // ✅ new single config API
} from '../../../helpers/backend_helper';

const OfficialMaster = () => {

  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [autoOrder, setAutoOrder] = useState(0);

  // ── Config Modal ──────────────────────────────────────────────
  const [configModal, setConfigModal]     = useState(false);
  const [configItem, setConfigItem]       = useState(null);
  const [subRoles, setSubRoles]           = useState([]);
  const [checkedRoles, setCheckedRoles]   = useState({});
  const [configLoading, setConfigLoading] = useState(false);

  const [isRepresentative, setIsRepresentative] = useState(0);
  const [isEntityType, setIsEntityType]         = useState('ALL');

  const loggedUser = getLoggedinUser();
  const updatedBy  = loggedUser?.user_id ?? loggedUser?.id ?? 1;

  document.title = 'ASR::CSS | Official Master';

  // ── Columns ───────────────────────────────────────────────────
  const COLUMNS = [
    {
      key:      'official_master_name',
      label:    'Official Name',
      sortable: true,
      gridPrimary: true,
      // Fixed widths keep columns steady across pages; long names cut with "…" (full on hover)
      width:    '340px',
      render:   row => (
        <span
          title={row.official_master_name}
          style={{ display: 'block', maxWidth: 310, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {row.official_master_name}
        </span>
      ),
    },
    {
      key:        'official_order',
      label:      'Order',
      sortable:   true,
      showInGrid: true,
      width:      '100px'
    },
    {
      key:        'representative_label',
      label:      'Representative',
      sortable:   false,
      showInGrid: true,
      badge:      true,
      badgeMap:   { Yes: 'success', No: 'secondary' },
      width:      '150px'
    },
    {
      key:        'is_entity_type',
      label:      'Entity Type',
      sortable:   false,
      showInGrid: true,
      width:      '140px'
    },
  ];

  // ── Fields ────────────────────────────────────────────────────
  const FIELDS = [
    {
      name:        'official_master_name',
      label:       'Official Name',
      placeholder: 'e.g. Director, CEO',
      validation:  Yup.string().min(2).max(150).required('Official name is required'),
    },
    {
      name:         'official_order',
      label:        'Order',
      placeholder:  'Enter Order Number',
      type:         'number',
      defaultValue: autoOrder,
      validation:   Yup.number().required('Official order is required'),
    },
  ];

  // ── Fetch list (is_parent = 0 only) ──────────────────────────
  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await getOfficialMasterList({
        page:      1,
        limit:     100,
        order:     'official_order:ASC',
        is_parent: 0,
      });

      const list = res?.data?.data ?? res?.data ?? res;
      const rows = Array.isArray(list) ? list : [];

      setData(rows.map(r => ({
        ...r,
        representative_label: r.is_representative === 1 ? 'Yes' : 'No',
      })));

      setAutoOrder(res?.data?.auto_order_number || 0);
    } catch {
      toast.error('Failed to load official masters', { autoClose: 3000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  // ── CRUD ──────────────────────────────────────────────────────
  const handleAdd = async (values) => {
    setLoading(true);
    try {
      await createOfficialMaster({ ...values, updated_by: updatedBy });
      toast.success('Official master added successfully', { autoClose: 3000 });
      await fetchList();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to add official master', { autoClose: 3000 });
      setLoading(false);
    }
  };

  const handleEdit = async (item, values) => {
    const id = item.official_master_id ?? item.id;
    setLoading(true);
    try {
      await updateOfficialMaster(id, { ...values, updated_by: updatedBy });
      toast.success('Official master updated successfully', { autoClose: 3000 });
      await fetchList();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to update official master', { autoClose: 3000 });
      setLoading(false);
    }
  };

  const handleDelete = async (item) => {
    const id = item.official_master_id ?? item.id;
    setLoading(true);
    try {
      await deleteOfficialMaster(id);
      toast.success('Official master deleted successfully', { autoClose: 3000 });
      await fetchList();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to delete official master', { autoClose: 3000 });
      setLoading(false);
    }
  };

  // ── Config modal open ─────────────────────────────────────────
  const openConfigModal = async (item) => {
    setConfigItem(item);
    setIsRepresentative(item.is_representative ?? 0);
    setIsEntityType(item.is_entity_type ?? 'ALL');
    setSubRoles([]);
    setCheckedRoles({});
    setConfigLoading(true);
    setConfigModal(true);

    try {
      const res = await getOfficialMasterList({
        page:      1,
        limit:     1000,
        is_parent: item.official_master_id,
        fetch_all: 1,   // include active + inactive sub roles
      });

      const list  = res?.data?.data ?? res?.data ?? [];
      const roles = Array.isArray(list) ? list : [];
      setSubRoles(roles);

      // ✅ Pre-check based on is_active value
      // is_active = 0 → active   → checked   (true)
      // is_active = 1 → inactive → unchecked (false)
      const initChecked = {};
      roles.forEach(r => {
        initChecked[r.official_master_id] =
          r.is_active === 0 || r.is_active === false;
      });
      setCheckedRoles(initChecked);

    } catch {
      toast.error('Failed to load sub roles', { autoClose: 3000 });
    } finally {
      setConfigLoading(false);
    }
  };

  const closeConfigModal = () => {
    setConfigModal(false);
    setConfigItem(null);
    setSubRoles([]);
    setCheckedRoles({});
  };

  const toggleCheck = (id) => {
    setCheckedRoles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Config save ───────────────────────────────────────────────
  // ✅ Single API call — sends all sub_roles with is_checked flag
  //    Backend logic:
  //      checked   (is_checked = true)  → is_active = 0  (active)
  //      unchecked (is_checked = false) → is_active = 1  (inactive)
  const handleConfigSave = async () => {
    if (!configItem) return;

    const id = configItem.official_master_id ?? configItem.id;
    setConfigLoading(true);

    try {
      // Build sub_roles payload from current checkedRoles state
      const sub_roles = subRoles.map(role => ({
        official_master_id : role.official_master_id,
        is_checked         : checkedRoles[role.official_master_id] ?? false,
      }));

      await saveOfficialMasterConfig(id, {
        is_representative : isRepresentative,
        is_entity_type    : isEntityType,
        updated_by        : updatedBy,
        sub_roles,
      });

      toast.success('Configuration saved successfully', { autoClose: 3000 });
      closeConfigModal();
      await fetchList();

    } catch (err) {
      toast.error(err?.message || err || 'Failed to save configuration', { autoClose: 3000 });
    } finally {
      setConfigLoading(false);
    }
  };

  // ── Grid card ─────────────────────────────────────────────────
  const renderGridCard = (item, index) => (
    <>
      <div className="avatar-sm mb-3" style={{ position: 'relative' }}>
        <div className="avatar-title bg-soft-success rounded-circle fs-22">
          <i className="ri-profile-line"></i>
        </div>
        <span className="badge bg-success rounded-pill" style={{
          position:  'absolute',
          top:       '-4px',
          right:     '-4px',
          fontSize:  '10px',
          minWidth:  '18px',
          height:    '18px',
          lineHeight:'18px',
          padding:   '0 5px',
        }}>
          {index + 1}
        </span>
      </div>
      <h5 className="fs-14 mb-0 fw-semibold">{item.official_master_name ?? '—'}</h5>
      <p className="text-muted fs-11 mb-1 mt-1">
        Order: <strong>{item.official_order ?? '—'}</strong>
      </p>
      <p className="text-muted fs-11 mb-1">
        Entity: <strong>{item.is_entity_type ?? 'ALL'}</strong>
      </p>
      <p className="text-muted fs-11 mb-2">
        Rep:{' '}
        <span className={`badge bg-${item.is_representative === 1 ? 'success' : 'secondary'}-subtle text-${item.is_representative === 1 ? 'success' : 'secondary'}`}>
          {item.is_representative === 1 ? 'Yes' : 'No'}
        </span>
      </p>
      <button
        className="btn btn-sm btn-soft-info mb-2"
        onClick={(e) => { e.stopPropagation(); openConfigModal(item); }}
      >
        <i className="ri-settings-3-line me-1"></i>Config
      </button>
      <p className="text-muted mb-1 fs-12">&nbsp;</p>
    </>
  );

  // ── Derived counts for the modal summary ──────────────────────
  const activeCount   = Object.values(checkedRoles).filter(Boolean).length;
  const inactiveCount = Object.values(checkedRoles).filter(v => !v).length;

  return (
    <>
      <MasterDataView
        title="List Of Official Masters"
        modalTitle="Official Master"
        listId="officialMasterList"
        columns={COLUMNS}
        fields={FIELDS}
        data={data}
        loading={loading}
        emptyMessage="No official masters found."
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        renderGridCard={renderGridCard}
        extraActions={(row) => (
          <button
            className="btn btn-sm btn-soft-info"
            onClick={() => openConfigModal(row)}
          >
            <i className="ri-settings-3-line me-1"></i>Config
          </button>
        )}
      />

      {/* ── Config Modal ────────────────────────────────────────── */}
      <Modal isOpen={configModal} toggle={closeConfigModal} centered size="lg">
        <ModalHeader className="bg-light p-3" toggle={closeConfigModal}>
          <i className="ri-settings-3-line me-2 text-info"></i>
          Configure —{' '}
          <span className="text-info fw-bold">{configItem?.official_master_name}</span>
        </ModalHeader>

        <ModalBody>
          {configLoading ? (
            <div className="text-center py-5">
              <Spinner color="success" style={{ width: '2.5rem', height: '2.5rem' }} />
              <p className="mt-3 text-muted">Loading configuration…</p>
            </div>
          ) : (
            <>
              {/* ── Representative + Entity Type ── */}
              <Row className="g-3 mb-4">
                <Col md={6}>
                  <Label className="fw-semibold mb-2">Is Representative?</Label>
                  <div className="d-flex gap-3">
                    {[{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }].map(opt => (
                      <div className="form-check" key={opt.value}>
                        <input
                          className="form-check-input"
                          type="radio"
                          name="is_representative"
                          id={`rep_${opt.value}`}
                          checked={isRepresentative === opt.value}
                          onChange={() => setIsRepresentative(opt.value)}
                        />
                        <label className="form-check-label" htmlFor={`rep_${opt.value}`}>
                          {opt.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </Col>

                <Col md={6}>
                  <Label className="fw-semibold mb-2" htmlFor="entityType">Entity Type</Label>
                  <Input
                    type="select"
                    id="entityType"
                    value={isEntityType}
                    onChange={e => setIsEntityType(e.target.value)}
                  >
                    <option value="ALL">ALL</option>
                    <option value="COMPANY">COMPANY</option>
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                  </Input>
                </Col>
              </Row>

              {/* ── Sub Roles ── */}
              <div className="border rounded p-3">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h6 className="mb-0 fw-semibold">
                    <i className="ri-user-star-line me-2 text-success"></i>
                    Linked Sub Roles
                    <Badge color="success" pill className="ms-2 fs-11">
                      {subRoles.length}
                    </Badge>
                  </h6>

                  {subRoles.length > 0 && (
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success"
                        onClick={() => {
                          const all = {};
                          subRoles.forEach(r => { all[r.official_master_id] = true; });
                          setCheckedRoles(all);
                        }}
                      >
                        <i className="ri-checkbox-multiple-line me-1"></i>Check All
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => {
                          const none = {};
                          subRoles.forEach(r => { none[r.official_master_id] = false; });
                          setCheckedRoles(none);
                        }}
                      >
                        <i className="ri-close-circle-line me-1"></i>Uncheck All
                      </button>
                    </div>
                  )}
                </div>

                {subRoles.length === 0 ? (
                  <div className="text-center py-4 text-muted">
                    <i className="ri-inbox-line fs-30 d-block mb-2 opacity-50"></i>
                    No sub roles linked to this official.
                  </div>
                ) : (
                  <>
                    <Row className="g-2">
                      {subRoles.map(role => {
                        const isChecked = checkedRoles[role.official_master_id] ?? false;
                        return (
                          <Col key={role.official_master_id} md={6} lg={4}>
                            <div
                              className={`border rounded p-2 d-flex align-items-center gap-2 ${
                                isChecked
                                  ? 'border-success bg-soft-success'
                                  : 'border-danger bg-soft-danger'
                              }`}
                              style={{ cursor: 'pointer', transition: 'all 0.18s' }}
                              onClick={() => toggleCheck(role.official_master_id)}
                            >
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleCheck(role.official_master_id)}
                                  onClick={e => e.stopPropagation()}
                                  style={{ cursor: 'pointer' }}
                                />
                              </div>
                              <div className="flex-grow-1 overflow-hidden">
                                <p className="mb-0 fw-semibold fs-13 text-truncate">
                                  {role.official_master_name}
                                </p>
                                <p className="mb-0 fs-11 text-muted">
                                  Order: {role.official_order}
                                </p>
                              </div>
                              {isChecked ? (
                                <i className="ri-checkbox-circle-line text-success fs-16 flex-shrink-0"></i>
                              ) : (
                                <i className="ri-close-circle-line text-danger fs-16 flex-shrink-0"></i>
                              )}
                            </div>
                          </Col>
                        );
                      })}
                    </Row>

                    {/* ── Summary bar ── */}
                    <div className="mt-3 pt-2 border-top d-flex gap-4 fs-12">
                      <span>
                        <i className="ri-checkbox-circle-line text-success me-1"></i>
                        Active:{' '}
                        <strong className="text-success">{activeCount}</strong>
                      </span>
                      <span>
                        <i className="ri-close-circle-line text-danger me-1"></i>
                        Inactive:{' '}
                        <strong className="text-danger">{inactiveCount}</strong>
                      </span>
                      <span className="text-muted">
                        (Checked → <strong>Active</strong>, Unchecked → <strong>Inactive</strong>)
                      </span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <div className="hstack gap-2 justify-content-end">
            <button
              type="button"
              className="btn btn-light"
              onClick={closeConfigModal}
              disabled={configLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={handleConfigSave}
              disabled={configLoading}
            >
              {configLoading
                ? <><Spinner size="sm" className="me-1" />Saving…</>
                : <><i className="ri-save-line me-1"></i>Save Config</>}
            </button>
          </div>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default OfficialMaster;