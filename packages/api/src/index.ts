// Central API exports
export { default as apiClient, apiClient as api, type AuthTokenProvider, ApiClient } from './client';
export { getApiErrorMessage, getApiErrorCode } from './errors';
export { setPublicApiBaseURL } from './publicClient';
export { createAmplifyAuthProvider } from './amplifyAuthProvider';

// Audit API
export {
  auditApi,
  type AuditLog,
  type AuditFieldChange,
  type AccountActivityEvent,
  type ServiceLocationAuditEntry,
} from './auditApi';

// Activity API (WO activity feed)
export {
  activityApi,
  type ActivityCategory,
  type ActivityClassification,
  type ActivityKind,
  type ActivityActor,
  type ActivityEvent,
  type ActivityPage,
  type ListActivityParams,
  type ActivityWorkOrderRef,
  type LocationActivityEvent,
  type LocationActivityPage,
} from './activityApi';

// Notes API (WO notes sub-resource)
export {
  notesApi,
  type WorkOrderNote,
  type CreateNoteRequest,
} from './notesApi';

// Notes API (customer + service-location notes — see noteApi.ts header)
export { noteApi, type NoteDto } from './noteApi';

// Arrival facts API (service-location structured arrival facts — see arrivalFactApi.ts header)
export {
  arrivalFactApi,
  type ArrivalFactDto,
  type CreateArrivalFactRequest,
  type UpdateArrivalFactRequest,
} from './arrivalFactApi';

// Customer API
export {
  customerApi,
  type Customer,
  type Address,
  type AddressInput,
  type AddressVerifyRequest,
  type AddressVerifyResponse,
  type ServiceLocation,
  type ServiceLocationSearchResult,
  type ServiceLocationSearchResponse,
  type AdditionalContact,
  type CustomerCategory,
  type CustomerShape,
  type CustomerStatus,
  type CustomerType,
  type InvoiceDeliveryMethod,
  type CreateCustomerRequest,
  type CreateServiceLocationRequest,
  type UpdateCustomerRequest,
  type UpdateBillingAddressRequest,
  type UpdateServiceLocationRequest,
  type UpdateServiceLocationAddressRequest,
  type Pageable,
  type CustomerListDto,
  type CustomerListResponse,
  type CustomerListCounts,
  type CustomerSearchResult,
  type CustomerSearchResponse,
  type DuplicateMatchReason,
  type DuplicateCandidate,
  type DuplicateCheckResponse,
  type ServiceLocationListDto,
  type ServiceLocationListResponse,
  type ServiceLocationListCounts,
  type ServiceLocationDetailDto,
  type PremiseType,
  type TagSummary,
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
  type RoleMember,
  type RolesListResponse,
  type PageEnvelope,
  type AssignableUser,
  type UserSearchParams,
  type UserPageCounts,
  type RoleMemberSearchParams,
  type InvitationStatus,
  type AccentInUseRef,
  type ColorsInUseMap,
  type AuditLogEntry,
  type TwoFactorStatus
} from './userApi';

