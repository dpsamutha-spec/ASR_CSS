
/******* VALID URL ENDPOINTS */
// PORT - absolute path, no /:db prefix (uses base server URL directly)
export const PORT_RESOLVE = `${process.env.REACT_APP_API_URL}/port/resolve`;

//AUTH
export const LOGIN  = "/auth/login";
export const LOGOUT = "/auth/logout";

// Dashboard
export const DASHBOARD_RECENT_ACTIVITY = "/dashboard/recent-activity";
export const DASHBOARD_PORTFOLIO_OVERVIEW = "/dashboard/portfolio-overview";

// Theme Settings
export const THEME_SETTINGS_GET  = "/theme-settings/get";
export const THEME_SETTINGS_SAVE = "/theme-settings/save";


// Salutation
export const SALUTATION_CREATE = "/salutation/create";
export const SALUTATION_UPDATE = "/salutation/update";
export const SALUTATION_GET    = "/salutation/get";
export const SALUTATION_LIST   = "/salutation/list";
export const SALUTATION_DELETE = "/salutation/delete";

// Region
export const REGION_CREATE = "/region-master/create";
export const REGION_UPDATE = "/region-master/update";
export const REGION_GET    = "/region-master/get";
export const REGION_LIST   = "/region-master/list";
export const REGION_DELETE = "/region-master/delete";

// Jurisdiction
export const JURISDICTION_CREATE = "/jurisdiction/create";
export const JURISDICTION_UPDATE = "/jurisdiction/update";
export const JURISDICTION_GET    = "/jurisdiction/get";
export const JURISDICTION_LIST   = "/jurisdiction/list";
export const JURISDICTION_DELETE = "/jurisdiction/delete";

// Authority
export const AUTHORITY_CREATE = "/authority/create";
export const AUTHORITY_UPDATE = "/authority/update";
export const AUTHORITY_GET    = "/authority/get";
export const AUTHORITY_LIST   = "/authority/list";
export const AUTHORITY_DELETE = "/authority/delete";

// Member ID Type
export const MEMBER_ID_TYPE_CREATE = "/member-id-type/create";
export const MEMBER_ID_TYPE_UPDATE = "/member-id-type/update";
export const MEMBER_ID_TYPE_GET    = "/member-id-type/get";
export const MEMBER_ID_TYPE_LIST   = "/member-id-type/list";
export const MEMBER_ID_TYPE_DELETE = "/member-id-type/delete";

// Race Master
export const RACE_CREATE = "/race-master/create";
export const RACE_UPDATE = "/race-master/update";
export const RACE_GET    = "/race-master/get";
export const RACE_LIST   = "/race-master/list";
export const RACE_DELETE = "/race-master/delete";

// Tag Master
export const TAG_CREATE = "/tag/create";
export const TAG_UPDATE = "/tag/update";
export const TAG_GET = "/tag/get";
export const TAG_LIST = "/tag/list";
export const TAG_DELETE = "/tag/delete";

// To-Do Task
export const TODO_TASK_CREATE        = "/todo-task/create";
export const TODO_TASK_LIST          = "/todo-task/list";
export const TODO_TASK_UPDATE_STATUS = "/todo-task/update-status";
export const TODO_TASK_DELETE        = "/todo-task/delete";

// Softwares Master
export const SOFTWARE_CREATE = "/softwares/create";
export const SOFTWARE_UPDATE = "/softwares/update";
export const SOFTWARE_GET = "/softwares/get";
export const SOFTWARE_LIST = "/softwares/list";
export const SOFTWARE_DELETE = "/softwares/delete";

// CSS Status
export const CSS_STATUS_CREATE = "/css-status/create";
export const CSS_STATUS_UPDATE = "/css-status/update";
export const CSS_STATUS_GET = "/css-status/get";
export const CSS_STATUS_LIST = "/css-status/list";
export const CSS_STATUS_DELETE = "/css-status/delete";

// Group Master
export const GROUP_MASTER_CREATE = "/group-master/create";
export const GROUP_MASTER_UPDATE = "/group-master/update";
export const GROUP_MASTER_GET = "/group-master/get";
export const GROUP_MASTER_LIST = "/group-master/list";
export const GROUP_MASTER_DELETE = "/group-master/delete";

// Official Master
export const OFFICIAL_MASTER_CREATE = "/official-master/create";
export const OFFICIAL_MASTER_UPDATE = "/official-master/update";
export const OFFICIAL_MASTER_CONFIG_UPDATE = "/official-master/save-config";
export const OFFICIAL_MASTER_GET = "/official-master/get";
export const OFFICIAL_MASTER_LIST = "/official-master/list";
export const OFFICIAL_MASTER_DELETE = "/official-master/delete";

