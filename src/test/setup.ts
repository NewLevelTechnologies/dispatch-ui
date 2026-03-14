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
    'app.name': 'Dispatch',
    'app.loading': 'Loading...',
    'nav.dashboard': 'Dashboard',
    'nav.customers': 'Customers',
    'nav.workOrders': 'Work Orders',
    'nav.equipment': 'Equipment',
    'nav.financial': 'Financial',
    'nav.scheduling': 'Scheduling',
    'common.signOut': 'Sign out',
    'common.cancel': 'Cancel',
    'common.create': 'Create',
    'common.update': 'Update',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.saving': 'Saving...',
    'common.add': 'Add',
    'common.moreOptions': 'More options',
    'common.active': 'Active',
    'common.actions.add': 'Add {{entity}}',
    'common.actions.addFirst': 'Add your first {{entity, lowercase}}',
    'common.actions.create': 'Create {{entity}}',
    'common.actions.createFirst': 'Create your first {{entity, lowercase}}',
    'common.actions.edit': 'Edit {{entity}}',
    'common.actions.loading': 'Loading {{entities, lowercase}}...',
    'common.actions.errorLoading': 'Error loading {{entities, lowercase}}',
    'common.actions.notFound': 'No {{entities, lowercase}} found',
    'common.actions.deleteConfirm': 'Are you sure you want to delete {{name}}?',
    'common.actions.deleteConfirmGeneric': 'Are you sure you want to delete this {{entity, lowercase}}?',
    'common.form.titleCreate': '{{action}} {{entity}}',
    'common.form.titleEdit': '{{action}} {{entity}}',
    'common.form.descriptionCreate': 'Create a new {{entity, lowercase}} record.',
    'common.form.descriptionEdit': 'Update {{entity, lowercase}} information.',
    'common.form.name': 'Name',
    'common.form.email': 'Email',
    'common.form.phone': 'Phone',
    'common.form.address': 'Address',
    'common.form.city': 'City',
    'common.form.state': 'State',
    'common.form.stateHelper': 'CA',
    'common.form.zipCode': 'Zip Code',
    'common.form.description': 'Description',
    'common.form.notes': 'Notes',
    'common.form.status': 'Status',
    'common.form.errorCreate': 'Failed to create {{entity, lowercase}}',
    'common.form.errorUpdate': 'Failed to update {{entity, lowercase}}',
    'customers.entity': 'Customer',
    'customers.entities': 'Customers',
    'customers.description': 'Manage your customer database',
    'customers.table.location': 'Location',
    'workOrders.entity': 'Work Order',
    'workOrders.entities': 'Work Orders',
    'workOrders.description': 'Manage work orders and service requests',
    'workOrders.form.customer': 'Customer',
    'workOrders.form.customerPlaceholder': 'Select a customer...',
    'workOrders.form.customerRequired': 'Please select a customer',
    'workOrders.form.scheduledDate': 'Scheduled Date',
    'workOrders.status.pending': 'Pending',
    'workOrders.status.scheduled': 'Scheduled',
    'workOrders.status.inProgress': 'In Progress',
    'workOrders.status.completed': 'Completed',
    'workOrders.status.cancelled': 'Cancelled',
    'workOrders.table.id': 'ID',
    'workOrders.table.customer': 'Customer',
    'workOrders.table.status': 'Status',
    'workOrders.table.scheduled': 'Scheduled',
    'workOrders.table.amount': 'Amount',
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
