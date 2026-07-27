import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionModal } from './ui/MotionModal';
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
import { X, Link as LinkIcon, Copy, Check, UserPlus, Trash2, Loader2, Pipette, Users, Settings, GripVertical, Sparkles, Building2, Search, ArrowRightLeft, Briefcase } from 'lucide-react';
import { ColorPickerPopover } from './ui/ColorPickerPopover';
import { InviteLink, slackWebhookAPI, SlackWebhookMemberStatus, discordAPI, DiscordMemberStatus, githubAPI, GithubUserCheck } from '../utils/api';
import { AiCredits, JobRole, JobRoleInfo, OrgBoardCandidate } from '../types';
import { FEATURE_COLORS } from '../constants';
import { ASSIGNEE_COLOR_NAMES, getAssigneeClasses, getAssigneeHex, getInitials } from '../utils/assigneeColor';
import { memberService } from '../utils/services';
import JoinRequestsPanel from './JoinRequestsPanel';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Reverse map hex → assignee color name for preset matching */
const HEX_TO_NAME_MAP = new Map(
  ASSIGNEE_COLOR_NAMES.map((name) => [getAssigneeHex(name, name).toLowerCase(), name])
);

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface BoardMember {
  id: string;       // member ID (for API calls)
  userId: string;   // user ID (for identifying current user)
  name: string;
  email: string;
  role: MemberRole;
  avatar?: string;
  assigneeColor?: string | null;
  jobRole?: JobRoleInfo | null;
  githubLogin?: string | null;
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
  onOpenAiCreditPurchase?: () => void;
  // 조직 보드 관련
  isOrgBoard?: boolean;
  organizationName?: string | null;
  // 참가 요청
  pendingJoinRequestCount?: number;
  isAdminOrOwner?: boolean;
  onJoinRequestHandled?: () => void;
  // 소유권 이전
  boardName?: string;
  onTransferOwnership?: (newOwnerUserId: string) => Promise<void>;
  // 직군(JobRole)
  jobRoles?: JobRole[];
  onUpdateMemberJobRole?: (memberId: string, jobRoleId: string | null) => void;
  onOpenJobRoleManager?: () => void;
  canManageJobRoles?: boolean;
  // GitHub 계정 연결
  onUpdateMemberGithubLogin?: (memberId: string, githubLogin: string | null) => void;
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
  viewer: 'bg-foreground/5 text-slate-400 border-foreground/10',
};

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z"/>
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
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
  discordStatus: DiscordMemberStatus | undefined;
  onUpdateMemberRole: (memberId: string, role: MemberRole) => void;
  onRemoveMember: (memberId: string) => void;
  onUpdateMemberColor?: (memberId: string, color: string | null) => void;
  jobRoles?: JobRole[];
  canChangeJobRole?: boolean;
  onUpdateMemberJobRole?: (memberId: string, jobRoleId: string | null) => void;
  canEditGithub?: boolean;
  onUpdateMemberGithubLogin?: (memberId: string, githubLogin: string | null) => void;
  boardId?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  isCurrentUserOwner?: boolean;
  onTransferClick?: () => void;
}

/** GitHub username 형식(영숫자·하이픈, 최대 39자, 하이픈 시작/끝·연속 불가) */
const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

type GithubCheckState =
  | { status: 'idle' | 'checking' | 'invalid' | 'error' }
  | { status: 'valid'; user: GithubUserCheck };