// Company Type
export const COMPANY_TYPE_CREATE = "/company-type/create";
export const COMPANY_TYPE_UPDATE = "/company-type/update";
export const COMPANY_TYPE_GET = "/company-type/get";
export const COMPANY_TYPE_LIST = "/company-type/list";
export const COMPANY_TYPE_DELETE = "/company-type/delete";

// Company Segregation
export const COMPANY_SEGREGATION_CREATE = "/company-segregation/create";
export const COMPANY_SEGREGATION_UPDATE = "/company-segregation/update";
export const COMPANY_SEGREGATION_GET = "/company-segregation/get";
export const COMPANY_SEGREGATION_LIST = "/company-segregation/list";
export const COMPANY_SEGREGATION_DELETE = "/company-segregation/delete";

// Business Entity
export const BUSINESS_ENTITY_CREATE = "/business-entity/create";
export const BUSINESS_ENTITY_UPDATE = "/business-entity/update";
export const BUSINESS_ENTITY_GET = "/business-entity/get";
export const BUSINESS_ENTITY_LIST = "/business-entity/list";
export const BUSINESS_ENTITY_DELETE = "/business-entity/delete";

// Related Industry
export const RELATED_INDUSTRY_CREATE = "/related-industry/create";
export const RELATED_INDUSTRY_UPDATE = "/related-industry/update";
export const RELATED_INDUSTRY_GET = "/related-industry/get";
export const RELATED_INDUSTRY_LIST = "/related-industry/list";
export const RELATED_INDUSTRY_DELETE = "/related-industry/delete";

// Company SSIC Code
export const COMPANY_SSIC_CODE_CREATE = "/company-ssic-code/create";
export const COMPANY_SSIC_CODE_UPDATE = "/company-ssic-code/update";
export const COMPANY_SSIC_CODE_GET = "/company-ssic-code/get";
export const COMPANY_SSIC_CODE_LIST = "/company-ssic-code/list";
export const COMPANY_SSIC_CODE_DELETE = "/company-ssic-code/delete";

// CORP SEC TYPE
export const CORP_SEC_TYPE_CREATE="/corp-sec-type/create";
export const CORP_SEC_TYPE_UPDATE="/corp-sec-type/update";
export const CORP_SEC_TYPE_GET="/corp-sec-type/get";
export const CORP_SEC_TYPE_LIST="/corp-sec-type/list";
export const CORP_SEC_TYPE_DELETE="/corp-sec-type/delete";

// ENTITY SERVICE CATEGORY
export const ENTITY_SERVICE_CATEGORY_CREATE="/entity-service-category/create";
export const ENTITY_SERVICE_CATEGORY_UPDATE="/entity-service-category/update";
export const ENTITY_SERVICE_CATEGORY_GET="/entity-service-category/get";
export const ENTITY_SERVICE_CATEGORY_LIST="/entity-service-category/list";
export const ENTITY_SERVICE_CATEGORY_DELETE="/entity-service-category/delete";

// COMPANY EVENT NAME
export const COMPANY_EVENT_NAME_CREATE="/company-event-name/create";
export const COMPANY_EVENT_NAME_UPDATE="/company-event-name/update";
export const COMPANY_EVENT_NAME_GET="/company-event-name/get";
export const COMPANY_EVENT_NAME_LIST="/company-event-name/list";
export const COMPANY_EVENT_NAME_DELETE="/company-event-name/delete";
export const DOCUMENT_CHECKLIST_TEMPLATE_LIST="/company-event-name/checklist";
export const DOCUMENT_CHECKLIST_TEMPLATE_SAVE="/company-event-name/checklist/save";

