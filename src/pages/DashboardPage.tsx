import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

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
                  className="inline-flex items-center border-b-2 border-indigo-500 px-1 pt-1 text-sm font-medium text-gray-900"
                >
                  Dashboard
                </Link>
                <Link
                  to="/customers"
                  className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
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
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">Welcome to Dispatch</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900">Customers</h3>
            <p className="mt-2 text-3xl font-semibold text-indigo-600">--</p>
            <p className="mt-1 text-sm text-gray-500">Total customers</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900">Work Orders</h3>
            <p className="mt-2 text-3xl font-semibold text-indigo-600">--</p>
            <p className="mt-1 text-sm text-gray-500">Active work orders</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900">Revenue</h3>
            <p className="mt-2 text-3xl font-semibold text-indigo-600">--</p>
            <p className="mt-1 text-sm text-gray-500">This month</p>
          </div>
        </div>
      </main>
    </div>
  );
}
