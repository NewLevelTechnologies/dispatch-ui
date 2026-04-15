// Central API exports
export { default as apiClient } from './client';

// Customer API
export {
  customerApi,
  type Customer,
  type Address,
  type ServiceLocation,
  type AdditionalContact,
  type CustomerDisplayMode,
  type CustomerStatus,
  type CreateCustomerRequest,
  type CreateServiceLocationRequest,
  type UpdateCustomerRequest,
  type UpdateBillingAddressRequest,
  type UpdateServiceLocationRequest,
  type UpdateServiceLocationAddressRequest,
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
  type RestoreAllDefaultsResponse
} from './userApi';

// Work Order API
export {
  workOrderApi,
  WorkOrderStatus,
  type WorkOrder,
  type CreateWorkOrderRequest,
  type UpdateWorkOrderRequest
} from './workOrderApi';

// Equipment APIs
export {
  equipmentApi,
  partsInventoryApi,
  warehousesApi,
  EquipmentStatus,
  WarehouseStatus,
  type Equipment,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
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
