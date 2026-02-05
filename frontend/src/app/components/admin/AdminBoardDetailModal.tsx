import { useState, useEffect } from 'react';
import { X, Folder, Users, ListTodo, Calendar, Trash2, Crown, Shield, User as UserIcon, Eye } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminBoardDetail } from '../../utils/api';

interface AdminBoardDetailModalProps {
  boardId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const TIER_OPTIONS = ['FREE', 'STANDARD', 'PREMIUM', 'ENTERPRISE'] as const;

export function AdminBoardDetailModal({ boardId, onClose, onUpdate }: AdminBoardDetailModalProps) {
  const [board, setBoard] = useState<AdminBoardDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadBoardDetail();
  }, [boardId]);

  const loadBoardDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getBoard(boardId);
      setBoard(data);
    } catch (err) {
      console.error('Failed to load board detail:', err);
      setError('보드 정보를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTierChange = async (newTier: typeof TIER_OPTIONS[number]) => {
    if (!board || board.tier === newTier) return;

    if (!confirm(`보드 티어를 ${newTier}로 변경하시겠습니까?`)) return;

    try {
      setIsUpdating(true);
      await adminService.updateBoardTier(boardId, newTier);
      setBoard({ ...board, tier: newTier });
      onUpdate();
    } catch (err) {
      console.error('Failed to update board tier:', err);
      alert('티어 변경에 실패했습니다');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!board) return;

    const confirmText = prompt(
      `정말로 "${board.name}" 보드를 삭제하시겠습니까?\n\n삭제하려면 보드 이름을 입력하세요:`
    );

    if (confirmText !== board.name) {
      if (confirmText !== null) {
        alert('보드 이름이 일치하지 않습니다');
      }
      return;
    }

    try {
      setIsDeleting(true);
      await adminService.deleteBoard(boardId);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to delete board:', err);
      alert('보드 삭제에 실패했습니다');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'FREE':
        return 'bg-slate-500/20 text-slate-400';
      case 'STANDARD':
        return 'bg-blue-500/20 text-blue-400';
      case 'PREMIUM':
        return 'bg-purple-500/20 text-purple-400';
      case 'ENTERPRISE':
        return 'bg-amber-500/20 text-amber-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER':
        return <Crown className="h-4 w-4 text-amber-400" />;
      case 'ADMIN':
        return <Shield className="h-4 w-4 text-purple-400" />;
      case 'MEMBER':
        return <UserIcon className="h-4 w-4 text-blue-400" />;
      case 'VIEWER':
        return <Eye className="h-4 w-4 text-slate-400" />;
      default:
        return <UserIcon className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bridge-obsidian rounded-2xl border border-white/20 w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/15">
          <h2 className="text-xl font-bold text-white">보드 상세</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {!isLoading && !error && board && (
            <div className="space-y-6">
              {/* Board Info */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-bridge-accent/20 flex items-center justify-center">
                  <Folder className="h-8 w-8 text-bridge-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{board.name}</h3>
                  {board.description && (
                    <p className="text-slate-400 mt-1">{board.description}</p>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    티어
                  </p>
                  <select
                    value={board.tier}
                    onChange={(e) => handleTierChange(e.target.value as typeof TIER_OPTIONS[number])}
                    disabled={isUpdating}
                    className={`${getTierStyle(board.tier)} px-3 py-1 rounded-full text-sm font-medium
                      border-0 focus:outline-none cursor-pointer disabled:opacity-50`}
                  >
                    {TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier} className="bg-bridge-dark text-white">
                        {tier}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    소유자
                  </p>
                  <div>
                    <p className="text-white font-medium">{board.owner_name}</p>
                    <p className="text-slate-400 text-sm">{board.owner_email}</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    멤버 수
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-bridge-accent" />
                    {board.member_count}명
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    태스크 수
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-bridge-secondary" />
                    {board.task_count}개
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    생성일
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(board.created_at)}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    구독 상태
                  </p>
                  {board.subscription ? (
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        board.subscription.status === 'ACTIVE'
                          ? 'bg-green-500/20 text-green-400'
                          : board.subscription.status === 'CANCELLED'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {board.subscription.status}
                    </span>
                  ) : (
                    <span className="text-slate-400">구독 없음</span>
                  )}
                </div>
              </div>

              {/* Members List */}
              {board.members && board.members.length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-white mb-4">멤버 목록</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {board.members.map((member) => (
                      <div
                        key={member.id}
                        className="bg-white/5 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {getRoleIcon(member.role)}
                          <div>
                            <p className="text-white font-medium">{member.name}</p>
                            <p className="text-slate-400 text-sm">{member.email}</p>
                          </div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            member.role === 'OWNER'
                              ? 'bg-amber-500/20 text-amber-400'
                              : member.role === 'ADMIN'
                              ? 'bg-purple-500/20 text-purple-400'
                              : member.role === 'MEMBER'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {member.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danger Zone */}
              <div className="border-t border-white/15 pt-6">
                <h4 className="text-lg font-bold text-red-400 mb-4">위험 영역</h4>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">보드 삭제</p>
                      <p className="text-slate-400 text-sm">
                        보드와 관련된 모든 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                      </p>
                    </div>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-medium
                        hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? '삭제 중...' : '삭제'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
