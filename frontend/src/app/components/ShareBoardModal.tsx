import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import { X, Link as LinkIcon, Copy, Check, UserPlus, Trash2, Plus, Loader2 } from 'lucide-react';
import { InviteLink } from '../utils/api';

export type MemberRole = 'owner' | 'admin' | 'member' | 'observer';

export interface BoardMember {
  id: string;       // member ID (for API calls)
  userId: string;   // user ID (for identifying current user)
  name: string;
  email: string;
  role: MemberRole;
  avatar?: string;
}

interface ShareBoardModalProps {
  open: boolean;
  onClose: () => void;
  members: BoardMember[];
  onAddMember: (email: string, role: MemberRole) => void;
  onUpdateMemberRole: (memberId: string, role: MemberRole) => void;
  onRemoveMember: (memberId: string) => void;
  currentUserId: string;
  // 초대 링크 관련
  inviteLinks?: InviteLink[];
  onCreateInviteLink?: (role: string, maxUses: number, expiresIn: string) => Promise<InviteLink>;
  onDeleteInviteLink?: (linkId: string) => Promise<void>;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  observer: 'Observer',
};

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  admin: 'bg-purple-100 text-purple-700 border-purple-300',
  member: 'bg-blue-100 text-blue-700 border-blue-300',
  observer: 'bg-gray-100 text-gray-700 border-gray-300',
};

export function ShareBoardModal({
  open,
  onClose,
  members,
  onAddMember,
  onUpdateMemberRole,
  onRemoveMember,
  currentUserId,
  // 초대 링크 관련
  inviteLinks,
  onCreateInviteLink,
  onDeleteInviteLink,
}: ShareBoardModalProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const handleInvite = () => {
    if (inviteEmail.trim()) {
      onAddMember(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInviteRole('member');
    }
  };

  const handleCopyLink = async () => {
    // 첫 번째 활성화된 초대 링크 사용
    let activeLink = inviteLinks?.find(link => link.is_active);

    // 활성화된 링크가 없으면 새로 생성
    if (!activeLink && onCreateInviteLink) {
      try {
        setIsCreatingLink(true);
        const newLink = await onCreateInviteLink('VIEWER', 0, '7d'); // Observer 역할, 무제한 사용, 7일 후 만료
        // 생성된 링크 바로 사용
        copyToClipboard(newLink.code);
        return;
      } catch (error) {
        console.error('Failed to create invite link:', error);
        setCopyMessage('링크 생성에 실패했습니다');
        setTimeout(() => setCopyMessage(null), 3000);
        return;
      } finally {
        setIsCreatingLink(false);
      }
    }

    if (activeLink) {
      copyToClipboard(activeLink.code);
    } else {
      setCopyMessage('초대 링크를 생성할 수 없습니다');
      setTimeout(() => setCopyMessage(null), 3000);
    }
  };

  const copyToClipboard = (code: string) => {
    const inviteUrl = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setCopyMessage('링크가 클립보드에 복사되었습니다!');
    setTimeout(() => {
      setLinkCopied(false);
      setCopyMessage(null);
    }, 3000);
  };

  const currentUser = members.find((m) => m.userId === currentUserId);
  const isCurrentUserAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-kanban-bg text-white border-kanban-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Share board</DialogTitle>
          <DialogDescription className="sr-only">
            보드를 팀원과 공유합니다
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* 초대 섹션 */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address or name"
                className="flex-1 bg-kanban-card border-kanban-border text-white placeholder:text-zinc-500"
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') {
                    handleInvite();
                  }
                }}
              />
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as MemberRole)}
              >
                <SelectTrigger className="w-[130px] bg-kanban-card border-kanban-border text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="observer">Observer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleInvite}
                disabled={!inviteEmail.trim()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Share
              </Button>
            </div>

            {/* 링크 공유 */}
            <div className="flex items-center justify-between p-3 bg-kanban-card rounded-lg border border-kanban-border">
              <div className="flex items-center gap-3">
                <LinkIcon className="h-5 w-5 text-zinc-400" />
                <div>
                  <p className="text-sm text-zinc-300">
                    Anyone with the link can join as an
                  </p>
                  <div className="flex items-center gap-2">
                    <button className="text-sm text-indigo-400 hover:underline">
                      Observer
                    </button>
                    <span className="text-zinc-500">•</span>
                    <button
                      className="text-sm text-indigo-400 hover:underline disabled:opacity-50"
                      onClick={handleCopyLink}
                      disabled={isCreatingLink}
                    >
                      {isCreatingLink ? '생성 중...' : linkCopied ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLink}
                disabled={isCreatingLink}
                className="text-zinc-300 hover:text-foreground hover:bg-white/5"
              >
                {isCreatingLink ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : linkCopied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* 멤버 목록 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Board members</h3>
              <Badge variant="secondary" className="bg-kanban-surface text-zinc-300">
                {members.length}
              </Badge>
            </div>

            <div className="space-y-2">
              {members.map((member) => {
                const isCurrentMember = member.userId === currentUserId;
                const canEdit = isCurrentUserAdmin && !isCurrentMember;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-kanban-border"
                  >
                    <div className="flex items-center gap-3">
                      {/* 아바타 */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                        {member.name.charAt(0).toUpperCase()}
                      </div>

                      {/* 정보 */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {member.name}
                          </span>
                          {isCurrentMember && (
                            <span className="text-xs text-zinc-400">(you)</span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400">{member.email}</p>
                      </div>
                    </div>

                    {/* 역할 & 액션 */}
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              onUpdateMemberRole(member.id, value as MemberRole)
                            }
                          >
                            <SelectTrigger className="w-[130px] bg-kanban-card border-kanban-border text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="observer">Observer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveMember(member.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Badge
                          className={`${
                            ROLE_COLORS[member.role]
                          } border px-3 py-1`}
                        >
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 권한 설명 */}
          <div className="p-4 bg-kanban-card rounded-lg border border-kanban-border">
            <h4 className="font-semibold text-foreground mb-2">역할 권한</h4>
            <div className="space-y-2 text-sm text-zinc-400">
              <div>
                <span className="font-medium text-purple-400">Admin:</span> 모든
                권한 (멤버 관리, 보드 설정, 카드 편집 등)
              </div>
              <div>
                <span className="font-medium text-indigo-400">Member:</span> 카드
                생성 및 편집, 댓글 작성
              </div>
              <div>
                <span className="font-medium text-zinc-400">Observer:</span> 읽기
                전용 (카드 조회만 가능)
              </div>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="flex justify-end pt-4 border-t border-kanban-border">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-kanban-border text-zinc-300 hover:bg-white/5"
          >
            Close
          </Button>
        </div>

        {/* 복사 알림 토스트 */}
        {copyMessage && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-kanban-card text-white px-4 py-2 rounded-lg shadow-lg border border-kanban-border flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 z-50">
            {linkCopied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <LinkIcon className="h-4 w-4 text-zinc-400" />
            )}
            <span className="text-sm">{copyMessage}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}