// COMPANY EVENT
export const COMPANY_EVENT_LIST="/event/list";
export const COMPANY_EVENT_GET="/event/get";
export const COMPANY_EVENT_CREATE="/event/create";
export const COMPANY_EVENT_CREATE_MULTIPLE="/event/create-multiple";
export const COMPANY_EVENT_UPDATE="/event/update";
export const COMPANY_EVENT_EXTEND="/event/extend";
export const COMPANY_EVENT_CANCEL_EXTENSION="/event/cancel-extension";
export const COMPANY_EVENT_UPDATE_STATUS="/event/status";
export const COMPANY_EVENT_DISPENSE="/event/dispense";
export const COMPANY_EVENT_CANCEL_DISPENSE="/event/cancel-dispense";
export const COMPANY_EVENT_EXTENSION_LOGS="/event/extension-logs";
export const COMPANY_EVENT_EXEMPT="/event/exempt";
export const COMPANY_EVENT_CANCEL_EXEMPT="/event/cancel-exempt";
export const COMPANY_EVENT_DELETE="/event/delete";
export const COMPANY_EVENT_VALIDATE_FYE="/event";
export const COMPANY_EVENT_SYNC="/event";
export const COMPANY_EVENT_DETAILS="/event";
export const COMPANY_EVENT_CALCULATION_TRACE="/event/calculation-trace";
export const COMPANY_EVENT_REQUEST_EXTENSION="/event/request-extension";
export const COMPANY_EVENT_REQUEST_WAIVER="/event/request-waiver";
export const COMPANY_EVENT_CANCEL_WAIVER="/event/cancel-waiver";
export const COMPANY_EVENT_EXTENSIONS="/event/extensions";
export const COMPANY_EVENT_WAIVERS="/event/waivers";
export const COMPANY_EVENT_DOCUMENTS="/event/documents";
export const COMPANY_EVENT_DOCUMENT_STATUS="/event/document-status";

// COMPANY EVENT RULE
export const COMPANY_EVENT_RULE_LIST="/event/rules";
export const COMPANY_EVENT_RULE_SAVE="/event/rules/save";
export const COMPANY_EVENT_RULE_DELETE="/event/rules/delete";
export const COMPANY_EVENT_RULE_VERSIONS="/event/rules/versions";
export const COMPANY_EVENT_RULE_SUBMIT="/event/rules/submit";
export const COMPANY_EVENT_RULE_APPROVE="/event/rules/approve";
export const COMPANY_EVENT_RULE_PUBLISH="/event/rules/publish";
export const COMPANY_EVENT_RULE_RETIRE="/event/rules/retire";

// SHARE CLASS MASTER
export const SHARE_CLASS_MASTER_CREATE="/share-class-master/create";
export const SHARE_CLASS_MASTER_UPDATE="/share-class-master/update";
export const SHARE_CLASS_MASTER_GET="/share-class-master/get";
export const SHARE_CLASS_MASTER_LIST="/share-class-master/list";
export const SHARE_CLASS_MASTER_DELETE="/share-class-master/delete";

// TypeOfFee
export const TYPE_OF_FEE_CREATE="/type-of-fee/create";
export const TYPE_OF_FEE_UPDATE="/type-of-fee/update";
export const TYPE_OF_FEE_GET="/type-of-fee/get";
export const TYPE_OF_FEE_LIST="/type-of-fee/list";
export const TYPE_OF_FEE_DELETE="/type-of-fee/delete";

// TransactionType
export const TRANSACTION_TYPE_CREATE="/transaction-type/create";
export const TRANSACTION_TYPE_UPDATE="/transaction-type/update";
export const TRANSACTION_TYPE_GET="/transaction-type/get";
export const TRANSACTION_TYPE_LIST="/transaction-type/list";
export const TRANSACTION_TYPE_DELETE="/transaction-type/delete";

// Template Category
export const TEMPLATE_CATEGORY_CREATE = "/template-category/create";
export const TEMPLATE_CATEGORY_UPDATE = "/template-category/update";
export const TEMPLATE_CATEGORY_GET = "/template-category/get";
export const TEMPLATE_CATEGORY_LIST = "/template-category/list";
export const TEMPLATE_CATEGORY_DELETE = "/template-category/delete";

// Register Footer
export const REGISTER_FOOTER_CREATE = "/register-footer/create";
export const REGISTER_FOOTER_UPDATE = "/register-footer/update";
export const REGISTER_FOOTER_GET = "/register-footer/get";
export const REGISTER_FOOTER_LIST = "/register-footer/list";
export const REGISTER_FOOTER_DELETE = "/register-footer/delete";

// Countrys
export const COUNTRIES_GET = "/common/get_country";
export const COUNTRIES_LIST = "/common/country_list";


// Individual
export const INDIVIDUAL_CREATE                   = "/individual/create";
export const INDIVIDUAL_UPDATE                   = "/individual/update";
export const INDIVIDUAL_GET                      = "/individual/get";
export const INDIVIDUAL_LIST                     = "/individual/list";
export const INDIVIDUAL_DELETE                   = "/individual/delete";

export const INDIVIDUAL_IDENTIFICATION_CREATE    = "/individual";
export const INDIVIDUAL_IDENTIFICATION_UPDATE    = "/individual/identification/update";
export const INDIVIDUAL_IDENTIFICATION_DELETE    = "/individual/identification/delete";

export const INDIVIDUAL_ADDRESS_CREATE           = "/individual";
export const INDIVIDUAL_ADDRESS_UPDATE           = "/individual/address/update";
export const INDIVIDUAL_ADDRESS_DELETE           = "/individual/address/delete";

