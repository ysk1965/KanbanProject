/**
 * Firebase Configuration & Initialization
 * Firebase Analytics, Performance Monitoring 설정
 */
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';
import { getPerformance, FirebasePerformance } from 'firebase/performance';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Singleton instances
let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let performance: FirebasePerformance | null = null;

/**
 * Firebase 설정이 유효한지 확인
 */
export const isFirebaseConfigured = (): boolean => {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
};

/**
 * Firebase App 초기화
 */
export const initializeFirebase = (): FirebaseApp | null => {
  if (!isFirebaseConfigured()) {
    console.warn('[Firebase] Configuration missing. Analytics disabled.');
    return null;
  }

  if (app) return app;

  // 이미 초기화된 앱이 있는지 확인
  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
    return app;
  }

  try {
    app = initializeApp(firebaseConfig);
    console.log('[Firebase] App initialized successfully');
    return app;
  } catch (error) {
    console.error('[Firebase] Failed to initialize:', error);
    return null;
  }
};

/**
 * Firebase Analytics 초기화
 */
export const initializeAnalytics = async (): Promise<Analytics | null> => {
  if (analytics) return analytics;

  const firebaseApp = initializeFirebase();
  if (!firebaseApp) return null;

  try {
    // Analytics가 지원되는 환경인지 확인 (SSR, 브라우저 확장 등에서 실패할 수 있음)
    const supported = await isSupported();
    if (!supported) {
      console.warn('[Firebase] Analytics not supported in this environment');
      return null;
    }

    analytics = getAnalytics(firebaseApp);
    console.log('[Firebase] Analytics initialized successfully');
    return analytics;
  } catch (error) {
    console.error('[Firebase] Failed to initialize Analytics:', error);
    return null;
  }
};

/**
 * Firebase Performance 초기화
 */
export const initializePerformance = (): FirebasePerformance | null => {
  if (performance) return performance;

  const firebaseApp = initializeFirebase();
  if (!firebaseApp) return null;

  try {
    performance = getPerformance(firebaseApp);
    console.log('[Firebase] Performance initialized successfully');
    return performance;
  } catch (error) {
    console.error('[Firebase] Failed to initialize Performance:', error);
    return null;
  }
};

/**
 * 모든 Firebase 서비스 초기화
 */
export const initializeAllFirebaseServices = async (): Promise<{
  app: FirebaseApp | null;
  analytics: Analytics | null;
  performance: FirebasePerformance | null;
}> => {
  const firebaseApp = initializeFirebase();
  const [analyticsInstance, performanceInstance] = await Promise.all([
    initializeAnalytics(),
    Promise.resolve(initializePerformance()),
  ]);

  return {
    app: firebaseApp,
    analytics: analyticsInstance,
    performance: performanceInstance,
  };
};

// Export instances
export { app, analytics, performance };
