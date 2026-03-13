import { useQuery } from '@tanstack/react-query';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export default function CustomersPage() {
  const { signOut, user } = useAuthenticator((context) => [context.user]);

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.get<Customer[]>('/customers');
      return response.data;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <h1 className="text-xl font-bold text-gray-900">Dispatch</h1>
              </div>
              <div className="ml-6 flex space-x-8">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                >
                  Dashboard
                </Link>
                <Link
                  to="/customers"
                  className="inline-flex items-center border-b-2 border-indigo-500 px-1 pt-1 text-sm font-medium text-gray-900"
                >
                  Customers
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="mr-4 text-sm text-gray-700">
                {user?.signInDetails?.loginId}
              </span>
              <button
                onClick={signOut}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage your customer database
            </p>
          </div>
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
            Add Customer
          </button>
        </div>

        {isLoading && (
          <div className="text-center">
            <p className="text-gray-600">Loading customers...</p>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">
              Error loading customers: {(error as Error).message}
            </p>
          </div>
        )}

        {customers && customers.length === 0 && (
          <div className="text-center">
            <p className="text-gray-600">No customers found</p>
          </div>
        )}

        {customers && customers.length > 0 && (
          <div className="overflow-hidden bg-white shadow sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="truncate text-sm font-medium text-indigo-600">
                          {customer.name}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {customer.email}
                        </p>
                      </div>
                      <div className="ml-2 flex flex-shrink-0">
                        <p className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                          Active
                        </p>
                      </div>
                    </div>
                    {customer.phone && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">{customer.phone}</p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
