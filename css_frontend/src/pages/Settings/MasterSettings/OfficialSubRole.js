import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Yup from 'yup';
import { toast } from 'react-toastify';

import MasterDataView from '../../../Components/Common/MasterDataView';
import { getLoggedinUser } from '../../../helpers/api_helper';

import {
  getOfficialMasterList,
  getOfficialSubRoleList,
  createOfficialSubRole,
  updateOfficialSubRole,
  deleteOfficialSubRole,
  getOfficialSubRoleNextOrder,   // ✅ new API
} from '../../../helpers/backend_helper';

const OfficialSubRole = () => {

  const [data, setData]                   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [parentOptions, setParentOptions] = useState([]);
  const [autoOrder, setAutoOrder]         = useState(1);

  // ✅ Ref to expose formik's setFieldValue from inside MasterDataView
  //    We use onFieldChange to intercept the parent change event
  const setOrderRef = useRef(null);   // stores the setFieldValue from MasterDataView

  const loggedUser = getLoggedinUser();
  const updatedBy  = loggedUser?.user_id ?? loggedUser?.id ?? 1;

  document.title = 'ASR::CSS | Official Sub Role';

  // ── Columns ───────────────────────────────────────────────────
  const COLUMNS = [
    {
      key:         'official_master_name',
      label:       'Sub Role Name',
      sortable:    true,
      gridPrimary: true,
      width:       '340px',
      // Default (system) sub roles get a small badge next to the name
      // Long names are cut with "…" (full name on hover) so the table doesn't scroll sideways
      render:      row => (
        <span style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 310 }}>
          <span
            title={row.official_master_name}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
          >
            {row.official_master_name}
          </span>
          {!!row.is_default && <span className="badge bg-primary-subtle text-primary ms-2 flex-shrink-0">Default</span>}
        </span>
      ),
    },
    {
      key:        'parent_name',
      label:      'Parent Official',
      sortable:   true,
      showInGrid: true,
      width:      '180px',
    },
    {
      key:        'official_order',
      label:      'Order',
      sortable:   true,
      showInGrid: true,
      width:      '100px',
    },
    {
      key:        'status_label',
      label:      'Status',
      sortable:   false,
      showInGrid: true,
      width:      '120px',
      badge:      true,
      badgeMap:   { Active: 'success', Inactive: 'danger' },
    },
  ];

  // ── Fetch next order for a given parent ───────────────────────
  const fetchNextOrder = useCallback(async (parentId, setFieldValue = null) => {
    if (!parentId || Number(parentId) === 0) return;
    try {
      const res       = await getOfficialSubRoleNextOrder(Number(parentId));
      const nextOrder = res?.data?.next_order ?? res?.next_order ?? 1;

      // ✅ Directly update the formik field inside MasterDataView
      if (setFieldValue) {
        setFieldValue('official_order', nextOrder);
      }
      setAutoOrder(nextOrder);
    } catch {
      // silently fail — user can still type order manually
    }
  }, []);

  // ── Fields ────────────────────────────────────────────────────
  const FIELDS = [
    {
      name:        'official_master_name',
      label:       'Sub Role Name',
      placeholder: 'Enter Sub Role Name',
      // Default (system) sub roles: name is fixed — dates reference the slug
      disabled:    (values, editItem) => !!editItem?.is_default,
      validation:  Yup.string()
        .min(2).max(150)
        .required('Sub role name is required'),
    },
    {
      name:       'is_parent',
      label:      'Parent Official',
      type:       'select',
      options:    parentOptions,
      disabled:   (values, editItem) => !!editItem?.is_default,
      validation: Yup.number()
        .required('Parent official is required')
        .min(1, 'Please select a parent official'),
      // ✅ field.onChange — called by MasterDataView handleFieldChange
      onChange: (value, { setFieldValue }) => {
        fetchNextOrder(Number(value), setFieldValue);
      },
    },
    {
      name:         'official_order',
      label:        'Order',
      placeholder:  'Auto-filled on parent selection',
      type:         'number',
      defaultValue: autoOrder,
      syncDefault:  true,   // ✅ tells MasterDataView to sync when autoOrder changes
      validation:   Yup.number().required('Order is required'),
    },
    {
      name:         'is_active',
      label:        'Status',
      type:         'select',
      options:      [
        { label: 'Active',   value: 0 },
        { label: 'Inactive', value: 1 },
      ],
      defaultValue: 0,
      validation:   Yup.number().required('Status is required'),
    },
  ];

  // ── Fetch parent list ─────────────────────────────────────────
  const fetchParents = async () => {
    try {
      const res = await getOfficialMasterList({
        page:      1,
        limit:     1000,
        is_parent: 0,
        order:     'official_order:ASC',
      });
      const list = res?.data?.data ?? res?.data ?? [];
      setParentOptions(
        (Array.isArray(list) ? list : []).map(item => ({
          label: item.official_master_name,
          value: item.official_master_id,
        }))
      );
    } catch {
      toast.error('Failed to load parent officials', { autoClose: 3000 });
    }
  };

  // ── Fetch sub-role list ───────────────────────────────────────
  const fetchList = async () => {
    setLoading(true);
    try {
      const res  = await getOfficialSubRoleList({
        page:  1,
        limit: 1000,
        order: 'official_order:ASC',
      });
      const list = res?.data?.data ?? res?.data ?? [];
      setData(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load official sub roles', { autoClose: 3000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchParents();
      await fetchList();
    };
    init();
  }, []);

  // ── Annotate rows ─────────────────────────────────────────────
  const annotatedData = data.map(row => {
    const parent = parentOptions.find(p => p.value === row.is_parent);
    return {
      ...row,
      parent_name:  parent?.label ?? (row.is_parent ? `ID: ${row.is_parent}` : '—'),
      status_label: (row.is_active === 0 || row.is_active === false) ? 'Active' : 'Inactive',
    };
  });

  // ── CRUD ──────────────────────────────────────────────────────
  const handleAdd = async (values) => {
    setLoading(true);
    try {
      await createOfficialSubRole({
        ...values,
        is_parent:  Number(values.is_parent),
        is_active:  Number(values.is_active ?? 0),
        updated_by: updatedBy,
      });
      toast.success('Official sub role added successfully', { autoClose: 3000 });
      await fetchList();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to add official sub role', { autoClose: 3000 });
      setLoading(false);
    }
  };

  const handleEdit = async (item, values) => {
    const id = item.official_master_id ?? item.id;
    setLoading(true);
    try {
      await updateOfficialSubRole(id, {
        ...values,
        is_parent:  Number(values.is_parent),
        is_active:  Number(values.is_active ?? 0),
        updated_by: updatedBy,
      });
      toast.success('Official sub role updated successfully', { autoClose: 3000 });
      await fetchList();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to update official sub role', { autoClose: 3000 });
      setLoading(false);
    }
  };

  const handleDelete = async (item) => {
    const id = item.official_master_id ?? item.id;
    setLoading(true);
    try {
      await deleteOfficialSubRole(id);
      toast.success('Official sub role deleted successfully', { autoClose: 3000 });
      await fetchList();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to delete official sub role', { autoClose: 3000 });
      setLoading(false);
    }
  };

  // ✅ Called by MasterDataView for every field change
  //    Used as a fallback if field.onChange isn't supported
  const handleFieldChange = useCallback(({ field, event, setFieldValue }) => {
    if (field.name === 'is_parent') {
      const parentId = Number(event.target.value);
      if (parentId > 0) {
        fetchNextOrder(parentId, setFieldValue);
      }
    }
  }, [fetchNextOrder]);

  return (
    <MasterDataView
      title="List Of Official Sub Roles"
      modalTitle="Official Sub Role"
      listId="officialSubRoleList"
      columns={COLUMNS}
      fields={FIELDS}
      data={annotatedData}
      loading={loading}
      emptyMessage="No official sub roles found."
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      canDelete={row => !row.is_default}   // default sub roles cannot be deleted
      onFieldChange={handleFieldChange} // ✅ fallback field change handler
    />
  );
};

export default OfficialSubRole;