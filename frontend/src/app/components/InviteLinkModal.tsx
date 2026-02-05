import { useState, useEffect } from 'react';
import { X, Copy, Link as LinkIcon, Trash2, Plus, Check } from 'lucide-react';
import { Button } from './ui/button';
import { InviteLink } from '../utils/api';

interface InviteLinkModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  inviteLinks: InviteLink[];
  onCreateLink: (role: string, maxUses: number, expiresIn: string) => Promise<void>;
  onDeleteLink: (linkId: string) => Promise<void>;
}

export function InviteLinkModal({
  open,
  onClose,
  boardId,
  inviteLinks,
  onCreateLink,
  onDeleteLink,
}: InviteLinkModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [role, setRole] = useState<'member' | 'viewer'>('member');
  const [maxUses, setMaxUses] = useState(10);
  const [expiresIn, setExpiresIn] = useState('7d');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  if (!open) return null;

  const handleCreateLink = async () => {
    try {
      await onCreateLink(role, maxUses, expiresIn);
      setIsCreating(false);
      // 초기화
      setRole('member');
      setMaxUses(10);
      setExpiresIn('7d');
    } catch (error) {
      console.error('Failed to create invite link:', error);
    }
  };

  const handleCopyLink = async (url: string, linkId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(linkId);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '관리자';
      case 'member':
        return '멤버';
      case 'viewer':
        return '뷰어';
      default:
        return role;
    }
  };

  const getExpiresLabel = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '만료됨';
    if (diffDays === 0) return '오늘 만료';
    if (diffDays === 1) return '내일 만료';
    return `${diffDays}일 후 만료`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bridge-obsidian rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-foreground">초대 링크 관리</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 새 링크 생성 버튼 */}
          {!isCreating && (
            <Button
              onClick={() => setIsCreating(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              새 초대 링크 생성
            </Button>
          )}

          {/* 링크 생성 폼 */}
          {isCreating && (
            <div className="bg-bridge-dark rounded-lg p-4 space-y-4 border border-white/20">
              <h3 className="font-medium text-foreground">새 초대 링크 설정</h3>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  역할
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-bridge-obsidian border border-white/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">뷰어 (읽기 전용)</option>
                  <option value="member">멤버 (편집 가능)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  최대 사용 횟수
                </label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 bg-bridge-obsidian border border-white/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  유효 기간
                </label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full px-3 py-2 bg-bridge-obsidian border border-white/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1d">1일</option>
                  <option value="7d">7일</option>
                  <option value="30d">30일</option>
                  <option value="never">무제한</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCreateLink}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  생성
                </Button>
                <Button
                  onClick={() => setIsCreating(false)}
                  variant="outline"
                  className="flex-1 border-white/20 text-slate-300 hover:bg-white/5 hover:text-foreground"
                >
                  취소
                </Button>
              </div>
            </div>
          )}

          {/* 초대 링크 목록 */}
          {inviteLinks.length === 0 && !isCreating && (
            <div className="text-center py-12 text-slate-400">
              <LinkIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>생성된 초대 링크가 없습니다.</p>
            </div>
          )}

          {inviteLinks.map((link) => {
            const isExpired = new Date(link.expiresAt) < new Date();
            const isMaxed = link.usedCount >= link.maxUses;
            const isInactive = isExpired || isMaxed;

            return (
              <div
                key={link.id}
                className={`bg-bridge-dark rounded-lg p-4 border ${
                  isInactive ? 'border-white/20 opacity-60' : 'border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {getRoleLabel(link.role)}
                      </span>
                      {isInactive && (
                        <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">
                          비활성
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div>
                        사용: {link.usedCount} / {link.maxUses}회
                      </div>
                      <div>{getExpiresLabel(link.expiresAt)}</div>
                      <div>생성: {link.createdBy.name}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(link.url, link.id)}
                      className="border-white/20 text-slate-300 hover:bg-white/5 hover:text-foreground"
                      disabled={isInactive}
                    >
                      {copiedLinkId === link.id ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          복사
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDeleteLink(link.id)}
                      className="border-red-600 text-red-400 hover:bg-red-600/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="bg-bridge-obsidian rounded px-3 py-2 text-sm text-slate-400 font-mono break-all">
                  {link.url}
                </div>
              </div>
            );
          })}
        </div>

        {/* 푸터 */}
        <div className="border-t border-white/20 p-4 bg-bridge-dark">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full border-white/20 text-slate-300 hover:bg-white/5 hover:text-foreground"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
