import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import OwnerRegister from './OwnerRegister';
import DirectorRegister from './DirectorRegister';
import StatutoryRegisterShell from './StatutoryRegisterShell';

const APPOINTMENT_DATES = [
  { value: 'APPOINTMENT', label: 'Appointment date' },
  { value: 'CESSATION', label: 'Cessation date' },
];

const REGISTER_CONFIG = {
  shareholders: {
    title: 'Register of Members',
    description: 'View current and historical member records.',
    icon: 'ri-stock-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  controllers: {
    title: 'Register of Controllers',
    description: 'View current and historical controller records.',
    icon: 'ri-user-settings-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  'nominee-shareholders': {
    title: 'Register of Nominee Shareholders',
    description: 'View current and historical nominee shareholder records.',
    icon: 'ri-user-shared-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  'nominee-and-trustees': {
    title: 'Register of Nominees & Trustees',
    description: 'View current and historical nominee and trustee records.',
    icon: 'ri-group-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  directors: {
    slug: 'directors',
    recordLabel: 'Director',
    title: 'Register of Directors',
    description: 'View current and historical director records.',
    icon: 'ri-user-star-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  'nominee-directors': {
    title: 'Register of Nominee Directors',
    description: 'View current and historical nominee director records.',
    icon: 'ri-user-follow-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  secretaries: {
    title: 'Register of Secretaries',
    description: 'View current and historical secretary records.',
    icon: 'ri-file-user-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  ceos: {
    title: 'Register of CEOs',
    description: 'View current and historical chief executive officer records.',
    icon: 'ri-user-voice-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  managers: {
    title: 'Register of Managers',
    description: 'View current and historical manager records.',
    icon: 'ri-briefcase-4-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  representatives: {
    title: 'Register of Representatives',
    description: 'View current and historical representative records.',
    icon: 'ri-contacts-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  agents: {
    title: 'Register of Agents',
    description: 'View current and historical agent records.',
    icon: 'ri-customer-service-2-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  'fund-managers': {
    title: 'Register of Fund Managers',
    description: 'View current and historical fund manager records.',
    icon: 'ri-funds-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  'data-protection-officers': {
    title: 'Register of Data Protection Officers',
    description: 'View current and historical data protection officer records.',
    icon: 'ri-shield-user-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  auditors: {
    title: 'Register of Auditors',
    description: 'View current and historical auditor records.',
    icon: 'ri-file-search-line',
    dateBasisOptions: APPOINTMENT_DATES,
  },
  'share-allotments': {
    title: 'Register of Share Allotments',
    description: 'View current and historical share allotment records.',
    icon: 'ri-pie-chart-line',
    dateBasisOptions: [{ value: 'ALLOTMENT', label: 'Allotment date' }],
  },
  'share-transfers': {
    title: 'Register of Share Transfers',
    description: 'View current and historical share transfer records.',
    icon: 'ri-arrow-left-right-line',
    dateBasisOptions: [{ value: 'TRANSFER', label: 'Transfer date' }],
  },
  'directors-interests': {
    title: "Register of Directors' Interests",
    description: 'View current and historical director interest records.',
    icon: 'ri-line-chart-line',
    dateBasisOptions: [{ value: 'TRANSACTION', label: 'Transaction date' }],
  },
  'ceos-interests': {
    title: "Register of CEOs' Interests",
    description: 'View current and historical CEO interest records.',
    icon: 'ri-bar-chart-grouped-line',
    dateBasisOptions: [{ value: 'TRANSACTION', label: 'Transaction date' }],
  },
  'allotments-by-transaction-date': {
    title: 'Register of Allotments by Transaction Date',
    description: 'View share allotments grouped by transaction date.',
    icon: 'ri-calendar-event-line',
    dateBasisOptions: [{ value: 'TRANSACTION', label: 'Transaction date' }],
  },
  charges: {
    title: 'Register of Charges',
    description: 'View current and historical charge records.',
    icon: 'ri-bank-card-line',
    dateBasisOptions: [
      { value: 'REGISTRATION', label: 'Registration date' },
      { value: 'SATISFACTION', label: 'Satisfaction date' },
    ],
  },
  sealings: {
    title: 'Register of Sealings',
    description: 'View current and historical company sealing records.',
    icon: 'ri-stamp-line',
    dateBasisOptions: [{ value: 'SEALING', label: 'Sealing date' }],
  },
  addresses: {
    title: 'Register of Addresses',
    description: 'View current and historical registered address records.',
    icon: 'ri-map-pin-line',
    dateBasisOptions: [{ value: 'EFFECTIVE', label: 'Effective date' }],
  },
};

const StatutoryRegisterRoute = () => {
  const { registerSlug } = useParams();

  if (registerSlug === 'owners') return <OwnerRegister />;
  // Directors has the same detailed register fields as Owners (position,
  // nationality/DOB, address and the detail view), so it cannot use the
  // condensed generic register shell.
  if (registerSlug === 'directors') return <DirectorRegister />;
  if (REGISTER_CONFIG[registerSlug]) {
    return <StatutoryRegisterShell key={registerSlug} config={REGISTER_CONFIG[registerSlug]} />;
  }

  return <Navigate to="/statutory_register/owners" replace />;
};

export default StatutoryRegisterRoute;
