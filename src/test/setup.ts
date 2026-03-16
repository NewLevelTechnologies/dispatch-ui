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
    'common.actions.create': 'Create {{entity}}',
    'common.actions.createFirst': 'Create your first {{entity, lowercase}}',
    'common.actions.deleteConfirm': 'Are you sure you want to delete {{name}}?',
    'common.actions.deleteConfirmGeneric': 'Are you sure you want to delete this {{entity, lowercase}}?',
    'common.actions.edit': 'Edit {{entity}}',
    'common.actions.errorLoading': 'Error loading {{entities, lowercase}}',
    'common.actions.loading': 'Loading {{entities, lowercase}}...',
    'common.actions.notFound': 'No {{entities, lowercase}} found',
    'common.active': 'Active',
    'common.add': 'Add',
    'common.cancel': 'Cancel',
    'common.create': 'Create',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.form.address': 'Address',
    'common.form.city': 'City',
    'common.form.description': 'Description',
    'common.form.descriptionCreate': 'Create a new {{entity, lowercase}} record.',
    'common.form.descriptionEdit': 'Update {{entity, lowercase}} information.',
    'common.form.email': 'Email',
    'common.form.errorCreate': 'Failed to create {{entity, lowercase}}',
    'common.form.errorUpdate': 'Failed to update {{entity, lowercase}}',
    'common.form.name': 'Name',
    'common.form.notes': 'Notes',
    'common.form.phone': 'Phone',
    'common.form.state': 'State',
    'common.form.stateHelper': 'CA',
    'common.form.status': 'Status',
    'common.form.titleCreate': '{{action}} {{entity}}',
    'common.form.titleEdit': '{{action}} {{entity}}',
    'common.form.zipCode': 'Zip Code',
    'common.moreOptions': 'More options',
    'common.saving': 'Saving...',
    'common.signOut': 'Sign out',
    'common.theme': 'Theme',
    'common.update': 'Update',
    'customers.description': 'Manage your customer database',
    'customers.table.location': 'Location',
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
    'entities.scheduling': 'Scheduling',
    'entities.workOrder': 'Work Order',
    'entities.workOrders': 'Work Orders',
    'equipment.comingSoon': 'Coming soon...',
    'equipment.description': 'Track equipment and inventory',
    'financial.comingSoon': 'Coming soon...',
    'financial.description': 'Manage invoices, quotes, and payments',
    'invoices.description': 'Manage customer invoices and billing',
    'payments.description': 'Track customer payments and transactions',
    'quotes.description': 'Create and manage customer quotes',
    'scheduling.comingSoon': 'Coming soon...',
    'scheduling.description': 'Manage dispatches and technician schedules',
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
