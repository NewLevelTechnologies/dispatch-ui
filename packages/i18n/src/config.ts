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

// `{{entity, lowercase}}` puts a glossary name mid-sentence ("Loading work
// orders…"). i18next has no built-in `lowercase` formatter; unregistered
// formats pass the value through untouched, so without this every such string
// rendered the name capitalized. (The web test mock lowercases on its own,
// which is why tests never caught it.)
i18n.services.formatter?.add('lowercase', (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase() : String(value),
);

export default i18n;
