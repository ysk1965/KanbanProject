import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./components/dashboard";
import { InviteLandingPage } from "./components/InviteLandingPage";
import { LandingPage } from "./components/landing/LandingPage";
import { ComparisonPage } from "./components/landing/ComparisonPage";
import { KanbanBoardPage } from "./pages/KanbanBoardPage";
import { PersonalBoardPage } from "./pages/PersonalBoardPage";
import { TaskKeyRedirect } from "./pages/TaskKeyRedirect";
import { EmailVerificationPendingPage } from "./components/EmailVerificationPendingPage";
import { EmailVerificationResultPage } from "./components/EmailVerificationResultPage";
import { ForgotPasswordPage } from "./components/ForgotPasswordPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { TermsPage } from "./components/TermsPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { SettingsPage } from "./components/SettingsPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { AdminRoute } from "./components/AdminRoute";
import { AdminPage } from "./pages/AdminPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { PaymentFailPage } from "./pages/PaymentFailPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { SharedNotePage } from "./pages/SharedNotePage";
import AutoReportPage from "./pages/AutoReportPage";
import GithubSetupPage from "./pages/GithubSetupPage";
import { SharedAlbumPage } from "./pages/SharedAlbumPage";
import { SharedGalleryPage } from "./pages/SharedGalleryPage";
import { PublicUploadPage } from "./pages/PublicUploadPage";
import { GalleryUploadPage } from "./pages/GalleryUploadPage";
import BibleTranscriptionPage from "./pages/BibleTranscriptionPage";
import RoulettePage from "./pages/RoulettePage";
import { CustomIconPage } from "./pages/CustomIconPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { OrganizationDetailPage } from "./pages/OrganizationDetailPage";
import { OrgInviteAcceptPage } from "./pages/OrgInviteAcceptPage";
import { SlackOAuthCallback } from "./components/slack/SlackOAuthCallback";
import { AnnouncementDisplay } from "./components/AnnouncementDisplay";
import { MaintenancePage } from "./components/MaintenancePage";
import { NightShutdownPage } from "./components/NightShutdownPage";
import { ServerDownPage } from "./components/ServerDownPage";
import {
  boardService,
  inviteLinkService,
  organizationService,
} from "./utils/services";
import { useState, useEffect, useCallback, useRef } from "react";
import { Board } from "./types";
import type { MaintenanceStatus } from "./utils/api";
import {
  SERVER_UNAVAILABLE_EVENT,
  fetchServerStatus,
} from "./utils/serverHealth";
import { trackEvent } from "./contexts/AnalyticsContext";
import {
  useVisualViewport,
  useKeyboardAutoScroll,
} from "./hooks/useVisualViewport";
import { useHorizontalWheelScroll } from "./hooks/useHorizontalWheelScroll";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { Toaster } from "./components/ui/sonner";
import { MobileBottomNav } from "./components/ui/MobileBottomNav";

/**
 * 로그인 후 돌아갈 경로. 외부 사이트로 튕기지 않도록 <b>같은 출처의 절대 경로</b>만 허용한다
 * ("//evil.com"은 프로토콜 상대 URL이라 반드시 막아야 한다).
 */
