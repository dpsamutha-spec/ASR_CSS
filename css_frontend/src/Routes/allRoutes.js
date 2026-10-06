import React from "react";
import { Navigate } from "react-router-dom";

//Dashboard
import DashboardEcommerce from "../pages/DashboardEcommerce";
import PortfolioDashboard from "../pages/Dashboards/PortfolioDashboard";

//Settings
import Settings from "../pages/Settings";

//Company
import Company from '../pages/Company';
import CompanyList from '../pages/Company/CompanyList';
import CompanyView from '../pages/Company/CompanyView';

//Shares
import EntitySharesPage           from '../pages/Shares/EntitySharesPage';
import ShareholderSharesListPage  from '../pages/Shares/ShareholderSharesListPage';
import ShareAllotmentPage         from '../pages/Shares/ShareAllotmentPage';
import SharePaymentsPage          from '../pages/Shares/SharePaymentsPage';
import ShareTransferPage          from '../pages/Shares/ShareTransferPage';
import ShareDissolvePage          from '../pages/Shares/ShareDissolvePage';
import ShareCancelPage            from '../pages/Shares/ShareCancelPage';
import ShareBuybackPage           from '../pages/Shares/ShareBuybackPage';
import ShareReplacementPage       from '../pages/Shares/ShareReplacementPage';
import ShareSplitPage             from '../pages/Shares/ShareSplitPage';
import ShareCombinePage           from '../pages/Shares/ShareCombinePage';
import ShareReclassificationPage  from '../pages/Shares/ShareReclassificationPage';

//Individual
import Individual from '../pages/Individual';
import IndividualList from '../pages/Individual/IndividualList';
import IndividualView from '../pages/Individual/IndividualView';
import ReportWorkspace from '../pages/Reports';

// Permission route guard
import PermissionRoute from '../Components/Common/PermissionRoute';

//Officials
import Officials from '../pages/Officials';
import OfficialFormPage from '../pages/Officials/OfficialFormPage';
import OfficialListPage from '../pages/Officials/OfficialListPage';
import SubOfficialListPage from '../pages/Officials/SubOfficialListPage';
import SubOfficialFormPage from '../pages/Officials/SubOfficialFormPage';

//User Management
import UsersPage      from '../pages/UserManagement/UsersPage';
import UserGroupsPage from '../pages/UserManagement/UserGroupsPage';

//Form Builder
import FormBuilderTemplateList      from '../pages/FormBuilder/FormBuilderTemplateList';
import FormBuilderTemplate     from '../pages/FormBuilder/FormBuilderTemplate';
import FormBuilderInstructions from '../pages/FormBuilder/FormBuilderInstructions';
import ShortcodeLibrary     from '../pages/FormBuilder/ShortcodeLibrary';

//Charges
import RegisterChargeList from '../pages/Charges/RegisterChargeList';
import RegisterChargeForm from '../pages/Charges/RegisterChargeForm';
import RegisterChargeView from '../pages/Charges/RegisterChargeView';

//Statutory Registers
import StatutoryRegisterRoute from '../pages/StatutoryRegisters/StatutoryRegisterRoute';

//Compliance
import ComplianceList from '../pages/Compliance/ComplianceList';
import EventList from '../pages/Compliance/EventList';
import EventForm from '../pages/Compliance/EventForm';
import MultiEventCreate from '../pages/Compliance/MultiEventCreate';
import ReminderEventList from '../pages/Compliance/ReminderEventList';
import ReminderLogList from '../pages/Compliance/ReminderLogList';
import ReminderLogDetails from '../pages/Compliance/ReminderLogDetails';
import ReminderCronPage from '../pages/Compliance/ReminderCronPage';
import DueDateTracker from '../pages/Compliance/DueDateTracker';
import ComplianceSystemGuide from '../pages/Compliance/ComplianceSystemGuide';

