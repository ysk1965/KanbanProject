import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '../utils/services';
import { setSentryUser } from '../../lib/sentry';

interface User {
  id: string;
  email: string;
  name: string;
  profile_image?: string | null;
  email_verified?: boolean;
  theme?: 'dark' | 'light';
  provider?: 'email' | 'google';
  system_role?: 'USER' | 'TESTER' | 'ADMIN';
}

interface AuthContextType {
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  isTester: boolean;
  hideBilling: boolean; // TESTER/ADMIN 사용자는 과금 UI 숨김
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  googleLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  updateCurrentUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  };

  const signup = async (email: string, password: string, name: string) => {
    const response = await authService.signup(email, password, name);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  };

  const googleLogin = async (code: string) => {
    const response = await authService.googleLogin(code);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
    syncAnalyticsUser(response.user);
  };

  const logout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    syncAnalyticsUser(null);
  };

  const resendVerificationEmail = async () => {
    if (!currentUser?.email) {
      throw new Error('사용자 이메일을 찾을 수 없습니다');
    }
    await authService.resendVerificationEmail(currentUser.email);
  };

  const updateCurrentUser = (updates: Partial<User>) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  };

  const isEmailVerified = currentUser?.email_verified ?? false;
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isTester = currentUser?.system_role === 'TESTER';
  const hideBilling = isTester || isAdmin; // TESTER, ADMIN은 과금 UI 숨김

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isEmailVerified,
        isAdmin,
        isTester,
        hideBilling,
        currentUser,
        isLoading,
        login,
        signup,
        googleLogin,
        logout,
        resendVerificationEmail,
        updateCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
