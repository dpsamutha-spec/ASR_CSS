import { APIClient, getLoggedinUser } from "./api_helper";
import * as url from "./url_helper";

const api = new APIClient();

// PORT - resolves port_number to port_name using absolute URL (bypasses /:db prefix)
export const resolvePort = (portNumber) => api.get(url.PORT_RESOLVE, { port_number: portNumber });

// AUTH
export const postLogin  = (data) => api.create(url.LOGIN,  data);
export const postLogout = (data) => api.create(url.LOGOUT, data);

// Dashboard
export const getDashboardRecentActivity = (limit = 25) => api.get(url.DASHBOARD_RECENT_ACTIVITY, { limit });
export const getDashboardPortfolioOverview = (params = {}) => api.get(url.DASHBOARD_PORTFOLIO_OVERVIEW, params);

// Theme Settings
export const getThemeSettings  = ()     => api.get(url.THEME_SETTINGS_GET);
export const saveThemeSettings = (data) => api.put(url.THEME_SETTINGS_SAVE, data);

// Salutation
export const getSalutationList   = (params) => api.get(url.SALUTATION_LIST, params);
export const getSalutation       = (id)     => api.get(`${url.SALUTATION_GET}/${id}`);
export const createSalutation    = (data)   => api.create(url.SALUTATION_CREATE, data);
export const updateSalutation    = (id, data) => api.put(`${url.SALUTATION_UPDATE}/${id}`, data);
export const deleteSalutation    = (id)     => api.create(url.SALUTATION_DELETE, { salutation_id: id });

// Region
export const getRegionList   = (params) => api.get(url.REGION_LIST, params);
export const getRegion       = (id)     => api.get(`${url.REGION_GET}/${id}`);
export const createRegion    = (data)   => api.create(url.REGION_CREATE, data);
export const updateRegion    = (id, data) => api.put(`${url.REGION_UPDATE}/${id}`, data);
export const deleteRegion    = (id)     => api.create(url.REGION_DELETE, { region_id: id });

// Jurisdiction
export const getJurisdictionsList = (params) => api.get(url.JURISDICTION_LIST, params);
export const getJurisdiction      = (id)     => api.get(`${url.JURISDICTION_GET}/${id}`);
export const createJurisdiction   = (data)   => api.create(url.JURISDICTION_CREATE, data);
export const updateJurisdiction   = (id, data) => api.put(`${url.JURISDICTION_UPDATE}/${id}`, data);
export const deleteJurisdiction   = (id)     => api.create(url.JURISDICTION_DELETE, { jurisdiction_id: id });

// Authority
export const getAuthoritiesList = (params) => api.get(url.AUTHORITY_LIST, params);
export const getAuthority       = (id)     => api.get(`${url.AUTHORITY_GET}/${id}`);
export const createAuthority    = (data)   => api.create(url.AUTHORITY_CREATE, data);
export const updateAuthority    = (id, data) => api.put(`${url.AUTHORITY_UPDATE}/${id}`, data);
export const deleteAuthority    = (id)     => api.create(url.AUTHORITY_DELETE, { authority_id: id });

// Member ID Type
export const getMemberIdTypeList = (params) => api.get(url.MEMBER_ID_TYPE_LIST, params);
export const getMemberIdType = (id) => api.get(`${url.MEMBER_ID_TYPE_GET}/${id}`);
export const createMemberIdType = (data) => api.create(url.MEMBER_ID_TYPE_CREATE, data);
export const updateMemberIdType = (id, data) => api.put(`${url.MEMBER_ID_TYPE_UPDATE}/${id}`, data);
export const deleteMemberIdType = (id) => api.create(url.MEMBER_ID_TYPE_DELETE, {m_identification_id: id});

// Race Master
export const getRaceList = (params) => api.get(url.RACE_LIST, params);
export const getRace = (id) => api.get(`${url.RACE_GET}/${id}`);
export const createRace = (data) => api.create(url.RACE_CREATE, data);
export const updateRace = (id, data) => api.put(`${url.RACE_UPDATE}/${id}`, data);
export const deleteRace = (id) =>  api.create(url.RACE_DELETE, {race_id: id });

// Tag Master
export const getTagList = (params) => api.get(url.TAG_LIST, params);
export const getTag = (id) => api.get(`${url.TAG_GET}/${id}`);
export const createTag = (data) => api.create(url.TAG_CREATE, data);
export const updateTag = (id, data) => api.put(`${url.TAG_UPDATE}/${id}`, data);
export const deleteTag = (id) => api.create(url.TAG_DELETE, { tag_id: id });

// To-Do Task
export const getTodoTaskList     = () => api.get(url.TODO_TASK_LIST);
export const createTodoTask      = (data) => api.create(url.TODO_TASK_CREATE, data);
export const updateTodoTaskStatus = (id, data) => api.put(`${url.TODO_TASK_UPDATE_STATUS}/${id}`, data);
export const deleteTodoTask      = (id) => api.create(url.TODO_TASK_DELETE, { todo_id: id });

// Softwares Master
export const getSoftwareList = (params) => api.get(url.SOFTWARE_LIST, params);
export const getSoftware = (id) => api.get(`${url.SOFTWARE_GET}/${id}`);
export const createSoftware = (data) => api.create(url.SOFTWARE_CREATE, data);
export const updateSoftware = (id, data) => api.put(`${url.SOFTWARE_UPDATE}/${id}`, data);
export const deleteSoftware = (id) => api.create(url.SOFTWARE_DELETE, { software_id: id });

