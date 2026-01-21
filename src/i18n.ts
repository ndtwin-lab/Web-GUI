import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import enMessages from '../messages/en.json';

const resources = {
  en: {
    translation: enMessages,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // Force English as the only language
  fallbackLng: 'en',
  debug: import.meta.env.DEV,

  interpolation: {
    escapeValue: false, // React already escapes values
  },

  react: {
    useSuspense: false,
  },
});

export default i18n;