//AuthenticationInner pages
import BasicSignIn from '../pages/AuthenticationInner/Login/BasicSignIn';
import CoverSignIn from '../pages/AuthenticationInner/Login/CoverSignIn';
import BasicSignUp from '../pages/AuthenticationInner/Register/BasicSignUp';
import CoverSignUp from "../pages/AuthenticationInner/Register/CoverSignUp";
import BasicPasswReset from '../pages/AuthenticationInner/PasswordReset/BasicPasswReset';
import CoverPasswReset from '../pages/AuthenticationInner/PasswordReset/CoverPasswReset';
import BasicLockScreen from '../pages/AuthenticationInner/LockScreen/BasicLockScr';
import CoverLockScreen from '../pages/AuthenticationInner/LockScreen/CoverLockScr';
import BasicLogout from '../pages/AuthenticationInner/Logout/BasicLogout';
import CoverLogout from '../pages/AuthenticationInner/Logout/CoverLogout';
import BasicSuccessMsg from '../pages/AuthenticationInner/SuccessMessage/BasicSuccessMsg';
import CoverSuccessMsg from '../pages/AuthenticationInner/SuccessMessage/CoverSuccessMsg';
import BasicTwosVerify from '../pages/AuthenticationInner/TwoStepVerification/BasicTwosVerify';
import CoverTwosVerify from '../pages/AuthenticationInner/TwoStepVerification/CoverTwosVerify';
import Basic404 from '../pages/AuthenticationInner/Errors/Basic404';
import Cover404 from '../pages/AuthenticationInner/Errors/Cover404';
import Alt404 from '../pages/AuthenticationInner/Errors/Alt404';
import Error500 from '../pages/AuthenticationInner/Errors/Error500';

import BasicPasswCreate from "../pages/AuthenticationInner/PasswordCreate/BasicPasswCreate";
import CoverPasswCreate from "../pages/AuthenticationInner/PasswordCreate/CoverPasswCreate";
import Offlinepage from "../pages/AuthenticationInner/Errors/Offlinepage";

//APi Key
import APIKey from "../pages/APIKey/index";

//login
import Login from "../pages/Authentication/Login";
import ForgetPasswordPage from "../pages/Authentication/ForgetPassword";
import Logout from "../pages/Authentication/Logout";
import Register from "../pages/Authentication/Register";


// User Profile
import UserProfile from "../pages/Authentication/user-profile";
import SimplePage from '../pages/Pages/Profile/SimplePage/SimplePage';


