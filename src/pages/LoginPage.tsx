import { Authenticator } from '@aws-amplify/ui-react';
import { useTranslation } from 'react-i18next';

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">{t('app.name')}</h1>
          <p className="mt-2 text-gray-600">{t('auth.signInPrompt')}</p>
        </div>
        <Authenticator />
      </div>
    </div>
  );
}
