import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { mockAnimationsApi } from 'jsdom-testing-mocks';

// Mock animations API for Headless UI
mockAnimationsApi();

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock AWS Amplify
vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: vi.fn(),
  },
}));

// Mock Amplify UI React
vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: vi.fn(() => ({
    authStatus: 'authenticated',
    user: { username: 'test-user' },
    signOut: vi.fn(),
  })),
  Authenticator: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver for Headless UI dropdowns
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock react-i18next with actual translations
vi.mock('react-i18next', () => {
  const translations = {
    'app.loading': 'Loading...',
    'app.name': 'Dispatch',
    'auth.signInPrompt': 'Sign in to your account',
    'common.actions.add': 'Add {{entity}}',
    'common.actions.addFirst': 'Add your first {{entity, lowercase}}',
    'common.actions.back': 'Back',
    'common.actions.create': 'Create {{entity}}',
    'common.actions.createFirst': 'Create your first {{entity, lowercase}}',
    'common.actions.deleteConfirm': 'Are you sure you want to delete {{name}}?',
    'common.actions.deleteConfirmGeneric': 'Are you sure you want to delete this {{entity, lowercase}}?',
    'common.actions.edit': 'Edit {{entity}}',
    'common.actions.errorLoading': 'Error loading {{entities, lowercase}}',
    'common.actions.loading': 'Loading {{entities, lowercase}}...',
    'common.actions.noMatchSearch': 'No {{entities, lowercase}} match your search.',
    'common.actions.notFound': 'No {{entities, lowercase}} found',
    'common.active': 'Active',
    'common.add': 'Add',
    'common.cancel': 'Cancel',
    'common.cloning': 'Cloning...',
    'common.create': 'Create',
    'common.delete': 'Delete',
    'common.deleting': 'Deleting...',
    'common.disabled': 'Disabled',
    'common.edit': 'Edit',
    'common.enabled': 'Enabled',
    'common.hide': 'Hide',
    'common.restoring': 'Restoring...',
    'common.search': 'Search...',
    'common.show': 'Show',
    'common.view': 'View',
    'common.form.accessInstructions': 'Access Instructions',
    'common.form.address': 'Address',
    'common.form.addressLine2': 'Address Line 2',
    'common.form.billingAddress': 'Billing Address',
    'common.form.billingAddressSameAsService': 'Send invoice to same address',
    'common.form.city': 'City',
    'common.form.contractPricingTier': 'Contract Pricing Tier',
    'common.form.description': 'Description',
    'common.form.descriptionCreate': 'Create a new {{entity, lowercase}} record.',
    'common.form.descriptionEdit': 'Update {{entity, lowercase}} information.',
    'common.form.email': 'Email',
    'common.form.errorCreate': 'Failed to create {{entity, lowercase}}',
    'common.form.errorUpdate': 'Failed to update {{entity, lowercase}}',
    'common.form.firstName': 'First Name',
    'common.form.lastName': 'Last Name',
    'common.form.locationName': 'Location Name',
    'common.form.name': 'Name',
    'common.form.notes': 'Notes',
    'common.form.paymentTermsDays': 'Payment Terms (Days)',
    'common.form.phone': 'Phone',
    'common.form.requiresPurchaseOrder': 'Requires Purchase Order',
    'common.form.role': 'Role',
    'common.form.select': 'Select...',
    'common.form.serviceAddress': 'Service Address',
    'common.form.siteContactEmail': 'Site Contact Email',
    'common.form.siteContactName': 'Site Contact Name',
    'common.form.siteContactPhone': 'Site Contact Phone',
    'common.form.state': 'State',
    'common.form.stateHelper': 'CA',
    'common.form.status': 'Status',
    'common.form.streetAddress': 'Street Address',
    'common.form.taxExempt': 'Tax Exempt',
    'common.form.taxExemptCertificate': 'Tax Exempt Certificate',
    'common.form.titleCreate': '{{action}} {{entity}}',
    'common.form.titleEdit': '{{action}} {{entity}}',
    'common.form.zipCode': 'Zip Code',
    'common.moreOptions': 'More options',
    'common.saving': 'Saving...',
    'common.signOut': 'Sign out',
    'common.theme': 'Theme',
    'common.update': 'Update',
    'customers.description': 'Manage your customer database',
    'customers.displayMode.simple': 'Simple',
    'customers.displayMode.standard': 'Standard',
    'customers.form.billingAddressHelp': 'Check this if invoices should be sent to the service address',
    'customers.form.billingAddressSection': 'Billing Address',
    'customers.form.businessDetails': 'Business Details',
    'customers.form.locationNameHelp': 'Optional - useful for businesses with multiple locations',
    'customers.form.paymentTermsHelp': '0 = Due on receipt',
    'customers.form.serviceLocationSection': 'Service Location',
    'customers.table.location': 'Location',
    'customers.table.locations': 'Locations',
    'customers.table.moreLocations': '+{{count}} more',
    'dashboard.stats.activeWorkOrders': 'Active work orders',
    'dashboard.stats.thisMonth': 'This month',
    'dashboard.stats.totalCustomers': 'Total customers',
    'dashboard.welcome': 'Welcome to Dispatch',
    'entities.customer': 'Customer',
    'entities.customers': 'Customers',
    'entities.dashboard': 'Dashboard',
    'entities.equipment': 'Equipment',
    'entities.financial': 'Financial',
    'entities.invoice': 'Invoice',
    'entities.invoices': 'Invoices',
    'entities.payment': 'Payment',
    'entities.payments': 'Payments',
    'entities.quote': 'Quote',
    'entities.quotes': 'Quotes',
    'entities.revenue': 'Revenue',
    'entities.role': 'Role',
    'entities.roles': 'Roles',
    'entities.scheduling': 'Scheduling',
    'entities.serviceLocation': 'Service Location',
    'entities.serviceLocations': 'Service Locations',
    'entities.user': 'User',
    'entities.users': 'Users',
    'entities.workOrder': 'Work Order',
    'entities.workOrders': 'Work Orders',
    'equipment.comingSoon': 'Coming soon...',
    'equipment.description': 'Track equipment and inventory',
    'equipment.descriptionParts': 'Manage parts inventory across warehouses',
    'equipment.descriptionWarehouses': 'Manage warehouse locations and inventory storage',
    'equipment.lowStock': 'Low Stock',
    'equipment.entities.part': 'Part',
    'equipment.entities.parts': 'Parts',
    'equipment.entities.warehouse': 'Warehouse',
    'equipment.entities.warehouses': 'Warehouses',
    'equipment.form.customer': 'Customer',
    'equipment.form.equipmentType': 'Equipment Type',
    'equipment.form.locationBin': 'Bin Location',
    'equipment.form.location': 'Location',
    'equipment.form.manager': 'Manager Name',
    'equipment.form.modelNumber': 'Model Number',
    'equipment.form.partName': 'Part Name',
    'equipment.form.partNumber': 'Part Number',
    'equipment.form.quantityOnHand': 'Quantity On Hand',
    'equipment.form.reorderPoint': 'Reorder Point',
    'equipment.form.reorderQuantity': 'Reorder Quantity',
    'equipment.form.serialNumber': 'Serial Number',
    'equipment.form.unitCost': 'Unit Cost',
    'equipment.form.warehouse': 'Warehouse',
    'equipment.table.partNumber': 'Part #',
    'equipment.table.partName': 'Part Name',
    'equipment.table.warehouse': 'Warehouse',
    'equipment.table.quantity': 'Quantity',
    'equipment.table.reorderPoint': 'Reorder Point',
    'equipment.table.unitCost': 'Unit Cost',
    'financial.comingSoon': 'Coming soon...',
    'financial.description': 'Manage invoices, quotes, and payments',
    'invoices.description': 'Manage customer invoices and billing',
    'payments.description': 'Track customer payments and transactions',
    'quotes.description': 'Create and manage customer quotes',
    'scheduling.comingSoon': 'Coming soon...',
    'scheduling.description': 'Manage dispatches and technician schedules',
    'scheduling.descriptionDispatches': 'Schedule and manage work order dispatches',
    'scheduling.descriptionAvailability': 'Manage user availability schedules',
    'scheduling.descriptionRecurringOrders': 'Manage recurring maintenance schedules',
    'scheduling.entities.dispatch': 'Dispatch',
    'scheduling.entities.dispatches': 'Dispatches',
    'scheduling.entities.availability': 'Availability',
    'scheduling.entities.availabilityRecord': 'Availability Record',
    'scheduling.entities.recurringOrder': 'Recurring Order',
    'scheduling.entities.recurringOrders': 'Recurring Orders',
    'scheduling.form.assignedUser': 'Assigned User',
    'scheduling.form.customer': 'Customer',
    'scheduling.form.date': 'Date',
    'scheduling.form.endTime': 'End Time',
    'scheduling.form.equipment': 'Equipment',
    'scheduling.form.estimatedDuration': 'Estimated Duration (minutes)',
    'scheduling.form.frequency': 'Frequency',
    'scheduling.form.nextScheduledDate': 'Next Scheduled Date',
    'scheduling.form.reason': 'Reason',
    'scheduling.form.scheduledDate': 'Scheduled Date',
    'scheduling.form.startTime': 'Start Time',
    'scheduling.form.user': 'User',
    'scheduling.form.workOrder': 'Work Order',
    'scheduling.frequency.annually': 'Annually',
    'scheduling.frequency.monthly': 'Monthly',
    'scheduling.frequency.quarterly': 'Quarterly',
    'scheduling.frequency.weekly': 'Weekly',
    'users.actions.deleteWarning': 'This action cannot be undone. All user data and history will be permanently removed.',
    'users.actions.disableConfirm': 'Are you sure you want to disable {{name}}? They will no longer be able to log in.',
    'users.actions.enableConfirm': 'Are you sure you want to enable {{name}}?',
    'users.description': 'Manage user accounts and permissions',
    'users.detail.activityComingSoon': 'Activity history coming soon',
    'users.detail.activityHelper': 'Will show login history, actions performed, etc.',
    'users.detail.auditComingSoon': 'Audit trail coming soon',
    'users.detail.auditHelper': 'Will show permission changes, profile updates, etc.',
    'users.detail.basicInfo': 'Basic Information',
    'users.detail.capabilities': 'Capabilities',
    'users.detail.cognitoSub': 'Cognito Sub',
    'users.detail.created': 'Created',
    'users.detail.lastUpdated': 'Last Updated',
    'users.detail.noCapabilities': 'No capabilities assigned',
    'users.detail.recentActivity': 'Recent Activity',
    'users.detail.rolePermissions': 'Role & Permissions',
    'users.detail.showLess': 'Show less',
    'users.detail.showMore': 'Show {{count}} more...',
    'users.detail.systemInfo': 'System Information',
    'users.detail.userId': 'User ID',
    'users.filter.all': 'All',
    'users.filter.allRoles': 'All roles',
    'users.filter.clearFilters': 'Clear filters',
    'users.filter.disabled': 'Disabled',
    'users.filter.enabled': 'Enabled',
    'users.filter.role': 'Role',
    'users.filter.status': 'Status',
    'users.form.adminRoleInfo': 'Admin role includes all permissions. Other roles are not needed.',
    'users.form.rolePlaceholder': 'Select a role...',
    'users.form.roleRequired': 'Please select at least one role',
    'users.form.sendInvite': 'Send invitation email',
    'users.search.noMatch': 'No users match "{{query}}"',
    'users.search.placeholder': 'Search by name, email, or role...',
    'users.status.disabled': 'Disabled',
    'users.status.enabled': 'Enabled',
    'users.table.actions': 'Actions',
    'users.table.auditLog': 'Audit Log',
    'users.table.disable': 'Disable',
    'users.table.enable': 'Enable',
    'users.table.lastUpdated': 'Last Updated',
    'capabilities.clearGroup': 'Clear group',
    'capabilities.collapseAll': 'Collapse All',
    'capabilities.description': 'Select the capabilities this role should have. Users assigned this role will inherit these permissions.',
    'capabilities.errorLoading': 'Error loading capabilities',
    'capabilities.expandAll': 'Expand All',
    'capabilities.label': 'Capabilities',
    'capabilities.noCapabilities': 'No capabilities assigned',
    'capabilities.selectedLower': 'selected',
    'capabilities.totalCount': 'capabilities',
    'capabilities.unknownError': 'Unknown error',
    'roles.actions.clone': 'Clone Role',
    'roles.actions.cloneDescription': 'Create a copy of "{{name}}" with all its capabilities.',
    'roles.actions.deleteWarning': 'This action cannot be undone. Users assigned this role will lose associated capabilities.',
    'roles.actions.errorClone': 'Failed to clone role',
    'roles.actions.errorRestoreAll': 'Failed to restore default roles',
    'roles.actions.restore': 'Restore',
    'roles.actions.restoreAllDefaults': 'Restore All Defaults',
    'roles.actions.restoreAllDefaultsConfirm': 'Restore All Default Roles?',
    'roles.actions.restoreAllDefaultsDescription': 'This will reset all {{count}} default system roles to their original state.',
    'roles.actions.restoreAllDefaultsDetails': 'What will happen: Modified system roles will be reset (names and capabilities). Deleted system roles will be recreated. Custom roles you\'ve created will be preserved. User assignments will be preserved.',
    'roles.actions.restoreAllDefaultsSuccess': 'Default roles restored successfully',
    'roles.actions.restoreAllDefaultsWarning': '⚠️ Any changes you\'ve made to default roles will be lost',
    'roles.actions.restoreDefaults': 'Restore Defaults',
    'roles.actions.restoreDefaultsConfirm': 'Restore "{{name}}" to default capabilities?',
    'roles.actions.restoreDefaultsWarning': 'This will reset all capabilities to the system template defaults. Custom changes will be lost.',
    'roles.description': 'Manage roles and their capabilities',
    'roles.restoreAllSummary.customRolesPreserved': '{{count}} custom role preserved',
    'roles.restoreAllSummary.rolesRecreated': '{{count}} role recreated',
    'roles.restoreAllSummary.rolesReset': '{{count}} role reset to defaults',
    'roles.restoreAllSummary.userAssignmentsPreserved': 'All user assignments have been preserved.',
    'roles.detail.created': 'Created',
    'roles.detail.lastUpdated': 'Last Updated',
    'roles.detail.roleId': 'Role ID',
    'roles.detail.roleInfo': 'Role Information',
    'roles.detail.systemInfo': 'System Information',
    'roles.detail.templateCode': 'Template Code',
    'roles.detail.totalCapabilities': 'Total Capabilities',
    'roles.form.descriptionCreate': 'Create a new role by defining its name, description, and capabilities.',
    'roles.form.descriptionEdit': 'Update role name, description, and capabilities.',
    'roles.table.capabilities': 'Capabilities',
    'roles.table.lastUpdated': 'Last Updated',
    'workOrders.description': 'Manage work orders and service requests',
    'workOrders.form.customerPlaceholder': 'Select a customer...',
    'workOrders.form.customerRequired': 'Please select a customer',
    'workOrders.form.scheduledDate': 'Scheduled Date',
    'workOrders.status.cancelled': 'Cancelled',
    'workOrders.status.completed': 'Completed',
    'workOrders.status.inProgress': 'In Progress',
    'workOrders.status.pending': 'Pending',
    'workOrders.status.scheduled': 'Scheduled',
    'workOrders.table.amount': 'Amount',
    'workOrders.table.id': 'ID',
    'workOrders.table.scheduled': 'Scheduled',
  };

  return {
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        let translation = translations[key as keyof typeof translations] || key;
        if (params) {
          Object.keys(params).forEach((param) => {
            const value = String(params[param]);
            // Handle {{param, lowercase}} format
            translation = translation.replace(`{{${param}, lowercase}}`, value.toLowerCase());
            // Handle {{param}} format
            translation = translation.replace(`{{${param}}}`, value);
          });
        }
        return translation;
      },
      i18n: {
        changeLanguage: () => new Promise(() => {}),
      },
    }),
    initReactI18next: {
      type: '3rdParty',
      init: () => {},
    },
  };
});