export const INDIVIDUAL_CONTACT_CREATE           = "/individual";
export const INDIVIDUAL_CONTACT_UPDATE           = "/individual/contact/update";
export const INDIVIDUAL_CONTACT_DELETE           = "/individual/contact/delete";

export const INDIVIDUAL_RELATIONSHIP_CREATE      = "/individual";
export const INDIVIDUAL_RELATIONSHIP_UPDATE      = "/individual/relationship/update";
export const INDIVIDUAL_RELATIONSHIP_DELETE      = "/individual/relationship/delete";

export const INDIVIDUAL_CHECK_NAME_GET                      = "/individual/check-individual-name";
export const INDIVIDUAL_CHECK_ID_NUMBER_GET                      = "/individual/check-id-number";
export const INDIVIDUAL_SAVE_FIELD_CHANGE_CREATE     = "/individual/entity-field-change";
export const INDIVIDUAL_FIELD_HISTORY_GET                      = "/individual/field-history";

// Company Entity
export const COMPANY_CREATE                = "/company/create";
export const COMPANY_UPDATE                = "/company/update";
export const COMPANY_GET                   = "/company/get";
export const COMPANY_LIST                  = "/company/list";
export const COMPANY_DELETE                = "/company/delete";
export const COMPANY_CHECK_NAME_GET        = "/company/check-entity-name";

export const COMPANY_ADDRESS_CREATE        = "/company";
export const COMPANY_ADDRESS_UPDATE        = "/company/address/update";
export const COMPANY_ADDRESS_DELETE        = "/company/address/delete";

export const COMPANY_CONTACT_CREATE        = "/company";
export const COMPANY_CONTACT_UPDATE        = "/company/contact/update";
export const COMPANY_CONTACT_DELETE        = "/company/contact/delete";

//CompanyProfile
export const COMPANY_PROFILE_UPDATE = "/company-profile/update";
export const COMPANY_PROFILE_GET = "/company-profile/get";
export const COMPANY_PROFILE_ADDRESS_HISTORY_CREATE = "/company-profile/address-create";
export const COMPANY_PROFILE_ADDRESS_HISTORY_GET = "/company-profile/address-history";
export const COMPANY_PROFILE_ADDRESS_HISTORY_DELETE = "/company-profile/address-history-delete";

// Document Store - shared upload/list/delete for all modules
export const DOCUMENT_STORE_LIST = "/document-store";
export const DOCUMENT_STORE_UPLOAD = "/document-store/upload";
export const DOCUMENT_STORE_UPLOAD_MULTIPLE = "/document-store/upload-multiple";
export const DOCUMENT_STORE_GET = "/document-store";
export const DOCUMENT_STORE_STATS = "/document-store/stats";

export const COMPANY_SAVE_FIELD_CHANGE_CREATE     = "/company/entity-field-change";
export const COMPANY_FIELD_HISTORY_GET                      = "/company/field-history";

// User
export const USER_LIST   = "/user/list";
export const USER_CREATE = "/user/create";
export const USER_UPDATE = "/user/update";
export const USER_DELETE = "/user/delete";

// User Permission (individual overrides)
export const USER_PERMISSION_GET   = "/user-permission";
export const USER_PERMISSION_SAVE  = "/user-permission";
export const USER_PERMISSION_CLEAR = "/user-permission";

// User Group
export const USER_GROUP_CREATE = "/user-group/create";
export const USER_GROUP_UPDATE = "/user-group/update";
export const USER_GROUP_GET    = "/user-group/get";
export const USER_GROUP_LIST   = "/user-group/list";
export const USER_GROUP_ALL    = "/user-group/all";
export const USER_GROUP_DELETE = "/user-group/delete";




/****************Below are the URL endpoints for the API routes NOT VALID */

//REGISTER
export const POST_FAKE_REGISTER = "/auth/signup";

//LOGIN
export const POST_FAKE_LOGIN = "/auth/signin";
export const POST_FAKE_JWT_LOGIN = "/post-jwt-login";
export const POST_FAKE_PASSWORD_FORGET = "/auth/forgot-password";
export const POST_FAKE_JWT_PASSWORD_FORGET = "/jwt-forget-pwd";
export const SOCIAL_LOGIN = "/social-login";

//PROFILE
export const POST_EDIT_JWT_PROFILE = "/post-jwt-profile";
export const POST_EDIT_PROFILE = "/user";

// Calendar
export const GET_EVENTS = "/events";
export const GET_CATEGORIES = "/categories";
export const GET_UPCOMMINGEVENT = "/upcommingevents";
export const ADD_NEW_EVENT = "/add/event";
export const UPDATE_EVENT = "/update/event";
export const DELETE_EVENT = "/delete/event";

