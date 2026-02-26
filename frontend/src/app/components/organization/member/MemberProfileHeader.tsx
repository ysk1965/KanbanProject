import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical, Shield, ShieldCheck, Crown, Camera, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OrgMemberDetail, OrgRole, WorkStatus } from '../../../types';

interface MemberProfileHeaderProps {
  member: OrgMemberDetail;
  myRole: OrgRole;
  isSelf: boolean;
  onChangeRole: (role: OrgRole) => void;
  onRemove: () => void;
  onPhotoUpload: (file: File) => Promise<void>;
  onPhotoDelete: () => Promise<void>;
}

const ROLE_BADGE: Record<OrgRole, { style: string; icon: typeof Crown }> = {
  OWNER: { style: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', icon: Crown },
  ADMIN: { style: 'bg-bridge-accent/20 text-bridge-accent', icon: ShieldCheck },
  MEMBER: { style: 'bg-slate-500/20 text-slate-500 dark:text-slate-400', icon: Shield },
};

const STATUS_BADGE: Record<WorkStatus, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  ON_LEAVE: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  RESIGNED: 'bg-red-500/20 text-red-600 dark:text-red-400',
};

export function MemberProfileHeader({ member, myRole, isSelf, onChangeRole, onRemove, onPhotoUpload, onPhotoDelete }: MemberProfileHeaderProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const canEditPhoto = isAdmin || isSelf;
  const [showMenu, setShowMenu] = useState(false);
  const [showRoleSub, setShowRoleSub] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const photoMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowRoleSub(false);
      }
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target as Node)) {
        setShowPhotoMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setShowPhotoMenu(false);
      await onPhotoUpload(file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePhotoDelete = async () => {
    try {
      setUploading(true);
      setShowPhotoMenu(false);
      await onPhotoDelete();
    } finally {
      setUploading(false);
    }
  };

  const roleBadge = ROLE_BADGE[member.role];
  const RoleIcon = roleBadge.icon;

  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-4">
        {/* Avatar with photo change */}
        <div className="relative shrink-0" ref={photoMenuRef}>
          <div
            className={`w-16 h-16 rounded-full bg-bridge-accent/20 flex items-center justify-center text-xl text-bridge-accent font-bold overflow-hidden ${canEditPhoto ? 'cursor-pointer group' : ''}`}
            onClick={() => canEditPhoto && !uploading && setShowPhotoMenu(!showPhotoMenu)}
          >
            {uploading ? (
              <Loader2 size={24} className="animate-spin text-bridge-accent" />
            ) : member.user.profile_image ? (
              <img src={member.user.profile_image} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              member.user.name?.charAt(0) || '?'
            )}
            {/* Camera overlay on hover */}
            {canEditPhoto && !uploading && (
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={18} className="text-white" />
              </div>
            )}
          </div>

          {/* Photo action menu */}
          <AnimatePresence>
            {showPhotoMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-1 w-40 bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 shadow-xl z-50 overflow-hidden"
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-900 dark:text-white hover:bg-foreground/5 transition-colors flex items-center gap-2"
                >
                  <Camera size={14} />
                  {t('organization.members.detail.changePhoto', '사진 변경')}
                </button>
                {member.user.profile_image && (
                  <>
                    <div className="border-t border-black/5 dark:border-white/5" />
                    <button
                      onClick={handlePhotoDelete}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/5 transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      {t('organization.members.detail.deletePhoto', '사진 삭제')}
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">{member.user.name}</h2>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${roleBadge.style}`}>
              <RoleIcon size={10} />
              {member.role}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[member.work_status]}`}>
              {member.work_status.replace('_', ' ')}
            </span>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {member.department?.name && <span>{member.department.name}</span>}
            {member.department?.name && member.job_title && <span> · </span>}
            {member.job_title && <span>{member.job_title}</span>}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{member.user.email}</div>
        </div>

        {/* More Menu */}
        {isAdmin && !isSelf && member.role !== 'OWNER' && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <MoreVertical size={18} />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-44 bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 shadow-xl z-50 overflow-hidden"
                >
                  {/* Change Role */}
                  <div
                    className="relative"
                    onMouseEnter={() => setShowRoleSub(true)}
                    onMouseLeave={() => setShowRoleSub(false)}
                  >
                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-900 dark:text-white hover:bg-foreground/5 transition-colors">
                      {t('organization.members.detail.changeRole')}
                    </button>
                    <AnimatePresence>
                      {showRoleSub && (
                        <motion.div
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -4 }}
                          className="absolute right-full top-0 mr-1 w-36 bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 shadow-xl overflow-hidden"
                        >
                          {(['ADMIN', 'MEMBER'] as OrgRole[]).map((role) => (
                            <button
                              key={role}
                              onClick={() => { onChangeRole(role); setShowMenu(false); }}
                              disabled={member.role === role}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-900 dark:text-white hover:bg-foreground/5 transition-colors disabled:opacity-40"
                            >
                              {role}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="border-t border-black/5 dark:border-white/5" />

                  {/* Remove */}
                  <button
                    onClick={() => { onRemove(); setShowMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/5 transition-colors"
                  >
                    {t('organization.members.detail.removeMember')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
