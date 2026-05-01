// Central API exports
export { default as apiClient } from './client';
export { getApiErrorMessage } from './errors';

// Audit API
export { auditApi, type AuditLog } from './auditApi';

// Activity API (WO activity feed)
export {
  activityApi,
  type ActivityCategory,
  type ActivityKind,
  type ActivityActor,
  type ActivityEvent,
  type ActivityPage,
  type ListActivityParams,
} from './activityApi';

// Notes API (WO notes sub-resource)
export {
  notesApi,
  type WorkOrderNote,
  type CreateNoteRequest,
} from './notesApi';

// Customer API
export {
  customerApi,
  type Customer,
  type Address,
  type ServiceLocation,
  type ServiceLocationSearchResult,
  type ServiceLocationSearchResponse,
  type AdditionalContact,
  type CustomerDisplayMode,
  type CustomerStatus,
  type CreateCustomerRequest,
  type CreateServiceLocationRequest,
  type UpdateCustomerRequest,
  type UpdateBillingAddressRequest,
  type UpdateServiceLocationRequest,
  type UpdateServiceLocationAddressRequest,
  type Pageable,
  type CustomerListDto,
  type CustomerListResponse,
  type CustomerSearchResult,
  type CustomerSearchResponse,
  type ServiceLocationListDto,
  type ServiceLocationListResponse,
  type ServiceLocationDetailDto,
} from './customerApi';

// Contact API
export {
  contactApi,
  type CreateAdditionalContactRequest,
  type UpdateAdditionalContactRequest,
} from './contactApi';

// User API
export {
  userApi,
  type User,
  type Role,
  type Capability,
  type CapabilityGroup,
  type GroupedCapabilitiesResponse,
  type CreateUserRequest,
  type UpdateUserProfileRequest,
  type UpdateUserRolesRequest,
  type UpdateUserEnabledRequest,
  type CreateRoleRequest,
  type UpdateRoleRequest,
  type RestoreAllDefaultsResponse,
  type AuditLogEntry
} from './userApi';

// Work Order API
export {
  workOrderApi,
  LifecycleState,
  ProgressCategory,
  WorkOrderPriority,
  type WorkOrder,
  type WorkOrderSummary,
  type WorkItemResponse,
  type WorkItemEquipmentSummary,
  type Page,
  type CreateWorkOrderRequest,
  type CreateWorkItemRequest,
  type UpdateWorkItemRequest,
  type UpdateWorkOrderRequest,
  type CancelWorkOrderRequest,
  type TransitionWorkItemStatusRequest,
  type ListWorkOrdersParams,
  type WorkOrderSortField,
  type SortDirection
} from './workOrderApi';

// Equipment APIs
export {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  partsInventoryApi,
  warehousesApi,
  EquipmentStatus,
  WarehouseStatus,
  type Equipment,
  type EquipmentSummary,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
  type ListEquipmentParams,
  type EquipmentSortField,
  type EquipmentSortDirection,
  type EquipmentType,
  type CreateEquipmentTypeRequest,
  type UpdateEquipmentTypeRequest,
  type EquipmentCategory,
  type CreateEquipmentCategoryRequest,
  type UpdateEquipmentCategoryRequest,
  type PartsInventory,
  type CreatePartsInventoryRequest,
  type UpdatePartsInventoryRequest,
  type AdjustQuantityRequest,
  type Warehouse,
  type CreateWarehouseRequest,
  type UpdateWarehouseRequest,
} from './equipmentApi';

// Financial APIs
export {
  invoicesApi,
  quotesApi,
  paymentsApi,
  InvoiceStatus,
  QuoteStatus,
  PaymentMethod,
  type Invoice,
  type InvoiceLineItem,
  type CreateInvoiceRequest,
  type CreateInvoiceLineItemRequest,
  type UpdateInvoiceStatusRequest,
  type Quote,
  type QuoteLineItem,
  type CreateQuoteRequest,
  type CreateQuoteLineItemRequest,
  type UpdateQuoteStatusRequest,
  type Payment,
  type CreatePaymentRequest,
} from './financialApi';

// Scheduling APIs
export {
  dispatchesApi,
  availabilityApi,
  recurringOrdersApi,
  type Dispatch,
  type CreateDispatchRequest,
  type UpdateDispatchRequest,
  type Availability,
  type CreateAvailabilityRequest,
  type UpdateAvailabilityRequest,
  type RecurringOrder,
  type CreateRecurringOrderRequest,
  type UpdateRecurringOrderRequest,
} from './schedulingApi';

// Tenant Settings API
export {
  tenantSettingsApi,
  type TenantSettings,
  type UpdateTenantSettingsRequest,
  type LogoUrls,
  type UploadLogoResponse,
  type Glossary,
  type GlossaryEntry,
} from './tenantSettingsApi';

// Glossary API
export { glossaryApi, type EntityInfo } from './glossaryApi';

// Notification API
export {
  notificationApi,
  NotificationStatus,
  NotificationChannel,
  type NotificationLogDto,
  type NotificationPreferenceDto,
  type CreateNotificationPreferenceRequest,
  type UpdateNotificationPreferenceRequest,
  type NotificationLogsQueryParams,
  type PageableResponse,
} from './notificationApi';

// Notification Template API
export {
  notificationTemplateApi,
  type NotificationTemplate,
  type NotificationTemplateListItem,
  type NotificationTemplateVariable,
  type CreateNotificationTemplateRequest,
  type UpdateNotificationTemplateRequest,
  type TemplatePreviewRequest,
  type TemplatePreviewResponse,
  type ValidateTemplateRequest,
  type ValidateTemplateResponse,
  type ValidationWarning,
  type TemplateVersion,
  type TemplateVersionHistoryResponse,
} from './notificationTemplateApi';

// Dispatch Region API
export {
  dispatchRegionApi,
  type DispatchRegion,
  type CreateDispatchRegionRequest,
  type UpdateDispatchRegionRequest,
} from './dispatchRegionApi';

// Work Order Config API (Phase 4)
export {
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  statusWorkflowsApi,
  workflowConfigApi,
  STATUS_CATEGORIES,
  type TaxonomyItem,
  type CreateTaxonomyItemRequest,
  type UpdateTaxonomyItemRequest,
  type WorkItemStatus,
  type CreateWorkItemStatusRequest,
  type UpdateWorkItemStatusRequest,
  type StatusCategory,
  type StatusWorkflowRule,
  type CreateStatusWorkflowRequest,
  type WorkflowConfig,
  type UpdateWorkflowConfigRequest,
  type DispatchBoardType,
} from './workOrderConfigApi';
