import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import zhTW from './locales/zh-TW.json';
import hi from './locales/hi.json';
import vi from './locales/vi.json';
import es from './locales/es.json';
import ptBR from './locales/pt-BR.json';
import th from './locales/th.json';
import { setLocale } from '../utils/dateUtils';

const LANGUAGE_KEY = 'bridge_language';

// dateUtils 로케일 매핑
const dateLocaleMap: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  hi: 'hi',
  vi: 'vi',
  es: 'es',
  'pt-BR': 'pt-BR',
  th: 'th',
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
      ja: { translation: ja },
      zh: { translation: zh },
      'zh-TW': { translation: zhTW },
      hi: { translation: hi },
      vi: { translation: vi },
      es: { translation: es },
      'pt-BR': { translation: ptBR },
      th: { translation: th },
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
