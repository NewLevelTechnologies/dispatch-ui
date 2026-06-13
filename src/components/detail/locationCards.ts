// Transitional shared surface for the SINGLE customer-detail page (one wallet,
// one site → it inlines this location's operational cards, which MUST be the
// same components the Location detail page uses — build once, don't reimplement).
//
// These cards' implementations currently live, exported in place, in
// ServiceLocationDetailPage so their entangled module-private sub-components
// (FactRow, ContactBlock, WorkOrderRow, …) don't have to move yet. Relocate the
// impls into components/detail/ when convenient — importers (SingleCustomerDetail)
// import from here and won't change. See project_customer_detail_redesign.
export {
  SiteWorkOrdersCard,
  SiteInstructionsCard,
  SiteContactCard,
  DispatchesTab,
} from '../../pages/ServiceLocationDetailPage';
