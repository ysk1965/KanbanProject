import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import { setLocale } from '../utils/dateUtils';

const LANGUAGE_KEY = 'bridge_language';

// dateUtils 로케일 매핑
const dateLocaleMap: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

function syncDateLocale(lng: string) {
  const dateLocale = dateLocaleMap[lng] || 'en-US';
  setLocale(dateLocale);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_KEY,
      caches: ['localStorage'],
    },
  });

// 초기 dateUtils 로케일 동기화
syncDateLocale(i18n.language);

// 언어 변경 시 dateUtils 로케일 동기화
i18n.on('languageChanged', syncDateLocale);

export default i18n;
export { LANGUAGE_KEY };