function SortableMemberRow({
  member, canDrag, isCurrentMember, isOnline, canEdit, canChangeColor, webhookStatus, discordStatus,
  onUpdateMemberRole, onRemoveMember, onUpdateMemberColor,
  jobRoles, canChangeJobRole, onUpdateMemberJobRole,
  canEditGithub, onUpdateMemberGithubLogin, boardId,
  t, isCurrentUserOwner, onTransferClick,
}: SortableMemberRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id, disabled: !canDrag });
  const [editingGithub, setEditingGithub] = useState(false);
  const [githubDraft, setGithubDraft] = useState(member.githubLogin ?? '');
  const [githubCheck, setGithubCheck] = useState<GithubCheckState>({ status: 'idle' });
  const commitGithub = () => {
    const val = githubDraft.trim().replace(/^@/, '');
    onUpdateMemberGithubLogin?.(member.id, val || null);
    setEditingGithub(false);
  };

  // 입력값을 디바운스해서 실제 GitHub 계정인지 조회한다. 존재 여부만 보므로 저장을 막지는 않는다.
  useEffect(() => {
    if (!editingGithub || !boardId) {
      setGithubCheck({ status: 'idle' });
      return;
    }
    const val = githubDraft.trim().replace(/^@/, '');
    if (!val) {
      setGithubCheck({ status: 'idle' });
      return;
    }
    if (!GITHUB_LOGIN_RE.test(val)) {
      setGithubCheck({ status: 'invalid' });
      return;
    }
    let cancelled = false;
    setGithubCheck({ status: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const res = await githubAPI.validateUser(boardId, val);
        if (cancelled) return;
        setGithubCheck(res.exists ? { status: 'valid', user: res } : { status: 'invalid' });
      } catch {
        if (!cancelled) setGithubCheck({ status: 'error' });
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [githubDraft, editingGithub, boardId]);
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
      className={`flex items-center justify-between py-2.5 px-3.5 hover:bg-foreground/[0.04] transition-all duration-150 ${isDragging ? 'bg-foreground/[0.08] shadow-lg' : ''}`}
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
        <ColorPickerPopover
          colors={FEATURE_COLORS}
          selectedColor={getAssigneeHex(member.name, member.assigneeColor)}
          onColorChange={(hex) => {
            if (!onUpdateMemberColor) return;
            const colorName = HEX_TO_NAME_MAP.get(hex.toLowerCase());
            onUpdateMemberColor(member.id, colorName ?? hex);
          }}
          disabled={!canChangeColor}
          triggerSize="sm"
          columns={3}
          customColorLabel={t('share.customColor')}
        >
          <button
            className={`relative w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium whitespace-nowrap group/avatar ${
              getAssigneeClasses(member.name, member.assigneeColor).bg || ''
            }`}
            style={
              member.assigneeColor?.startsWith('#')
                ? { backgroundColor: member.assigneeColor }
                : undefined
            }
            title={canChangeColor ? t('share.changeColor') : undefined}
          >
            {getInitials(member.name)}
            {/* 온라인/오프라인 상태 dot */}
            <div
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bridge-obsidian ${
                isOnline ? 'bg-emerald-400' : 'bg-red-400/70'
              } ${canChangeColor ? 'group-hover/avatar:opacity-0' : ''} transition-opacity`}
            />
            {canChangeColor && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-bridge-obsidian border border-foreground/10 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                <Pipette className="h-2 w-2 text-slate-400" />
              </div>
            )}
          </button>
        </ColorPickerPopover>

        {/* 정보 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-foreground shrink-0">
              {member.name}
            </span>
            {isCurrentMember && (
              <span className="text-xs text-slate-400 tracking-wide shrink-0">{t('common.me')}</span>
            )}
            <span
              className="shrink-0"
              title={
                webhookStatus?.reachable
                  ? `Slack ${t('share.webhookConnected')}${webhookStatus.channel_name ? ` (#${webhookStatus.channel_name})` : ''}`
                  : `Slack ${t('share.webhookNotConnected')}`
              }
            >
              <SlackIcon
                className={`h-3.5 w-3.5 ${
                  webhookStatus?.reachable
                    ? 'text-[#36C5F0]'
                    : 'text-slate-700'
                }`}
              />
            </span>
            <span
              className="shrink-0"
              title={
                discordStatus?.linked
                  ? discordStatus.enabled
                    ? `Discord ${t('share.webhookConnected')}${discordStatus.discord_username ? ` (@${discordStatus.discord_username})` : ''}`
                    : `Discord ${t('share.webhookDisabled')}`
                  : `Discord ${t('share.webhookNotConnected')}`
              }
            >
              <DiscordIcon
                className={`h-3.5 w-3.5 ${
                  discordStatus?.linked && discordStatus?.enabled
                    ? 'text-[#5865F2]'
                    : discordStatus?.linked
                      ? 'text-slate-500'
                      : 'text-slate-700'
                }`}
              />
            </span>
            {/* GitHub 계정 연결 (본인/Admin 편집 가능) */}
            <span className="relative shrink-0">
              <button
                type="button"
                disabled={!canEditGithub}
                onClick={() => {
                  if (!canEditGithub) return;
                  setGithubDraft(member.githubLogin ?? '');
                  setEditingGithub((v) => !v);
                }}
                title={member.githubLogin ? `GitHub @${member.githubLogin}` : 'GitHub 미연결'}
                className={canEditGithub ? 'cursor-pointer' : 'cursor-default'}
              >
                <GithubIcon
                  className={`h-3.5 w-3.5 ${member.githubLogin ? 'text-foreground' : 'text-slate-700'} ${canEditGithub ? 'hover:text-bridge-accent transition-colors' : ''}`}
                />
              </button>
              {editingGithub && (
                <div className="absolute z-50 top-full left-0 mt-1.5 w-56 p-2.5 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl">
                  <p className="text-xs text-slate-400 mb-1.5">GitHub 계정 연결</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">@</span>
                    <input
                      autoFocus
                      value={githubDraft}
                      onChange={(e) => setGithubDraft(e.target.value)}
                      placeholder="octocat"
                      className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter') commitGithub();
                        if (e.key === 'Escape') setEditingGithub(false);
                      }}
                    />
                  </div>
                  {githubCheck.status !== 'idle' && (
                    <div className="flex items-center gap-1.5 mt-1.5 min-h-[16px]">
                      {githubCheck.status === 'checking' && (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                          <span className="text-xs text-slate-400">확인 중…</span>
                        </>
                      )}
                      {githubCheck.status === 'valid' && (
                        <>
                          {githubCheck.user.avatar_url && (
                            <img src={githubCheck.user.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                          )}
                          <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="text-xs text-emerald-500 truncate">
                            {githubCheck.user.name || githubCheck.user.login}
                          </span>
                        </>
                      )}
                      {githubCheck.status === 'invalid' && (
                        <>
                          <X className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="text-xs text-rose-400">존재하지 않는 계정</span>
                        </>
                      )}
                      {githubCheck.status === 'error' && (
                        <span className="text-xs text-slate-500">확인할 수 없음 (저장은 가능)</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditingGithub(false)}
                      className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={commitGithub}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
                    >
                      저장
                    </button>
                  </div>
                </div>
              )}
            </span>
            <span className="text-xs text-slate-500 truncate min-w-0">{member.email}</span>
          </div>
        </div>
      </div>

      {/* 역할 & 액션 */}
      <div className="flex items-center gap-1.5">
        {/* 직군(JobRole) 드롭다운 */}
        {jobRoles !== undefined && (
          canChangeJobRole ? (
            <Select
              value={member.jobRole?.id ?? '__none__'}
              onValueChange={(value) =>
                onUpdateMemberJobRole?.(member.id, value === '__none__' ? null : value)
              }
            >
              <SelectTrigger
                className="w-[120px] bg-foreground/[0.04] border-foreground/10 rounded-lg text-foreground text-xs h-8"
                title={t('jobRole.title')}
              >
                <SelectValue placeholder={t('jobRole.unassigned')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-slate-400">{t('jobRole.unassigned')}</span>
                </SelectItem>
                {jobRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: r.color || '#6366F1' }}
                      />
                      {r.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : member.jobRole ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
              style={{
                backgroundColor: `${member.jobRole.color || '#6366F1'}26`,
                color: member.jobRole.color || '#6366F1',
              }}
              title={t('jobRole.title')}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: member.jobRole.color || '#6366F1' }}
              />
              {member.jobRole.name}
            </span>
          ) : null
        )}
        {canEdit ? (
          <>
            <Select
              value={member.role}
              onValueChange={(value) =>
                onUpdateMemberRole(member.id, value as MemberRole)
              }
            >
              <SelectTrigger className="w-[120px] bg-foreground/[0.08] border-foreground/10 rounded-lg text-foreground text-sm h-8">
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
        ) : member.role === 'owner' && isCurrentMember && isCurrentUserOwner && onTransferClick ? (
          <button
            onClick={onTransferClick}
            className={`${ROLE_COLORS.owner} border text-xs font-medium px-3 py-1 rounded-lg cursor-pointer hover:bg-amber-500/25 hover:border-amber-400/50 transition-all group flex items-center gap-1`}
            title={t('share.transferTooltip')}
          >
            {ROLE_LABELS.owner}
            <ArrowRightLeft className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
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
  onOpenAiCreditPurchase,
  // 조직 보드
  isOrgBoard,
  organizationName,
  // 참가 요청
  pendingJoinRequestCount = 0,
  isAdminOrOwner: isAdminOrOwnerProp = false,
  onJoinRequestHandled,
  // 소유권 이전
  boardName,
  onTransferOwnership,
  // 직군
  jobRoles,
  onUpdateMemberJobRole,
  onOpenJobRoleManager,
  // GitHub 계정 연결
  onUpdateMemberGithubLogin,
}: ShareBoardModalProps) {
  const { t } = useTranslation();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [webhookStatusMap, setWebhookStatusMap] = useState<Record<string, SlackWebhookMemberStatus>>({});
  const [discordStatusMap, setDiscordStatusMap] = useState<Record<string, DiscordMemberStatus>>({});

  // 조직 보드: 후보 멤버 관련
  const [orgCandidates, setOrgCandidates] = useState<OrgBoardCandidate[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgCandidateRole, setOrgCandidateRole] = useState<MemberRole>('member');
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // 소유권 이전 관련
  const [transferTarget, setTransferTarget] = useState<string>('');
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferSection, setShowTransferSection] = useState(false);

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
      discordAPI.getMemberStatuses(boardId)
        .then((statuses) => {
          const map: Record<string, DiscordMemberStatus> = {};
          (Array.isArray(statuses) ? statuses : []).forEach((s) => { map[s.user_id] = s; });
          setDiscordStatusMap(map);
        })
        .catch(() => {
          setDiscordStatusMap({});
        });
    }
  }, [open, boardId]);

  // 조직 보드: 후보 멤버 로드
  const loadOrgCandidates = (search?: string) => {
    if (!boardId || !isOrgBoard) return;
    setIsLoadingCandidates(true);
    memberService.getOrgCandidates(boardId, search || undefined)
      .then(setOrgCandidates)
      .catch(() => setOrgCandidates([]))
      .finally(() => setIsLoadingCandidates(false));
  };

  useEffect(() => {
    if (open && boardId && isOrgBoard) {
      loadOrgCandidates();
    }
    if (!open) {
      setOrgCandidates([]);
      setOrgSearch('');
    }
  }, [open, boardId, isOrgBoard]);

  // 디바운스 검색
  useEffect(() => {
    if (!isOrgBoard || !open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadOrgCandidates(orgSearch);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [orgSearch]);

  const handleAddOrgMember = (candidate: OrgBoardCandidate) => {
    onAddMember(candidate.email, orgCandidateRole);
    // 후보 목록에서 즉시 제거 (optimistic)
    setOrgCandidates((prev) => prev.filter((c) => c.user_id !== candidate.user_id));
  };

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
  const isCurrentUserOwner = currentUser?.role === 'owner';

  const eligibleMembers = members.filter(m =>
    m.userId !== currentUserId && m.role !== 'viewer' && m.role !== 'owner'
  );

  const handleTransferOwnership = async () => {
    if (!transferTarget || transferConfirmText !== boardName || !onTransferOwnership) return;
    setIsTransferring(true);
    try {
      await onTransferOwnership(transferTarget);
      setShowTransferSection(false);
      setTransferTarget('');
      setTransferConfirmText('');
    } catch {
      // error handled by caller
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-2xl max-h-[85dvh] overflow-hidden flex flex-col">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-foreground">
              {isOrgBoard ? t('share.orgBoardTitle') : t('share.title')}
            </h2>
            {isOrgBoard && organizationName && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
                <Building2 className="h-3 w-3" />
                {organizationName}
              </span>
            )}
          </div>
          {isOrgBoard && (
            <p className="text-xs text-slate-500 mt-1">{t('share.orgBoardDesc')}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 px-5 pb-2 custom-scrollbar">
          {/* 초대 섹션 - ADMIN+ 전용 */}
          {isCurrentUserAdmin && !isOrgBoard && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('share.emailPlaceholder')}
                className="flex-1 bg-foreground/[0.08] border-foreground/10 rounded-xl text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
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
                <SelectTrigger className="w-[130px] bg-foreground/[0.08] border-foreground/10 rounded-xl text-foreground">
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
            <div className="flex items-center justify-between p-3.5 bg-foreground/[0.06] rounded-xl border border-foreground/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-bridge-accent/10 flex items-center justify-center shrink-0">
                  <LinkIcon className="h-4 w-4 text-bridge-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
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
                className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-all"
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

          {/* 조직 보드: 조직 구성원 추가 섹션 - ADMIN+ 전용 */}
          {isCurrentUserAdmin && isOrgBoard && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('share.addOrgMember')}</h3>
                <Select
                  value={orgCandidateRole}
                  onValueChange={(value) => setOrgCandidateRole(value as MemberRole)}
                >
                  <SelectTrigger className="w-[120px] bg-foreground/[0.08] border-foreground/10 rounded-lg text-foreground text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 검색 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  placeholder={t('share.searchOrgMembers')}
                  className="pl-9 bg-foreground/[0.08] border-foreground/10 rounded-xl text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>

              {/* 후보 목록 */}
              <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] overflow-hidden max-h-[200px] overflow-y-auto custom-scrollbar">
                {isLoadingCandidates ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                  </div>
                ) : orgCandidates.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm text-slate-500">
                      {orgSearch ? t('share.noOrgCandidates') : t('share.allOrgMembersAdded')}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-foreground/[0.06]">
                    {orgCandidates.map((candidate) => (
                      <div
                        key={candidate.user_id}
                        className="flex items-center justify-between py-2 px-3.5 hover:bg-foreground/[0.04] transition-all duration-150"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center text-bridge-accent text-xs font-medium shrink-0">
                            {getInitials(candidate.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-foreground">{candidate.name}</span>
                              <span className="text-xs text-slate-500 truncate">{candidate.email}</span>
                            </div>
                            {(candidate.department || candidate.position) && (
                              <p className="text-xs text-slate-500">
                                {[candidate.department, candidate.position].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddOrgMember(candidate)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-bridge-accent bg-bridge-accent/10 hover:bg-bridge-accent/20 transition-all shrink-0"
                        >
                          <UserPlus className="h-3 w-3" />
                          {t('share.invite')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Owner 전용: 시트 & 크레딧 관리 섹션 (ORG_MANAGED 보드는 조직에서 관리) */}
          {currentUser?.role === 'owner' && !isOrgBoard && (seatInfo || aiCredits) && (
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
                        <p className="text-sm font-medium text-foreground">{t('share.seatUsage')}</p>
                        <p className="text-xs text-slate-400">
                          {seatInfo.usedSeats} / {seatInfo.seatCount} {t('share.seatsUsed')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
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
                        <p className="text-sm font-medium text-foreground">{t('ai_credits.title')}</p>
                        <p className="text-xs text-slate-400">
                          {aiCredits.monthly_used} / {aiCredits.monthly_credits} {t('ai_credits.used')}
                          {aiCredits.purchased_credits > 0 && (
                            <span className="text-bridge-secondary"> +{aiCredits.purchased_credits}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
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
                      {onOpenAiCreditPurchase && (
                        <button
                          onClick={onOpenAiCreditPurchase}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-bridge-secondary/20 text-bridge-secondary text-xs font-medium rounded-lg hover:bg-bridge-secondary/30 transition-all"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {t('ai_credits.purchase.buy_button')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 참가 요청 (Admin/Owner only) */}
          {isAdminOrOwnerProp && isOrgBoard && pendingJoinRequestCount > 0 && boardId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-medium text-muted-foreground">{t('share.joinRequests', '참가 요청')}</h3>
                <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                  {pendingJoinRequestCount}
                </span>
              </div>
              <JoinRequestsPanel
                boardId={boardId}
                onMemberAdded={onJoinRequestHandled}
              />
            </div>
          )}

          {/* 멤버 목록 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-medium text-muted-foreground">{t('share.boardMembers')}</h3>
              <span className="text-xs font-bold text-bridge-accent bg-bridge-accent/15 px-2 py-0.5 rounded-full">
                {members.length}
              </span>
              {onOpenJobRoleManager && (
                <button
                  type="button"
                  onClick={onOpenJobRoleManager}
                  className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-bridge-accent bg-bridge-accent/10 hover:bg-bridge-accent/20 transition-all"
                  title={t('jobRole.manage')}
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  {t('jobRole.manage')}
                </button>
              )}
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] divide-y divide-foreground/[0.06] overflow-hidden">
                  {members.map((member) => {
                    const isCurrentMember = member.userId === currentUserId;
                    const canEdit = isCurrentUserAdmin && !isCurrentMember && member.role !== 'owner';
                    const canChangeColor = onUpdateMemberColor && (isCurrentMember || isCurrentUserAdmin);
                    const webhookStatus = webhookStatusMap[member.userId];
                    const discordStatus = discordStatusMap[member.userId];
                    const canDrag = !!onReorderMembers && isCurrentUserAdmin;

                    const canChangeJobRole = isCurrentUserAdmin && !!onUpdateMemberJobRole;
                    const canEditGithub = !!onUpdateMemberGithubLogin && (isCurrentMember || isCurrentUserAdmin);
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
                        discordStatus={discordStatus}
                        onUpdateMemberRole={onUpdateMemberRole}
                        onRemoveMember={onRemoveMember}
                        onUpdateMemberColor={onUpdateMemberColor}
                        jobRoles={jobRoles}
                        canChangeJobRole={canChangeJobRole}
                        onUpdateMemberJobRole={onUpdateMemberJobRole}
                        canEditGithub={canEditGithub}
                        onUpdateMemberGithubLogin={onUpdateMemberGithubLogin}
                        boardId={boardId}
                        t={t}
                        isCurrentUserOwner={isCurrentUserOwner}
                        onTransferClick={onTransferOwnership ? () => setShowTransferSection(true) : undefined}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* 소유권 이전 섹션 */}
          {showTransferSection && isCurrentUserOwner && onTransferOwnership && (
            <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft size={14} className="text-amber-500" />
                  <span className="text-sm font-bold text-foreground">{t('share.transferOwnership')}</span>
                </div>
                <button
                  onClick={() => { setShowTransferSection(false); setTransferTarget(''); setTransferConfirmText(''); }}
                  className="p-1 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">{t('share.transferWarning')}</p>

              {eligibleMembers.length === 0 ? (
                <p className="text-xs text-slate-400">{t('share.noEligibleMembers')}</p>
              ) : (
                <div className="space-y-2">
                  <select
                    value={transferTarget}
                    onChange={(e) => { setTransferTarget(e.target.value); setTransferConfirmText(''); }}
                    className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                  >
                    <option value="">{t('share.transferSelectMember')}</option>
                    {eligibleMembers.map(m => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.email}) — {ROLE_LABELS[m.role]}
                      </option>
                    ))}
                  </select>

                  {transferTarget && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={transferConfirmText}
                        onChange={(e) => setTransferConfirmText(e.target.value)}
                        placeholder={t('share.transferConfirmLabel')}
                        className="flex-1 bg-foreground/[0.03] border border-amber-500/20 rounded-xl py-2 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                      />
                      <button
                        onClick={handleTransferOwnership}
                        disabled={transferConfirmText !== boardName || isTransferring}
                        className="px-4 py-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl font-bold text-sm hover:bg-amber-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                      >
                        {isTransferring ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRightLeft size={14} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 권한 설명 */}
          <div className="p-4 bg-foreground/[0.04] rounded-xl border border-foreground/10">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">{t('share.rolePermissions')}</h4>
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
                <span className="font-medium text-muted-foreground shrink-0">Viewer</span>
                <span className="text-slate-400">{t('share.viewerDesc')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="flex justify-end px-5 py-3 border-t border-foreground/[0.08]">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-foreground/[0.08] border border-foreground/10 text-muted-foreground rounded-xl text-sm font-medium hover:bg-foreground/15 hover:text-foreground transition-all"
          >
            {t('common.close')}
          </button>
        </div>

        {/* 복사 알림 토스트 */}
        {copyMessage && (
          <div className="fixed toast-bottom-safe left-1/2 -translate-x-1/2 bg-bridge-obsidian text-white px-5 py-2.5 rounded-xl shadow-2xl border border-foreground/10 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 z-50">
            {linkCopied ? (
              <Check className="h-4 w-4 text-bridge-secondary" />
            ) : (
              <LinkIcon className="h-4 w-4 text-slate-400" />
            )}
            <span className="text-sm font-medium">{copyMessage}</span>
          </div>
        )}
    </MotionModal>
  );
}
