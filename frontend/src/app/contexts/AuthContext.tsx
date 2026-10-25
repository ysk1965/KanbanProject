import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { authService, getMonetizationStatus } from '../utils/services';
import { setSentryUser } from '../../lib/sentry';
import { isWhiteLabelDomain, isRestrictedEmail } from '../utils/domain';

interface User {
  id: string;
  email: string;
  name: string;
  profile_image?: string | null;
  email_verified?: boolean;
  theme?: 'dark' | 'light';
  provider?: 'email' | 'google';
  system_role?: 'USER' | 'TESTER' | 'ADMIN';
  personal_space_enabled?: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  isTester: boolean;
  hideBilling: boolean; // TESTER/ADMIN 사용자는 과금 UI 숨김
  isRestricted: boolean; // milkyway 도메인 OR @cookapps.com 이메일 → 기능 제한
  monetizationEnabled: boolean;
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  googleLogin: (code: string) => Promise<void>;
  googleLoginWithIdToken: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  updateCurrentUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * 토큰 갱신이 실패했어도 세션이 살아 있는가.
 * api.ts 는 세션 만료(4xx)일 때만 토큰을 지우고, 네트워크 오류·5xx 면 남긴다.
 * 토큰과 저장된 사용자가 그대로면 "연결이 없어서 못 갱신한 것"이다.
 */
function keepsSessionOffline(): boolean {
  return authService.isTokenExpiredButExists() && !!authService.getCurrentUser();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [monetizationEnabled, setMonetizationEnabled] = useState<boolean>(true);

  // Analytics/Sentry 사용자 동기화
  const syncAnalyticsUser = (user: User | null) => {
    // Sentry 사용자 설정
    if (user) {
      setSentryUser({ id: user.id, email: user.email, name: user.name });
    } else {
      setSentryUser(null);
    }

    // Firebase Analytics 사용자 설정 (동적 import로 광고 차단기 대응)
    import('firebase/analytics')
      .then(({ setUserId, setUserProperties }) => {
        return import('../../lib/firebase').then(({ analytics }) => {
          if (!analytics) return;
          setUserId(analytics, user?.id || null);
          if (user) {
            setUserProperties(analytics, {
              user_role: user.system_role?.toLowerCase() || 'user',
              theme: user.theme || 'dark',
              provider: user.provider || 'email',
            });
          }
        });
      })
      .catch(() => {
        console.debug('[Analytics] Firebase Analytics unavailable');
      });
  };

  // Initialize push notifications when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      import('../utils/pushNotifications')
        .then(({ initPushNotifications }) => initPushNotifications())
        .catch(() => console.debug('[Push] Push notifications unavailable'));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    getMonetizationStatus()
      .then((data) => setMonetizationEnabled(data.monetization_enabled))
      .catch(() => setMonetizationEnabled(true)); // default ON on error
  }, []);

  useEffect(() => {
    // 초기 인증 상태 확인 (토큰 유효성 검증 포함)
    const checkAuth = async () => {
      // 1. 토큰이 유효한 경우 - 바로 인증 상태로 설정
      if (authService.isAuthenticated()) {
        console.log('✅ [Auth] 유효한 토큰 확인');
        const user = authService.getCurrentUser();
        setIsAuthenticated(true);
        setCurrentUser(user);
        syncAnalyticsUser(user);
        setIsLoading(false);
        return;
      }

      // 2. 토큰이 존재하지만 만료된 경우 - 갱신 시도
      if (authService.isTokenExpiredButExists()) {
        console.log('🔄 [Auth] 만료된 토큰 감지, 갱신 시도...');
        const refreshed = await authService.tryRefreshToken();

        if (refreshed) {
          console.log('✅ [Auth] 토큰 갱신 성공');
          const user = authService.getCurrentUser();
          setIsAuthenticated(true);
          setCurrentUser(user);
          syncAnalyticsUser(user);
        } else if (keepsSessionOffline()) {
          // 오프라인·서버 장애로 갱신만 못 했다 — 세션은 살아 있으니 로그인 상태를 유지한다.
          // (설교 노트를 오프라인으로 열어도 계정 노트가 보이게. 연결되면 첫 요청의 401→갱신이 이어 받는다)
          console.log('📴 [Auth] 갱신 보류(연결 없음), 기존 세션 유지');
          const user = authService.getCurrentUser();
          setIsAuthenticated(true);
          setCurrentUser(user);
          syncAnalyticsUser(user);
        } else {
          console.log('❌ [Auth] 토큰 갱신 실패, 로그인 필요');
          setIsAuthenticated(false);
          setCurrentUser(null);
          syncAnalyticsUser(null);
        }
        setIsLoading(false);
        return;
      }

      // 3. 토큰이 없는 경우
      console.log('🔒 [Auth] 토큰 없음, 미인증 상태');
      setIsAuthenticated(false);
      setCurrentUser(null);
      syncAnalyticsUser(null);
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // 탭 복귀 시 토큰 만료 체크 → 자동 갱신
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        if (authService.isTokenExpiredButExists()) {
          console.log('🔄 [Auth] 탭 복귀, 만료된 토큰 갱신 시도...');
          const refreshed = await authService.tryRefreshToken();
          if (!refreshed && !keepsSessionOffline()) {
            setIsAuthenticated(false);
            setCurrentUser(null);
            syncAnalyticsUser(null);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authService.login(email, password);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const response = await authService.signup(email, password, name);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  }, []);

  const googleLogin = useCallback(async (code: string) => {
    const response = await authService.googleLogin(code);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  }, []);

  const googleLoginWithIdToken = useCallback(async (idToken: string) => {
    const response = await authService.googleLoginWithIdToken(idToken);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    syncAnalyticsUser(null);
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!currentUser?.email) {
      throw new Error('사용자 이메일을 찾을 수 없습니다');
    }
    await authService.resendVerificationEmail(currentUser.email);
  }, [currentUser?.email]);

  const updateCurrentUser = useCallback((updates: Partial<User>) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isEmailVerified = currentUser?.email_verified ?? false;
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isRestricted = isWhiteLabelDomain || isRestrictedEmail(currentUser?.email); // milkyway 도메인 OR @cookapps.com 이메일
  const isTester = currentUser?.system_role === 'TESTER' || isRestricted;
  const hideBilling = !monetizationEnabled || isTester || isAdmin || isRestricted;

  // value 참조가 매 렌더 바뀌면 useAuth 소비자(거의 모든 화면)가 함께 다시 그려진다.
  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      isEmailVerified,
      isAdmin,
      isTester,
      hideBilling,
      isRestricted,
      monetizationEnabled,
      currentUser,
      isLoading,
      login,
      signup,
      googleLogin,
      googleLoginWithIdToken,
      logout,
      resendVerificationEmail,
      updateCurrentUser,
    }),
    [
      isAuthenticated,
      isEmailVerified,
      isAdmin,
      isTester,
      hideBilling,
      isRestricted,
      monetizationEnabled,
      currentUser,
      isLoading,
      login,
      signup,
      googleLogin,
      googleLoginWithIdToken,
      logout,
      resendVerificationEmail,
      updateCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
