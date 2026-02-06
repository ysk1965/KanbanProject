import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './components/dashboard';
import { InviteLandingPage } from './components/InviteLandingPage';
import { LandingPage } from './components/landing/LandingPage';
import { KanbanBoardPage } from './pages/KanbanBoardPage';
import { EmailVerificationPendingPage } from './components/EmailVerificationPendingPage';
import { EmailVerificationResultPage } from './components/EmailVerificationResultPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { TermsPage } from './components/TermsPage';
import { PrivacyPage } from './components/PrivacyPage';
import { SettingsPage } from './components/SettingsPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AdminRoute } from './components/AdminRoute';
import { AdminPage } from './pages/AdminPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { AnnouncementDisplay } from './components/AnnouncementDisplay';
import { MaintenancePage } from './components/MaintenancePage';
import { boardService, inviteLinkService, systemService } from './utils/services';
import { useState, useEffect, useCallback } from 'react';
import { Board } from './types';
import type { MaintenanceStatus } from './utils/api';
import { trackEvent } from './contexts/AnalyticsContext';

// 인증이 필요한 라우트 래퍼
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">로딩 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 이메일 미인증 시 인증 대기 페이지로 리다이렉트
  if (!isEmailVerified) {
    return <Navigate to="/email-pending" replace />;
  }

  return <>{children}</>;
}

// 초대 정보 인터페이스
interface InviteInfo {
  boardName: string;
  role: string;
  inviterName?: string;
}

// 로그인 페이지 래퍼 (이미 로그인되어 있으면 보드 목록으로)
function LoginRoute() {
  const { isAuthenticated, isLoading, login: authLogin, signup: authSignup, googleLogin: authGoogleLogin } = useAuth();
  const navigate = useNavigate();
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);

  // 초대 정보 로드
  useEffect(() => {
    const loadInviteInfo = async () => {
      const pendingCode = localStorage.getItem('pending_invite_code');
      if (pendingCode) {
        try {
          const info = await inviteLinkService.getInviteLinkInfo(pendingCode);
          if (info.valid) {
            setInviteInfo({
              boardName: info.board_name,
              role: info.role,
            });
          }
        } catch (error) {
          console.error('Failed to load invite info:', error);
        }
      }
    };
    loadInviteInfo();
  }, []);

  // 로그인/회원가입 후 초대 처리를 위한 래퍼 함수들
  const handleLoginSuccess = async () => {
    setJustLoggedIn(true);
  };

  const login = async (email: string, password: string) => {
    await authLogin(email, password);
    await handleLoginSuccess();
  };

  const signup = async (email: string, password: string, name: string) => {
    await authSignup(email, password, name);
    await handleLoginSuccess();
  };

  const googleLogin = async (idToken: string) => {
    await authGoogleLogin(idToken);
    await handleLoginSuccess();
  };

  useEffect(() => {
    const handlePostLogin = async () => {
      // 방금 로그인했거나 이미 인증된 상태인 경우
      if ((justLoggedIn || (isAuthenticated && !isLoading)) && !isProcessingInvite) {
        // 대기 중인 초대가 있으면 자동으로 수락
        const pendingCode = localStorage.getItem('pending_invite_code');
        if (pendingCode && justLoggedIn) {
          // 방금 로그인한 경우에만 초대 자동 수락
          setIsProcessingInvite(true);
          localStorage.removeItem('pending_invite_code');
          try {
            const result = await inviteLinkService.acceptInvite(pendingCode);
            navigate(`/boards/${result.board_id}`);
          } catch (error: any) {
            console.error('Failed to accept invite:', error);
            alert(error?.message || '초대 수락에 실패했습니다. 보드 목록으로 이동합니다.');
            navigate('/boards');
          } finally {
            setIsProcessingInvite(false);
          }
        } else if (isAuthenticated && !isLoading) {
          // 이미 로그인되어 있고 초대 코드가 없으면 보드 목록으로
          navigate('/boards');
        }
      }
    };

    handlePostLogin();
  }, [isAuthenticated, isLoading, navigate, isProcessingInvite, justLoggedIn]);

  if (isLoading || isProcessingInvite) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-lg mb-2">
            {isProcessingInvite ? '초대를 수락하는 중...' : '로딩 중...'}
          </div>
          {isProcessingInvite && (
            <div className="text-slate-400 text-sm">잠시만 기다려주세요</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <LoginPage
      onLogin={login}
      onSignup={signup}
      onGoogleLogin={googleLogin}
      inviteInfo={inviteInfo}
    />
  );
}

