// Central API exports
export { default as apiClient } from './client';

// Customer API
export {
  customerApi,
  type Customer,
  type Address,
  type ServiceLocation,
  type CustomerDisplayMode,
  type CustomerStatus,
  type CreateCustomerRequest,
  type CreateServiceLocationRequest,
  type UpdateCustomerRequest,
  type UpdateBillingAddressRequest,
  type UpdateServiceLocationRequest,
  type UpdateServiceLocationAddressRequest,
} from './customerApi';

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