// Chat
export const GET_DIRECT_CONTACT = "/chat";
export const GET_MESSAGES = "/messages";
export const ADD_MESSAGE = "add/message";
export const GET_CHANNELS = "/channels";
export const DELETE_MESSAGE = "delete/message";

//Mailbox
export const GET_MAIL_DETAILS = "/mail";
export const DELETE_MAIL = "/delete/mail";

// Ecommerce
// Product
export const GET_PRODUCTS = "/apps/product";
export const DELETE_PRODUCT = "/apps/product";
export const ADD_NEW_PRODUCT = "/apps/product";
export const UPDATE_PRODUCT = "/apps/product";

// Orders
export const GET_ORDERS = "/apps/order";
export const ADD_NEW_ORDER = "/apps/order";
export const UPDATE_ORDER = "/apps/order";
export const DELETE_ORDER = "/apps/order";

// Customers
export const GET_CUSTOMERS = "/apps/customer";
export const ADD_NEW_CUSTOMER = "/apps/customer";
export const UPDATE_CUSTOMER = "/apps/customer";
export const DELETE_CUSTOMER = "/apps/customer";

// Sellers
export const GET_SELLERS = "/sellers";

// Project list
export const GET_PROJECT_LIST = "/project/list";

// Task
export const GET_TASK_LIST = "/apps/task";
export const ADD_NEW_TASK = "/apps/task";
export const UPDATE_TASK = "/apps/task";
export const DELETE_TASK = "/apps/task";

// CRM
// Conatct
export const GET_CONTACTS = "/apps/contact";
export const ADD_NEW_CONTACT = "/apps/contact";
export const UPDATE_CONTACT = "/apps/contact";
export const DELETE_CONTACT = "/apps/contact";

// Companies
export const GET_COMPANIES = "/apps/company";
export const ADD_NEW_COMPANIES = "/apps/company";
export const UPDATE_COMPANIES = "/apps/company";
export const DELETE_COMPANIES = "/apps/company";

// Lead
export const GET_LEADS = "/apps/lead";
export const ADD_NEW_LEAD = "/apps/lead";
export const UPDATE_LEAD = "/apps/lead";
export const DELETE_LEAD = "/apps/lead";

// Deals
export const GET_DEALS = "/deals";

// Crypto
export const GET_TRANSACTION_LIST = "/transaction-list";
export const GET_ORDRER_LIST = "/order-list";

// Invoice
export const GET_INVOICES = "/apps/invoice";
export const ADD_NEW_INVOICE = "/apps/invoice";
export const UPDATE_INVOICE = "/apps/invoice";
export const DELETE_INVOICE = "/apps/invoice";

// TicketsList
export const GET_TICKETS_LIST = "/apps/ticket";
export const ADD_NEW_TICKET = "/apps/ticket";
export const UPDATE_TICKET = "/apps/ticket";
export const DELETE_TICKET = "/apps/ticket";

// kanban
export const GET_TASKS = "/apps/tasks";
export const ADD_TASKS = "/add/tasks";
export const UPDATE_TASKS = "/update/tasks";
export const DELETE_TASKS = "/delete/tasks";

// Dashboard Analytics

// Sessions by Countries
export const GET_ALL_DATA = "/all-data";
export const GET_HALFYEARLY_DATA = "/halfyearly-data";
export const GET_MONTHLY_DATA = "/monthly-data";

// Audiences Metrics
export const GET_ALLAUDIENCESMETRICS_DATA = "/allAudiencesMetrics-data";
export const GET_MONTHLYAUDIENCESMETRICS_DATA = "/monthlyAudiencesMetrics-data";
export const GET_HALFYEARLYAUDIENCESMETRICS_DATA = "/halfyearlyAudiencesMetrics-data";
export const GET_YEARLYAUDIENCESMETRICS_DATA = "/yearlyAudiencesMetrics-data";

// Users by Device
export const GET_TODAYDEVICE_DATA = "/todayDevice-data";
export const GET_LASTWEEKDEVICE_DATA = "/lastWeekDevice-data";
export const GET_LASTMONTHDEVICE_DATA = "/lastMonthDevice-data";
export const GET_CURRENTYEARDEVICE_DATA = "/currentYearDevice-data";

// Audiences Sessions by Country
export const GET_TODAYSESSION_DATA = "/todaySession-data";
export const GET_LASTWEEKSESSION_DATA = "/lastWeekSession-data";
export const GET_LASTMONTHSESSION_DATA = "/lastMonthSession-data";
export const GET_CURRENTYEARSESSION_DATA = "/currentYearSession-data";

