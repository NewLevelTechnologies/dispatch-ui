// Re-export i18n instance
export { default as i18n } from './config';

// Re-export from react-i18next for convenience
export {
  useTranslation,
  Trans,
  Translation,
  I18nextProvider,
  initReactI18next,
} from 'react-i18next';

// Export translations if needed
export { default as enUS } from './locales/en_us.json';