// CSS Status
export const getCssStatusList = (params) => api.get(url.CSS_STATUS_LIST, params);
export const getCssStatus = (id) => api.get(`${url.CSS_STATUS_GET}/${id}`);
export const createCssStatus = (data) => api.create(url.CSS_STATUS_CREATE, data);
export const updateCssStatus = (id, data) => api.put(`${url.CSS_STATUS_UPDATE}/${id}`, data);
export const deleteCssStatus = (id) => api.create(url.CSS_STATUS_DELETE, { css_status_id: id });

export const getGroupMasterList = (params) => api.get(url.GROUP_MASTER_LIST, params);
export const getGroupMaster = (id) => api.get(`${url.GROUP_MASTER_GET}/${id}`);
export const createGroupMaster = (data) => api.create(url.GROUP_MASTER_CREATE, data);
export const updateGroupMaster = (id, data) => api.put(`${url.GROUP_MASTER_UPDATE}/${id}`, data);
export const deleteGroupMaster = (id) => api.create(url.GROUP_MASTER_DELETE, { group_id: id });

// Official Master
export const getOfficialMasterList = (params) => api.get(url.OFFICIAL_MASTER_LIST, params);
export const getOfficialMaster = (id) => api.get(`${url.OFFICIAL_MASTER_GET}/${id}`);
export const createOfficialMaster = (data) => api.create(url.OFFICIAL_MASTER_CREATE, data);
export const updateOfficialMaster = (id, data) => api.put(`${url.OFFICIAL_MASTER_UPDATE}/${id}`, data);
export const deleteOfficialMaster = (id) => api.create(url.OFFICIAL_MASTER_DELETE, { official_master_id: id });
export const saveOfficialMasterConfig = (id, data) => api.put(`${url.OFFICIAL_MASTER_CONFIG_UPDATE}/${id}`, data);


// Company Type
export const getCompanyTypeList = (params) => api.get(url.COMPANY_TYPE_LIST, params);
export const getCompanyType = (id) => api.get(`${url.COMPANY_TYPE_GET}/${id}`);
export const createCompanyType = (data) => api.create(url.COMPANY_TYPE_CREATE, data);
export const updateCompanyType = (id, data) => api.put(`${url.COMPANY_TYPE_UPDATE}/${id}`, data);
export const deleteCompanyType = (id) => api.create(url.COMPANY_TYPE_DELETE, { company_type_id: id });

// Company Segregation
export const getCompanySegregationList = (params) => api.get(url.COMPANY_SEGREGATION_LIST, params);
export const getCompanySegregation = (id) => api.get(`${url.COMPANY_SEGREGATION_GET}/${id}`);
export const createCompanySegregation = (data) => api.create(url.COMPANY_SEGREGATION_CREATE, data);
export const updateCompanySegregation = (id, data) => api.put(`${url.COMPANY_SEGREGATION_UPDATE}/${id}`, data);
export const deleteCompanySegregation = (id) => api.create(url.COMPANY_SEGREGATION_DELETE, { segregation_id: id });

// Business Entity
export const getBusinessEntityList = (params) => api.get(url.BUSINESS_ENTITY_LIST, params);
export const getBusinessEntity = (id) => api.get(`${url.BUSINESS_ENTITY_GET}/${id}`);
export const createBusinessEntity = (data) => api.create(url.BUSINESS_ENTITY_CREATE, data);
export const updateBusinessEntity = (id, data) => api.put(`${url.BUSINESS_ENTITY_UPDATE}/${id}`, data);
export const deleteBusinessEntity = (id) => api.create(url.BUSINESS_ENTITY_DELETE, { bn_id: id });

// Related Industry
export const getRelatedIndustryList = (params) => api.get(url.RELATED_INDUSTRY_LIST, params);
export const getRelatedIndustry = (id) => api.get(`${url.RELATED_INDUSTRY_GET}/${id}`);
export const createRelatedIndustry = (data) => api.create(url.RELATED_INDUSTRY_CREATE, data);
export const updateRelatedIndustry = (id, data) => api.put(`${url.RELATED_INDUSTRY_UPDATE}/${id}`, data);
export const deleteRelatedIndustry = (id) => api.create(url.RELATED_INDUSTRY_DELETE, { related_industry_id: id });

// Company SSIC Code
export const getCompanySSICCodeList = (params) => api.get(url.COMPANY_SSIC_CODE_LIST, params);
export const getCompanySSICCode = (id) => api.get(`${url.COMPANY_SSIC_CODE_GET}/${id}`);
export const createCompanySSICCode = (data) => api.create(url.COMPANY_SSIC_CODE_CREATE, data);
export const updateCompanySSICCode = (id, data) => api.put(`${url.COMPANY_SSIC_CODE_UPDATE}/${id}`, data);
export const deleteCompanySSICCode = (id) => api.create(url.COMPANY_SSIC_CODE_DELETE, { ssic_id: id });

// CorpSecType
export const getCorpSecTypeList=(params)=>api.get(url.CORP_SEC_TYPE_LIST,params);
export const getCorpSecType=(id)=>api.get(`${url.CORP_SEC_TYPE_GET}/${id}`);
export const createCorpSecType=(data)=>api.create(url.CORP_SEC_TYPE_CREATE,data);
export const updateCorpSecType=(id,data)=>api.put(`${url.CORP_SEC_TYPE_UPDATE}/${id}`,data);
export const deleteCorpSecType=(id)=>api.create(url.CORP_SEC_TYPE_DELETE,{corp_sec_id:id});