// Dashboard CRM

// Balance Overview
export const GET_TODAYBALANCE_DATA = "/todayBalance-data";
export const GET_LASTWEEKBALANCE_DATA = "/lastWeekBalance-data";
export const GET_LASTMONTHBALANCE_DATA = "/lastMonthBalance-data";
export const GET_CURRENTYEARBALANCE_DATA = "/currentYearBalance-data";

// Deal type
export const GET_TODAYDEAL_DATA = "/todayDeal-data";
export const GET_WEEKLYDEAL_DATA = "/weeklyDeal-data";
export const GET_MONTHLYDEAL_DATA = "/monthlyDeal-data";
export const GET_YEARLYDEAL_DATA = "/yearlyDeal-data";

// Sales Forecast

export const GET_OCTSALES_DATA = "/octSales-data";
export const GET_NOVSALES_DATA = "/novSales-data";
export const GET_DECSALES_DATA = "/decSales-data";
export const GET_JANSALES_DATA = "/janSales-data";

// Dashboard Ecommerce
// Revenue
export const GET_ALLREVENUE_DATA = "/allRevenue-data";
export const GET_MONTHREVENUE_DATA = "/monthRevenue-data";
export const GET_HALFYEARREVENUE_DATA = "/halfYearRevenue-data";
export const GET_YEARREVENUE_DATA = "/yearRevenue-data";

// Dashboard Crypto
// Portfolio
export const GET_BTCPORTFOLIO_DATA = "/btcPortfolio-data";
export const GET_USDPORTFOLIO_DATA = "/usdPortfolio-data";
export const GET_EUROPORTFOLIO_DATA = "/euroPortfolio-data";

// Market Graph
export const GET_ALLMARKETDATA_DATA = "/allMarket-data";
export const GET_YEARMARKET_DATA = "/yearMarket-data";
export const GET_MONTHMARKET_DATA = "/monthMarket-data";
export const GET_WEEKMARKET_DATA = "/weekMarket-data";
export const GET_HOURMARKET_DATA = "/hourMarket-data";

// Dashboard Crypto
// Project Overview
export const GET_ALLPROJECT_DATA = "/allProject-data";
export const GET_MONTHPROJECT_DATA = "/monthProject-data";
export const GET_HALFYEARPROJECT_DATA = "/halfYearProject-data";
export const GET_YEARPROJECT_DATA = "/yearProject-data";

// Project Status
export const GET_ALLPROJECTSTATUS_DATA = "/allProjectStatus-data";
export const GET_WEEKPROJECTSTATUS_DATA = "/weekProjectStatus-data";
export const GET_MONTHPROJECTSTATUS_DATA = "/monthProjectStatus-data";
export const GET_QUARTERPROJECTSTATUS_DATA = "/quarterProjectStatus-data";

// Dashboard NFT
// Marketplace
export const GET_ALLMARKETPLACE_DATA = "/allMarketplace-data";
export const GET_MONTHMARKETPLACE_DATA = "/monthMarketplace-data";
export const GET_HALFYEARMARKETPLACE_DATA = "/halfYearMarketplace-data";
export const GET_YEARMARKETPLACE_DATA = "/yearMarketplace-data";

// Project
export const ADD_NEW_PROJECT = "/add/project";
export const UPDATE_PROJECT = "/update/project";
export const DELETE_PROJECT = "/delete/project";

// Pages > Team
export const GET_TEAMDATA = "/teamData";
export const DELETE_TEAMDATA = "/delete/teamData";
export const ADD_NEW_TEAMDATA = "/add/teamData";
export const UPDATE_TEAMDATA = "/update/teamData";

// File Manager
// Folder
export const GET_FOLDERS = "/folder";
export const DELETE_FOLDER = "/delete/folder";
export const ADD_NEW_FOLDER = "/add/folder";
export const UPDATE_FOLDER = "/update/folder";

// File
export const GET_FILES = "/file";
export const DELETE_FILE = "/delete/file";
export const ADD_NEW_FILE = "/add/file";
export const UPDATE_FILE = "/update/file";

// To do
export const GET_TODOS = "/todo";
export const DELETE_TODO = "/delete/todo";
export const ADD_NEW_TODO = "/add/todo";
export const UPDATE_TODO = "/update/todo";

// To do Project
export const GET_PROJECTS = "/projects";
export const ADD_NEW_TODO_PROJECT = "/add/project";

//JOB APPLICATION
export const GET_APPLICATION_LIST = "/application-list";

//JOB APPLICATION
export const GET_API_KEY = "/api-key";