// Mock ThemeContext
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn(),
    resolvedTheme: 'light',
  })),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useCurrentUser hook
vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(() => ({
    data: {
      id: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      enabled: true,
      capabilities: [
        'VIEW_USERS',
        'INVITE_USERS',
        'EDIT_USERS',
        'DELETE_USERS',
        'VIEW_ROLES',
        'CREATE_ROLES',
        'EDIT_ROLES',
        'DELETE_ROLES',
      ],
      roles: [],
    },
    isLoading: false,
    error: null,
  })),
  useHasCapability: vi.fn((capability: string) => {
    const capabilities = [
      'VIEW_USERS',
      'INVITE_USERS',
      'EDIT_USERS',
      'DELETE_USERS',
      'VIEW_ROLES',
      'CREATE_ROLES',
      'EDIT_ROLES',
      'DELETE_ROLES',
    ];
    return capabilities.includes(capability);
  }),
  useHasAnyCapability: vi.fn((...capabilities: string[]) => {
    const mockCapabilities = [
      'VIEW_USERS',
      'INVITE_USERS',
      'EDIT_USERS',
      'DELETE_USERS',
      'VIEW_ROLES',
      'CREATE_ROLES',
      'EDIT_ROLES',
      'DELETE_ROLES',
    ];
    return capabilities.some(cap => mockCapabilities.includes(cap));
  }),
  useHasAllCapabilities: vi.fn((...capabilities: string[]) => {
    const mockCapabilities = [
      'VIEW_USERS',
      'INVITE_USERS',
      'EDIT_USERS',
      'DELETE_USERS',
      'VIEW_ROLES',
      'CREATE_ROLES',
      'EDIT_ROLES',
      'DELETE_ROLES',
    ];
    return capabilities.every(cap => mockCapabilities.includes(cap));
  }),
}));
