import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { Container, Spinner } from 'reactstrap';
import { toast } from 'react-toastify';
import BreadCrumb from '../../Components/Common/BreadCrumb';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import { getCompanyList, getOfficialList } from '../../helpers/backend_helper';
import './Statutory.css';

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderColor: state.isFocused ? '#405189' : 'var(--vz-border-color, #dfe3ea)',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(64,81,137,.1)' : 'none',
    background: 'var(--vz-input-bg, var(--vz-card-bg, #fff))',
    fontSize: 12.5,
    '&:hover': { borderColor: '#405189' },
  }),
  menu: (base) => ({ ...base, zIndex: 20, fontSize: 12.5 }),
  singleValue: (base) => ({ ...base, color: 'var(--vz-body-color)' }),
  placeholder: (base) => ({ ...base, color: '#9aa1ac' }),
};

const unwrapList = (response) => {
  const payload = response?.data ?? response;
  const list = payload?.data ?? payload ?? [];
  return Array.isArray(list) ? list : [];
};

const emptyFilters = (dateBasis) => ({
  companyId: '',
  dateBasis,
  fromDate: '',
  toDate: '',
  status: 'ALL',
  recordStage: 'ALL',
});

const mainDateOf = (record) => record.date_record
  || (record.date_records || []).find((item) => String(item.is_main_role) === '1')
  || (record.date_records || [])[0]
  || {};

