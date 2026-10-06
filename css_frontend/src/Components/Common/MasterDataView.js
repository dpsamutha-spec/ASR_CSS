import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    Button, Card, CardBody, CardHeader, Col, Row,
    Modal, ModalBody, ModalFooter, ModalHeader,
    Input, Label, FormFeedback,
} from 'reactstrap';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useSelector } from 'react-redux';
import { createSelector } from 'reselect';
import Pagination from './Pagination';
import DatePickerInput from './DatePickerInput';
import { Spinner } from 'reactstrap';
import './MasterDataView.css';

const selectDefaultPageSize = createSelector(
    (state) => state.Layout,
    (layout) => Number(layout.defaultPageSize) || 10
);

const MasterDataView = ({
    title,
    listId,
    listSortKey,
    columnLabel,
    columns,
    fields = [],
    modalTitle,
    data = [],
    loading = false,
    emptyMessage = 'No results found.',
    onAdd,
    onEdit,
    onDelete,
    onDeleteClick,    // ✅ NEW: if provided, replaces the internal delete modal trigger.
                      //         MasterDataView will call onDeleteClick(item) instead of
                      //         opening its own delete modal. The parent owns the modal.
    renderGridCard,
    onFieldChange,
    extraActions,
    onEditOpen,
    canEdit,
    canDelete,
    highlightSystemDefaults = false,
}) => {
    const globalPageSize = useSelector(selectDefaultPageSize);

    const [viewMode, setViewMode]        = useState('list');
    const [searchTerm, setSearchTerm]    = useState('');
    const [modal_list, setModalList]     = useState(false);
    const [modal_delete, setModalDelete] = useState(false);
    const [editItem, setEditItem]        = useState(null);
    const [deleteItem, setDeleteItem]    = useState(null);
    const [currentPage, setCurrentPage]  = useState(1);
    const [pageSize, setPageSize]        = useState(globalPageSize);

    useEffect(() => { setPageSize(globalPageSize); setCurrentPage(1); }, [globalPageSize]);

    const resolvedColumns = columns || [
        { key: listSortKey, label: columnLabel, sortable: true, gridPrimary: true },
    ];

    const initialValues = fields.reduce(
        (acc, f) => ({ ...acc, [f.name]: f.defaultValue ?? '' }), {}
    );
    const validationSchema = Yup.object(
        fields.reduce((acc, f) =>
            f.validation ? { ...acc, [f.name]: f.validation } : acc, {}
        )
    );

    const formik = useFormik({
        initialValues,
        validationSchema,
        enableReinitialize: true,
        onSubmit: (values, { resetForm }) => {
            if (editItem) {
                onEdit?.(editItem, values);
            } else {
                onAdd?.(values);
            }
            resetForm();
            setModalList(false);
            setEditItem(null);
        },
    });

    const tog_list = (item = null) => {
        setEditItem(item);
        if (item && fields.length > 0) {
            formik.setValues(
                fields.reduce(
                    (acc, f) => ({ ...acc, [f.name]: item[f.name] ?? '' }),
                    {}
                )
            );
            if (onEditOpen) onEditOpen(item);
        } else {
            formik.resetForm();
        }
        if (fields.length === 0) {
            item ? onEdit(item) : onAdd();
            return;
        }
        setModalList(prev => !prev);
    };

    // ✅ handleDeleteClick — if parent passes onDeleteClick, delegate entirely.
    //    Otherwise fall back to the built-in delete modal (original behaviour).
    const handleDeleteClick = (item) => {
        if (onDeleteClick) {
            onDeleteClick(item);   // parent owns the modal
            return;
        }
        // built-in modal path
        setDeleteItem(item);
        setModalDelete(true);
    };

    const handleDeleteConfirm = () => {
        if (deleteItem) onDelete(deleteItem);
        setModalDelete(false);
        setDeleteItem(null);
    };

    const handleDeleteClose = () => {
        setModalDelete(false);
        setDeleteItem(null);
    };

    useEffect(() => { setCurrentPage(1); }, [searchTerm, pageSize]);

    const filteredData = data.filter(item =>
        resolvedColumns.some(col =>
            String(item[col.key] ?? item.name ?? '')
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
        )
    );

    const pagedData = filteredData.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const getBadgeColor = (col, value) => {
        if (col.badgeMap) return col.badgeMap[value] || 'secondary';
        const v = String(value).toLowerCase();
        if (v === 'active')   return 'success';
        if (v === 'inactive') return 'danger';
        if (v === 'pending')  return 'warning';
        return 'secondary';
    };

    const isColorColumn    = (col) => col.type === 'color'     || col.key?.toLowerCase().includes('color');
    const isTextWrapColumn = (col) => col.type === 'text-wrap' || col.type === 'textarea';

    const gridPrimaryCol = resolvedColumns.find(c => c.gridPrimary) || resolvedColumns[0];
    const gridSecondCols = resolvedColumns.filter(c => c.showInGrid && !c.gridPrimary);

    const MDV_COLORS = ['#405189','#0ab39c','#f06548','#f0b232','#299cdb','#6559cc','#e83e8c','#20c997','#fd7e14','#6c757d'];
    const MDV_GRADS  = ['#6b7fc8','#2dcbb0','#f5876b','#f5c560','#4db5e8','#8a7fd8','#ee6ba5','#4dd9ae','#ff9b45','#8c959d'];

    const defaultGridCard = (item, index) => {
        const name    = item[gridPrimaryCol?.key] ?? item.name ?? '—';
        const initial = name.trim().charAt(0).toUpperCase() || '?';
        const ci      = index % MDV_COLORS.length;
        const color   = MDV_COLORS[ci];
        const grad    = MDV_GRADS[ci];
        return (
            <>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${color} 0%, ${grad} 100%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, fontWeight: 700, color: '#fff',
                        boxShadow: `0 4px 14px ${color}55`,
                    }}>
                        {initial}
                    </div>
                    <span style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 20, height: 20, borderRadius: '50%',
                        background: color, color: '#fff',
                        fontSize: 9, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid #fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,.15)',
                    }}>
                        {index + 1}
                    </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--vz-body-color)', marginBottom: 4, wordBreak: 'break-word', lineHeight: 1.3, textAlign: 'center' }}>
                    {name}
                </div>

                {gridSecondCols.map(col => (
                    <div key={col.key} style={{ marginTop: 6 }}>
                        {isColorColumn(col) ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <div style={{
                                    width: 16, height: 16,
                                    backgroundColor: item[col.key] || '#000',
                                    borderRadius: 4, border: '1px solid #ddd',
                                }} />
                                <span style={{ fontSize: 11, color: 'var(--vz-sidebar-sub-item-color)' }}>{item[col.key] ?? '—'}</span>
                            </div>
                        ) : col.badge ? (
                            <span className={`badge bg-${getBadgeColor(col, item[col.key])}-subtle text-${getBadgeColor(col, item[col.key])}`}>
                                {item[col.key] ?? '—'}
                            </span>
                        ) : (
                            <span style={{ fontSize: 11, color: 'var(--vz-sidebar-sub-item-color)' }}>
                                {col.label}: <strong style={{ color: 'var(--vz-body-color)' }}>{item[col.key] ?? '—'}</strong>
                            </span>
                        )}
                    </div>
                ))}
            </>
        );
    };

    const handleFieldChange = (e, field) => {
        formik.handleChange(e);
        if (field.onChange) {
            field.onChange(e.target.value, {
                values:        formik.values,
                setFieldValue: formik.setFieldValue,
                setValues:     formik.setValues,
            });
        }
        if (onFieldChange) {
            onFieldChange({
                event:         e,
                field,
                values:        formik.values,
                setFieldValue: formik.setFieldValue,
                setValues:     formik.setValues,
            });
        }
    };

    useEffect(() => {
        fields.forEach(f => {
            if (
                f.syncDefault &&
                !editItem &&
                formik.values[f.name] !== f.defaultValue
            ) {
                formik.setFieldValue(f.name, f.defaultValue ?? '');
            }
        });
    }, [fields]);

    const cardContent    = renderGridCard || defaultGridCard;
    const actionColWidth = extraActions ? '240px' : '180px';

    return (
        <React.Fragment>
            <Card className="mb-0 shadow-none border-0">

                <CardHeader className="py-2">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                        <h5 className="card-title mb-0 fs-14 flex-shrink-0">{title}</h5>

                        {/* Toolbar — every control shares one height so they line up */}
                        <div className="d-flex align-items-center gap-2 flex-grow-1 justify-content-end">
                            <Button color="warning" size="sm"
                                className="d-flex align-items-center gap-1 flex-shrink-0 px-3"
                                style={{ height: 34 }}
                                onClick={() => tog_list(null)}>
                                <i className="ri-add-line"></i> Add New
                            </Button>
                            <div className="search-box flex-shrink-0" style={{ width: 220 }}>
                                <input
                                    type="text"
                                    className="form-control form-control-sm search"
                                    style={{ height: 34 }}
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                <i className="ri-search-line search-icon"></i>
                            </div>
                            <div className="btn-group flex-shrink-0" role="group" aria-label="View mode">
                                <button
                                    className={`btn btn-sm d-flex align-items-center justify-content-center ${viewMode === 'list' ? 'btn-success' : 'btn-outline-success'}`}
                                    style={{ height: 34, width: 36 }}
                                    title="List View"
                                    onClick={() => setViewMode('list')}>
                                    <i className="ri-list-unordered"></i>
                                </button>
                                <button
                                    className={`btn btn-sm d-flex align-items-center justify-content-center ${viewMode === 'grid' ? 'btn-success' : 'btn-outline-success'}`}
                                    style={{ height: 34, width: 36 }}
                                    title="Grid View"
                                    onClick={() => setViewMode('grid')}>
                                    <i className="ri-grid-fill"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardBody>

                    {/* LIST VIEW */}
                    {viewMode === 'list' && (
                        <div>
                            <div className="position-relative">
                                {loading && (
                                    <div style={{
                                        position: 'absolute', inset: 0,
                                        background: 'rgba(255,255,255,0.65)',
                                        backdropFilter: 'blur(2px)',
                                        zIndex: 10,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: '8px',
                                    }}>
                                        <Spinner color="success" style={{ width: '2rem', height: '2rem' }} />
                                    </div>
                                )}
                                <div className="table-responsive table-card mt-1 mb-1">
                                    <table className="table align-middle table-nowrap" id="customerTable">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: '80px', minWidth: '80px' }}>S/No.</th>
                                                {resolvedColumns.map(col => (
                                                    <th key={col.key} style={{
                                                        width: col.width || col.maxWidth || '180px',
                                                        minWidth: col.width || col.maxWidth || '180px',
                                                        wordBreak: 'break-word',
                                                    }}>
                                                        {col.label}
                                                    </th>
                                                ))}
                                                <th style={{ width: actionColWidth, minWidth: actionColWidth }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedData.map((row, index) => (
                                                <tr
                                                    key={row.id ?? index}
                                                    style={highlightSystemDefaults && row.is_system_default ? {
                                                        backgroundColor: 'rgba(64, 81, 137, 0.10)',
                                                        borderLeft: '3px solid #405189',
                                                    } : undefined}
                                                >
                                                    <td style={{ width: '80px', minWidth: '80px' }}>
                                                        {(currentPage - 1) * pageSize + index + 1}
                                                    </td>
                                                    {resolvedColumns.map(col => (
                                                        <td key={col.key} style={{
                                                            width: col.width || col.maxWidth || '180px',
                                                            minWidth: col.width || col.maxWidth || '180px',
                                                            wordBreak: isTextWrapColumn(col) ? 'break-word' : 'normal',
                                                            whiteSpace: isTextWrapColumn(col) ? 'normal' : 'nowrap',
                                                            overflowWrap: isTextWrapColumn(col) ? 'break-word' : 'normal',
                                                        }}>
                                                            {/* col.render(row) — optional custom cell content */}
                                                            {col.render ? col.render(row) : isColorColumn(col) ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{
                                                                        width: '24px', height: '24px', minWidth: '24px',
                                                                        backgroundColor: row[col.key] || '#000000',
                                                                        borderRadius: '4px', border: '1px solid #ddd',
                                                                    }} />
                                                                    <span style={{ fontFamily: 'monospace', fontWeight: '500' }}>
                                                                        {row[col.key] ?? '—'}
                                                                    </span>
                                                                </div>
                                                            ) : col.badge ? (
                                                                <span className={`badge bg-${getBadgeColor(col, row[col.key])}-subtle text-${getBadgeColor(col, row[col.key])}`}>
                                                                    {row[col.key] ?? '—'}
                                                                </span>
                                                            ) : (
                                                                <span style={{
                                                                    whiteSpace: isTextWrapColumn(col) ? 'pre-wrap' : 'nowrap',
                                                                    lineHeight: isTextWrapColumn(col) ? '1.5' : 'normal',
                                                                    display: 'block',
                                                                }}>
                                                                    {row[col.key] ?? row.name ?? '—'}
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                    {/* Action Column */}
                                                    <td style={{ width: actionColWidth, minWidth: actionColWidth }}>
                                                        <div className="d-flex gap-2 flex-wrap">
                                                            {(!canEdit || canEdit(row)) && (
                                                                <button className="btn btn-sm btn-soft-success"
                                                                    onClick={() => tog_list(row)}>
                                                                    <i className="ri-pencil-fill me-1"></i>Edit
                                                                </button>
                                                            )}
                                                            {extraActions && extraActions(row)}
                                                            {(!canDelete || canDelete(row)) && (
                                                                <button className="btn btn-sm btn-soft-danger"
                                                                    onClick={() => handleDeleteClick(row)}>
                                                                    <i className="ri-delete-bin-fill me-1"></i>Delete
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {filteredData.length === 0 && (
                                        <div className="text-center py-4">
                                            <lord-icon
                                                src="https://cdn.lordicon.com/msoeawqm.json"
                                                trigger="loop"
                                                colors="primary:#121331,secondary:#08a88a"
                                                style={{ width: '75px', height: '75px' }}
                                            ></lord-icon>
                                            <h5 className="mt-2">Sorry! No Result Found</h5>
                                            <p className="text-muted mb-0">{emptyMessage}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Pagination
                                total={filteredData.length}
                                currentPage={currentPage}
                                pageSize={pageSize}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={setPageSize}
                            />
                        </div>
                    )}

                    {/* GRID VIEW */}
                    {viewMode === 'grid' && (
                        <div>
                            <div className="position-relative">
                                {loading && (
                                    <div style={{
                                        position: 'absolute', inset: 0,
                                        background: 'rgba(255,255,255,0.65)',
                                        backdropFilter: 'blur(2px)',
                                        zIndex: 10,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: '8px',
                                    }}>
                                        <Spinner color="success" style={{ width: '2rem', height: '2rem' }} />
                                    </div>
                                )}
                                {filteredData.length > 0 ? (
                                    <Row className="g-3">
                                        {pagedData.map((item, index) => {
                                            const absIdx   = (currentPage - 1) * pageSize + index;
                                            const cardColor = MDV_COLORS[absIdx % MDV_COLORS.length];
                                            return (
                                            <Col key={item.id ?? index} xxl={3} xl={3} lg={4} md={6} sm={6} xs={12}>
                                                <div
                                                    className="mdv-grid-card"
                                                    style={highlightSystemDefaults && item.is_system_default ? {
                                                        backgroundColor: 'rgba(64, 81, 137, 0.10)',
                                                        borderColor: '#405189',
                                                    } : undefined}
                                                >
                                                    <div className="mdv-grid-card-strip" style={{ background: highlightSystemDefaults && item.is_system_default ? '#405189' : cardColor }} />
                                                    <div className="mdv-grid-card-body">
                                                        {cardContent(item, absIdx)}
                                                    </div>
                                                    <div className="mdv-grid-card-actions">
                                                        {(!canEdit || canEdit(item)) && (
                                                            <button className="btn btn-sm btn-soft-success"
                                                                onClick={() => tog_list(item)}>
                                                                <i className="ri-pencil-fill me-1"></i>Edit
                                                            </button>
                                                        )}
                                                        {(!canDelete || canDelete(item)) && (
                                                            <button className="btn btn-sm btn-soft-danger"
                                                                onClick={() => handleDeleteClick(item)}>
                                                                <i className="ri-delete-bin-fill me-1"></i>Delete
                                                            </button>
                                                        )}
                                                        {extraActions && extraActions(item)}
                                                    </div>
                                                </div>
                                            </Col>
                                            );
                                        })}
                                    </Row>
                                ) : (
                                    <div className="text-center py-5">
                                        <lord-icon
                                            src="https://cdn.lordicon.com/msoeawqm.json"
                                            trigger="loop"
                                            colors="primary:#121331,secondary:#08a88a"
                                            style={{ width: '75px', height: '75px' }}
                                        ></lord-icon>
                                        <h5 className="mt-2">Sorry! No Result Found</h5>
                                        <p className="text-muted mb-0">{emptyMessage}</p>
                                    </div>
                                )}
                            </div>

                            <Pagination
                                total={filteredData.length}
                                currentPage={currentPage}
                                pageSize={pageSize}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={setPageSize}
                            />
                        </div>
                    )}

                </CardBody>
            </Card>

            {/* ── Add / Edit Modal (only when fields are defined) ── */}
            {fields.length > 0 && (
                <Modal isOpen={modal_list} toggle={() => tog_list(null)} centered
                    size={fields.length > 3 ? 'lg' : undefined}>
                    <ModalHeader className="bg-light p-3" toggle={() => tog_list(null)}>
                        {editItem
                            ? `Edit ${modalTitle || columnLabel}`
                            : `Add ${modalTitle || columnLabel}`}
                    </ModalHeader>
                    <form onSubmit={formik.handleSubmit}>
                        <ModalBody>
                            <Row className="g-3">
                                {fields.filter(field => (
                                    typeof field.visible === 'function'
                                        ? field.visible(formik.values, editItem)
                                        : field.visible !== false
                                )).map(field => (
                                    <Col key={field.name}
                                        md={field.col || (fields.length > 2 ? 6 : 12)}>
                                        <Label htmlFor={field.name} className={field.type === 'checkbox' ? 'd-flex align-items-center gap-2 mb-0 mt-4' : ''}>
                                            {field.type === 'checkbox' && (
                                                <Input
                                                    type="checkbox"
                                                    id={field.name}
                                                    name={field.name}
                                                    checked={Boolean(formik.values[field.name])}
                                                    onChange={(e) => handleFieldChange({
                                                        ...e,
                                                        target: {
                                                            ...e.target,
                                                            name: field.name,
                                                            value: e.target.checked,
                                                        },
                                                    }, field)}
                                                    onBlur={formik.handleBlur}
                                                    disabled={
                                                        typeof field.disabled === 'function'
                                                            ? field.disabled(formik.values, editItem)
                                                            : field.disabled || false
                                                    }
                                                    invalid={formik.touched[field.name] && !!formik.errors[field.name]}
                                                />
                                            )}
                                            {field.label}
                                            {field.required !== false &&
                                                <span className="text-danger ms-1">*</span>}
                                        </Label>

                                        {field.type === 'checkbox' ? null : field.type === 'select' ? (
                                            <Input type="select"
                                                name={field.name}
                                                value={formik.values[field.name]}
                                                onChange={(e) => handleFieldChange(e, field)}
                                                onBlur={formik.handleBlur}
                                                readOnly={
                                                    typeof field.readonly === 'function'
                                                        ? field.readonly(formik.values)
                                                        : field.readonly || false
                                                }
                                                disabled={
                                                    typeof field.disabled === 'function'
                                                        ? field.disabled(formik.values, editItem)
                                                        : field.disabled || false
                                                }
                                                invalid={formik.touched[field.name] && !!formik.errors[field.name]}>
                                                <option value="">Select {field.label}...</option>
                                                {field.options?.map(opt => (
                                                    <option key={opt.value ?? opt} value={opt.value ?? opt}>
                                                        {opt.label ?? opt}
                                                    </option>
                                                ))}
                                            </Input>
                                        ) : field.type === 'textarea' ? (
                                            <Input type="textarea"
                                                id={field.name} name={field.name}
                                                rows={field.rows || 3}
                                                placeholder={field.placeholder}
                                                value={formik.values[field.name]}
                                                readOnly={
                                                    typeof field.readonly === 'function'
                                                        ? field.readonly(formik.values)
                                                        : field.readonly || false
                                                }
                                                disabled={
                                                    typeof field.disabled === 'function'
                                                        ? field.disabled(formik.values, editItem)
                                                        : field.disabled || false
                                                }
                                                onChange={(e) => handleFieldChange(e, field)}
                                                onBlur={formik.handleBlur}
                                                invalid={formik.touched[field.name] && !!formik.errors[field.name]} />
                                        ) : field.type === 'date' ? (
                                            <DatePickerInput
                                                id={field.name}
                                                name={field.name}
                                                placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`}
                                                value={formik.values[field.name]}
                                                readOnly={
                                                    typeof field.readonly === 'function'
                                                        ? field.readonly(formik.values)
                                                        : field.readonly || false
                                                }
                                                disabled={
                                                    typeof field.disabled === 'function'
                                                        ? field.disabled(formik.values, editItem)
                                                        : field.disabled || false
                                                }
                                                onChange={(e) => handleFieldChange(e, field)}
                                                onBlur={formik.handleBlur}
                                                invalid={formik.touched[field.name] && !!formik.errors[field.name]}
                                            />
                                        ) : field.type === 'color' ? (
                                            <Input type="color"
                                                id={field.name} name={field.name}
                                                value={formik.values[field.name] || '#000000'}
                                                onChange={(e) => handleFieldChange(e, field)}
                                                onBlur={formik.handleBlur}
                                                style={{ height: '38px', padding: '4px' }}
                                                readOnly={
                                                    typeof field.readonly === 'function'
                                                        ? field.readonly(formik.values)
                                                        : field.readonly || false
                                                }
                                                disabled={
                                                    typeof field.disabled === 'function'
                                                        ? field.disabled(formik.values, editItem)
                                                        : field.disabled || false
                                                }
                                                invalid={formik.touched[field.name] && !!formik.errors[field.name]}
                                            />
                                        ) : (
                                            <Input type={field.type || 'text'}
                                                id={field.name} name={field.name}
                                                placeholder={field.placeholder}
                                                value={formik.values[field.name]}
                                                readOnly={
                                                    typeof field.readonly === 'function'
                                                        ? field.readonly(formik.values)
                                                        : field.readonly || false
                                                }
                                                disabled={
                                                    typeof field.disabled === 'function'
                                                        ? field.disabled(formik.values, editItem)
                                                        : field.disabled || false
                                                }
                                                onChange={(e) => handleFieldChange(e, field)}
                                                onBlur={formik.handleBlur}
                                                invalid={formik.touched[field.name] && !!formik.errors[field.name]} />
                                        )}

                                        {formik.touched[field.name] && formik.errors[field.name] && (
                                            <FormFeedback>{formik.errors[field.name]}</FormFeedback>
                                        )}
                                        {field.hint && (
                                            <div className="form-text text-muted">{field.hint}</div>
                                        )}
                                    </Col>
                                ))}
                            </Row>
                        </ModalBody>
                        <ModalFooter>
                            <div className="hstack gap-2 justify-content-end">
                                <button type="button" className="btn btn-light"
                                    onClick={() => tog_list(null)}>Close</button>
                                <button type="submit" className="btn btn-success">
                                    {editItem ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </ModalFooter>
                    </form>
                </Modal>
            )}

            {/*
              ── Built-in Delete Modal ──
              ✅ Only rendered when onDeleteClick is NOT provided (built-in path).
                 When onDeleteClick IS provided, the parent owns the delete modal
                 entirely and this one is never shown.
            */}
            {!onDeleteClick && (
                <Modal isOpen={modal_delete} toggle={handleDeleteClose} fade={true} centered modalClassName="zoomIn">
                    <ModalBody className="py-3 px-5 position-relative">
                        <button type="button" className="btn-close position-absolute top-0 end-0 m-2"
                            onClick={handleDeleteClose} aria-label="Close"></button>
                        <div className="mt-2 text-center">
                            <lord-icon
                                src="https://cdn.lordicon.com/gsqxdxog.json"
                                trigger="loop"
                                colors="primary:#f7b84b,secondary:#f06548"
                                style={{ width: '100px', height: '100px' }}
                            ></lord-icon>
                            <div className="mt-4 pt-2 fs-15 mx-4 mx-sm-5">
                                <h4>Are you sure?</h4>
                                <p className="text-muted mx-4 mb-0">
                                    Are you sure you want to remove{' '}
                                    <strong>
                                        {deleteItem
                                            ? (deleteItem[resolvedColumns[0]?.key] ?? deleteItem.name ?? '')
                                            : ''}
                                    </strong>?
                                </p>
                            </div>
                        </div>
                        <div className="d-flex gap-2 justify-content-center mt-4 mb-2">
                            <button type="button" className="btn w-sm btn-light"
                                onClick={handleDeleteClose}>Close</button>
                            <button type="button" className="btn w-sm btn-danger"
                                onClick={handleDeleteConfirm}>Yes, Delete It!</button>
                        </div>
                    </ModalBody>
                </Modal>
            )}
        </React.Fragment>
    );
};

MasterDataView.propTypes = {
    title:          PropTypes.string.isRequired,
    listId:         PropTypes.string.isRequired,
    listSortKey:    PropTypes.string,
    columnLabel:    PropTypes.string,
    columns:        PropTypes.array,
    fields:         PropTypes.array,
    modalTitle:     PropTypes.string,
    data:           PropTypes.array,
    emptyMessage:   PropTypes.string,
    onAdd:          PropTypes.func.isRequired,
    onEdit:         PropTypes.func.isRequired,
    onDelete:       PropTypes.func.isRequired,
    onDeleteClick:  PropTypes.func,   // ✅ NEW — optional; parent takes over delete modal
    renderGridCard: PropTypes.func,
    onFieldChange:  PropTypes.func,
    extraActions:   PropTypes.func,
    onEditOpen:     PropTypes.func,
    canEdit:        PropTypes.func,
    canDelete:      PropTypes.func,
    highlightSystemDefaults: PropTypes.bool,
};

export default MasterDataView;
