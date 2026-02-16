import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, AtSign, X } from 'lucide-react';
import type { MemberResponse } from '../../utils/api';

interface NoteCommentInputProps {
  boardId: string;
  members: MemberResponse[];
  onSubmit: (content: string, mentions: string[]) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  initialContent?: string;
}

export function NoteCommentInput({
  members,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus = false,
  initialContent = '',
}: NoteCommentInputProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = members.filter(m =>
    m.user.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && showMentions) {
      setShowMentions(false);
    }
  }, [content, showMentions]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }, []);

  const insertMention = useCallback((member: MemberResponse) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.substring(0, cursorPos);
    const textAfterCursor = content.substring(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    const newText = textBeforeCursor.substring(0, atIndex) + `@${member.user.name} ` + textAfterCursor;
    setContent(newText);
    setShowMentions(false);

    if (!selectedMentions.includes(member.user.id)) {
      setSelectedMentions(prev => [...prev, member.user.id]);
    }

    setTimeout(() => {
      textarea.focus();
      const newPos = atIndex + member.user.name.length + 2;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }, [content, selectedMentions]);

  const handleSubmit = useCallback(async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content.trim(), selectedMentions);
      setContent('');
      setSelectedMentions([]);
    } finally {
      setSubmitting(false);
    }
  }, [content, selectedMentions, submitting, onSubmit]);

  return (
    <div className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('notes.comment.placeholder', '댓글을 입력하세요... (@로 멘션)')}
          autoFocus={autoFocus}
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 pr-20 text-sm text-white
            placeholder-slate-500 resize-none
            focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
            transition-all"
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowMentions(!showMentions)}
            className="p-1.5 text-slate-500 hover:text-bridge-accent hover:bg-white/5 rounded-lg transition-colors"
          >
            <AtSign className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="p-1.5 text-bridge-accent hover:bg-bridge-accent/10 rounded-lg transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Mention dropdown */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute z-50 bottom-full mb-1 left-0 w-full max-h-40 overflow-y-auto
          bg-bridge-obsidian border border-white/10 rounded-xl shadow-xl">
          {filteredMembers.map(member => (
            <button
              key={member.user.id}
              onClick={() => insertMention(member)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300
                hover:bg-white/5 hover:text-white transition-colors"
            >
              {member.user.profile_image ? (
                <img src={member.user.profile_image} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-bridge-accent/30 flex items-center justify-center text-[10px] font-bold text-bridge-accent">
                  {member.user.name.charAt(0)}
                </div>
              )}
              <span>{member.user.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