// EntityServiceCategory
export const getEntityServiceCategoryList=(params)=>api.get(url.ENTITY_SERVICE_CATEGORY_LIST,params);
export const getEntityServiceCategory=(id)=>api.get(`${url.ENTITY_SERVICE_CATEGORY_GET}/${id}`);
export const createEntityServiceCategory=(data)=>api.create(url.ENTITY_SERVICE_CATEGORY_CREATE,data);
export const updateEntityServiceCategory=(id,data)=>api.put(`${url.ENTITY_SERVICE_CATEGORY_UPDATE}/${id}`,data);
export const deleteEntityServiceCategory=(id)=>api.create(url.ENTITY_SERVICE_CATEGORY_DELETE,{service_id:id});

// CompanyEventName
export const getCompanyEventNameList=(params)=>api.get(url.COMPANY_EVENT_NAME_LIST,params);
export const getCompanyEventName=(id)=>api.get(`${url.COMPANY_EVENT_NAME_GET}/${id}`);
export const createCompanyEventName=(data)=>api.create(url.COMPANY_EVENT_NAME_CREATE,data);
export const updateCompanyEventName=(id,data)=>api.put(`${url.COMPANY_EVENT_NAME_UPDATE}/${id}`,data);
export const deleteCompanyEventName=(id)=>api.create(url.COMPANY_EVENT_NAME_DELETE,{e_id:id});
export const getDocumentChecklistTemplates=(eventMasterId)=>api.get(`${url.DOCUMENT_CHECKLIST_TEMPLATE_LIST}/${eventMasterId}`);
export const saveDocumentChecklistTemplates=(eventMasterId,items)=>api.create(url.DOCUMENT_CHECKLIST_TEMPLATE_SAVE,{event_master_id:eventMasterId,items});

// CompanyEvent
export const getCompanyEventList=(params)=>api.get(url.COMPANY_EVENT_LIST,params);
export const getCompanyEvent=(id)=>api.get(`${url.COMPANY_EVENT_GET}/${id}`);
export const createCompanyEvent=(data)=>api.create(url.COMPANY_EVENT_CREATE,data);
export const createMultipleCompanyEvents=(data)=>api.create(url.COMPANY_EVENT_CREATE_MULTIPLE,data);
export const updateCompanyEvent=(id,data)=>api.put(`${url.COMPANY_EVENT_UPDATE}/${id}`,data);
export const extendCompanyEventDueDate=(id,data)=>api.create(`${url.COMPANY_EVENT_EXTEND}/${id}`,data);
export const cancelCompanyEventDueDateExtension=(id,data={})=>api.create(`${url.COMPANY_EVENT_CANCEL_EXTENSION}/${id}`,data);
export const updateCompanyEventStatus=(id,data)=>api.create(`${url.COMPANY_EVENT_UPDATE_STATUS}/${id}`,data);
export const dispenseCompanyEvent=(id,data={})=>api.create(`${url.COMPANY_EVENT_DISPENSE}/${id}`,data);
export const cancelDispenseCompanyEvent=(id,data={})=>api.create(`${url.COMPANY_EVENT_CANCEL_DISPENSE}/${id}`,data);
export const getCompanyEventExtensionLogs=(params)=>api.get(url.COMPANY_EVENT_EXTENSION_LOGS,params);
export const exemptCompanyEvent=(id,data={})=>api.create(`${url.COMPANY_EVENT_EXEMPT}/${id}`,data);
export const cancelExemptCompanyEvent=(id,data={})=>api.create(`${url.COMPANY_EVENT_CANCEL_EXEMPT}/${id}`,data);
export const deleteCompanyEvent=(id,data={})=>api.create(url.COMPANY_EVENT_DELETE,{company_event_id:id,...data});
export const validateCompanyActualFye=(entityId,data)=>api.create(`${url.COMPANY_EVENT_VALIDATE_FYE}/${entityId}/validate-fye`,data);
export const syncCompanyEvents=(entityId,data)=>api.create(`${url.COMPANY_EVENT_SYNC}/${entityId}/sync`,data);
export const getCompanyEventDetails=(entityId,params)=>api.get(`${url.COMPANY_EVENT_DETAILS}/${entityId}/details`,params);
export const getCompanyEventCalculationTrace=(id)=>api.get(`${url.COMPANY_EVENT_CALCULATION_TRACE}/${id}`);
export const requestGeneralEventExtension=(id,data)=>api.create(`${url.COMPANY_EVENT_REQUEST_EXTENSION}/${id}`,data);
export const requestGeneralEventWaiver=(id,data)=>api.create(`${url.COMPANY_EVENT_REQUEST_WAIVER}/${id}`,data);
export const cancelGeneralEventWaiver=(id,data={})=>api.create(`${url.COMPANY_EVENT_CANCEL_WAIVER}/${id}`,data);
export const getCompanyEventExtensions=(id,params)=>api.get(`${url.COMPANY_EVENT_EXTENSIONS}/${id}`,params);
export const getCompanyEventWaivers=(id,params)=>api.get(`${url.COMPANY_EVENT_WAIVERS}/${id}`,params);
export const getCompanyEventDocuments=(id)=>api.get(`${url.COMPANY_EVENT_DOCUMENTS}/${id}`);
export const updateCompanyEventDocumentStatus=(eventDocumentId,data)=>api.create(`${url.COMPANY_EVENT_DOCUMENT_STATUS}/${eventDocumentId}`,data);