// Work Order API
export {
  workOrderApi,
  LifecycleState,
  ProgressCategory,
  WorkOrderPriority,
  type WorkOrder,
  type WorkOrderSummary,
  type WorkOrderAssignedUser,
  type AssignedUserState,
  type WorkItemResponse,
  type WorkItemSummaryProjection,
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

// Shared React Query options for the embedded work-orders list
export { workOrdersListQueryOptions } from './workOrdersListQuery';

// Service Agreement API (recurring scheduled work — work-order-service)
export {
  agreementApi,
  agreementNotesApi,
  agreementPlanApi,
  type AgreementKind,
  type AgreementClassification,
  type AgreementStatus,
  type CadenceUnit,
  type BillingMode,
  type CoverageSelectorMode,
  type CoverageMembershipSource,
  type AgreementVisitStatus,
  type AgreementVisitsWhen,
  type VisitScopeItem,
  type VisitTemplateResponse,
  type AgreementCustomerRef,
  type AgreementResponse,
  type AgreementSummaryResponse,
  type CustomerAgreementSummaryResponse,
  type VisitStatusEntry,
  type CreateAgreementRequest,
  type UpdateAgreementRequest,
  type CreateVisitTemplateRequest,
  type UpdateVisitTemplateRequest,
  type CoverageMembership,
  type CoverageResponse,
  type UpdateCoverageSelectorRequest,
  type AddCoverageLocationsRequest,
  type AgreementVisitResponse,
  type AgreementComplianceSummary,
  type BillingScheduleResponse,
  type UpsertBillingScheduleRequest,
  type BillingInstallmentResponse,
  type BillingInstallmentStatus,
  type RevenueRecognitionResponse,
  type MemberBenefits,
  type AgreementPlanResponse,
  type AgreementPlanPage,
  type ListAgreementPlansParams,
  type CreateAgreementPlanRequest,
  type UpdateAgreementPlanRequest,
} from './agreementApi';

// Equipment APIs
export {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  equipmentCategoryFieldsApi,
  equipmentFiltersApi,
  equipmentImagesApi,
  equipmentNotesApi,
  reportsApi,
  tenantFilterSizesApi,
  partsInventoryApi,
  warehousesApi,
  EquipmentStatus,
  EQUIPMENT_IMAGE_MAX_BYTES,
  EQUIPMENT_IMAGE_MAX_PER_EQUIPMENT,
  EQUIPMENT_IMAGE_CAPTION_MAX_CHARS,
  EQUIPMENT_IMAGE_CONTENT_TYPES,
  EQUIPMENT_NOTE_BODY_MAX_CHARS,
  WarehouseStatus,
  type Equipment,
  type EquipmentSummary,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
  type NameplateExtractionResponse,
  type ListEquipmentParams,
  type EquipmentSortField,
  type EquipmentSortDirection,
  type EquipmentType,
  type CreateEquipmentTypeRequest,
  type UpdateEquipmentTypeRequest,
  type EquipmentCategory,
  type CreateEquipmentCategoryRequest,
  type UpdateEquipmentCategoryRequest,
  type EquipmentCategoryField,
  type EquipmentFieldDataType,
  type CreateEquipmentCategoryFieldRequest,
  type UpdateEquipmentCategoryFieldRequest,
  type EquipmentFilter,
  type CreateEquipmentFilterRequest,
  type UpdateEquipmentFilterRequest,
  type EquipmentImage,
  type EquipmentImageContentType,
  type RequestImageUploadUrlRequest,
  type RequestImageUploadUrlResponse,
  type UpdateEquipmentImageRequest,
  type EquipmentNote,
  type SaveEquipmentNoteRequest,
  type FilterPullListEntry,
  type FilterPullListParams,
  type TenantFilterSize,
  type PartsInventory,
  type CreatePartsInventoryRequest,
  type UpdatePartsInventoryRequest,
  type AdjustQuantityRequest,
  type Warehouse,
  type CreateWarehouseRequest,
  type UpdateWarehouseRequest,
} from './equipmentApi';

// Purchase Orders + Vendors (inventory-service) — WO Purchasing tab
export {
  purchaseOrderApi,
  vendorApi,
  poFilesApi,
  PO_FILE_CONTENT_TYPES,
  PO_FILE_MAX_BYTES,
  type PurchaseOrderType,
  type PurchaseOrderStatus,
  type InventoryMode,
  type PurchaseOrderListItem,
  type PurchaseOrderSummary,
  type PurchaseOrderLine,
  type PurchaseOrderResponse,
  type PurchaseOrderLineInput,
  type CreatePurchaseOrderRequest,
  type UpdatePurchaseOrderRequest,
  type PoFileResponse,
  type PoFileStatus,
  type Vendor,
  type VendorKind,
  type CreateVendorRequest,
  type UpdateVendorRequest,
  type ReceiptExtractionResult,
  type ReceiptExtractionLine,
} from './purchaseOrderApi';

// Files APIs (location aggregate + direct site uploads)
export {
  filesApi,
  locationFilesApi,
  equipmentFilesApi,
  workOrderFilesApi,
  agreementFilesApi,
  FILE_MAX_BYTES,
  FILE_CAPTION_MAX_CHARS,
  FILE_CONTENT_TYPES,
  OFFICE_DOC_CONTENT_TYPES,
  VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
  LOCATION_FILE_CATEGORIES,
  LOCATION_FILE_CATEGORY_LABELS,
  type FileContentType,
  type VideoContentType,
  type FileKind,
  type FileStatus,
  type FileCounts,
  type PagedFiles,
  type ListFilesParams,
  type LocationFileCategory,
  type LocationFile,
  type WorkOrderFile,
  type WorkOrderFileCaptureTag,
  type RequestFileUploadUrlResponse,
  type RequestLocationFileUploadUrlRequest,
  type RequestEquipmentFileUploadUrlRequest,
  type RequestWorkOrderFileUploadUrlRequest,
  type PatchLocationFileRequest,
  type PatchWorkOrderFileRequest,
} from './filesApi';

// Financial APIs
export {
  invoicesApi,
  quotesApi,
  paymentsApi,
  financialSummaryApi,
  financialActivityApi,
  type FinancialActivityEvent,
  type FinancialActivityKind,
  type FinancialActivityPage,
  InvoiceStatus,
  InvoiceAgingBucket,
  QuoteStatus,
  PaymentMethod,
  type Invoice,
  type InvoiceLineItem,
  type CreateInvoiceRequest,
  type CreateInvoiceLineItemRequest,
  type UpdateInvoiceStatusRequest,
  type LocationInvoiceSummaryResponse,
  type CustomerArSummaryResponse,
  type ArAgingBucket,
  type ArPaymentMethod,
  type InvoiceListItemRow,
  type InvoiceListPage,
  type InvoiceSortField,
  type ListInvoicesParams,
  type Quote,
  type QuoteLineItem,
  type CreateQuoteRequest,
  type CreateQuoteLineItemRequest,
  type UpdateQuoteStatusRequest,
  type Payment,
  type NestedInvoicePayment,
  type PaymentStatus,
  type CreatePaymentRequest,
  type SendResponse,
  type ReissueShareLinkResponse,
  type ExtendShareLinkResponse,
  type WorkOrderFinancialSummary,
} from './financialApi';

// Public Financial APIs (share-link unauthenticated)
export {
  publicFinancialApi,
  type PublicTenantBranding,
  type PublicCustomerSummary,
  type PublicInvoiceResponse,
  type PublicQuoteResponse,
  type PublicInvoiceData,
  type PublicQuoteData,
  type PublicLineItem,
  type PublicPayment,
  type PublicInvoiceStatus,
  type PublicQuoteStatus,
  type PublicPaymentMethod,
  type PublicPaymentStatus,
} from './publicFinancialApi';

// Scheduling APIs
export {
  dispatchesApi,
  dispatchNotesApi,
  availabilityApi,
  recurringOrdersApi,
  dispatchRowTitle,
  type Dispatch,
  type DispatchStatus,
  type DispatchLifecycle,
  type DispatchNoteResponse,
  type CreateDispatchNoteRequest,
  type DispatchBoardRow,
  type DispatchBoardPage,
  type DispatchSortField,
  type ListDispatchesParams,
  type LocationDispatchResponse,
  type LocationDispatchPage,
  type ListLocationDispatchesParams,
  type LocationDispatchesWhen,
  type CreateDispatchRequest,
  type UpdateDispatchRequest,
  type TechState,
  type OnSiteTech,
  type WorkOrderTech,
  type LocationTechSummaryResponse,
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
  type RecognitionBasis,
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
  type NotificationAudience,
  type VariableScope,
  type CreateNotificationTemplateRequest,
  type UpdateNotificationTemplateRequest,
  type TemplatePreviewRequest,
  type TemplatePreviewResponse,
  type ValidateTemplateRequest,
  type ValidateTemplateResponse,
  type ValidationWarning,
  type TemplateVersion,
  type TemplateVersionHistoryResponse,
  type TemplateSample,
  type TemplateSamplesResponse,
  type SendTestRequest,
} from './notificationTemplateApi';

// Dispatch Region API
export {
  dispatchRegionApi,
  type DispatchRegion,
  type CreateDispatchRegionRequest,
  type UpdateDispatchRegionRequest,
} from './dispatchRegionApi';

// Tag API (tenant tag library + customer / service-location assignment)
export { tagApi, type Tag, type TagScope, type TagColor, type CreateTagRequest } from './tagApi';

// Approvals API (workflow engine approval requests)
export {
  approvalsApi,
  type ApprovalRequest,
  type ApprovalStatus,
  type ApprovalStatusRef,
  type ApprovalTransitionRef,
  type ApprovalWorkItemRef,
  type ApprovalWorkOrderRef,
  type ApprovalUserRef,
  type ApprovalsPage,
  type ListApprovalsParams,
  type ApprovalCountParams,
  type ApprovalsBellSummary,
  type ApproveApprovalRequest,
  type RejectApprovalRequest,
} from './approvalsApi';

// Two-Factor Auth API
export {
  twoFactorApi,
  type TwoFactorMethod,
  type TotpSetupResponse,
  type ConfirmRequestResponse,
} from './twoFactorApi';

// Work Order Config API (Phase 4)
export {
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  workflowsApi,
  workflowConfigApi,
  STATUS_CATEGORIES,
  type WorkOrderType,
  type WorkOrderTypeColorOwner,
  type WorkOrderTypeListResponse,
  type CreateWorkOrderTypeRequest,
  type UpdateWorkOrderTypeRequest,
  type AccentConflictBody,
  type Division,
  type CreateDivisionRequest,
  type UpdateDivisionRequest,
  type WorkItemStatus,
  type CreateWorkItemStatusRequest,
  type UpdateWorkItemStatusRequest,
  type SeededRowImmutableBody,
  type StatusCategory,
  type Workflow,
  type WorkflowSummary,
  type WorkflowTransition,
  type CreateWorkflowTransitionRequest,
  type UpdateWorkflowTransitionRequest,
  type WorkflowConfig,
  type UpdateWorkflowConfigRequest,
  type DispatchBoardType,
  type EnforcementMode,
} from './workOrderConfigApi';
