import { useTranslation } from 'react-i18next';
import { Lock, AlertCircle, X } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  type: 'premium' | 'permission';
  title?: string;
  message?: string;
}

export function AlertModal({ open, onClose, type, title, message }: AlertModalProps) {
  const { t } = useTranslation();

  const defaultContent = {
    premium: {
      title: t('alert.premiumTitle'),
      message: t('alert.premiumMessage'),
      icon: Lock,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-400/10',
    },
    permission: {
      title: t('alert.permissionTitle'),
      message: t('alert.permissionMessage'),
      icon: AlertCircle,
      iconColor: 'text-red-400',
      iconBg: 'bg-red-400/10',
    },
  };

  const content = defaultContent[type];
  const Icon = content.icon;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-sm p-0 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-foreground transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="p-6 pt-8 text-center">
          {/* Icon */}
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full ${content.iconBg} flex items-center justify-center`}>
            <Icon size={32} className={content.iconColor} />
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-foreground mb-2">
            {title || content.title}
          </h3>

          {/* Message */}
          <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">
            {message || content.message}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 rounded-xl text-sm font-semibold text-foreground transition-all"
          >
            {t('common.confirm')}
          </button>
        </div>
    </MotionModal>
  );
}
