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
import { X, Link as LinkIcon, Copy, Check, UserPlus, Trash2, Plus, Loader2, Palette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { HexColorPicker } from 'react-colorful';
import { InviteLink } from '../utils/api';
import { ASSIGNEE_COLOR_NAMES, getAssigneeClasses, getAssigneeHex, getInitials } from '../utils/assigneeColor';

export type MemberRole = 'owner' | 'admin' | 'member' | 'observer';

export interface BoardMember {
  id: string;       // member ID (for API calls)
  userId: string;   // user ID (for identifying current user)
  name: string;
  email: string;
  role: MemberRole;
  avatar?: string;
  assigneeColor?: string | null;
}

interface ShareBoardModalProps {
  open: boolean;
  onClose: () => void;
  members: BoardMember[];
  onAddMember: (email: string, role: MemberRole) => void;
  onUpdateMemberRole: (memberId: string, role: MemberRole) => void;
  onRemoveMember: (memberId: string) => void;
  onUpdateMemberColor?: (memberId: string, color: string | null) => void;
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
  onUpdateMemberColor,
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
  const [customPickerMemberId, setCustomPickerMemberId] = useState<string | null>(null);
  const [customPickerColor, setCustomPickerColor] = useState('#6366F1');

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
                className="flex-1 bg-kanban-card border-kanban-border text-white placeholder:text-zinc-400"
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
                    <span className="text-zinc-400">•</span>
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
                      {/* 아바타 + 색상 피커 */}
                      <Popover onOpenChange={(open) => {
                        if (!open) setCustomPickerMemberId(null);
                      }}>
                        <PopoverTrigger asChild>
                          <button
                            className={`relative w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold group/avatar ${
                              getAssigneeClasses(member.name, member.assigneeColor).bg || ''
                            }`}
                            style={
                              member.assigneeColor?.startsWith('#')
                                ? { backgroundColor: member.assigneeColor }
                                : undefined
                            }
                            title="색상 변경"
                          >
                            {getInitials(member.name)}
                            {onUpdateMemberColor && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bridge-obsidian border border-white/20 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                <Palette className="h-2.5 w-2.5 text-slate-400" />
                              </div>
                            )}
                          </button>
                        </PopoverTrigger>
                        {onUpdateMemberColor && (
                          <PopoverContent className="w-auto p-2 bg-bridge-obsidian border-white/20" align="start">
                            <div className="flex gap-1.5">
                              {ASSIGNEE_COLOR_NAMES.map((colorName) => {
                                const cls = getAssigneeClasses(colorName, colorName);
                                const currentHex = getAssigneeHex(member.name, member.assigneeColor);
                                const isSelected = cls.hex === currentHex;
                                return (
                                  <button
                                    key={colorName}
                                    onClick={() => {
                                      onUpdateMemberColor(member.id, colorName);
                                      setCustomPickerMemberId(null);
                                    }}
                                    className={`w-7 h-7 rounded-full ${cls.bg} flex items-center justify-center transition-all ${
                                      isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian' : 'hover:scale-110'
                                    }`}
                                    title={colorName}
                                  >
                                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                  </button>
                                );
                              })}
                              {/* 커스텀 컬러 + 버튼 */}
                              <button
                                onClick={() => {
                                  const currentHex = getAssigneeHex(member.name, member.assigneeColor);
                                  setCustomPickerColor(currentHex);
                                  setCustomPickerMemberId(
                                    customPickerMemberId === member.id ? null : member.id
                                  );
                                }}
                                className={`w-7 h-7 rounded-full border border-dashed border-white/30 flex items-center justify-center transition-all hover:scale-110 hover:border-white/60 ${
                                  customPickerMemberId === member.id ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian border-solid' : ''
                                }`}
                                style={
                                  member.assigneeColor?.startsWith('#')
                                    ? { backgroundColor: member.assigneeColor + '40', borderColor: member.assigneeColor }
                                    : undefined
                                }
                                title="커스텀 색상"
                              >
                                <Plus className="h-3.5 w-3.5 text-slate-400" />
                              </button>
                            </div>
                            {/* 커스텀 컬러 피커 패널 */}
                            {customPickerMemberId === member.id && (
                              <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
                                <HexColorPicker
                                  color={customPickerColor}
                                  onChange={setCustomPickerColor}
                                  style={{ width: '100%', height: 140 }}
                                />
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-7 h-7 rounded-full border border-white/20 shrink-0"
                                    style={{ backgroundColor: customPickerColor }}
                                  />
                                  <input
                                    type="text"
                                    value={customPickerColor}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCustomPickerColor(v);
                                    }}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                                    maxLength={7}
                                  />
                                  <button
                                    onClick={() => {
                                      if (/^#[0-9A-Fa-f]{6}$/.test(customPickerColor)) {
                                        onUpdateMemberColor(member.id, customPickerColor);
                                        setCustomPickerMemberId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-bridge-accent text-white text-xs rounded-lg hover:bg-bridge-accent/90 transition-colors font-medium"
                                  >
                                    적용
                                  </button>
                                </div>
                              </div>
                            )}
                          </PopoverContent>
                        )}
                      </Popover>

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