export function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// 인증이 필요한 라우트 래퍼
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">{t("app.loading")}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // 목적지를 들고 간다 — 공유 보고서의 딥링크는 로그아웃 상태로 열리는 일이 잦아
    // 여기서 경로를 버리면 로그인 후 "무엇을 보러 왔는지"가 통째로 증발한다.
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
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
  const {
    isAuthenticated,
    isLoading,
    login: authLogin,
    signup: authSignup,
    googleLogin: authGoogleLogin,
    googleLoginWithIdToken: authGoogleLoginWithIdToken,
    isTester,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  // PrivateRoute가 붙여 보낸 원래 목적지(?returnTo=). 초대 수락보다는 뒤, 기본 이동보다는 앞.
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get("returnTo"),
  );

  // 초대 정보 로드
  useEffect(() => {
    const loadInviteInfo = async () => {
      const pendingCode = localStorage.getItem("pending_invite_code");
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
          console.error("Failed to load invite info:", error);
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
    localStorage.setItem("bridge_show_onboarding", "true");
    await handleLoginSuccess();
  };

  const googleLogin = async (code: string) => {
    await authGoogleLogin(code);
    await handleLoginSuccess();
  };

  const googleLoginWithIdToken = async (idToken: string) => {
    await authGoogleLoginWithIdToken(idToken);
    await handleLoginSuccess();
  };

  useEffect(() => {
    const handlePostLogin = async () => {
      // 방금 로그인했거나 이미 인증된 상태인 경우
      if (
        (justLoggedIn || (isAuthenticated && !isLoading)) &&
        !isProcessingInvite
      ) {
        // 대기 중인 조직 초대가 있으면 자동으로 수락 (보드 초대보다 우선)
        const pendingOrgCode = localStorage.getItem("pending_org_invite_code");
        if (pendingOrgCode && justLoggedIn) {
          setIsProcessingInvite(true);
          localStorage.removeItem("pending_org_invite_code");
          try {
            const result =
              await organizationService.acceptInvite(pendingOrgCode);
            navigate(`/organizations/${result.organization_id}`);
          } catch (error: any) {
            console.error("Failed to accept org invite:", error);
            alert(
              error?.message ||
                t(
                  "app.orgInviteAcceptFailed",
                  "조직 초대 수락에 실패했습니다.",
                ),
            );
            navigate("/boards");
          } finally {
            setIsProcessingInvite(false);
          }
          return;
        }

        // 대기 중인 보드 초대가 있으면 자동으로 수락
        const pendingCode = localStorage.getItem("pending_invite_code");
        if (pendingCode && justLoggedIn) {
          // 방금 로그인한 경우에만 초대 자동 수락
          setIsProcessingInvite(true);
          localStorage.removeItem("pending_invite_code");
          try {
            const result = await inviteLinkService.acceptInvite(pendingCode);
            navigate(`/boards/${result.board_id}`);
          } catch (error: any) {
            console.error("Failed to accept invite:", error);
            alert(error?.message || t("app.inviteAcceptFailed"));
            navigate("/boards");
          } finally {
            setIsProcessingInvite(false);
          }
        } else if (isAuthenticated && !isLoading) {
          // pending invite가 있으면 justLoggedIn을 기다림 (race condition 방지)
          const hasPendingOrgInvite = localStorage.getItem(
            "pending_org_invite_code",
          );
          const hasPendingBoardInvite = localStorage.getItem(
            "pending_invite_code",
          );
          if (!hasPendingOrgInvite && !hasPendingBoardInvite) {
            // 원래 가려던 곳이 있으면 그리로, 없으면 보드 목록으로
            // (TESTER 자동 리다이렉트는 BoardsRoute에서 처리)
            navigate(returnTo ?? "/boards", { replace: true });
          }
        }
      }
    };

    handlePostLogin();
  }, [
    isAuthenticated,
    isLoading,
    navigate,
    isProcessingInvite,
    justLoggedIn,
    returnTo,
  ]);

  if (isLoading || isProcessingInvite) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-lg mb-2">
            {isProcessingInvite ? t("app.processingInvite") : t("app.loading")}
          </div>
          {isProcessingInvite && (
            <div className="text-slate-400 text-sm">{t("app.pleaseWait")}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <LoginPage
      onLogin={login}
      onSignup={signup}
      onGoogleLogin={
        import.meta.env.VITE_GOOGLE_CLIENT_ID ? googleLogin : undefined
      }
      onGoogleLoginWithIdToken={
        import.meta.env.VITE_GOOGLE_CLIENT_ID
          ? googleLoginWithIdToken
          : undefined
      }
      inviteInfo={inviteInfo}
    />
  );
}

// 보드 목록 페이지 래퍼
function BoardsRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isTester } = useAuth();
  const { t } = useTranslation();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 보드 로드 실패로 돌아온 경우 (무한 리다이렉트 방지)
  const boardLoadFailed = (location.state as any)?.boardLoadFailed;

  const loadBoards = async () => {
    try {
      const boardsData = await boardService.getBoards();
      // TESTER인 경우 참여 중인 보드가 있으면 바로 이동 (milkyway.pe.kr 도메인도 isTester에 포함)
      // 단, 해당 보드 로드 실패로 돌아온 경우엔 리다이렉트하지 않음
      if (
        isTester &&
        boardsData.length > 0 &&
        boardLoadFailed !== boardsData[0].id
      ) {
        navigate(`/boards/${boardsData[0].id}`, { replace: true });
        return;
      }
      setBoards(boardsData);
    } catch (error) {
      console.error("Failed to load boards:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoards();
  }, []);

  const handleSelectBoard = (boardId: string) => {
    trackEvent("board_view", { board_id: boardId });
    navigate(`/boards/${boardId}`);
  };

  const handleCreateBoard = async (
    name: string,
    description?: string,
    backgroundGradient?: string,
  ) => {
    try {
      const newBoard = await boardService.createBoard(
        name,
        description,
        backgroundGradient,
      );
      setBoards([...boards, newBoard]);
      trackEvent("board_create", { board_id: newBoard.id });
    } catch (error) {
      console.error("Failed to create board:", error);
      trackEvent("error", {
        error_type: "board_create_failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
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
          b.id === boardId ? { ...b, is_starred: newStarredStatus } : b,
        ),
      );
    } catch (error) {
      console.error("Failed to toggle star:", error);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await boardService.deleteBoard(boardId);
      setBoards(boards.filter((b) => b.id !== boardId));
      trackEvent("board_delete", { board_id: boardId });
    } catch (error) {
      console.error("Failed to delete board:", error);
    }
  };

  const handleUpdateBoard = async (
    boardId: string,
    name: string,
    description?: string,
    backgroundGradient?: string,
  ) => {
    try {
      const updatedBoard = await boardService.updateBoard(
        boardId,
        name,
        description,
        backgroundGradient,
      );
      setBoards(
        boards.map((b) => (b.id === boardId ? { ...b, ...updatedBoard } : b)),
      );
    } catch (error) {
      console.error("Failed to update board:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">{t("app.loading")}</div>
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
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">{t("app.loading")}</div>
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
      localStorage.setItem("pending_invite_code", code);
    }
    navigate("/login");
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
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-white text-lg">{t("app.loading")}</div>
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
  const appNavigate = useNavigate();
  const location = useLocation();

  // Initialize deep link handler for Capacitor native apps
  useEffect(() => {
    import("./utils/deepLinks")
      .then(({ initDeepLinks }) => initDeepLinks(appNavigate))
      .catch(() => {});
  }, [appNavigate]);

  return (
    <>
      <ThemeSync />
      {/* 라우트 단위 경계: 한 화면 크래시가 앱 전체를 블랭크시키지 않도록 격리하고,
          경로 변경/뒤로가기 시 리로드 없이 자동 복구한다. App 최상단 ErrorBoundary는 최후 방어. */}
      <ErrorBoundary resetKeys={[location.pathname]}>
        <Routes>
        {/* 루트: 로그인 상태면 /boards, 아니면 /login */}
        <Route path="/" element={<HomeRoute />} />

        {/* 랜딩 페이지 */}
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/compare" element={<ComparisonPage />} />

        {/* 로그인 */}
        <Route path="/login" element={<LoginRoute />} />

        {/* 이메일 인증 */}
        <Route
          path="/verify-email/:token"
          element={<EmailVerificationResultPage />}
        />
        <Route path="/email-pending" element={<EmailPendingRoute />} />

        {/* 비밀번호 재설정 */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* 이용약관 및 개인정보처리방침 */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* 공유 노트 (공개 - 인증 불필요) */}
        {/* 신규 단축 경로 + 레거시 /shared/note 별칭(기존 링크 호환) */}
        {/* 자동 보고서 — 슬랙 버튼이 가리키는 공유 링크 (로그인 불필요) */}
        <Route path="/r/:shareToken" element={<AutoReportPage />} />

        <Route path="/n/:shareToken" element={<SharedNotePage />} />
        <Route path="/shared/note/:shareToken" element={<SharedNotePage />} />

        {/* 공유 앨범 (공개 - 인증 불필요) */}
        <Route path="/shared/album/:shareToken" element={<SharedAlbumPage />} />

        {/* 공유 갤러리 (공개 - 인증 불필요, 다중 앨범 탭) */}
        <Route
          path="/shared/gallery/:shareToken"
          element={<SharedGalleryPage />}
        />

        {/* 공개 업로드 (인증 불필요) */}
        <Route
          path="/shared/upload/:uploadToken"
          element={<PublicUploadPage />}
        />

        {/* 갤러리 공개 업로드 (인증 불필요, 다중 앨범 업로드) */}
        <Route
          path="/shared/gallery-upload/:uploadToken"
          element={<GalleryUploadPage />}
        />

        {/* 공지사항 */}
        <Route path="/announcements" element={<AnnouncementsPage />} />

        {/* 성경 필사 */}
        <Route path="/bible" element={<BibleTranscriptionPage />} />

        {/* 커피 룰렛 */}
        <Route path="/roulette" element={<RoulettePage />} />

        {/* 커스텀 아이콘 생성기 */}
        <Route
          path="/customicon"
          element={
            <PrivateRoute>
              <CustomIconPage />
            </PrivateRoute>
          }
        />

        {/* Slack OAuth 콜백 */}
        <Route
          path="/auth/slack/callback"
          element={
            <PrivateRoute>
              <SlackOAuthCallback />
            </PrivateRoute>
          }
        />

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

        {/* 개인 보드 (일정 + AI 일기) */}
        <Route
          path="/my-board"
          element={
            <PrivateRoute>
              <PersonalBoardPage />
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

        {/* GitHub App 설치 착지점 — Setup URL은 앱당 하나뿐이라 state(boardId)로 보드를 찾는다 */}
        <Route
          path="/github/setup"
          element={
            <PrivateRoute>
              <GithubSetupPage />
            </PrivateRoute>
          }
        />

        {/* 자동 보고서 — 보드 멤버용 (공유 링크와 같은 화면, 권한만 다르다) */}
        <Route
          path="/boards/:boardId/reports/:reportId"
          element={
            <PrivateRoute>
              <AutoReportPage />
            </PrivateRoute>
          }
        />

        {/* 사람이 읽는 태스크 키 딥링크 (예: /t/STORY-42) → 보드 딥링크로 리다이렉트 */}
        <Route
          path="/t/:taskKey"
          element={
            <PrivateRoute>
              <TaskKeyRedirect />
            </PrivateRoute>
          }
        />

        {/* 결제 결과 페이지 */}
        <Route
          path="/payment/success"
          element={
            <PrivateRoute>
              <PaymentSuccessPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/payment/fail"
          element={
            <PrivateRoute>
              <PaymentFailPage />
            </PrivateRoute>
          }
        />

        {/* 조직 */}
        <Route
          path="/organizations"
          element={
            <PrivateRoute>
              <OrganizationPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/organizations/:orgId"
          element={
            <PrivateRoute>
              <OrganizationDetailPage />
            </PrivateRoute>
          }
        />

        {/* 조직 초대 링크 */}
        <Route path="/org-invite/:code" element={<OrgInviteAcceptPage />} />

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
      </ErrorBoundary>
    </>
  );
}

// 점검 모드에서도 허용되는 경로들
const MAINTENANCE_ALLOWED_PATHS = [
  "/login",
  "/signup",
  "/admin",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/n",
  "/shared/note",
  "/shared/album",
  "/shared/gallery",
  "/shared/upload",
  "/shared/gallery-upload",
];

/** KST 03:30~08:30 야간 점검 시간대인지 */
const isNightWindow = (): boolean => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const kstMins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return kstMins >= 3 * 60 + 30 && kstMins < 8 * 60 + 30;
};

// 점검 모드 + 공지사항 래퍼
function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [maintenanceStatus, setMaintenanceStatus] =
    useState<MaintenanceStatus | null>(null);
  const [isNightShutdown, setIsNightShutdown] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  // 서버 자체가 응답하지 않는 상태 (BE 배포 중 · 장애 · 오프라인)
  const [outage, setOutage] = useState<{
    offline: boolean;
    since: number;
  } | null>(null);

  // 동시 다발 실패로 확인 요청이 겹치지 않게 하는 in-flight 락
  const checkingRef = useRef(false);
  const outageRef = useRef(false);
  // 한 번이라도 앱을 정상 렌더한 뒤 끊겼는지 (복구 시 새로고침 여부 판단)
  const wasHealthyRef = useRef(false);

  const checkMaintenance = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      // 타임아웃이 있는 직접 조회 — 응답 없는 서버에서 스피너가 멈추지 않는 것을 막는다
      const status = await fetchServerStatus<MaintenanceStatus>();

      // 세션 도중 끊겼다가 복구된 경우: 화면에 남은 데이터가 낡았으므로 다시 로드
      if (outageRef.current && wasHealthyRef.current) {
        window.location.reload();
        return;
      }

      outageRef.current = false;
      setOutage(null);
      setMaintenanceStatus(status);
      setIsNightShutdown(false);
    } catch {
      // 서버 접속 불가 + 점검 시간(KST 03:30~08:30)이면 야간 셧다운 페이지 표시
      if (isNightWindow()) {
        outageRef.current = false;
        setOutage(null);
        setIsNightShutdown(true);
        setMaintenanceStatus({
          enabled: true,
          message: "서버 점검 중입니다 (03:30~08:30)",
          started_at: null,
          estimated_end_at: null,
        });
      } else {
        // 그 외 시간대의 무응답 = 서버 다운(배포 중 포함).
        // 여기서 통과시키면 목업 데이터가 실데이터인 척 렌더된다.
        outageRef.current = true;
        setIsNightShutdown(false);
        setMaintenanceStatus(null);
        setOutage((prev) => ({
          offline: typeof navigator !== "undefined" && !navigator.onLine,
          since: prev?.since ?? Date.now(),
        }));
      }
    } finally {
      setIsChecking(false);
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkMaintenance();
  }, [checkMaintenance]);

  // API 계층이 보낸 "서버 무응답" 신호 → 실제로 죽었는지 재확인
  useEffect(() => {
    const handleUnavailable = () => {
      void checkMaintenance();
    };
    const handleOffline = () => {
      outageRef.current = true;
      setOutage((prev) => ({
        offline: true,
        since: prev?.since ?? Date.now(),
      }));
    };
    window.addEventListener(SERVER_UNAVAILABLE_EVENT, handleUnavailable);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleUnavailable);
    return () => {
      window.removeEventListener(SERVER_UNAVAILABLE_EVENT, handleUnavailable);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleUnavailable);
    };
  }, [checkMaintenance]);

  // 점검 모드에서도 허용된 경로인지 확인
  const isAllowedPath = MAINTENANCE_ALLOWED_PATHS.some(
    (path) =>
      location.pathname === path || location.pathname.startsWith(path + "/"),
  );

  const isBlocked =
    !!outage || (!!maintenanceStatus?.enabled && !isAllowedPath);

  // 정상 렌더에 도달한 시점을 기록 (복구 시 새로고침 판단용)
  useEffect(() => {
    if (!isChecking && !isBlocked) {
      wasHealthyRef.current = true;
    }
  }, [isChecking, isBlocked]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
      </div>
    );
  }

  // 서버 무응답은 로그인/공유 링크 포함 전 경로에서 막는다 (어차피 API가 없다)
  if (outage) {
    return (
      <ServerDownPage
        onRetry={checkMaintenance}
        isOffline={outage.offline}
        since={outage.since}
      />
    );
  }

  // 점검 모드이지만 허용된 경로면 정상 렌더링
  if (maintenanceStatus?.enabled && !isAllowedPath) {
    if (isNightShutdown) {
      return <NightShutdownPage onRetry={checkMaintenance} />;
    }
    return (
      <MaintenancePage status={maintenanceStatus} onRetry={checkMaintenance} />
    );
  }

  return <>{children}</>;
}

// App 컴포넌트
function App() {
  // 모바일 키보드 대응: visual viewport CSS 변수 + 자동 스크롤
  useVisualViewport();
  useKeyboardAutoScroll();
  useHorizontalWheelScroll();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <MaintenanceGuard>
          <AuthProvider>
            <AnalyticsProvider>
              <AppRoutes />
              <MobileBottomNav />
              <PWAUpdatePrompt />
              <Toaster position="top-center" richColors closeButton />
            </AnalyticsProvider>
          </AuthProvider>
        </MaintenanceGuard>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
