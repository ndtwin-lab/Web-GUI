import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

export const useLanguage = () => {
  const { i18n } = useTranslation();

  const changeLanguage = useCallback(
    (language: string) => {
      i18n.changeLanguage(language);
      localStorage.setItem('i18nextLng', language);
    },
    [i18n]
  );

  const getCurrentLanguage = useCallback(() => {
    return i18n.language;
  }, [i18n.language]);

  const getAvailableLanguages = useCallback(() => {
    return [{ code: 'en', name: 'English', nativeName: 'English' }];
  }, []);

  return {
    currentLanguage: getCurrentLanguage(),
    changeLanguage,
    availableLanguages: getAvailableLanguages(),
  };
};
