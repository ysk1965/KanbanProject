import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Users, Shield, ArrowRight, Loader2 } from 'lucide-react';
import { inviteLinkService } from '../utils/services';

interface InviteLandingPageProps {
  inviteCode: string;
  isAuthenticated: boolean;
  onLogin: () => void;
  onAcceptInvite: (boardId: string) => void;
}

interface InviteInfo {
  board_id: string;
  board_name: string;
  role: string;
  valid: boolean;  // API returns 'valid' not 'is_valid'
  message: string;
}

export function InviteLandingPage({
  inviteCode,
  isAuthenticated,
  onLogin,
  onAcceptInvite,
}: InviteLandingPageProps) {
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInviteInfo = async () => {
      try {
        setIsLoading(true);
        const info = await inviteLinkService.getInviteLinkInfo(inviteCode);
        setInviteInfo(info);
      } catch (err: any) {
        setError(err?.message || '초대 링크를 확인할 수 없습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInviteInfo();
  }, [inviteCode]);

  const handleAcceptInvite = async () => {
    if (!isAuthenticated) {
      // 로그인 페이지로 이동 (초대 코드 저장)
      localStorage.setItem('pending_invite_code', inviteCode);
      onLogin();
      return;
    }

    try {
      setIsAccepting(true);
      const result = await inviteLinkService.acceptInvite(inviteCode);
      onAcceptInvite(result.board_id);
    } catch (err: any) {
      setError(err?.message || '보드 참여에 실패했습니다.');
    } finally {
      setIsAccepting(false);
    }
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: Record<string, { label: string; description: string }> = {
      ADMIN: { label: 'Admin', description: '모든 권한 (멤버 관리, 보드 설정, 카드 편집 등)' },
      MEMBER: { label: 'Member', description: '카드 생성 및 편집, 댓글 작성' },
      VIEWER: { label: 'Observer', description: '읽기 전용 (카드 조회만 가능)' },
    };
    return roleMap[role] || { label: role, description: '' };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">초대 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !inviteInfo?.valid) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
        <div className="bg-bridge-obsidian rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">유효하지 않은 초대 링크</h1>
          <p className="text-slate-400 mb-6">
            {error || inviteInfo?.message || '이 초대 링크는 만료되었거나 존재하지 않습니다.'}
          </p>
          <Button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            홈으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const roleInfo = getRoleDisplay(inviteInfo.role);

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <div className="bg-bridge-obsidian rounded-lg shadow-xl p-8 max-w-md w-full">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">보드 초대</h1>
          <p className="text-slate-400">아래 보드에 참여하도록 초대받았습니다</p>
        </div>

        {/* 보드 정보 */}
        <div className="bg-bridge-dark rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">{inviteInfo.board_name}</h2>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">참여 역할:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              inviteInfo.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' :
              inviteInfo.role === 'MEMBER' ? 'bg-blue-500/20 text-blue-400' :
              'bg-slate-500/20 text-slate-400'
            }`}>
              {roleInfo.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{roleInfo.description}</p>
        </div>

        {/* 액션 버튼 */}
        {isAuthenticated ? (
          <Button
            onClick={handleAcceptInvite}
            disabled={isAccepting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isAccepting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                참여 중...
              </>
            ) : (
              <>
                보드 참여하기
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handleAcceptInvite}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              보드 참여하기
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-xs text-slate-400 text-center">
              로그인 또는 회원가입 후 자동으로 보드에 참여됩니다
            </p>
          </div>
        )}

        {/* 푸터 */}
        <div className="mt-6 pt-4 border-t border-white/20 text-center">
          <p className="text-xs text-slate-400">
            Team Kanban - 팀 협업을 위한 칸반보드
          </p>
        </div>
      </div>
    </div>
  );
}
