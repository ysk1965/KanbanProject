import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

// ==================== Confirm Modal ====================

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) confirmRef.current?.focus();
  }, [isOpen]);

  const confirmBg = variant === 'danger'
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-bridge-accent hover:bg-bridge-accent/90';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="bg-bridge-obsidian text-foreground border-white/10 max-w-sm p-0 gap-0 [&>button:last-child]:hidden overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            {variant === 'danger' && (
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <p className="text-slate-400 text-sm mt-1 whitespace-pre-line">{message}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
            >
              {cancelLabel || t('common.cancel')}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold transition-all text-sm ${confirmBg}`}
            >
              {confirmLabel || t('common.confirm')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Prompt Modal ====================

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  inputType?: 'text' | 'number';
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptModal({
  isOpen,
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel,
  cancelLabel,
  required = false,
  inputType = 'text',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = () => {
    if (required && !value.trim()) return;
    onConfirm(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="bg-bridge-obsidian text-foreground border-white/10 max-w-sm p-0 gap-0 [&>button:last-child]:hidden overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="p-6">
          <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
          <p className="text-slate-400 text-sm mb-4 whitespace-pre-line">{message}</p>
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={placeholder}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
            >
              {cancelLabel || t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={required && !value.trim()}
              className="flex-1 px-4 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 disabled:opacity-50 transition-all text-sm"
            >
              {confirmLabel || t('common.confirm')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Select Modal ====================

interface SelectModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  options: { id: string; label: string; description?: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (selectedId: string) => void;
  onCancel: () => void;
}

export function SelectModal({
  isOpen,
  title,
  message,
  options,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: SelectModalProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (isOpen) setSelectedId('');
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="bg-bridge-obsidian text-foreground border-white/10 max-w-md p-0 gap-0 [&>button:last-child]:hidden overflow-hidden rounded-2xl max-h-[80vh] flex flex-col">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="p-6 flex flex-col flex-1 min-h-0">
          <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
          <p className="text-slate-400 text-sm mb-4">{message}</p>
          <div className="space-y-2 overflow-y-auto flex-1 mb-4">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedId(opt.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedId === opt.id
                    ? 'border-bridge-accent bg-bridge-accent/10'
                    : 'border-white/5 bg-white/5 hover:bg-white/10'
                }`}
              >
                <p className="text-white text-sm font-medium">{opt.label}</p>
                {opt.description && (
                  <p className="text-slate-400 text-xs mt-0.5">{opt.description}</p>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
            >
              {cancelLabel || t('common.cancel')}
            </button>
            <button
              onClick={() => selectedId && onConfirm(selectedId)}
              disabled={!selectedId}
              className="flex-1 px-4 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 disabled:opacity-50 transition-all text-sm"
            >
              {confirmLabel || t('common.confirm')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Toast Notification ====================

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
}

export function Toast({ message, type = 'success', isVisible, onClose }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const bgColor = type === 'success'
    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
    : type === 'error'
    ? 'bg-red-500/20 border-red-500/30 text-red-400'
    : 'bg-blue-500/20 border-blue-500/30 text-blue-400';

  return (
    <div className="fixed top-4 right-4 z-[70] animate-fade-in-up">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg ${bgColor}`}>
        <span className="text-sm font-medium">{message}</span>
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