// Entity Status
export const ENTITY_STATUS_CREATE = "/entity-status/create";
export const ENTITY_STATUS_UPDATE = "/entity-status/update";
export const ENTITY_STATUS_GET = "/entity-status/get";
export const ENTITY_STATUS_LIST = "/entity-status/list";
export const ENTITY_STATUS_DELETE = "/entity-status/delete";

// Official Sub Role
export const OFFICIAL_SUB_ROLE_CREATE = "/official-sub-role/create";
export const OFFICIAL_SUB_ROLE_UPDATE = "/official-sub-role/update";
export const OFFICIAL_SUB_ROLE_GET = "/official-sub-role/get";
export const OFFICIAL_SUB_ROLE_LIST = "/official-sub-role/list";
export const OFFICIAL_SUB_ROLE_DELETE = "/official-sub-role/delete";
export const OFFICIAL_SUB_ROLE_AUTO_ORDER = "/official-sub-role/next-order";
// Official CRUD
export const OFFICIAL_CREATE = "/official/create";
export const OFFICIAL_LIST   = "/official/list";
export const OFFICIAL_GET    = "/official/get";
export const OFFICIAL_UPDATE = "/official/update";
export const OFFICIAL_DELETE           = "/official/delete";
export const OFFICIAL_CONTROLLER_DATES = "/official/controller-dates";

// Product & Service
export const PRODUCT_SERVICE_CREATE =
    "/product-and-service/create";

export const PRODUCT_SERVICE_UPDATE =
    "/product-and-service/update";

export const PRODUCT_SERVICE_GET =
    "/product-and-service/get";

export const PRODUCT_SERVICE_LIST =
    "/product-and-service/list";

export const PRODUCT_SERVICE_DELETE =
    "/product-and-service/delete";

// Form Pop Up Field CRUD
export const FORM_POP_UP_FIELD_CREATE = "/form-pop-up-field/create";
export const FORM_POP_UP_FIELD_LIST   = "/form-pop-up-field/list";
export const FORM_POP_UP_FIELD_GET    = "/form-pop-up-field/get";
export const FORM_POP_UP_FIELD_UPDATE = "/form-pop-up-field/update";
export const FORM_POP_UP_FIELD_DELETE = "/form-pop-up-field/delete";

// Form
export const FORM_TEMPLATE_CREATE = "/form-template/create";
export const FORM_TEMPLATE_LIST   = "/form-template/list";
export const FORM_TEMPLATE_GET    = "/form-template/get";
export const FORM_TEMPLATE_UPDATE = "/form-template/update";
export const FORM_TEMPLATE_DELETE = "/form-template/delete";
export const FORM_TEMPLATE_POPUP_SCHEMA = "/form-template/popup-schema";
export const FORM_TEMPLATE_POPUP_SCHEMA_MERGE = "/form-template/popup-schema/merge";
export const FORM_TEMPLATE_POPUP_OPTIONS = "/form-template/popup-options";
export const FORM_TEMPLATE_POPUP_VALIDATE = "/form-template/popup-validate";
export const FORM_TEMPLATE_PREVIEW = "/form-template/preview";
export const FORM_TEMPLATE_AI_EDIT = "/form-template/ai/edit";
export const FORM_GENERATION_CREATE = "/form-generations/create";
export const FORM_GENERATION_RENDER_HTML = "/form-generations/render-html";
export const FORM_GENERATION_RENDER_PDF = "/form-generations/render-pdf";
export const FORM_GENERATION_RENDER_DOCX = "/form-generations/render-docx";
export const FORM_GENERATION_HISTORY = "/form-generations/history";
export const FORM_GENERATION_DOWNLOAD = "/form-generations/download";
export const FORM_GENERATION_REGENERATE = "/form-generations/regenerate";
export const FORM_GENERATION_DIRECT = "/form-generations/direct";
export const FORM_SHORTCODE_LIST = "/form-shortcode/list";
export const FORM_SHORTCODE_META = "/form-shortcode/meta";
export const FORM_SHORTCODE_GET = "/form-shortcode/get";
export const FORM_SHORTCODE_CREATE = "/form-shortcode/create";
export const FORM_SHORTCODE_UPDATE = "/form-shortcode/update";
export const FORM_SHORTCODE_RETIRE = "/form-shortcode/retire";
export const FORM_TEMPLATE_SHORTCODE_VALIDATE = "/form-template/version/validate";
export const FORM_TEMPLATE_VERSION_CREATE = "/form-template/version/create";
export const FORM_TEMPLATE_VERSION_PUBLISH = "/form-template/version/publish";
export const FORM_TEMPLATE_VERSION_LIST = "/form-template/versions";

