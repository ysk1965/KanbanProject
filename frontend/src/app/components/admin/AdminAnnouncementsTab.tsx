import { useState, useEffect } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Megaphone,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { adminService } from '../../utils/services';
import type { AnnouncementDetail } from '../../utils/api';
import { formatDate, formatDateTime, toDateTimeLocalValue, fromDateTimeLocalValue } from '../../utils/dateUtils';

export function AdminAnnouncementsTab() {
  const [announcements, setAnnouncements] = useState<AnnouncementDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error('Failed to load announcements:', err);
      setError('공지사항을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await adminService.deleteAnnouncement(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete announcement:', err);
      alert('삭제에 실패했습니다');
    }
  };

  const handleSave = async (data: AnnouncementFormData) => {
    try {
      if (editingAnnouncement) {
        const updated = await adminService.updateAnnouncement(editingAnnouncement.id, data);
        setAnnouncements(announcements.map((a) => (a.id === updated.id ? updated : a)));
        setEditingAnnouncement(null);
      } else {
        const created = await adminService.createAnnouncement(data);
        setAnnouncements([created, ...announcements]);
        setIsCreateOpen(false);
      }
    } catch (err) {
      console.error('Failed to save announcement:', err);
      alert('저장에 실패했습니다');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={loadAnnouncements} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
          다시 시도
        </button>
      </div>
    );
  }

  const typeLabel: Record<string, string> = { POPUP: '팝업', BANNER: '배너', NOTICE: '공지' };
  const typeBadge: Record<string, string> = {
    POPUP: 'bg-purple-500/20 text-purple-400',
    BANNER: 'bg-amber-500/20 text-amber-400',
    NOTICE: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">공지사항 관리</h2>
          <p className="text-slate-400">시스템 공지사항을 관리하세요</p>
        </div>
        <button
          onClick={() => { setIsCreateOpen(true); setEditingAnnouncement(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl font-medium hover:bg-bridge-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          새 공지사항
        </button>
      </div>

      {(isCreateOpen || editingAnnouncement) && (
        <AnnouncementFormModal
          announcement={editingAnnouncement}
          onSave={handleSave}
          onClose={() => { setIsCreateOpen(false); setEditingAnnouncement(null); }}
        />
      )}

      {announcements.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-12 text-center">
          <Megaphone className="h-12 w-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">등록된 공지사항이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="bg-bridge-obsidian rounded-xl border border-white/5 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${typeBadge[ann.type] || typeBadge.NOTICE}`}>
                      {typeLabel[ann.type] || ann.type}
                    </span>
                    {ann.is_active ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                        <Eye className="h-3 w-3" /> 활성
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <EyeOff className="h-3 w-3" /> 비활성
                      </span>
                    )}
                    {ann.priority > 0 && (
                      <span className="text-[11px] text-amber-400">우선순위: {ann.priority}</span>
                    )}
                  </div>
                  <h3 className="text-white font-medium mb-1">{ann.title}</h3>
                  {ann.content && (
                    <p className="text-slate-400 text-sm line-clamp-2">{ann.content}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
                    {ann.start_at && <span>시작: {formatDateTime(ann.start_at)}</span>}
                    {ann.end_at && <span>종료: {formatDateTime(ann.end_at)}</span>}
                    <span>생성: {formatDate(ann.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => { setEditingAnnouncement(ann); setIsCreateOpen(false); }}
                    className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Form Modal ====================

interface AnnouncementFormData {
  title: string;
  content?: string;
  type?: 'POPUP' | 'BANNER' | 'NOTICE';
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  priority?: number;
  target_role?: string | null;
}

function AnnouncementFormModal({
  announcement,
  onSave,
  onClose,
}: {
  announcement: AnnouncementDetail | null;
  onSave: (data: AnnouncementFormData) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(announcement?.title || '');
  const [content, setContent] = useState(announcement?.content || '');
  const [type, setType] = useState<'POPUP' | 'BANNER' | 'NOTICE'>(announcement?.type || 'NOTICE');
  const [isActive, setIsActive] = useState(announcement?.is_active ?? true);
  const [startAt, setStartAt] = useState(toDateTimeLocalValue(announcement?.start_at));
  const [endAt, setEndAt] = useState(toDateTimeLocalValue(announcement?.end_at));
  const [priority, setPriority] = useState(announcement?.priority || 0);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      // 종료일이 시간 없이 날짜만 있거나 00:00이면 23:59로 보정
      let normalizedEndAt = endAt || '';
      if (normalizedEndAt && normalizedEndAt.endsWith('T00:00')) {
        normalizedEndAt = normalizedEndAt.replace('T00:00', 'T23:59');
      }

      await onSave({
        title: title.trim(),
        content: content.trim() || undefined,
        type,
        is_active: isActive,
        start_at: startAt ? fromDateTimeLocalValue(startAt) : null,
        end_at: normalizedEndAt ? fromDateTimeLocalValue(normalizedEndAt) : null,
        priority,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">
            {announcement ? '공지사항 수정' : '새 공지사항'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">제목 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              placeholder="공지 제목"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
              placeholder="공지 내용"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">유형</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'POPUP' | 'BANNER' | 'NOTICE')}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              >
                <option value="NOTICE">공지</option>
                <option value="BANNER">배너</option>
                <option value="POPUP">팝업</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">우선순위</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                min={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">시작일</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">종료일</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIsActive(!isActive)}
              className={`w-10 h-6 rounded-full transition-colors relative ${isActive ? 'bg-bridge-accent' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'left-5' : 'left-1'}`} />
            </div>
            <span className="text-sm text-slate-300">{isActive ? '활성' : '비활성'}</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSaving}
            className="flex-1 px-4 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
          >
            {isSaving ? '저장 중...' : announcement ? '수정' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
