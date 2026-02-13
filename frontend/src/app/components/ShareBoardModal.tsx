import { useState, useEffect } from 'react';
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
import { X, Link as LinkIcon, Copy, Check, UserPlus, Trash2, Plus, Loader2, Palette, Users, Settings, GripVertical, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { HexColorPicker } from 'react-colorful';
import { InviteLink, slackWebhookAPI, SlackWebhookMemberStatus } from '../utils/api';
import { AiCredits } from '../types';
import { ASSIGNEE_COLOR_NAMES, getAssigneeClasses, getAssigneeHex, getInitials } from '../utils/assigneeColor';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

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
  onReorderMembers?: (memberIds: string[]) => void;
  currentUserId: string;
  boardId?: string;
  onlineUserIds?: Set<string>;
  // 초대 링크 관련
  inviteLinks?: InviteLink[];
  onCreateInviteLink?: (role: string, maxUses: number, expiresIn: string) => Promise<InviteLink>;
  onDeleteInviteLink?: (linkId: string) => Promise<void>;
  // 시트 관리 (Owner 전용)
  seatInfo?: { seatCount: number; usedSeats: number };
  onOpenSeatManagement?: () => void;
  // AI 크레딧 (Owner 전용)
  aiCredits?: AiCredits | null;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  member: 'bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30',
  viewer: 'bg-white/5 text-slate-400 border-white/10',
};

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z"/>
    </svg>
  );
}

