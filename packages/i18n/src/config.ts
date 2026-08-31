import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enUS from './locales/en_us.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en_US: {
        translation: enUS,
      },
    },
    lng: 'en_US',
    fallbackLng: 'en_US',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;