const displayDate = (value) => {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const recordStage = (date, basis) => {
  const proposed = basis === 'CESSATION' ? date.is_ceased_proposed : date.is_appt_proposed;
  return Number(proposed) === 1 ? 'PROPOSED' : 'EFFECTIVE';
};

const recordStatus = (record, date) => (
  date.ceased_date || Number(record.is_current) === 0 ? 'Ceased' : 'Active'
);

const StatutoryRegisterShell = ({ config }) => {
  useCollapseSidebar();

  const defaultDateBasis = config.dateBasisOptions[0].value;
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [pdpaMode, setPdpaMode] = useState('WITH');
  const [filters, setFilters] = useState(() => emptyFilters(defaultDateBasis));
  const [searching, setSearching] = useState(false);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  document.title = `${config.title} | ASR CSS`;

  useEffect(() => {
    let active = true;

    getCompanyList({ page: 1, limit: 1000, sort: 'name', order: 'ASC' })
      .then((response) => {
        if (active) setCompanies(unwrapList(response));
      })
      .catch(() => {
        if (active) {
          setCompanies([]);
          toast.error('Unable to load the entity filter');
        }
      })
      .finally(() => {
        if (active) setLoadingCompanies(false);
      });

    return () => { active = false; };
  }, []);

  const companyOptions = useMemo(() => companies.map((company) => ({
    value: String(company.entity_id),
    label: company.name,
    caption: company.client_no,
  })), [companies]);

  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setFiltersApplied(false);
  };

  const resetFilters = () => {
    setPdpaMode('WITH');
    setFilters(emptyFilters(defaultDateBasis));
    setFiltersApplied(false);
    setRecords([]);
    setTableSearch('');
  };

  const visibleRecords = useMemo(() => {
    if (!filtersApplied) return [];
    const needle = tableSearch.trim().toLowerCase();
    return records.filter((record) => {
      const date = mainDateOf(record);
      const dateValue = filters.dateBasis === 'CESSATION' ? date.ceased_date : date.appointment_date;
      const status = recordStatus(record, date);
      if (filters.status !== 'ALL' && status.toUpperCase() !== filters.status) return false;
      if (filters.recordStage !== 'ALL' && recordStage(date, filters.dateBasis) !== filters.recordStage) return false;
      if (filters.fromDate && (!dateValue || dateValue < filters.fromDate)) return false;
      if (filters.toDate && (!dateValue || dateValue > filters.toDate)) return false;
      if (!needle) return true;
      return [record.entity?.name, record.entity?.client_no, record.official_entity?.name,
        record.official_entity?.client_no, recordStatus(record, date)].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [filters, filtersApplied, records, tableSearch]);

  const applySearch = async () => {
    if (!filters.companyId) {
      toast.error('Please select an entity name before searching');
      return;
    }
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      toast.error('From date must be before or equal to To date');
      return;
    }

    // Only the Directors register currently has a result listing on this shared shell.
    if (!config.slug) {
      setSearching(true);
      setTimeout(() => {
        setSearching(false);
        setFiltersApplied(true);
      }, 250);
      return;
    }

    setSearching(true);
    setLoadingRecords(true);
    try {
      const response = await getOfficialList({
        page: 1,
        limit: 2000,
        entity_id: filters.companyId,
        official_master_slug: config.slug,
        is_ref_id: 0,
        order: 'created_date:DESC',
      });
      setRecords(unwrapList(response));
      setFiltersApplied(true);
    } catch (error) {
      setRecords([]);
      toast.error(`Unable to load ${config.title.toLowerCase()}`);
    } finally {
      setSearching(false);
      setLoadingRecords(false);
    }
  };

  return (
    <div className="page-content owner-register-page">
      <Container fluid>
        <BreadCrumb title={config.title} pageTitle="Statutory Registers" />

        <section className="or-hero">
          <div className="or-hero-icon"><i className={config.icon} /></div>
          <div className="or-hero-copy">
            <h2>{config.title}</h2>
            <p>{config.description}</p>
          </div>
        </section>

        <section className="or-filter-card">
          <div className="or-filter-toolbar">
            <div className="or-visibility-control">
              <span className="or-visibility-label">Data visibility <i className="ri-information-line" /></span>
              <div className="or-segmented" role="group" aria-label="PDPA display mode">
                <button type="button" className={pdpaMode === 'WITH' ? 'active' : ''} onClick={() => setPdpaMode('WITH')}>
                  <i className="ri-shield-check-line" /> With PDPA
                </button>
                <button type="button" className={pdpaMode === 'WITHOUT' ? 'active' : ''} onClick={() => setPdpaMode('WITHOUT')}>
                  <i className="ri-eye-off-line" /> Without PDPA
                </button>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              {filtersApplied && <span className="d-inline-flex align-items-center gap-1 text-success fs-11 fw-semibold"><i className="ri-check-line" /> Filters applied</span>}
              <button type="button" className="or-reset-btn" onClick={resetFilters}>
                <i className="ri-refresh-line" /> Reset filters
              </button>
            </div>
          </div>

          <div className="or-filter-grid">
            <div className="or-field or-span-2">
              <label>Entity <span className="text-danger">*</span></label>
              <Select
                isClearable
                isSearchable
                isLoading={loadingCompanies}
                styles={selectStyles}
                options={companyOptions}
                value={companyOptions.find((item) => item.value === filters.companyId) || null}
                onChange={(option) => setFilter('companyId', option?.value || '')}
                placeholder="Select entity name"
                formatOptionLabel={(option) => (
                  <div className="or-option">
                    <span>{option.label}</span>
                    {option.caption && <small>{option.caption}</small>}
                  </div>
                )}
              />
            </div>
            <div className="or-field">
              <label>Date basis</label>
              <select value={filters.dateBasis} onChange={(event) => setFilter('dateBasis', event.target.value)}>
                {config.dateBasisOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="or-field">
              <label>From date</label>
              <DatePickerInput value={filters.fromDate} onChange={(event) => setFilter('fromDate', event.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="or-field">
              <label>To date</label>
              <DatePickerInput value={filters.toDate} onChange={(event) => setFilter('toDate', event.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="or-field">
              <label>Status</label>
              <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="CEASED">Ceased</option>
              </select>
            </div>
            <div className="or-field">
              <label>Record stage</label>
              <select value={filters.recordStage} onChange={(event) => setFilter('recordStage', event.target.value)}>
                <option value="ALL">All stages</option>
                <option value="EFFECTIVE">Effective</option>
                <option value="PROPOSED">Proposed</option>
              </select>
            </div>
            <div className="or-filter-action">
              <button type="button" className="or-search-btn" onClick={applySearch} disabled={searching || loadingCompanies}>
                {searching ? <Spinner size="sm" /> : <i className="ri-search-2-line" />}
                Search
              </button>
            </div>
          </div>
        </section>

        {config.slug && <section className="or-results-card">
          <div className="or-results-toolbar">
            <div className="or-results-heading">
              <h5>{config.recordLabel} Records</h5>
              <span>{!filtersApplied ? 'Search to view records' : loadingRecords ? 'Loading…' : `${visibleRecords.length} record${visibleRecords.length === 1 ? '' : 's'}`}</span>
            </div>
            <div className="or-table-search"><i className="ri-search-line" /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder={`Search ${config.recordLabel.toLowerCase()}...`} /></div>
          </div>
          <div className="or-table-wrap">
            <table className="or-table">
              <thead><tr><th>Entity</th><th>{config.recordLabel}</th><th>Type</th>{pdpaMode === 'WITH' && <th>Identification</th>}<th>Appointment</th><th>Cessation</th><th>Status</th></tr></thead>
              <tbody>
                {!filtersApplied ? <tr><td colSpan={pdpaMode === 'WITH' ? 7 : 6}><div className="or-empty"><span><i className="ri-search-2-line" /></span><h5>Search to view {config.recordLabel.toLowerCase()} records</h5><p>Select an entity and click Search.</p></div></td></tr>
                  : loadingRecords ? [...Array(4)].map((_, index) => <tr key={index} className="or-skeleton-row">{[...Array(pdpaMode === 'WITH' ? 7 : 6)].map((__, cell) => <td key={cell}><span /></td>)}</tr>)
                    : visibleRecords.length === 0 ? <tr><td colSpan={pdpaMode === 'WITH' ? 7 : 6}><div className="or-empty"><span><i className="ri-file-search-line" /></span><h5>No {config.recordLabel.toLowerCase()} records found</h5><p>Adjust the register filters and try your search again.</p></div></td></tr>
                      : visibleRecords.map((record) => {
                        const date = mainDateOf(record);
                        const person = record.official_entity || {};
                        const identification = record.identification || (person.identifications || []).find((item) => item.is_primary) || (person.identifications || [])[0] || {};
                        const type = record.official_type === 'COMPANY' ? 'Corporate' : record.official_type === 'JOINT' ? 'Joint' : 'Individual';
                        const status = recordStatus(record, date);
                        return <tr key={record.official_id}><td><div className="or-company-cell"><div><strong>{record.entity?.name || '—'}</strong><small>{record.entity?.client_no || 'Entity'}</small></div></div></td><td><div className="or-owner-cell"><strong>{person.name || '—'}</strong>{person.client_no && <small>{person.client_no}</small>}</div></td><td><span className={`or-type-badge ${type.toLowerCase()}`}><i className={type === 'Corporate' ? 'ri-building-line' : type === 'Joint' ? 'ri-group-line' : 'ri-user-line'} />{type}</span></td>{pdpaMode === 'WITH' && <td><div className="or-detail-cell"><small>{identification.id_type?.id_name || 'Identification'}</small><strong>{identification.id_number || '—'}</strong></div></td>}<td><div className="or-date-cell"><strong>{displayDate(date.appointment_date)}</strong><small className={recordStage(date, 'APPOINTMENT').toLowerCase()}>{recordStage(date, 'APPOINTMENT')}</small></div></td><td><div className="or-date-cell"><strong>{displayDate(date.ceased_date)}</strong>{date.ceased_date && <small className={recordStage(date, 'CESSATION').toLowerCase()}>{recordStage(date, 'CESSATION')}</small>}</div></td><td><span className={`or-status ${status.toLowerCase()}`}><i />{status}</span></td></tr>;
                      })}
              </tbody>
            </table>
          </div>
        </section>}
      </Container>
    </div>
  );
};

export default StatutoryRegisterShell;
