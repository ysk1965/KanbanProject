import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  owner: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  member: 'bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30',
  observer: 'bg-white/5 text-slate-400 border-white/10',
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
  const { t } = useTranslation();
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
        setCopyMessage(t('share.linkCreateFailed'));
        setTimeout(() => setCopyMessage(null), 3000);
        return;
      } finally {
        setIsCreatingLink(false);
      }
    }

    if (activeLink) {
      copyToClipboard(activeLink.code);
    } else {
      setCopyMessage(t('share.cannotCreateLink'));
      setTimeout(() => setCopyMessage(null), 3000);
    }
  };

  const copyToClipboard = (code: string) => {
    const inviteUrl = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setCopyMessage(t('share.linkCopied'));
    setTimeout(() => {
      setLinkCopied(false);
      setCopyMessage(null);
    }, 3000);
  };

  const currentUser = members.find((m) => m.userId === currentUserId);
  const isCurrentUserAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-bridge-obsidian text-white border border-white/10 rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-white">{t('share.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('share.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* 초대 섹션 */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('share.emailPlaceholder')}
                className="flex-1 bg-white/[0.08] border-white/15 rounded-xl text-white placeholder:text-slate-400 focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
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
                <SelectTrigger className="w-[130px] bg-white/[0.08] border-white/15 rounded-xl text-white">
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
                className="bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-40"
              >
                {t('share.invite')}
              </Button>
            </div>

            {/* 링크 공유 */}
            <div className="flex items-center justify-between p-3.5 bg-white/[0.06] rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-bridge-accent/10 flex items-center justify-center shrink-0">
                  <LinkIcon className="h-4 w-4 text-bridge-accent" />
                </div>
                <div>
                  <p className="text-sm text-slate-200">
                    {t('share.linkShareDesc')}
                  </p>
                  <button
                    className="text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors disabled:opacity-50 mt-0.5"
                    onClick={handleCopyLink}
                    disabled={isCreatingLink}
                  >
                    {isCreatingLink ? t('share.creating') : linkCopied ? t('share.copied') : t('share.copyLink')}
                  </button>
                </div>
              </div>
              <button
                onClick={handleCopyLink}
                disabled={isCreatingLink}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-all"
              >
                {isCreatingLink ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : linkCopied ? (
                  <Check className="h-4 w-4 text-bridge-secondary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* 멤버 목록 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-slate-300">{t('share.boardMembers')}</h3>
              <span className="text-[11px] font-bold text-bridge-accent bg-bridge-accent/10 px-2 py-0.5 rounded-full">
                {members.length}
              </span>
            </div>

            <div className="space-y-1">
              {members.map((member) => {
                const isCurrentMember = member.userId === currentUserId;
                const canEdit = isCurrentUserAdmin && !isCurrentMember;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* 아바타 + 색상 피커 */}
                      <Popover onOpenChange={(open) => {
                        if (!open) setCustomPickerMemberId(null);
                      }}>
                        <PopoverTrigger asChild>
                          <button
                            className={`relative w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold group/avatar ${
                              getAssigneeClasses(member.name, member.assigneeColor).bg || ''
                            }`}
                            style={
                              member.assigneeColor?.startsWith('#')
                                ? { backgroundColor: member.assigneeColor }
                                : undefined
                            }
                            title={t('share.changeColor')}
                          >
                            {getInitials(member.name)}
                            {onUpdateMemberColor && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-bridge-obsidian border border-white/20 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                <Palette className="h-2 w-2 text-slate-400" />
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
                                title={t('share.customColor')}
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
                                    {t('common.apply')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </PopoverContent>
                        )}
                      </Popover>

                      {/* 정보 */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-white truncate">
                            {member.name}
                          </span>
                          {isCurrentMember && (
                            <span className="text-[10px] text-slate-400 tracking-wide shrink-0">{t('common.me')}</span>
                          )}
                          <span className="text-xs text-slate-500 truncate">{member.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* 역할 & 액션 */}
                    <div className="flex items-center gap-1.5">
                      {canEdit ? (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              onUpdateMemberRole(member.id, value as MemberRole)
                            }
                          >
                            <SelectTrigger className="w-[120px] bg-white/[0.08] border-white/15 rounded-lg text-white text-sm h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="observer">Observer</SelectItem>
                            </SelectContent>
                          </Select>
                          <button
                            onClick={() => onRemoveMember(member.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <span
                          className={`${
                            ROLE_COLORS[member.role]
                          } border text-xs font-medium px-3 py-1 rounded-lg`}
                        >
                          {ROLE_LABELS[member.role]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 권한 설명 */}
          <div className="p-4 bg-white/[0.04] rounded-xl border border-white/10">
            <h4 className="text-sm font-semibold text-slate-300 mb-3">{t('share.rolePermissions')}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-medium text-purple-400 shrink-0">Admin</span>
                <span className="text-slate-400">{t('share.adminDesc')}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-bridge-accent shrink-0">Member</span>
                <span className="text-slate-400">{t('share.memberDesc')}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-300 shrink-0">Observer</span>
                <span className="text-slate-400">{t('share.observerDesc')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="flex justify-end pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/[0.08] border border-white/15 text-slate-200 rounded-xl text-sm font-medium hover:bg-white/15 hover:text-white transition-all"
          >
            {t('common.close')}
          </button>
        </div>

        {/* 복사 알림 토스트 */}
        {copyMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-bridge-obsidian text-white px-5 py-2.5 rounded-xl shadow-2xl border border-white/10 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 z-50">
            {linkCopied ? (
              <Check className="h-4 w-4 text-bridge-secondary" />
            ) : (
              <LinkIcon className="h-4 w-4 text-slate-400" />
            )}
            <span className="text-sm font-medium">{copyMessage}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