const authProtectedRoutes = [
  //Dashboard
  { path: "/index", component: <DashboardEcommerce /> },
  { path: "/dashboard", component: <DashboardEcommerce /> },
  { path: "/dashboard/portfolio", component: <PortfolioDashboard /> },
  

  //Settings 
  { path: "/settings", component: <Settings /> },

  //Entities
  { path: '/company/list',              component: <CompanyList /> },
  { path: '/company/add',               component: <Company /> },
  { path: '/company/edit/:entity_id',   component: <Company /> },
  { path: '/company/view/:entity_id',   component: <CompanyView /> },
  { path: '/company/:entity_id/shares',                              component: <EntitySharesPage /> },
  { path: '/company/:entity_id/shares/shareholder-register',        component: <ShareholderSharesListPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/add',      component: <ShareAllotmentPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/payments/:txn_id', component: <SharePaymentsPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/transfer/:txn_id', component: <ShareTransferPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/transfer',         component: <ShareTransferPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/dissolve',         component: <ShareDissolvePage /> },
  { path: '/company/:entity_id/shares/shareholder-register/cancel',           component: <ShareCancelPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/buyback',          component: <ShareBuybackPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/replacement',      component: <ShareReplacementPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/split',            component: <ShareSplitPage /> },
  { path: '/company/:entity_id/shares/shareholder-register/combine',          component: <ShareCombinePage /> },
  { path: '/company/:entity_id/shares/shareholder-register/reclassification', component: <ShareReclassificationPage /> },

  //Charges
  { path: '/entity/register-charges-list',   component: <RegisterChargeList /> },
  { path: '/entity/register-charges-create',   component: <RegisterChargeForm /> },
  { path: '/entity/register-charges-update/:id',   component: <RegisterChargeForm /> },
  { path: '/entity/register-charges-view/:id',   component: <RegisterChargeView /> },

  //Statutory Registers
  { path: '/statutory_register/:registerSlug', component: <StatutoryRegisterRoute /> },

  //Compliance
  { path: '/compliance/events', component: <ComplianceList /> },
  { path: '/compliance/multi-event/create', component: <MultiEventCreate /> },
  { path: '/compliance/events/list', component: <EventList /> },
  { path: '/compliance/events/company/:companyId', component: <EventList /> },
  { path: '/compliance/events-create', component: <EventForm /> },
  { path: '/compliance/events/company/:companyId/create', component: <EventForm /> },
  { path: '/compliance/events-update/:id', component: <EventForm /> },
  { path: '/compliance/due-date-tracker', component: <DueDateTracker /> },
  { path: '/compliance/system-guide', component: <ComplianceSystemGuide /> },
  { path: '/compliance/events-reminder', component: <ReminderEventList /> },
  { path: '/compliance/reminder-logs', component: <ReminderLogList /> },
  { path: '/compliance/reminder-logs/company/:companyId', component: <ReminderLogList /> },
  { path: '/compliance/reminder-logs/:logId', component: <ReminderLogDetails /> },
  { path: '/compliance/reminder-cron', component: <ReminderCronPage /> },

  { path: '/individuals',         component: <PermissionRoute module="individual" action="view"><IndividualList /></PermissionRoute> },
  { path: '/individual/add',      component: <PermissionRoute module="individual" action="create"><Individual /></PermissionRoute> },
  { path: '/individual/edit/:id', component: <PermissionRoute module="individual" action="edit"><Individual /></PermissionRoute> },
  { path: '/individual/:id',      component: <PermissionRoute module="individual" action="view"><IndividualView /></PermissionRoute> },

  // Reports
  { path: '/reports/:sectionKey/:reportKey', component: <ReportWorkspace /> },

  //Officials
  { path: '/officials/entity',                                                            component: <Officials /> },
  { path: '/officials/:slug/list',                                                        component: <OfficialListPage /> },
  { path: '/officials/:slug/add',                                                         component: <OfficialFormPage /> },
  { path: '/officials/:slug/edit/:official_id',                                           component: <OfficialFormPage /> },
  { path: '/officials/:parentSlug/:parentOfficialId/:childSlug',                          component: <SubOfficialListPage /> },
  { path: '/officials/:parentSlug/:parentOfficialId/:childSlug/add',                      component: <SubOfficialFormPage /> },
  { path: '/officials/:parentSlug/:parentOfficialId/:childSlug/edit/:official_id',        component: <SubOfficialFormPage /> },

  //User Management
  { path: '/user-management/users',       component: <UsersPage /> },
  { path: '/user-management/user-groups', component: <UserGroupsPage /> },

  //User Profile
  { path: "/profile", component: <SimplePage /> },
  { path: "/profile-1", component: <UserProfile /> },
  
    //Form Builder
  { path: '/form-builder/form-template',       component: <FormBuilderTemplateList /> },
  { path: '/form-builder/form-template/add',       component: <FormBuilderTemplate /> },
  { path: '/form-builder/form-template/:id',       component: <FormBuilderTemplate /> },
  { path: '/form-builder/instructions',       component: <FormBuilderInstructions /> },
  { path: '/form-builder/pop-up-field',       component: <Navigate to="/form-builder/instructions" replace /> },
  { path: '/form-builder/shortcode-library',       component: <ShortcodeLibrary /> },

  // this route should be at the end of all other routes
  // eslint-disable-next-line react/display-name
  {
    path: "/",
    exact: true,
    component: <Navigate to="/dashboard" />,
  },
  { path: "*", component: <Navigate to="/dashboard" /> },
];

const publicRoutes = [
  // Authentication Page
  { path: "/logout", component: <Logout /> },
  { path: "/login", component: <Login /> },
  { path: "/forgot-password", component: <ForgetPasswordPage /> },
  { path: "/register", component: <Register /> },

  //AuthenticationInner pages
  { path: "/auth-signin-basic", component: <BasicSignIn /> },
  { path: "/auth-signin-cover", component: <CoverSignIn /> },
  { path: "/auth-signup-basic", component: <BasicSignUp /> },
  { path: "/auth-signup-cover", component: <CoverSignUp /> },
  { path: "/auth-pass-reset-basic", component: <BasicPasswReset /> },
  { path: "/auth-pass-reset-cover", component: <CoverPasswReset /> },
  { path: "/auth-lockscreen-basic", component: <BasicLockScreen /> },
  { path: "/auth-lockscreen-cover", component: <CoverLockScreen /> },
  { path: "/auth-logout-basic", component: <BasicLogout /> },
  { path: "/auth-logout-cover", component: <CoverLogout /> },
  { path: "/auth-success-msg-basic", component: <BasicSuccessMsg /> },
  { path: "/auth-success-msg-cover", component: <CoverSuccessMsg /> },
  { path: "/auth-twostep-basic", component: <BasicTwosVerify /> },
  { path: "/auth-twostep-cover", component: <CoverTwosVerify /> },
  { path: "/auth-404-basic", component: <Basic404 /> },
  { path: "/auth-404-cover", component: <Cover404 /> },
  { path: "/auth-404-alt", component: <Alt404 /> },
  { path: "/auth-500", component: <Error500 /> },
  


  { path: "/auth-pass-change-basic", component: <BasicPasswCreate /> },
  { path: "/auth-pass-change-cover", component: <CoverPasswCreate /> },
  { path: "/auth-offline", component: <Offlinepage /> },

];

export { authProtectedRoutes, publicRoutes };

