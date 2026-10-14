import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { BackendModule, ReadCallback } from 'i18next';
// 첫 화면에 문자열이 바로 필요한 ko(기본)·en(폴백)만 번들에 포함한다.
import ko from './locales/ko.json';
import en from './locales/en.json';
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

const SUPPORTED_LANGUAGES = Object.keys(dateLocaleMap);

// 나머지 8개 언어는 선택 시점에 청크로 내려받는다 (locale JSON 10개 ≈ 2.3MB가 초기 번들에서 빠진다).
// import.meta.glob 은 빌드 시 파일별 동적 import 맵으로 치환된다.
const localeLoaders = import.meta.glob<{ default: Record<string, unknown> }>(
  './locales/*.json',
);

/**
 * i18next 백엔드 플러그인 — 번들에 없는 언어 리소스를 동적 import 로 읽는다.
 * 외부 의존성(i18next-resources-to-backend) 없이 같은 동작을 한다.
 */
const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(lng: string, _ns: string, callback: ReadCallback) {
    const loader = localeLoaders[`./locales/${lng}.json`];
    if (!loader) {
      callback(new Error(`Unsupported locale: ${lng}`), false);
      return;
    }
    loader()
      .then((m) => callback(null, m.default))
      .catch((err) => callback(err, false));
  },
};

function syncDateLocale(lng: string) {
  // 감지 언어가 'ko-KR' 처럼 지역 코드를 달고 오면 기본 언어('ko')로 한 번 더 찾는다.
  const base = lng?.split('-')[0];
  const dateLocale = dateLocaleMap[lng] || dateLocaleMap[base] || 'en-US';
  setLocale(dateLocale);
}

i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    // resources 에 일부만 실어 두고 나머지는 backend 로 읽는다.
    partialBundledLanguages: true,
    // 'zh-TW' 선택 시 'zh' 까지 추가로 내려받지 않도록 현재 언어 파일만 로드한다.
    load: 'currentOnly',
    fallbackLng: 'en',
    // 브라우저 감지값('ko-KR', 'zh-Hant' 등)을 지원 언어('ko', 'zh')로 정규화한다.
    // 이게 없으면 i18n.language 가 'ko-KR' 로 남아 dateUtils 로케일 매핑이 en-US 로 떨어진다.
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_KEY,
      caches: ['localStorage'],
    },
  })
  .then(() => {
    // init 완료 후 확실한 동기화
    syncDateLocale(i18n.language);
  });

// 동기적 즉시 동기화 (init이 sync로 완료되는 경우 대응)
syncDateLocale(i18n.language);

// 언어 변경 시 dateUtils 로케일 동기화
i18n.on('languageChanged', syncDateLocale);

export default i18n;
export { LANGUAGE_KEY };