// CompanyEventRule
export const getCompanyEventRuleList=(params)=>api.get(url.COMPANY_EVENT_RULE_LIST,params);
export const saveCompanyEventRule=(data)=>api.create(url.COMPANY_EVENT_RULE_SAVE,data);
export const deleteCompanyEventRule=(id, data={})=>api.create(url.COMPANY_EVENT_RULE_DELETE,{rule_id:id,...data});
export const getEventRuleVersions=(ruleId)=>api.get(url.COMPANY_EVENT_RULE_VERSIONS,{rule_id:ruleId});
export const submitEventRuleForReview=(id, data={})=>api.create(url.COMPANY_EVENT_RULE_SUBMIT,{rule_id:id,...data});
export const approveEventRule=(id, data={})=>api.create(url.COMPANY_EVENT_RULE_APPROVE,{rule_id:id,...data});
export const publishEventRule=(id, data={})=>api.create(url.COMPANY_EVENT_RULE_PUBLISH,{rule_id:id,...data});
export const retireEventRule=(id, data={})=>api.create(url.COMPANY_EVENT_RULE_RETIRE,{rule_id:id,...data});

// ShareClassMaster
export const getShareClassMasterList=(params)=>api.get(url.SHARE_CLASS_MASTER_LIST,params);
export const getShareClassMaster=(id)=>api.get(`${url.SHARE_CLASS_MASTER_GET}/${id}`);
export const createShareClassMaster=(data)=>api.create(url.SHARE_CLASS_MASTER_CREATE,data);
export const updateShareClassMaster=(id,data)=>api.put(`${url.SHARE_CLASS_MASTER_UPDATE}/${id}`,data);
export const deleteShareClassMaster=(id)=>api.create(url.SHARE_CLASS_MASTER_DELETE,{sc_id:id});

// TypeOfFee
export const getTypeOfFeeList=(params)=>api.get(url.TYPE_OF_FEE_LIST,params);
export const getTypeOfFee=(id)=>api.get(`${url.TYPE_OF_FEE_GET}/${id}`);
export const createTypeOfFee=(data)=>api.create(url.TYPE_OF_FEE_CREATE,data);
export const updateTypeOfFee=(id,data)=>api.put(`${url.TYPE_OF_FEE_UPDATE}/${id}`,data);
export const deleteTypeOfFee=(id)=>api.create(url.TYPE_OF_FEE_DELETE,{fee_id:id});

// TransactionType
export const getTransactionTypeList=(params)=>api.get(url.TRANSACTION_TYPE_LIST,params);
export const getTransactionType=(id)=>api.get(`${url.TRANSACTION_TYPE_GET}/${id}`);
export const createTransactionType=(data)=>api.create(url.TRANSACTION_TYPE_CREATE,data);
export const updateTransactionType=(id,data)=>api.put(`${url.TRANSACTION_TYPE_UPDATE}/${id}`,data);
export const deleteTransactionType=(id)=>api.create(url.TRANSACTION_TYPE_DELETE,{t_id:id});

// Template Category
export const getTemplateCategoryList = (params) => api.get(url.TEMPLATE_CATEGORY_LIST, params);
export const getTemplateCategory = (id) => api.get(`${url.TEMPLATE_CATEGORY_GET}/${id}`);
export const createTemplateCategory = (data) => api.create(url.TEMPLATE_CATEGORY_CREATE, data);
export const updateTemplateCategory = (id, data) => api.put(`${url.TEMPLATE_CATEGORY_UPDATE}/${id}`, data);
export const deleteTemplateCategory = (id) => api.create(url.TEMPLATE_CATEGORY_DELETE, { tc_id: id });

// Register Footer
export const getRegisterFooterList = (params) => api.get(url.REGISTER_FOOTER_LIST, params);
export const getRegisterFooter = (id) => api.get(`${url.REGISTER_FOOTER_GET}/${id}`);
export const createRegisterFooter = (data) => api.create(url.REGISTER_FOOTER_CREATE, data);
export const updateRegisterFooter = (id, data) => api.put(`${url.REGISTER_FOOTER_UPDATE}/${id}`, data);
export const deleteRegisterFooter = (id) => api.create(url.REGISTER_FOOTER_DELETE, { rf_id: id });

//Countries

export const getCountriesList = (params) => api.get(url.COUNTRIES_LIST, params);
export const getCountries = (id) => api.get(`${url.COUNTRIES_GET}/${id}`);



export const getIndividualList   = (params)     => api.get(url.INDIVIDUAL_LIST, params);
export const getIndividual       = (id)         => api.get(`${url.INDIVIDUAL_GET}/${id}`);
export const createIndividual    = (data)       => api.create(url.INDIVIDUAL_CREATE, data, { headers: {'Content-Type': 'multipart/form-data'}});
export const updateIndividual    = (id, data)   => api.put(`${url.INDIVIDUAL_UPDATE}/${id}`, data, { headers: {'Content-Type': 'multipart/form-data'}});
export const deleteIndividual    = (id)         => api.create(url.INDIVIDUAL_DELETE, { entity_id: id });

export const getIndividualFieldHistory = (id, params) =>
  api.get(`${url.INDIVIDUAL_FIELD_HISTORY_GET}/${id}`, params);

export const saveIndividualFieldChange = (id, data) =>
  api.create(`${url.INDIVIDUAL_SAVE_FIELD_CHANGE_CREATE}/${id}`, data);

export const checkIndividualName = (params) =>
  api.get(url.INDIVIDUAL_CHECK_NAME_GET, params);

export const checkIdNumber = (params) =>
  api.get(url.INDIVIDUAL_CHECK_ID_NUMBER_GET, params);


// Individual â€” Identification
export const createIndividualIdentification = (entityId, data) =>
    api.create(`${url.INDIVIDUAL_IDENTIFICATION_CREATE}/${entityId}/identification/create`, data);
export const updateIndividualIdentification = (id, data) =>
    api.put(`${url.INDIVIDUAL_IDENTIFICATION_UPDATE}/${id}`, data);
export const deleteIndividualIdentification = (id) =>
    api.create(url.INDIVIDUAL_IDENTIFICATION_DELETE, { identification_id: id });

