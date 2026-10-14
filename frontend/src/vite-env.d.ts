/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  // Google OAuth
  readonly VITE_GOOGLE_CLIENT_ID: string;

  // API (파생 상수는 src/app/config/env.ts)
  readonly VITE_API_BASE_URL: string;
  /** S3 직접 URL 을 리라이트할 CloudFront 도메인(호스트만). 선택 */
  readonly VITE_CLOUDFRONT_DOMAIN?: string;

  // Firebase Configuration
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;

  // Sentry Configuration
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_SENTRY_ENVIRONMENT: string;
  readonly VITE_SENTRY_RELEASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'node-htmldiff' {
  function htmldiff(
    before: string,
    after: string,
    className?: string,
    dataPrefix?: string,
    atomicTags?: string,
  ): string;
  export default htmldiff;
}
