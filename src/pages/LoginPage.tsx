import { Authenticator } from '@aws-amplify/ui-react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Dispatch</h1>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>
        <Authenticator />
      </div>
    </div>
  );
}
