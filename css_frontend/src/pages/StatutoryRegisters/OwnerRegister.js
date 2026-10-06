import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { Container, Modal, ModalBody, ModalHeader, Spinner } from 'reactstrap';
import { toast } from 'react-toastify';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import BreadCrumb from '../../Components/Common/BreadCrumb';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import Pagination from '../../Components/Common/Pagination';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import { getCompanyList, getOfficialList } from '../../helpers/backend_helper';
import './Statutory.css';

const EMPTY_FILTERS = {
  companyId: '',
  fromDate: '',
  toDate: '',
  status: 'ALL',
  dateBasis: 'APPOINTMENT',
  recordStage: 'ALL',
};

const OWNER_REGISTER_STATE_KEY = 'owner-register-search-state';

const loadOwnerRegisterState = () => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = window.sessionStorage.getItem(OWNER_REGISTER_STATE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    return {};
  }
};

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

const mainDateOf = (record) => record.date_record
  || (record.date_records || []).find((item) => String(item.is_main_role) === '1')
  || (record.date_records || [])[0]
  || {};

const displayDate = (value) => {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatAddress = (addresses = []) => {
  const address = addresses.find((item) => item.is_primary)
    || addresses.find((item) => item.address_type === 'REGISTERED')
    || addresses[0];
  if (!address) return '—';

  const unit = [address.level_no && `#${address.level_no}`, address.unit_no]
    .filter(Boolean).join('-');
  return [
    address.block_no,
    address.street_name,
    address.building_name,
    unit,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean).join(', ') || '—';
};

const CORPORATE_IDENTIFICATION_FIELDS = [
  { key: 'uen_no', label: 'UEN No.' },
  { key: 'fbrn_reg_no', label: 'FBRN' },
  { key: 'uf_no', label: 'UF No.' },
  { key: 'domes_bus_no', label: 'Domestic Business Number' },
  { key: 'acra_no', label: 'ACRA ID' },
];

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const roleLabel = (record) => {
  const label = record.official_master?.official_master_name;
  if (label) {
    if (/ies$/i.test(label)) return `${label.slice(0, -3)}y`;
    if (/s$/i.test(label) && !/ss$/i.test(label)) return label.slice(0, -1);
    return label;
  }

  return String(record.official_master_slug || '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const ownerRoleKey = (entityId, officialEntityId) => (
  entityId && officialEntityId ? `${entityId}:${officialEntityId}` : ''
);

const ownerEntityIds = (record) => {
  if (record.official_entity_id) return [record.official_entity_id];
  return (record.joint_members || [])
    .map((member) => member.official_entity_id)
    .filter(Boolean);
};

const resolveCorporateIdentification = (record, entity) => {
  const entityIdentifications = entity.identifications || [];
  const primaryIdentification = entityIdentifications.find((item) => item.is_primary);
  const sources = [record.identification, primaryIdentification, ...entityIdentifications]
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);

  for (const field of CORPORATE_IDENTIFICATION_FIELDS) {
    const source = sources.find((item) => hasValue(item[field.key]));
    if (source) return { type: field.label, number: String(source[field.key]).trim() };
  }

  const legacySource = sources.find((item) => hasValue(item.id_number));
  return legacySource
    ? { type: 'Registration Number', number: String(legacySource.id_number).trim() }
    : { type: 'Corporate Registration Number', number: '—' };
};

const getOwnerInfo = (record, ownerPositions = []) => {
  const entity = record.official_entity || {};
  const registeredEntity = record.entity || {};
  const detail = entity.individual_detail || {};
  const companyDetail = entity.company_detail || {};
  const registeredCompanyDetail = registeredEntity.company_detail || {};
  const companyContact = record.company_contact || {};
  const contacts = entity.contacts || [];
  const registeredContacts = registeredEntity.contacts || [];
  const dateRecord = mainDateOf(record);
  const ceased = Boolean(dateRecord.ceased_date) || Number(record.is_current) === 0;
  const entityIdentifications = entity.identifications || [];
  const identification = record.identification
    || entityIdentifications.find((item) => item.is_primary)
    || entityIdentifications[0]
    || {};
  const isCorporate = record.official_type === 'COMPANY';
  const corporateIdentification = isCorporate
    ? resolveCorporateIdentification(record, entity)
    : null;
  const contactValue = (type) => contacts.find((item) => item.contact_type === type)?.contact_value || '';
  const phoneValue = (type) => {
    const contact = contacts.find((item) => item.contact_type === type);
    if (!contact?.contact_value) return '';
    return [contact.phone_country_code, contact.contact_value].filter(Boolean).join(' ');
  };
  const registeredPhoneValue = (type) => {
    const matching = registeredContacts.filter((item) => item.contact_type === type);
    const contact = matching.find((item) => Number(item.is_primary) === 1) || matching[0];
    if (!contact?.contact_value) return '';
    return [contact.phone_country_code, contact.contact_value].filter(Boolean).join(' ');
  };
  const savedPhone = (code, value) => value ? [code, value].filter(Boolean).join(' ') : '';
  return {
    company: record.entity?.name || '—',
    owner: entity.name || '—',
    clientNo: entity.client_no || '',
    ownerType: record.official_type === 'COMPANY' ? 'Corporate' : record.official_type === 'JOINT' ? 'Joint' : 'Individual',
    ownerPositions,
    ownerPositionText: ownerPositions.join(', ') || '—',
    identificationType: isCorporate
      ? corporateIdentification.type
      : (identification.id_type?.id_name || 'Identification'),
    identificationNo: isCorporate
      ? corporateIdentification.number
      : (identification.id_number || '—'),
    identificationExpiry: identification.id_expired_date || '',
    nationality: detail.member_nationality || companyDetail.country || '—',
    birthOrIncorpDate: detail.member_dob || companyDetail.company_incorporation_date || '',
    address: formatAddress(entity.addresses || []),
    email: companyContact.email || contactValue('EMAIL') || '—',
    mobile: savedPhone(companyContact.mobile_code, companyContact.mobile) || phoneValue('MOBILE') || '—',
    telephone: savedPhone(companyContact.telephone_code, companyContact.telephone) || phoneValue('HOME') || '—',
    office: savedPhone(companyContact.office_code, companyContact.office) || phoneValue('OFFICE') || '—',
    entityType: registeredEntity.company_type?.company_type_name || '—',
    companyId: registeredEntity.client_no || '—',
    companyPhone: registeredPhoneValue('MOBILE')
      || registeredPhoneValue('OFFICE')
      || registeredPhoneValue('HOME')
      || '—',
    jurisdiction: companyDetail.jurisdiction_incorp_name || companyDetail.country || '—',
    fyeDate: registeredCompanyDetail.company_fin_date || '',
    entityStatus: registeredCompanyDetail.entity_status?.e_status_name || '—',
    corporateRegistrationNo: companyDetail.jurisdiction_corp_id
      || corporateIdentification?.number
      || identification.id_number
      || '—',
    appointmentDate: dateRecord.appointment_date || '',
    cessationDate: dateRecord.ceased_date || '',
    appointmentStage: Number(dateRecord.is_appt_proposed) === 1 ? 'Proposed' : 'Effective',
    cessationStage: Number(dateRecord.is_ceased_proposed) === 1 ? 'Proposed' : 'Effective',
    status: ceased ? 'Ceased' : 'Active',
    entryDate: record.created_date || '',
  };
};

const getCompanyInfo = (record) => {
  const entity = record.entity || {};
  const registration = resolveCorporateIdentification({}, entity);
  return {
    id: record.entity_id,
    name: entity.name || '—',
    uen: registration.number !== '—' ? registration.number : (entity.client_no || '—'),
  };
};

const groupByCompany = (records) => {
  const groups = new Map();
  records.forEach((record) => {
    const key = String(record.entity_id || 'unknown');
    if (!groups.has(key)) groups.set(key, { company: getCompanyInfo(record), records: [] });
    groups.get(key).records.push(record);
  });
  return [...groups.values()].sort((a, b) => a.company.name.localeCompare(b.company.name));
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const filenameDate = () => new Date().toISOString().slice(0, 10);

const filenamePart = (value) => String(value || 'entity')
  .trim()
  .replace(/[<>:"/\\|?*]/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^[-.]+|[-.]+$/g, '') || 'entity';

const packParticularPairs = (pairs) => {
  const rows = [];
  for (let index = 0; index < pairs.length; index += 3) {
    const cells = pairs.slice(index, index + 3).flatMap(([label, value]) => [label, value]);
    while (cells.length < 6) cells.push('');
    rows.push(cells);
  }
  return rows;
};

const OwnerRegister = () => {
  useCollapseSidebar();
  const navigate = useNavigate();
  const [savedRegisterState] = useState(loadOwnerRegisterState);
  const [companies, setCompanies] = useState([]);
  const [owners, setOwners] = useState([]);
  const [officialRecords, setOfficialRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState('');
  const [pdpaMode, setPdpaMode] = useState(savedRegisterState.pdpaMode === 'WITHOUT' ? 'WITHOUT' : 'WITH');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ...(savedRegisterState.filters || {}) });
  const [appliedFilters, setAppliedFilters] = useState(savedRegisterState.appliedFilters
    ? { ...EMPTY_FILTERS, ...savedRegisterState.appliedFilters }
    : null);
  const [tableSearch, setTableSearch] = useState(savedRegisterState.tableSearch || '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(Number(savedRegisterState.pageSize) || 10);
  const [selectedOwner, setSelectedOwner] = useState(null);

  document.title = 'Register of Owners | ASR CSS';

  const fetchRegisterData = useCallback(async () => {
    setLoading(true);
    try {
      const [companyResponse, ownerResponse, officialResponse] = await Promise.all([
        getCompanyList({ page: 1, limit: 1000, sort: 'name', order: 'ASC' }),
        getOfficialList({
          page: 1,
          limit: 2000,
          official_master_slug: 'owners',
          is_ref_id: 0,
          order: 'created_date:DESC',
        }),
        getOfficialList({
          page: 1,
          limit: 2000,
          is_ref_id: 0,
          order: 'created_date:DESC',
        }),
      ]);
      setCompanies(unwrapList(companyResponse));
      setOwners(unwrapList(ownerResponse));
      setOfficialRecords(unwrapList(officialResponse));
    } catch (error) {
      setCompanies([]);
      setOwners([]);
      setOfficialRecords([]);
      toast.error(typeof error === 'string' ? error : 'Unable to load the owners register');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRegisterData(); }, [fetchRegisterData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!appliedFilters) {
      window.sessionStorage.removeItem(OWNER_REGISTER_STATE_KEY);
      return;
    }
    window.sessionStorage.setItem(OWNER_REGISTER_STATE_KEY, JSON.stringify({
      pdpaMode,
      filters,
      appliedFilters,
      tableSearch,
      pageSize,
    }));
  }, [pdpaMode, filters, appliedFilters, tableSearch, pageSize]);

  const companyOptions = useMemo(() => companies.map((company) => ({
    value: String(company.entity_id),
    label: company.name,
    caption: company.client_no,
  })), [companies]);

  const ownerPositionsByEntity = useMemo(() => {
    const positions = new Map();

    officialRecords.forEach((record) => {
      const slug = String(record.official_master_slug || record.official_master?.official_master_slug || '').toLowerCase();
      if (!record.official_entity_id || slug === 'owners') return;

      const key = ownerRoleKey(record.entity_id, record.official_entity_id);
      const label = roleLabel(record);
      if (!key || !label) return;

      if (!positions.has(key)) positions.set(key, new Set());
      positions.get(key).add(label);
    });

    return new Map([...positions].map(([key, labels]) => [key, [...labels]]));
  }, [officialRecords]);

  const positionsForOwner = useCallback((record) => {
    const labels = ownerEntityIds(record)
      .flatMap((officialEntityId) => ownerPositionsByEntity.get(ownerRoleKey(record.entity_id, officialEntityId)) || []);
    return [...new Set(labels)];
  }, [ownerPositionsByEntity]);

  const filteredRows = useMemo(() => {
    if (!appliedFilters) return [];

    return owners.filter((record) => {
      const dates = mainDateOf(record);
      const info = getOwnerInfo(record, positionsForOwner(record));
      const dateValue = appliedFilters.dateBasis === 'CESSATION' ? dates.ceased_date : dates.appointment_date;
      const stage = appliedFilters.dateBasis === 'CESSATION'
        ? (Number(dates.is_ceased_proposed) === 1 ? 'PROPOSED' : 'EFFECTIVE')
        : (Number(dates.is_appt_proposed) === 1 ? 'PROPOSED' : 'EFFECTIVE');

      if (appliedFilters.companyId && String(record.entity_id) !== appliedFilters.companyId) return false;
      if (appliedFilters.status !== 'ALL' && info.status.toUpperCase() !== appliedFilters.status) return false;
      if (appliedFilters.recordStage !== 'ALL' && stage !== appliedFilters.recordStage) return false;
      if (appliedFilters.fromDate && (!dateValue || dateValue < appliedFilters.fromDate)) return false;
      if (appliedFilters.toDate && (!dateValue || dateValue > appliedFilters.toDate)) return false;

      if (tableSearch.trim()) {
        const needle = tableSearch.trim().toLowerCase();
        const haystack = [info.company, info.owner, info.clientNo, info.identificationNo, info.ownerPositionText, info.address, info.status]
          .join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [owners, appliedFilters, tableSearch, positionsForOwner]);

  useEffect(() => { setPage(1); }, [appliedFilters, tableSearch, pageSize]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const applySearch = () => {
    if (!filters.companyId) {
      toast.error('Please select an entity name before searching');
      return;
    }
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      toast.error('From date must be before or equal to To date');
      return;
    }
    setSearching(true);
    setAppliedFilters({ ...filters });
    setTimeout(() => setSearching(false), 250);
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters(null);
    setTableSearch('');
  };

  const ownerParticularRows = (record) => {
    const info = getOwnerInfo(record, positionsForOwner(record));
    const present = (value) => value || '—';
    const dated = (value) => value ? displayDate(value) : '—';

    if (info.ownerType === 'Corporate') {
      if (pdpaMode === 'WITHOUT') {
        return packParticularPairs([
          ['Full Name / Entity Name', info.owner],
          ['Register Number', info.identificationType],
          ['Date of Appointment', dated(info.appointmentDate)],
          ['Register Data', info.identificationNo],
          ['Date of Cessation', dated(info.cessationDate)],
          ['Date of Incorporation', dated(info.birthOrIncorpDate)],
          ['Jurisdiction / Country', info.jurisdiction],
          ['Entity Type', info.entityType],
          ['Company ID', info.companyId],
          ['FYE Date', dated(info.fyeDate)],
          ['Entity Status', info.entityStatus],
        ]);
      }

      return [
        ['Full Name / Entity Name', info.owner, 'Register Number', info.identificationType, 'Date of Appointment', dated(info.appointmentDate)],
        ['Registered Office', info.address, 'Register Data', info.identificationNo, 'Date of Cessation', dated(info.cessationDate)],
        ['Date of Incorporation', dated(info.birthOrIncorpDate), 'Jurisdiction / Country', info.jurisdiction, 'Entity Type', info.entityType],
        ['Email Address', info.email, 'Contact Number', info.companyPhone, 'Company ID', info.companyId],
        ['Office Number', info.office, 'FYE Date', dated(info.fyeDate), 'Entity Status', info.entityStatus],
      ];
    }

    if (pdpaMode === 'WITHOUT') {
      return packParticularPairs([
        ['Full Name / Entity Name', info.owner],
        ['Identification Type', info.identificationType],
        ['Date of Appointment', dated(info.appointmentDate)],
        ['Date of Cessation', dated(info.cessationDate)],
        ['Entry Date', dated(info.entryDate)],
        ['Status', info.status],
      ]);
    }

    return [
      ['Full Name / Entity Name', info.owner, 'Identification Type', info.identificationType, 'Date of Appointment', dated(info.appointmentDate)],
      ['Residential Address', present(info.address), 'Identification Value', present(info.identificationNo), 'Date of Cessation', dated(info.cessationDate)],
      ['Date of Birth', present(dated(info.birthOrIncorpDate)), 'Nationality / Country', present(info.nationality), 'ID Expiry Date', present(dated(info.identificationExpiry))],
      ['Email Address', present(info.email), 'Mobile Number', present(info.mobile), 'Telephone Number', present(info.telephone)],
      ['Office Number', present(info.office), 'Entry Date', dated(info.entryDate), 'Status', info.status],
    ];
  };

  const handlePdfDownload = () => {
    if (!appliedFilters) return toast.info('Search for an entity before downloading');
    if (!filteredRows.length) return toast.info('There are no owner records to export');
    setExporting('PDF');
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const companyGroups = groupByCompany(filteredRows);
      const generationDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      let isFirstPage = true;

      const drawCompanyHeader = (group, addPage = false) => {
        if (addPage) pdf.addPage('a4', 'landscape');
        pdf.setTextColor(20, 20, 20);
        pdf.setFont('times', 'bold');
        pdf.setFontSize(15);
        pdf.text('REGISTER OF OWNERS', 148.5, 17, { align: 'center' });
        pdf.setFont('times', 'normal');
        pdf.setFontSize(7.5);
        pdf.text(`Prepared as at ${generationDate}`, 148.5, 23, { align: 'center' });

        autoTable(pdf, {
          startY: 29,
          body: [[
            { content: `ENTITY NAME:  ${group.company.name}`, styles: { fontStyle: 'bold' } },
            { content: `UEN / REGISTRATION NO.:  ${group.company.uen}`, styles: { fontStyle: 'bold' } },
          ]],
          theme: 'grid',
          tableWidth: 277,
          margin: { left: 10, right: 10 },
          styles: { font: 'times', fontSize: 8.5, cellPadding: 3, lineColor: [25, 25, 25], lineWidth: 0.35, textColor: [20, 20, 20] },
          columnStyles: { 0: { cellWidth: 138.5 }, 1: { cellWidth: 138.5 } },
        });

        pdf.setFont('times', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(90, 90, 90);
        pdf.text(
          pdpaMode === 'WITH'
            ? 'CONFIDENTIAL — This copy contains personal particulars.'
            : 'PDPA-REDACTED COPY — Personal particulars are omitted.',
          10,
          pdf.lastAutoTable.finalY + 5,
        );
        return pdf.lastAutoTable.finalY + 10;
      };

      companyGroups.forEach((group) => {
        let cursorY = drawCompanyHeader(group, !isFirstPage);
        isFirstPage = false;

        group.records.forEach((record, ownerIndex) => {
          const info = getOwnerInfo(record, positionsForOwner(record));
          if (cursorY > 155) cursorY = drawCompanyHeader(group, true);

          pdf.setFillColor(238, 240, 244);
          pdf.rect(10, cursorY, 277, 7, 'F');
          pdf.setDrawColor(25, 25, 25);
          pdf.rect(10, cursorY, 277, 7);
          pdf.setTextColor(20, 20, 20);
          pdf.setFont('times', 'bold');
          pdf.setFontSize(8);
          pdf.text(`OWNER ${String(ownerIndex + 1).padStart(2, '0')}  —  ${info.owner.toUpperCase()}  (${info.ownerType.toUpperCase()})`, 13, cursorY + 4.7);

          autoTable(pdf, {
            startY: cursorY + 7,
            body: ownerParticularRows(record),
            theme: 'grid',
            tableWidth: 277,
            margin: { left: 10, right: 10, bottom: 16 },
            pageBreak: 'avoid',
            styles: { font: 'times', fontSize: 7.4, cellPadding: 2.2, minCellHeight: 8, valign: 'middle', lineColor: [25, 25, 25], lineWidth: 0.25, textColor: [20, 20, 20] },
            columnStyles: {
              0: { cellWidth: 31, fillColor: [247, 247, 247], fontStyle: 'bold' },
              1: { cellWidth: 61 },
              2: { cellWidth: 31, fillColor: [247, 247, 247], fontStyle: 'bold' },
              3: { cellWidth: 61 },
              4: { cellWidth: 31, fillColor: [247, 247, 247], fontStyle: 'bold' },
              5: { cellWidth: 62 },
            },
          });
          cursorY = pdf.lastAutoTable.finalY + 9;
        });
      });

      const totalPages = pdf.getNumberOfPages();
      for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
        pdf.setPage(pageNo);
        pdf.setDrawColor(175, 175, 175);
        pdf.line(10, 198, 287, 198);
        pdf.setFont('times', 'normal');
        pdf.setTextColor(90, 90, 90);
        pdf.setFontSize(7);
        pdf.text(`Generated by ASR CSS on ${generationDate}`, 10, 203);
        pdf.text(`Page ${pageNo} of ${totalPages}`, 287, 203, { align: 'right' });
      }
      const entityName = filenamePart(companyGroups[0]?.company.name);
      pdf.save(`register-of-owners-${entityName}-${filenameDate()}.pdf`);
      toast.success('Owners register PDF downloaded');
    } catch {
      toast.error('Unable to generate the PDF');
    } finally {
      setExporting('');
    }
  };

  const handleDocxDownload = async () => {
    if (!appliedFilters) return toast.info('Search for an entity before downloading');
    if (!filteredRows.length) return toast.info('There are no owner records to export');
    setExporting('DOCX');
    try {
      const companyGroups = groupByCompany(filteredRows);
      const generationDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const borders = {
        top: { style: BorderStyle.SINGLE, size: 5, color: '222222' },
        bottom: { style: BorderStyle.SINGLE, size: 5, color: '222222' },
        left: { style: BorderStyle.SINGLE, size: 5, color: '222222' },
        right: { style: BorderStyle.SINGLE, size: 5, color: '222222' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 5, color: '222222' },
        insideVertical: { style: BorderStyle.SINGLE, size: 5, color: '222222' },
      };
      const margins = { top: 90, right: 100, bottom: 90, left: 100 };
      // A4 landscape (16,838 twips) minus the 540-twip left/right page margins.
      // Explicit table grids are required for FIXED layouts; otherwise docx uses
      // 100 twips per grid column and Word collapses all but the first column.
      const contentWidth = 15758;
      const companyColumnWidths = [2206, 5673, 2836, 5043];
      const ownerColumnWidths = [1891, 3362, 1891, 3361, 1891, 3362];
      const cell = (text, { label = false, width, fill } = {}) => new TableCell({
        width: width ? { size: width, type: WidthType.DXA } : undefined,
        borders,
        margins,
        shading: label || fill ? { type: ShadingType.CLEAR, fill: fill || 'F3F4F6', color: 'auto' } : undefined,
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({
            text: text === null || text === undefined ? '—' : String(text),
            bold: label,
            size: label ? 18 : 17,
            color: '111111',
          })],
        })],
      });
      const companyTable = (group) => new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: companyColumnWidths,
        layout: TableLayoutType.FIXED,
        rows: [new TableRow({
          cantSplit: true,
          children: [
            cell('ENTITY NAME', { label: true, width: companyColumnWidths[0] }),
            cell(group.company.name, { width: companyColumnWidths[1] }),
            cell('UEN / REGISTRATION NO.', { label: true, width: companyColumnWidths[2] }),
            cell(group.company.uen, { width: companyColumnWidths[3] }),
          ],
        })],
      });
      const ownerTable = (record) => new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: ownerColumnWidths,
        layout: TableLayoutType.FIXED,
        rows: ownerParticularRows(record).map((row) => new TableRow({
          cantSplit: true,
          children: row.map((value, index) => cell(value, {
            label: index % 2 === 0,
            width: ownerColumnWidths[index],
          })),
        })),
      });

      const children = [];
      companyGroups.forEach((group, groupIndex) => {
        children.push(
          new Paragraph({
            pageBreakBefore: groupIndex > 0,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: 'REGISTER OF OWNERS', bold: true, size: 30, font: 'Times New Roman', color: '111111' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [new TextRun({ text: `Prepared as at ${generationDate}`, size: 17, italics: true, font: 'Times New Roman', color: '555555' })],
          }),
          companyTable(group),
          new Paragraph({
            spacing: { before: 100, after: 200 },
            children: [new TextRun({
              text: pdpaMode === 'WITH'
                ? 'CONFIDENTIAL — This copy contains personal particulars.'
                : 'PDPA-REDACTED COPY — Personal particulars are omitted.',
              italics: true, size: 16, color: '666666', font: 'Times New Roman',
            })],
          }),
        );

        group.records.forEach((record, ownerIndex) => {
          const info = getOwnerInfo(record, positionsForOwner(record));
          children.push(
            new Table({
              width: { size: contentWidth, type: WidthType.DXA },
              columnWidths: [contentWidth],
              layout: TableLayoutType.FIXED,
              rows: [new TableRow({
                cantSplit: true,
                children: [new TableCell({
                  width: { size: contentWidth, type: WidthType.DXA },
                  borders,
                  margins,
                  shading: { type: ShadingType.CLEAR, fill: 'E5E7EB', color: 'auto' },
                  children: [new Paragraph({
                    spacing: { before: 0, after: 0 },
                    children: [new TextRun({
                      text: `OWNER ${String(ownerIndex + 1).padStart(2, '0')} — ${info.owner.toUpperCase()} (${info.ownerType.toUpperCase()})`,
                      bold: true, size: 18, font: 'Times New Roman', color: '111111',
                    })],
                  })],
                })],
              })],
            }),
            ownerTable(record),
            new Paragraph({ spacing: { after: 220 }, children: [] }),
          );
        });
      });

      const doc = new Document({
        sections: [{
          properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, right: 540, bottom: 720, left: 540 } } },
          children,
        }],
      });
      const blob = await Packer.toBlob(doc);
      const entityName = filenamePart(companyGroups[0]?.company.name);
      downloadBlob(blob, `register-of-owners-${entityName}-${filenameDate()}.docx`);
      toast.success('Owners register DOCX downloaded');
    } catch {
      toast.error('Unable to generate the DOCX file');
    } finally {
      setExporting('');
    }
  };

  const selectedOwnerInfo = selectedOwner
    ? getOwnerInfo(selectedOwner, positionsForOwner(selectedOwner))
    : null;
  const selectedOwnerDetails = selectedOwner
    ? ownerParticularRows(selectedOwner).flatMap((row) => [0, 2, 4]
      .map((index) => ({ label: row[index], value: row[index + 1] }))
      .filter((item) => item.label))
    : [];

  return (
    <div className="page-content owner-register-page">
      <Container fluid>
        <BreadCrumb title="Register of Owners" pageTitle="Statutory Registers" />

        <section className="or-hero">
          <div className="or-hero-icon"><i className="ri-team-line" /></div>
          <div className="or-hero-copy">
            <h2>Register of Owners</h2>
            <p>View current and historical ownership records.</p>
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
            <button type="button" className="or-reset-btn" onClick={resetFilters}><i className="ri-refresh-line" /> Reset filters</button>
          </div>

          <div className="or-filter-grid">
            <div className="or-field or-span-2">
              <label>Entity <span className="text-danger">*</span></label>
              <Select
                isClearable
                isSearchable
                styles={selectStyles}
                options={companyOptions}
                value={companyOptions.find((item) => item.value === filters.companyId) || null}
                onChange={(option) => setFilters((current) => ({ ...current, companyId: option?.value || '' }))}
                placeholder="Select entity name"
                formatOptionLabel={(option) => <div className="or-option"><span>{option.label}</span>{option.caption && <small>{option.caption}</small>}</div>}
              />
            </div>
            <div className="or-field">
              <label>Date basis</label>
              <select value={filters.dateBasis} onChange={(event) => setFilters((current) => ({ ...current, dateBasis: event.target.value }))}>
                <option value="APPOINTMENT">Appointment date</option>
                <option value="CESSATION">Cessation date</option>
              </select>
            </div>
            <div className="or-field">
              <label>From date</label>
              <DatePickerInput value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} placeholder="DD/MM/YYYY" />
            </div>
            <div className="or-field">
              <label>To date</label>
              <DatePickerInput value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} placeholder="DD/MM/YYYY" />
            </div>
            <div className="or-field">
              <label>Status</label>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="CEASED">Ceased</option>
              </select>
            </div>
            <div className="or-field">
              <label>Record stage</label>
              <select value={filters.recordStage} onChange={(event) => setFilters((current) => ({ ...current, recordStage: event.target.value }))}>
                <option value="ALL">All stages</option>
                <option value="EFFECTIVE">Effective</option>
                <option value="PROPOSED">Proposed</option>
              </select>
            </div>
            <div className="or-filter-action">
              <button type="button" className="or-search-btn" onClick={applySearch} disabled={loading || searching}>
                {searching ? <Spinner size="sm" /> : <i className="ri-search-2-line" />}
                Search
              </button>
            </div>
            <div className="or-filter-downloads">
              <button type="button" className="or-inline-export pdf" onClick={handlePdfDownload} disabled={loading || Boolean(exporting) || !appliedFilters || filteredRows.length === 0}>
                {exporting === 'PDF' ? <Spinner size="sm" /> : <i className="ri-file-pdf-2-line" />}
                Download PDF
              </button>
              <button type="button" className="or-inline-export docx" onClick={handleDocxDownload} disabled={loading || Boolean(exporting) || !appliedFilters || filteredRows.length === 0}>
                {exporting === 'DOCX' ? <Spinner size="sm" /> : <i className="ri-file-word-2-line" />}
                Download DOCX
              </button>
            </div>
          </div>
        </section>

        <section className="or-results-card">
          <div className="or-results-toolbar">
            <div className="or-results-heading">
              <h5>Owner Records</h5>
              <span>{!appliedFilters ? 'Search to view records' : loading ? 'Loading…' : `${filteredRows.length} record${filteredRows.length === 1 ? '' : 's'}`}</span>
            </div>
            <div className="or-table-tools">
              <div className="or-table-search"><i className="ri-search-line" /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Search owners..." /></div>
              <label>Show
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="or-table-wrap">
            <table className="or-table">
              <thead><tr>
                <th>Entity</th><th>Owner</th><th>Type</th>
                {pdpaMode === 'WITH' && <th>Identification</th>}
                <th>Owner Position</th>
                {pdpaMode === 'WITH' && <><th>Nationality / DOB</th><th>Address</th></>}
                <th>Appointment</th><th>Cessation</th><th>Status</th><th className="or-actions-heading">Actions</th>
              </tr></thead>
              <tbody>
                {!appliedFilters ? (
                  <tr><td colSpan={pdpaMode === 'WITH' ? 11 : 8}><div className="or-empty"><span><i className="ri-search-2-line" /></span><h5>Search to view owner records</h5><p>Select an entity and click Search.</p></div></td></tr>
                ) : loading ? [...Array(6)].map((_, index) => (
                  <tr key={index} className="or-skeleton-row">{[...Array(pdpaMode === 'WITH' ? 11 : 8)].map((__, cell) => <td key={cell}><span /></td>)}</tr>
                )) : pagedRows.length === 0 ? (
                  <tr><td colSpan={pdpaMode === 'WITH' ? 11 : 8}><div className="or-empty"><span><i className="ri-file-search-line" /></span><h5>No owner records found</h5><p>Adjust the register filters and try your search again.</p></div></td></tr>
                ) : pagedRows.map((record) => {
                  const info = getOwnerInfo(record, positionsForOwner(record));
                  const ownerEditPath = `/officials/${record.official_master_slug || 'owners'}/edit/${record.official_id}`;
                  return <tr key={record.official_id}>
                    <td><div className="or-company-cell"><div><strong>{info.company}</strong><small>{record.entity?.client_no || 'Entity'}</small></div></div></td>
                    <td><div className="or-owner-cell"><strong>{info.owner}</strong>{info.clientNo && <small>{info.clientNo}</small>}</div></td>
                    <td><span className={`or-type-badge ${info.ownerType.toLowerCase()}`}><i className={info.ownerType === 'Corporate' ? 'ri-building-line' : info.ownerType === 'Joint' ? 'ri-group-line' : 'ri-user-line'} />{info.ownerType}</span></td>
                    {pdpaMode === 'WITH' && <td><div className="or-detail-cell"><small>{info.identificationType}</small><strong>{info.identificationNo}</strong></div></td>}
                    <td>
                      {info.ownerPositions.length > 0
                        ? <div className="or-position-tags">{info.ownerPositions.map((position) => <span key={position}>{position}</span>)}</div>
                        : <span className="or-no-position">—</span>}
                    </td>
                    {pdpaMode === 'WITH' && <>
                      <td><div className="or-detail-cell"><strong>{info.nationality}</strong><small>{info.birthOrIncorpDate ? displayDate(info.birthOrIncorpDate) : 'Date not recorded'}</small></div></td>
                      <td><span className="or-address" title={info.address}>{info.address}</span></td>
                    </>}
                    <td><div className="or-date-cell"><strong>{displayDate(info.appointmentDate)}</strong><small className={info.appointmentStage.toLowerCase()}>{info.appointmentStage}</small></div></td>
                    <td><div className="or-date-cell"><strong>{displayDate(info.cessationDate)}</strong>{info.cessationDate && <small className={info.cessationStage.toLowerCase()}>{info.cessationStage}</small>}</div></td>
                    <td><span className={`or-status ${info.status.toLowerCase()}`}><i />{info.status}</span></td>
                    <td className="or-actions-cell">
                      <button type="button" className="or-action-button" title="View owner" aria-label={`View ${info.owner}`} onClick={() => setSelectedOwner(record)}>
                        <i className="ri-eye-line" />
                      </button>
                      <button type="button" className="or-action-button" title="Edit owner record" aria-label={`Edit ${info.owner}`} onClick={() => navigate(ownerEditPath)}>
                        <i className="ri-edit-line" />
                      </button>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          {!loading && filteredRows.length > 0 && <div className="or-pagination">
            <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}</span>
            <Pagination total={filteredRows.length} currentPage={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => setPageSize(size)} />
          </div>}
        </section>
      </Container>

      <Modal isOpen={Boolean(selectedOwner)} toggle={() => setSelectedOwner(null)} centered size="lg" className="or-owner-modal">
        <ModalHeader toggle={() => setSelectedOwner(null)}>
          <div className="or-modal-title">
            <span>Owner Details</span>
            <small>{selectedOwnerInfo?.company} · {selectedOwner?.entity?.client_no || 'Entity'}</small>
          </div>
        </ModalHeader>
        <ModalBody>
          {selectedOwnerInfo && <>
            <div className="or-modal-summary">
              <div className="or-modal-owner-icon"><i className={selectedOwnerInfo.ownerType === 'Corporate' ? 'ri-building-line' : selectedOwnerInfo.ownerType === 'Joint' ? 'ri-group-line' : 'ri-user-line'} /></div>
              <div className="or-modal-owner-name">
                <strong>{selectedOwnerInfo.owner}</strong>
                <span>{selectedOwnerInfo.clientNo || selectedOwnerInfo.ownerType}</span>
              </div>
              <span className={`or-type-badge ${selectedOwnerInfo.ownerType.toLowerCase()}`}>{selectedOwnerInfo.ownerType}</span>
              <span className={`or-status ${selectedOwnerInfo.status.toLowerCase()}`}><i />{selectedOwnerInfo.status}</span>
            </div>
            {pdpaMode === 'WITHOUT' && <div className="or-modal-pdpa-note"><i className="ri-eye-off-line" />Personal particulars are omitted in Without PDPA mode.</div>}
            <div className="or-modal-details">
              {selectedOwnerDetails.map((item, index) => <div className="or-modal-detail" key={`${item.label}-${index}`}>
                <span>{item.label}</span>
                <strong>{item.value || '—'}</strong>
              </div>)}
            </div>
          </>}
        </ModalBody>
      </Modal>
    </div>
  );
};

export default OwnerRegister;