interface SortableMemberRowProps {
  member: BoardMember;
  canDrag: boolean;
  isCurrentMember: boolean;
  isOnline: boolean;
  canEdit: boolean;
  canChangeColor: boolean;
  webhookStatus: SlackWebhookMemberStatus | undefined;
  customPickerMemberId: string | null;
  customPickerColor: string;
  onUpdateMemberRole: (memberId: string, role: MemberRole) => void;
  onRemoveMember: (memberId: string) => void;
  onUpdateMemberColor?: (memberId: string, color: string | null) => void;
  setCustomPickerMemberId: (id: string | null) => void;
  setCustomPickerColor: (color: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function SortableMemberRow({
  member, canDrag, isCurrentMember, isOnline, canEdit, canChangeColor, webhookStatus,
  customPickerMemberId, customPickerColor,
  onUpdateMemberRole, onRemoveMember, onUpdateMemberColor,
  setCustomPickerMemberId, setCustomPickerColor, t,
}: SortableMemberRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id, disabled: !canDrag });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-white/[0.05] transition-colors ${isDragging ? 'bg-white/[0.08] shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {/* 드래그 핸들 */}
        {canDrag && (
          <button
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-5 h-5 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {/* 아바타 + 색상 피커 */}
        <Popover onOpenChange={(open) => {
          if (!open) setCustomPickerMemberId(null);
        }}>
          <PopoverTrigger asChild>
            <button
              className={`relative w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold whitespace-nowrap group/avatar ${
                getAssigneeClasses(member.name, member.assigneeColor).bg || ''
              }`}
              style={
                member.assigneeColor?.startsWith('#')
                  ? { backgroundColor: member.assigneeColor }
                  : undefined
              }
              title={canChangeColor ? t('share.changeColor') : undefined}
              disabled={!canChangeColor}
            >
              {getInitials(member.name)}
              {/* 온라인/오프라인 상태 dot */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bridge-obsidian ${
                  isOnline ? 'bg-emerald-400' : 'bg-red-400/70'
                } ${canChangeColor ? 'group-hover/avatar:opacity-0' : ''} transition-opacity`}
              />
              {canChangeColor && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-bridge-obsidian border border-white/20 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                  <Palette className="h-2 w-2 text-slate-400" />
                </div>
              )}
            </button>
          </PopoverTrigger>
          {canChangeColor && onUpdateMemberColor && (
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
            <span
              className="shrink-0"
              title={
                webhookStatus
                  ? webhookStatus.enabled
                    ? `Slack ${t('share.webhookConnected')}${webhookStatus.channel_name ? ` (#${webhookStatus.channel_name})` : ''}`
                    : `Slack ${t('share.webhookDisabled')}`
                  : `Slack ${t('share.webhookNotConnected')}`
              }
            >
              <SlackIcon
                className={`h-3.5 w-3.5 ${
                  webhookStatus?.enabled
                    ? 'text-[#36C5F0]'
                    : webhookStatus
                      ? 'text-slate-500'
                      : 'text-slate-700'
                }`}
              />
            </span>
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
                <SelectItem value="viewer">Viewer</SelectItem>
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
}

export function ShareBoardModal({
  open,
  onClose,
  members,
  onAddMember,
  onUpdateMemberRole,
  onRemoveMember,
  onUpdateMemberColor,
  onReorderMembers,
  currentUserId,
  boardId,
  onlineUserIds,
  // 초대 링크 관련
  inviteLinks,
  onCreateInviteLink,
  onDeleteInviteLink,
  // 시트 관리
  seatInfo,
  onOpenSeatManagement,
  aiCredits,
}: ShareBoardModalProps) {
  const { t } = useTranslation();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [customPickerMemberId, setCustomPickerMemberId] = useState<string | null>(null);
  const [customPickerColor, setCustomPickerColor] = useState('#6366F1');
  const [webhookStatusMap, setWebhookStatusMap] = useState<Record<string, SlackWebhookMemberStatus>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderMembers) return;

    const oldIndex = members.findIndex((m) => m.id === active.id);
    const newIndex = members.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(members, oldIndex, newIndex);
    onReorderMembers(reordered.map((m) => m.id));
  };

  useEffect(() => {
    if (open && boardId) {
      slackWebhookAPI.getMemberStatuses(boardId)
        .then((statuses) => {
          const map: Record<string, SlackWebhookMemberStatus> = {};
          (Array.isArray(statuses) ? statuses : []).forEach((s) => { map[s.user_id] = s; });
          setWebhookStatusMap(map);
        })
        .catch(() => {
          setWebhookStatusMap({});
        });
    }
  }, [open, boardId]);

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
        const newLink = await onCreateInviteLink('VIEWER', 0, '7d'); // Viewer 역할, 무제한 사용, 7일 후 만료
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
          {/* 초대 섹션 - ADMIN+ 전용 */}
          {isCurrentUserAdmin && (
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
                  <SelectItem value="viewer">Viewer</SelectItem>
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
          )}

          {/* Owner 전용: 시트 & 크레딧 관리 섹션 */}
          {currentUser?.role === 'owner' && (seatInfo || aiCredits) && (
            <div className="space-y-2">
              {/* 시트 사용 현황 */}
              {seatInfo && onOpenSeatManagement && (
                <div className="p-4 bg-gradient-to-r from-bridge-accent/10 to-bridge-secondary/10 rounded-xl border border-bridge-accent/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-bridge-accent/20 rounded-lg">
                        <Users className="h-4 w-4 text-bridge-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{t('share.seatUsage')}</p>
                        <p className="text-xs text-slate-400">
                          {seatInfo.usedSeats} / {seatInfo.seatCount} {t('share.seatsUsed')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (seatInfo.usedSeats / seatInfo.seatCount) >= 0.9
                              ? 'bg-red-500'
                              : (seatInfo.usedSeats / seatInfo.seatCount) >= 0.7
                                ? 'bg-yellow-500'
                                : 'bg-bridge-accent'
                          }`}
                          style={{ width: `${Math.min((seatInfo.usedSeats / seatInfo.seatCount) * 100, 100)}%` }}
                        />
                      </div>
                      <button
                        onClick={onOpenSeatManagement}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-bridge-accent/20 text-bridge-accent text-xs font-medium rounded-lg hover:bg-bridge-accent/30 transition-all"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {t('share.manageSeat')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI 크레딧 사용 현황 */}
              {aiCredits && (
                <div className="p-4 bg-gradient-to-r from-bridge-secondary/10 to-bridge-accent/10 rounded-xl border border-bridge-secondary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-bridge-secondary/20 rounded-lg">
                        <Sparkles className="h-4 w-4 text-bridge-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{t('ai_credits.title')}</p>
                        <p className="text-xs text-slate-400">
                          {aiCredits.monthly_used} / {aiCredits.monthly_credits} {t('ai_credits.used')}
                          {aiCredits.purchased_credits > 0 && (
                            <span className="text-bridge-secondary"> +{aiCredits.purchased_credits}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            aiCredits.warning_level === 'EXHAUSTED'
                              ? 'bg-red-500'
                              : aiCredits.warning_level === 'CRITICAL'
                                ? 'bg-red-400'
                                : aiCredits.warning_level === 'LOW'
                                  ? 'bg-yellow-500'
                                  : 'bg-bridge-secondary'
                          }`}
                          style={{ width: `${Math.min(aiCredits.monthly_credits > 0 ? (aiCredits.monthly_used / aiCredits.monthly_credits) * 100 : 0, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium tabular-nums ${
                        aiCredits.warning_level === 'EXHAUSTED' || aiCredits.warning_level === 'CRITICAL'
                          ? 'text-red-400'
                          : aiCredits.warning_level === 'LOW'
                            ? 'text-yellow-400'
                            : 'text-bridge-secondary'
                      }`}>
                        {aiCredits.total_available}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 멤버 목록 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-slate-300">{t('share.boardMembers')}</h3>
              <span className="text-[11px] font-bold text-bridge-accent bg-bridge-accent/10 px-2 py-0.5 rounded-full">
                {members.length}
              </span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {members.map((member) => {
                    const isCurrentMember = member.userId === currentUserId;
                    const canEdit = isCurrentUserAdmin && !isCurrentMember && member.role !== 'owner';
                    const canChangeColor = onUpdateMemberColor && (isCurrentMember || isCurrentUserAdmin);
                    const webhookStatus = webhookStatusMap[member.userId];
                    const canDrag = !!onReorderMembers && isCurrentUserAdmin;

                    return (
                      <SortableMemberRow
                        key={member.id}
                        member={member}
                        canDrag={canDrag}
                        isCurrentMember={isCurrentMember}
                        isOnline={onlineUserIds?.has(member.userId) ?? false}
                        canEdit={canEdit}
                        canChangeColor={!!canChangeColor}
                        webhookStatus={webhookStatus}
                        customPickerMemberId={customPickerMemberId}
                        customPickerColor={customPickerColor}
                        onUpdateMemberRole={onUpdateMemberRole}
                        onRemoveMember={onRemoveMember}
                        onUpdateMemberColor={onUpdateMemberColor}
                        setCustomPickerMemberId={setCustomPickerMemberId}
                        setCustomPickerColor={setCustomPickerColor}
                        t={t}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
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
                <span className="font-medium text-slate-300 shrink-0">Viewer</span>
                <span className="text-slate-400">{t('share.viewerDesc')}</span>
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