// Individual â€” Address
export const createIndividualAddress = (entityId, data) =>
    api.create(`${url.INDIVIDUAL_ADDRESS_CREATE}/${entityId}/address/create`, data);
export const updateIndividualAddress = (id, data) =>
    api.put(`${url.INDIVIDUAL_ADDRESS_UPDATE}/${id}`, data);
export const deleteIndividualAddress = (id) =>
    api.create(url.INDIVIDUAL_ADDRESS_DELETE, { address_id: id });

// Individual â€” Contact
export const createIndividualContact = (entityId, data) =>
    api.create(`${url.INDIVIDUAL_CONTACT_CREATE}/${entityId}/contact/create`, data);
export const updateIndividualContact = (id, data) =>
    api.put(`${url.INDIVIDUAL_CONTACT_UPDATE}/${id}`, data);
export const deleteIndividualContact = (id) =>
    api.create(url.INDIVIDUAL_CONTACT_DELETE, { contact_id: id });

// Individual â€” Relationship
export const createIndividualRelationship = (entityId, data) =>
    api.create(`${url.INDIVIDUAL_RELATIONSHIP_CREATE}/${entityId}/relationship/create`, data);
export const updateIndividualRelationship = (id, data) =>
    api.put(`${url.INDIVIDUAL_RELATIONSHIP_UPDATE}/${id}`, data);
export const deleteIndividualRelationship = (id) =>
    api.create(url.INDIVIDUAL_RELATIONSHIP_DELETE, { relationship_id: id });

// Company Entity
export const getCompanyList   = (params)     => api.get(url.COMPANY_LIST, params);
export const getCompany       = (id)         => api.get(`${url.COMPANY_GET}/${id}`);
export const createCompany    = (data)       => api.create(url.COMPANY_CREATE, data, { headers: {'Content-Type': 'multipart/form-data'} });
export const updateCompany    = (id, data)   => api.put(`${url.COMPANY_UPDATE}/${id}`, data, { headers: {'Content-Type': 'multipart/form-data'} });
export const deleteCompany    = (id)         => api.create(url.COMPANY_DELETE, { entity_id: id });

export const checkEntityName = (params) =>
  api.get(url.COMPANY_CHECK_NAME_GET, params);

export const createCompanyAddress = (entityId, data) =>
    api.create(`${url.COMPANY_ADDRESS_CREATE}/${entityId}/address/create`, data);
export const updateCompanyAddress = (id, data) =>
    api.put(`${url.COMPANY_ADDRESS_UPDATE}/${id}`, data);
export const deleteCompanyAddress = (id) =>
    api.create(url.COMPANY_ADDRESS_DELETE, { address_id: id });

export const createCompanyContact = (entityId, data) =>
    api.create(`${url.COMPANY_CONTACT_CREATE}/${entityId}/contact/create`, data);
export const updateCompanyContact = (id, data) =>
    api.put(`${url.COMPANY_CONTACT_UPDATE}/${id}`, data);
export const deleteCompanyContact = (id) =>
    api.create(url.COMPANY_CONTACT_DELETE, { contact_id: id });

// Company profile
export const getCompanyProfile = (id) => api.get(`${url.COMPANY_PROFILE_GET}/${id}`);
export const updateCompanyProfile = (id, data) => api.put(`${url.COMPANY_PROFILE_UPDATE}/${id}`, data , { headers: {'Content-Type': 'multipart/form-data'} });
export const updateCompanyProfileAddress = (id, data) => api.create(`${url.COMPANY_PROFILE_ADDRESS_HISTORY_CREATE}/${id}`, data);
export const getCompanyProfileAddressHistory = (id) =>  api.get(`${url.COMPANY_PROFILE_ADDRESS_HISTORY_GET}/${id}`);
export const deleteCompanyProfileAddressHistory = (id)  => api.create(url.COMPANY_PROFILE_ADDRESS_HISTORY_DELETE, { addr_history_id: id });

const withPortName = (params = {}) => {
  const user = getLoggedinUser();
  const portName = user?.portName || user?.port_name || localStorage.getItem("portName") || "";
  return portName && !params.port_name ? { ...params, port_name: portName } : params;
};

export const getDocumentStoreList = (params = {}) =>
  api.get(url.DOCUMENT_STORE_LIST, withPortName(params));

export const getDocumentStore = (id, params = {}) =>
  api.get(`${url.DOCUMENT_STORE_GET}/${id}`, withPortName(params));

export const getDocumentStoreUrl = (id, params = {}) =>
  api.get(`${url.DOCUMENT_STORE_GET}/${id}/url`, withPortName(params));

