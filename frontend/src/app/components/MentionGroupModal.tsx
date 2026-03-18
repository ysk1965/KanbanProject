import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionModal } from './ui/MotionModal';
import { mentionGroupAPI, MentionGroupDetail } from '../utils/api';
import { BoardMember } from './ShareBoardModal';
import { getAssigneeClasses, getInitials } from '../utils/assigneeColor';
import { Users, Plus, Pencil, Trash2, X, Check, Loader2, ArrowLeft } from 'lucide-react';

interface MentionGroupModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardMembers: BoardMember[];
  mentionGroups: MentionGroupDetail[];
  onGroupsChange: (groups: MentionGroupDetail[]) => void;
}

type ModalView = 'list' | 'create' | 'edit';

export function MentionGroupModal({ open, onClose, boardId, boardMembers, mentionGroups, onGroupsChange }: MentionGroupModalProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<ModalView>('list');
  const [editingGroup, setEditingGroup] = useState<MentionGroupDetail | null>(null);
  const [name, setName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (open) {
      setView('list');
      setEditingGroup(null);
      setName('');
      setSelectedMemberIds([]);
      setMemberSearch('');
    }
  }, [open]);

  const handleCreate = () => {
    setView('create');
    setName('');
    setSelectedMemberIds([]);
    setMemberSearch('');
  };

  const handleEdit = (group: MentionGroupDetail) => {
    setView('edit');
    setEditingGroup(group);
    setName(group.name);
    setSelectedMemberIds(group.members.map(m => m.user_id));
    setMemberSearch('');
  };

  const handleBack = () => {
    setView('list');
    setEditingGroup(null);
    setName('');
    setSelectedMemberIds([]);
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim() || selectedMemberIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (view === 'create') {
        const created = await mentionGroupAPI.createGroup(boardId, { name: name.trim(), member_ids: selectedMemberIds });
        onGroupsChange([...mentionGroups, created]);
      } else if (view === 'edit' && editingGroup) {
        const updated = await mentionGroupAPI.updateGroup(boardId, editingGroup.id, { name: name.trim(), member_ids: selectedMemberIds });
        onGroupsChange(mentionGroups.map(g => g.id === editingGroup.id ? updated : g));
      }
      handleBack();
    } catch {
      // error handled silently
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    try {
      await mentionGroupAPI.deleteGroup(boardId, groupId);
      onGroupsChange(mentionGroups.filter(g => g.id !== groupId));
      setDeleteTarget(null);
    } catch {
      // error handled silently
    }
  };

  const filteredBoardMembers = boardMembers.filter(m =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <MotionModal open={open} onClose={onClose}>
      <div className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl">
        {/* Top Accent Line */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent rounded-t-2xl" />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          {view !== 'list' && (
            <button onClick={handleBack} className="text-slate-400 hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Users className="w-4 h-4 text-bridge-secondary" />
          <h3 className="text-sm font-bold text-foreground">
            {view === 'list' ? t('mentionGroup.manageTitle', '멘션 그룹 관리') :
              view === 'create' ? t('mentionGroup.create', '멘션 그룹 만들기') :
              t('mentionGroup.edit', '멘션 그룹 수정')}
          </h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {view === 'list' ? (
            <>
              {mentionGroups.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">{t('mentionGroup.noGroups', '멘션 그룹이 없습니다')}</p>
              ) : (
                <div className="space-y-2">
                  {mentionGroups.map(group => (
                    <div key={group.id} className="flex items-center gap-3 p-3 rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors">
                      <div className="w-8 h-8 rounded-full bg-bridge-secondary/20 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-bridge-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{group.name}</p>
                        <p className="text-xs text-slate-500">{group.members.length}{t('mentionGroup.memberCountSuffix', '명')}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Member avatars */}
                        <div className="flex -space-x-1.5 mr-2">
                          {group.members.slice(0, 4).map(m => {
                            const bm = boardMembers.find(b => b.userId === m.user_id);
                            const color = getAssigneeClasses(m.name, bm?.assigneeColor);
                            return (
                              <div key={m.user_id} className={`w-5 h-5 rounded-full ${color.bg} flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-bridge-obsidian`}>
                                {getInitials(m.name)}
                              </div>
                            );
                          })}
                          {group.members.length > 4 && (
                            <div className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center text-[9px] font-bold text-slate-400 ring-1 ring-bridge-obsidian">
                              +{group.members.length - 4}
                            </div>
                          )}
                        </div>
                        {deleteTarget === group.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(group.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(null)} className="p-1 text-slate-400 hover:bg-foreground/5 rounded transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => handleEdit(group)} className="p-1 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(group.id)} className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleCreate}
                className="mt-3 flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border border-dashed border-foreground/10 text-xs text-bridge-accent hover:bg-foreground/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('mentionGroup.create', '멘션 그룹 만들기')}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              {/* 그룹 이름 */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                  {t('mentionGroup.name', '그룹 이름')}
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('mentionGroup.namePlaceholder', '예: 디자인팀, 개발팀')}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                  maxLength={50}
                  autoFocus
                />
              </div>

              {/* 멤버 선택 */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                  {t('mentionGroup.selectMembers', '멤버 선택')} ({selectedMemberIds.length})
                </label>
                {boardMembers.length > 5 && (
                  <input
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder={t('mentionGroup.searchMember', '멤버 검색...')}
                    className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all mb-2"
                  />
                )}
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {filteredBoardMembers.map(member => {
                    const isSelected = selectedMemberIds.includes(member.userId);
                    const color = getAssigneeClasses(member.name, member.assigneeColor);
                    return (
                      <button
                        key={member.userId}
                        onClick={() => toggleMember(member.userId)}
                        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs transition-colors ${isSelected ? 'bg-bridge-accent/10 border border-bridge-accent/30' : 'hover:bg-foreground/5 border border-transparent'}`}
                      >
                        <div className={`w-5 h-5 rounded-full ${color.bg} flex items-center justify-center text-xs font-bold text-white`}>
                          {getInitials(member.name)}
                        </div>
                        <span className="text-foreground flex-1 text-left">{member.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-bridge-accent" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {view !== 'list' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
            <span className="text-xs text-slate-500">Esc {t('mentionGroup.close', '닫기')}</span>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || selectedMemberIds.length === 0 || isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                view === 'create' ? t('mentionGroup.createBtn', '만들기') : t('mentionGroup.saveBtn', '저장')}
            </button>
          </div>
        )}
      </div>
    </MotionModal>
  );
}