// Register Charge constants

// Register Charge URLs
export const REGISTER_CHARGE_LIST = '/entity-change/list';
export const REGISTER_CHARGE_GET = '/entity-change/get';
export const REGISTER_CHARGE_CREATE = '/entity-change/create';
export const REGISTER_CHARGE_UPDATE = '/entity-change/update';
export const REGISTER_CHARGE_DELETE = '/entity-change/delete';
export const CHECK_CHARGE_NO =         '/entity-change/check-charge-number';

// Dropdown URLs
export const ENTITY_LIST = '/company/get_all';


// Entity Shares
export const ENTITY_SHARE_LIST    = "/entity-shares";
export const ENTITY_SHARE_HISTORY = "/entity-shares";
export const ENTITY_SHARE_GET     = "/entity-shares/get";
export const ENTITY_SHARE_CREATE  = "/entity-shares/create";
export const ENTITY_SHARE_UPDATE  = "/entity-shares/update";
export const ENTITY_SHARE_DELETE  = "/entity-shares/delete";

export const ENTITY_SHARE_DECIMAL_SETTINGS = "/entity-share-decimal-settings";

// Share Transactions (shareholder register)
export const SHARE_TXN_ALLOTMENT      = "/share-transactions/allotment";
export const SHARE_TXN_TRANSFER       = "/share-transactions/transfer";
export const SHARE_TXN_CLUB_TRANSFER  = "/share-transactions/transfer/club";
export const SHARE_TXN_RETAIN         = "/share-transactions/retain";
export const SHARE_TXN_RETAIN_CLUB    = "/share-transactions/retain/club";
export const SHARE_TXN_DISSOLVE        = "/share-transactions/dissolve";
export const SHARE_TXN_RETAIN_DISSOLVE = "/share-transactions/retain/dissolve";
export const SHARE_TXN_RETAIN_BUYBACK  = "/share-transactions/retain/buyback";
export const SHARE_TXN_CANCEL         = "/share-transactions/cancel";
export const SHARE_TXN_BUYBACK              = "/share-transactions/buyback";
export const SHARE_TXN_REPLACEMENT          = "/share-transactions/replacement";
export const SHARE_TXN_REPLACEMENT_CHECK    = "/share-transactions/replacement/check";
export const SHARE_TXN_REPLACEMENT_COMPAT   = "/share-transactions/replacement/compatible-certs";
export const SHARE_TXN_RETAIN_REPLACEMENT   = "/share-transactions/retain/replacement";
export const SHARE_TXN_SPLIT                = "/share-transactions/split";
export const SHARE_TXN_RETAIN_SPLIT         = "/share-transactions/retain/split";
export const SHARE_TXN_COMBINE              = "/share-transactions/combine";
export const SHARE_TXN_RETAIN_COMBINE       = "/share-transactions/retain/combine";
export const SHARE_TXN_RECLASS              = "/share-transactions/reclassification";
export const SHARE_TXN_RETAIN_RECLASS       = "/share-transactions/retain/reclassification";
export const SHARE_TXN_FOLIO_CHECK          = "/share-transactions/folio/check";
export const SHARE_TXN_SH_HISTORY    = "/share-transactions/shareholder-history";
export const SHARE_TXN_CO_SUMMARY    = "/share-transactions/company-share-summary";
export const SHARE_TXN_LIST      = "/share-transactions";
export const SHARE_TXN_GET       = "/share-transactions/get";
export const SHARE_TXN_DELETE    = "/share-transactions/delete";

// Share Payments (partial / installment)
export const SHARE_PAYMENT_LIST   = "/share-payments";
export const SHARE_PAYMENT_CREATE = "/share-payments/create";
export const SHARE_PAYMENT_DELETE = "/share-payments/delete";

export const REMINDER_LIST    = "/event/reminders/list";
export const REMINDER_GET     = "/event/reminders/get";
export const REMINDER_CREATE  = "/event/reminders/create";
export const REMINDER_UPDATE  = "/event/reminders/update";
export const REMINDER_DELETE  = "/event/reminders/delete";
export const REMINDER_LOGS = "/event/reminders/logs";
export const REMINDER_SEND_DUE = "/event/reminders/send-due";

export const REMAIDER_LIST = REMINDER_LIST;
export const REMAIDER_GET = REMINDER_GET;
export const REMAIDER_CREATE = REMINDER_CREATE;
export const REMAIDER_UPDATE = REMINDER_UPDATE;
export const REMAIDER_DELETE = REMINDER_DELETE;
export const REMAIDER_LOGS = REMINDER_LOGS;
export const REMAIDER_SEND_DUE = REMINDER_SEND_DUE;