export const uploadDocumentStore = (formData) => {
  const payload = formData instanceof FormData ? formData : new FormData();
  const user = getLoggedinUser();
  const portName = user?.portName || user?.port_name || localStorage.getItem("portName") || "";
  if (portName && !payload.get("port_name")) payload.append("port_name", portName);
  return api.create(url.DOCUMENT_STORE_UPLOAD, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const uploadMultipleDocumentStore = (formData) => {
  const payload = formData instanceof FormData ? formData : new FormData();
  const user = getLoggedinUser();
  const portName = user?.portName || user?.port_name || localStorage.getItem("portName") || "";
  if (portName && !payload.get("port_name")) payload.append("port_name", portName);
  return api.create(url.DOCUMENT_STORE_UPLOAD_MULTIPLE, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const updateDocumentStore = (id, data = {}) =>
  api.update(`${url.DOCUMENT_STORE_GET}/${id}`, withPortName(data));

export const deleteDocumentStore = (id, params = {}) =>
  api.delete(`${url.DOCUMENT_STORE_GET}/${id}`, { params: withPortName(params) });

export const bulkDeleteDocumentStore = (docIds = [], data = {}) =>
  api.delete(`${url.DOCUMENT_STORE_GET}/bulk/delete`, { data: withPortName({ ...data, doc_ids: docIds }) });

export const getDocumentStoreStats = (params = {}) =>
  api.get(url.DOCUMENT_STORE_STATS, withPortName(params));

export const getCompanyFieldHistory = (id, params) =>
  api.get(`${url.COMPANY_FIELD_HISTORY_GET}/${id}`, params);

export const saveCompanyFieldChange = (id, data) =>
  api.create(`${url.COMPANY_SAVE_FIELD_CHANGE_CREATE}/${id}`, data);

// User
export const getUserList   = (params)       => api.get(url.USER_LIST, params);
export const createUser    = (data)         => api.create(url.USER_CREATE, data);
export const updateUser    = (id, data)     => api.put(`${url.USER_UPDATE}/${id}`, data);
export const deleteUser    = (data)         => api.create(url.USER_DELETE, data);

// User Permission (individual overrides)
export const getUserPermission   = (userId)       => api.get(`${url.USER_PERMISSION_GET}/${userId}`);
export const saveUserPermission  = (userId, data) => api.put(`${url.USER_PERMISSION_SAVE}/${userId}`, data);
export const clearUserPermission = (userId)       => api.delete(`${url.USER_PERMISSION_CLEAR}/${userId}/clear`);

// User Group
export const getUserGroupList   = (params) => api.get(url.USER_GROUP_LIST, params);
export const getUserGroupAll    = ()       => api.get(url.USER_GROUP_ALL);
export const getUserGroup       = (id)     => api.get(`${url.USER_GROUP_GET}/${id}`);
export const createUserGroup    = (data)   => api.create(url.USER_GROUP_CREATE, data);
export const updateUserGroup    = (id, data) => api.put(`${url.USER_GROUP_UPDATE}/${id}`, data);
export const deleteUserGroup    = (id)     => api.create(url.USER_GROUP_DELETE, { user_group_id: id });

//Entity Status

export const getEntityStatusList = (params) => api.get(url.ENTITY_STATUS_LIST, params);
export const getEntityStatus      = (id)     => api.get(`${url.ENTITY_STATUS_GET}/${id}`);
export const createEntityStatus = (data) => api.create(url.ENTITY_STATUS_CREATE, data);
export const updateEntityStatus = (id, data) => api.put(`${url.ENTITY_STATUS_UPDATE}/${id}`, data);
export const deleteEntityStatus = (id) => api.create(url.ENTITY_STATUS_DELETE, { e_status_id : id });

// Official Sub Role
export const getOfficialSubRoleList = (params) => api.get(url.OFFICIAL_SUB_ROLE_LIST, params);
export const getOfficialSubRole = (id) => api.get(`${url.OFFICIAL_SUB_ROLE_GET}/${id}`);
export const createOfficialSubRole = (data) => api.create(url.OFFICIAL_SUB_ROLE_CREATE, data);
export const updateOfficialSubRole = (id, data) => api.put(`${url.OFFICIAL_SUB_ROLE_UPDATE}/${id}`, data);
export const deleteOfficialSubRole = (id) => api.create(url.OFFICIAL_SUB_ROLE_DELETE, { official_master_id: id });
export const getOfficialSubRoleNextOrder = (parentId) => api.get(`${url.OFFICIAL_SUB_ROLE_AUTO_ORDER}/${parentId}`);
// Official CRUD
export const createOfficial = (data)     => api.create(url.OFFICIAL_CREATE, data);
export const getOfficialList = (params)  => api.get(url.OFFICIAL_LIST, params);
export const getOfficial    = (id)       => api.get(`${url.OFFICIAL_GET}/${id}`);
export const updateOfficial = (id, data) => api.put(`${url.OFFICIAL_UPDATE}/${id}`, data);
export const deleteOfficial             = (id)       => api.create(url.OFFICIAL_DELETE, { official_id: id });
export const getOfficialControllerDates = (params)   => api.get(url.OFFICIAL_CONTROLLER_DATES, params);

// Product & Service
export const getProductAndServiceList = (params) =>
    api.get(url.PRODUCT_SERVICE_LIST, params);

export const getProductAndService = (id) =>
    api.get(`${url.PRODUCT_SERVICE_GET}/${id}`);

export const createProductAndService = (data) =>
    api.create(url.PRODUCT_SERVICE_CREATE, data);

export const updateProductAndService = (id, data) =>
    api.put(`${url.PRODUCT_SERVICE_UPDATE}/${id}`, data);

export const deleteProductAndService = (id) =>
    api.create(url.PRODUCT_SERVICE_DELETE, {
        product_service_id: id,
    });
    
// Form Pop Up Field CRUD
export const createFormPopUpField = (data) =>
  api.create(url.FORM_POP_UP_FIELD_CREATE, data);

export const getFormPopUpFieldList = (params) =>
  api.get(url.FORM_POP_UP_FIELD_LIST, params);

export const getFormPopUpField = (id) =>
  api.get(`${url.FORM_POP_UP_FIELD_GET}/${id}`);

export const updateFormPopUpField = (id, data) =>
  api.put(`${url.FORM_POP_UP_FIELD_UPDATE}/${id}`, data);

export const deleteFormPopUpField = (id) =>
  api.create(url.FORM_POP_UP_FIELD_DELETE, {
    form_pop_up_field_id: id,
  });

  // Form 
export const createFormTemplate = (data) =>
  api.create(url.FORM_TEMPLATE_CREATE, data , { headers: {'Content-Type': 'multipart/form-data'}});

export const getFormTemplateList = (params) =>
  api.get(url.FORM_TEMPLATE_LIST, params);

export const updateFormTemplate = (id, data) =>
  api.put(`${url.FORM_TEMPLATE_UPDATE}/${id}`, data, { headers: {'Content-Type': 'multipart/form-data'}});

export const getFormTemplate = (id) =>
  api.get(`${url.FORM_TEMPLATE_GET}/${id}`);

export const getFormShortcodeList = (params) =>
  api.get(url.FORM_SHORTCODE_LIST, params);

export const getFormShortcodeMeta = () =>
  api.get(url.FORM_SHORTCODE_META);

export const getFormShortcode = (id) =>
  api.get(`${url.FORM_SHORTCODE_GET}/${id}`);

export const createFormShortcode = (data) =>
  api.create(url.FORM_SHORTCODE_CREATE, data);

export const updateFormShortcode = (id, data) =>
  api.put(`${url.FORM_SHORTCODE_UPDATE}/${id}`, data);

export const retireFormShortcode = (id) =>
  api.create(`${url.FORM_SHORTCODE_RETIRE}/${id}`, {});

export const validateFormTemplateShortcodes = (content) =>
  api.create(url.FORM_TEMPLATE_SHORTCODE_VALIDATE, { content });

export const editFormTemplateWithAi = (data) =>
  api.create(url.FORM_TEMPLATE_AI_EDIT, data);

export const createFormTemplateVersion = (formId) =>
  api.create(`${url.FORM_TEMPLATE_VERSION_CREATE}/${formId}`, {});

export const publishFormTemplateVersion = (versionId) =>
  api.create(`${url.FORM_TEMPLATE_VERSION_PUBLISH}/${versionId}`, {});

export const getFormTemplateVersions = (formId) =>
  api.get(`${url.FORM_TEMPLATE_VERSION_LIST}/${formId}`);

export const deleteFormTemplate = (id) =>
  api.create(url.FORM_TEMPLATE_DELETE, {
    form_id : id,
  });

export const getFormTemplatePopupSchema = (formId) =>
  api.get(`${url.FORM_TEMPLATE_POPUP_SCHEMA}/${formId}`);

export const mergeFormTemplatePopupSchemas = (formIds) =>
  api.create(url.FORM_TEMPLATE_POPUP_SCHEMA_MERGE, { form_ids: formIds });

export const getFormTemplatePopupOptions = (formId, fieldKey, params) =>
  api.get(`${url.FORM_TEMPLATE_POPUP_OPTIONS}/${formId}/${fieldKey}`, params);

export const validateFormTemplatePopup = (formId, data) =>
  api.create(`${url.FORM_TEMPLATE_POPUP_VALIDATE}/${formId}`, data);

export const previewFormTemplate = (formId, data) =>
  api.create(`${url.FORM_TEMPLATE_PREVIEW}/${formId}`, data);

export const createFormGenerationRun = (formId, data, idempotencyKey) =>
  api.create(`${url.FORM_GENERATION_CREATE}/${formId}`, data, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });

export const renderFormGenerationHtml = (generationRunId) =>
  api.create(`${url.FORM_GENERATION_RENDER_HTML}/${generationRunId}`, {});

export const renderFormGenerationPdf = (generationRunId) =>
  api.create(`${url.FORM_GENERATION_RENDER_PDF}/${generationRunId}`, {});

export const renderFormGenerationDocx = (generationRunId) =>
  api.create(`${url.FORM_GENERATION_RENDER_DOCX}/${generationRunId}`, {});

export const getFormGenerationHistory = (formId) =>
  api.get(`${url.FORM_GENERATION_HISTORY}/${formId}`);

export const downloadFormGenerationArtifact = (artifactId) =>
  api.getBlob(`${url.FORM_GENERATION_DOWNLOAD}/${artifactId}`);

export const renderFormDirect = (formId, format, data) =>
  api.createBlob(`${url.FORM_GENERATION_DIRECT}/${String(format).toLowerCase()}/${formId}`, data);

export const renderFormDirectHtml = (formId, data) =>
  api.create(`${url.FORM_GENERATION_DIRECT}/html/${formId}`, data, { responseType: 'text' });

export const regenerateFormGeneration = (generationRunId, idempotencyKey) =>
  api.create(`${url.FORM_GENERATION_REGENERATE}/${generationRunId}`, {}, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });


// List charges with pagination and filters
export const getRegisterChargeList = (params) =>
  api.get(url.REGISTER_CHARGE_LIST, params);

// Get single charge by ID
export const getRegisterCharge = (id) =>
  api.get(`${url.REGISTER_CHARGE_GET}/${id}`);

// Create new charge
export const createRegisterCharge = (data) =>
  api.create(url.REGISTER_CHARGE_CREATE, data, { headers: {'Content-Type': 'multipart/form-data'}});

// Update existing charge
export const updateRegisterCharge = (id, data) =>
  api.put(`${url.REGISTER_CHARGE_UPDATE}/${id}`, data, { headers: {'Content-Type': 'multipart/form-data'}});

// Delete charge
export const deleteRegisterCharge = (id) =>
  api.create(url.REGISTER_CHARGE_DELETE, {
    charge_id: id,
  });

// Check charge number uniqueness
export const checkChargeNumber = (params) =>
  api.get(url.CHECK_CHARGE_NO, params);

// Get members list for dropdown (individual chargee)
export const getEntityList = (params) =>
  api.get(url.ENTITY_LIST, params);



// Entity Shares
export const getEntityShareList    = (entityId, params) => api.get(`${url.ENTITY_SHARE_LIST}/${entityId}/list`, params);
export const getEntityShareHistory = (entityId, params) => api.get(`${url.ENTITY_SHARE_HISTORY}/${entityId}/history`, params);
export const getEntityShare        = (id)               => api.get(`${url.ENTITY_SHARE_GET}/${id}`);
export const createEntityShare     = (data)             => api.create(url.ENTITY_SHARE_CREATE, data);
export const updateEntityShare     = (id, data)         => api.put(`${url.ENTITY_SHARE_UPDATE}/${id}`, data);
export const deleteEntityShare     = (id)               => api.create(url.ENTITY_SHARE_DELETE, { id });

// Entity Share Decimal Settings
export const getEntityShareDecimalSettings    = (entityId)       => api.get(`${url.ENTITY_SHARE_DECIMAL_SETTINGS}/${entityId}`);
export const upsertEntityShareDecimalSettings = (entityId, data) => api.create(`${url.ENTITY_SHARE_DECIMAL_SETTINGS}/${entityId}`, data);

// Share Transactions
export const createShareAllotment  = (data)         => api.create(url.SHARE_TXN_ALLOTMENT, data);
export const createShareTransfer     = (data, config) => api.create(url.SHARE_TXN_TRANSFER, data, config || {});
export const createShareClubTransfer = (data)         => api.create(url.SHARE_TXN_CLUB_TRANSFER, data);
export const retainShareTxn          = (id)           => api.create(`${url.SHARE_TXN_RETAIN}/${id}`, {});
export const retainClubShareTxn        = (id)  => api.create(`${url.SHARE_TXN_RETAIN_CLUB}/${id}`, {});
export const createShareDissolve       = (data) => api.create(url.SHARE_TXN_DISSOLVE, data);
export const createShareCancel         = (data) => api.create(url.SHARE_TXN_CANCEL, data);
export const createShareBuyback        = (data) => api.create(url.SHARE_TXN_BUYBACK, data);
export const retainDissolveShareTxn    = (id)   => api.create(`${url.SHARE_TXN_RETAIN_DISSOLVE}/${id}`, {});
export const retainBuybackShareTxn       = (id)   => api.create(`${url.SHARE_TXN_RETAIN_BUYBACK}/${id}`,  {});
export const createShareReplacement      = (data) => api.create(url.SHARE_TXN_REPLACEMENT, data);
export const retainReplacementShareTxn   = (id)   => api.create(`${url.SHARE_TXN_RETAIN_REPLACEMENT}/${id}`, {});
export const createShareSplit            = (data) => api.create(url.SHARE_TXN_SPLIT, data);
export const retainSplitShareTxn         = (id)   => api.create(`${url.SHARE_TXN_RETAIN_SPLIT}/${id}`, {});
export const createShareCombine          = (data) => api.create(url.SHARE_TXN_COMBINE, data);
export const retainCombineShareTxn       = (id)   => api.create(`${url.SHARE_TXN_RETAIN_COMBINE}/${id}`, {});
export const createShareReclassification = (data) => api.create(url.SHARE_TXN_RECLASS, data);
export const retainReclassShareTxn       = (id)   => api.create(`${url.SHARE_TXN_RETAIN_RECLASS}/${id}`, {});
export const checkShareFolioNo           = (params) => api.get(url.SHARE_TXN_FOLIO_CHECK, params);
export const checkReplacementCert            = (params) => api.get(url.SHARE_TXN_REPLACEMENT_CHECK, params);
export const listCompatibleReplacementCerts  = (params) => api.get(url.SHARE_TXN_REPLACEMENT_COMPAT, params);
export const getShareholderHistory    = (officialEntityId, entityId) => api.get(`${url.SHARE_TXN_SH_HISTORY}/${officialEntityId}`, { entity_id: entityId });
export const getCompanyShareSummary   = (entityIds) => api.get(url.SHARE_TXN_CO_SUMMARY, { entity_ids: entityIds.join(',') });
export const getShareTxnList       = (entityId, params) => api.get(`${url.SHARE_TXN_LIST}/${entityId}/list`, params);
export const getShareTxn           = (id)           => api.get(`${url.SHARE_TXN_GET}/${id}`);
export const deleteShareTxn        = (id)           => api.delete(`${url.SHARE_TXN_DELETE}/${id}`);

// Share Payments
export const getSharePaymentList    = (txnId)              => api.get(`${url.SHARE_PAYMENT_LIST}/${txnId}/list`);
export const createSharePayment     = (data)               => api.create(url.SHARE_PAYMENT_CREATE, data);
export const updateSharePayment     = (id, data)           => api.put(`${url.SHARE_PAYMENT_LIST}/update/${id}`, data);
export const updateShareInstalment  = (txnId, data)        => api.create(`${url.SHARE_PAYMENT_LIST}/${txnId}/instalment`, data);
export const deleteSharePayment     = (id)                 => api.create(url.SHARE_PAYMENT_DELETE, { id });

export const getReminderList = (params) => api.get(url.REMINDER_LIST, params);
export const getReminder = (id) => api.get(`${url.REMINDER_GET}/${id}`);
export const createReminder = (formData) => api.create(url.REMINDER_CREATE, formData,  { headers: {'Content-Type': 'multipart/form-data'} });
export const updateReminder = (id, formData) => api.put(`${url.REMINDER_UPDATE}/${id}`, formData, { headers: {'Content-Type': 'multipart/form-data'} });
export const deleteReminder = (id) => api.delete(`${url.REMINDER_DELETE}/${id}`);
export const getReminderLogs = (params) => api.get(url.REMINDER_LOGS, params);
export const sendDueReminders = (data) => api.create(url.REMINDER_SEND_DUE, data);