// 보드 목록 페이지 래퍼
function BoardsRoute() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBoards = async () => {
    try {
      const boardsData = await boardService.getBoards();
      setBoards(boardsData);
    } catch (error) {
      console.error('Failed to load boards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoards();
  }, []);

  const handleSelectBoard = (boardId: string) => {
    trackEvent('board_view', { board_id: boardId });
    navigate(`/boards/${boardId}`);
  };

  const handleCreateBoard = async (name: string, description?: string) => {
    try {
      const newBoard = await boardService.createBoard(name, description);
      setBoards([...boards, newBoard]);
      trackEvent('board_create', { board_id: newBoard.id });
    } catch (error) {
      console.error('Failed to create board:', error);
      trackEvent('error', {
        error_type: 'board_create_failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handleToggleStar = async (boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) return;

    const newStarredStatus = !board.is_starred;

    try {
      await boardService.toggleStar(boardId, newStarredStatus);
      setBoards(
        boards.map((b) =>
          b.id === boardId ? { ...b, is_starred: newStarredStatus } : b
        )
      );
    } catch (error) {
      console.error('Failed to toggle star:', error);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await boardService.deleteBoard(boardId);
      setBoards(boards.filter((b) => b.id !== boardId));
      trackEvent('board_delete', { board_id: boardId });
    } catch (error) {
      console.error('Failed to delete board:', error);
    }
  };

  const handleUpdateBoard = async (boardId: string, name: string, description?: string) => {
    try {
      const updatedBoard = await boardService.updateBoard(boardId, name, description);
      setBoards(boards.map((b) => (b.id === boardId ? { ...b, ...updatedBoard } : b)));
    } catch (error) {
      console.error('Failed to update board:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">로딩 중...</div>
      </div>
    );
  }

  return (
    <Dashboard
      boards={boards}
      onSelectBoard={handleSelectBoard}
      onCreateBoard={handleCreateBoard}
      onToggleStar={handleToggleStar}
      onDeleteBoard={handleDeleteBoard}
      onUpdateBoard={handleUpdateBoard}
      onRefreshBoards={loadBoards}
    />
  );
}

// 이메일 인증 대기 페이지 래퍼
function EmailPendingRoute() {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">로딩 중...</div>
      </div>
    );
  }

  // 미인증 시 로그인 페이지로
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 이미 이메일 인증 완료 시 보드 목록으로
  if (isEmailVerified) {
    return <Navigate to="/boards" replace />;
  }

  return <EmailVerificationPendingPage />;
}

// 초대 페이지 래퍼
function InviteRoute() {
  const { code } = useParams<{ code: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogin = () => {
    // 초대 코드를 저장하고 로그인 페이지로 이동
    if (code) {
      localStorage.setItem('pending_invite_code', code);
    }
    navigate('/login');
  };

  const handleAcceptInvite = async (boardId: string) => {
    navigate(`/boards/${boardId}`);
  };

  if (!code) {
    return <Navigate to="/boards" replace />;
  }

  return (
    <InviteLandingPage
      inviteCode={code}
      isAuthenticated={isAuthenticated}
      onLogin={handleLogin}
      onAcceptInvite={handleAcceptInvite}
    />
  );
}

// 테마 동기화 컴포넌트 - 로그인 시 서버에서 가져온 테마 적용
function ThemeSync() {
  const { currentUser } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    // 유저 정보가 있고 테마가 설정되어 있으면 적용
    if (currentUser?.theme) {
      setTheme(currentUser.theme);
    }
  }, [currentUser?.theme, setTheme]);

  return null;
}

// 루트 경로 래퍼 (인증 상태에 따라 리다이렉트)
function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">로딩 중...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/boards" replace />;
  }

  return <Navigate to="/login" replace />;
}

// 메인 앱 라우터
function AppRoutes() {
  return (
    <>
      <ThemeSync />
      <Routes>
      {/* 루트: 로그인 상태면 /boards, 아니면 /login */}
      <Route path="/" element={<HomeRoute />} />

      {/* 랜딩 페이지 */}
      <Route path="/landing" element={<LandingPage />} />

      {/* 로그인 */}
      <Route path="/login" element={<LoginRoute />} />

      {/* 이메일 인증 */}
      <Route path="/verify-email/:token" element={<EmailVerificationResultPage />} />
      <Route path="/email-pending" element={<EmailPendingRoute />} />

      {/* 비밀번호 재설정 */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      {/* 이용약관 및 개인정보처리방침 */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* 공지사항 */}
      <Route path="/announcements" element={<AnnouncementsPage />} />

      {/* 설정 */}
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <SettingsPage />
          </PrivateRoute>
        }
      />

      {/* 보드 목록 */}
      <Route
        path="/boards"
        element={
          <PrivateRoute>
            <BoardsRoute />
          </PrivateRoute>
        }
      />

      {/* 칸반 보드 */}
      <Route
        path="/boards/:boardId"
        element={
          <PrivateRoute>
            <KanbanBoardPage />
          </PrivateRoute>
        }
      />

      {/* 초대 링크 */}
      <Route path="/invite/:code" element={<InviteRoute />} />

      {/* Admin */}
      <Route
        path="/admin/*"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />

      {/* 404 - 존재하지 않는 경로 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

// 점검 모드에서도 허용되는 경로들
const MAINTENANCE_ALLOWED_PATHS = [
  '/login',
  '/signup',
  '/admin',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

// 점검 모드 + 공지사항 래퍼
function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkMaintenance = useCallback(async () => {
    try {
      const status = await systemService.getStatus();
      setMaintenanceStatus(status);
    } catch {
      // 503 에러 시에도 점검 모드로 간주하지 않음 (서버 장애일 수 있음)
      setMaintenanceStatus(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkMaintenance();
  }, [checkMaintenance]);

  // 점검 모드에서도 허용된 경로인지 확인
  const isAllowedPath = MAINTENANCE_ALLOWED_PATHS.some(
    path => location.pathname === path || location.pathname.startsWith(path + '/')
  );

  if (isChecking) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
      </div>
    );
  }

  // 점검 모드이지만 허용된 경로면 정상 렌더링
  if (maintenanceStatus?.enabled && !isAllowedPath) {
    return <MaintenancePage status={maintenanceStatus} onRetry={checkMaintenance} />;
  }

  return <>{children}</>;
}

// App 컴포넌트
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <MaintenanceGuard>
          <AuthProvider>
            <AnalyticsProvider>
              <AppRoutes />
            </AnalyticsProvider>
          </AuthProvider>
        </MaintenanceGuard>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
