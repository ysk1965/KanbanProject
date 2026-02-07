import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Lock,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Settings,
  Moon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { userService } from '../utils/services';
import { Switch } from './ui/switch';

export function SettingsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const { theme, setTheme, isDark } = useTheme();

  // Profile State
  const [name, setName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Delete Account State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
    }
  }, [currentUser]);

  const handleProfileSave = async () => {
    if (!name.trim()) {
      setProfileError(t('settings.enterName'));
      return;
    }

    setProfileSaving(true);
    setProfileError('');
    setProfileSuccess(false);

    try {
      await userService.updateProfile({ name: name.trim() });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setProfileError(err.message || t('settings.profileSaveFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError('');

    // 유효성 검사
    if (!currentPassword) {
      setPasswordError(t('settings.enterCurrentPassword'));
      return;
    }
    if (!newPassword) {
      setPasswordError(t('settings.enterNewPassword'));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t('settings.pwMinLength'));
      return;
    }
    if (!/[A-Za-z]/.test(newPassword)) {
      setPasswordError(t('settings.pwNeedLetter'));
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordError(t('settings.pwNeedNumber'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.pwMismatch'));
      return;
    }

    setPasswordSaving(true);
    setPasswordSuccess(false);

    try {
      await userService.changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      if (err.code === 'U002') {
        setPasswordError(t('settings.currentPwWrong'));
      } else {
        setPasswordError(err.message || t('settings.pwChangeFailed'));
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== t('settings.deleteAccountText')) {
      setDeleteError(t('settings.deleteAccountTypeExact'));
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      await userService.deleteAccount();
      await logout();
      navigate('/');
    } catch (err: any) {
      if (err.code === 'U003') {
        setDeleteError(t('settings.ownerCannotDelete'));
      } else {
        setDeleteError(err.message || t('settings.deleteAccountFailed'));
      }
      setDeleting(false);
    }
  };

  const isGoogleUser = currentUser?.provider === 'google';

  const handleThemeChange = async (checked: boolean) => {
    const newTheme = checked ? 'dark' : 'light';

    // 1. 즉시 UI 변경 (ThemeContext)
    setTheme(newTheme);

    // 2. AuthContext의 currentUser 업데이트
    updateCurrentUser({ theme: newTheme });

    // 3. API로 서버에 저장 (백그라운드)
    try {
      await userService.updateProfile({ theme: newTheme });
      console.log('✅ [Theme] 테마 설정 저장 완료:', newTheme);
    } catch (err) {
      console.error('❌ [Theme] 테마 설정 저장 실패:', err);
      // 실패해도 UI는 이미 변경되었으므로 사용자 경험에 영향 없음
    }
  };

  return (
    <div className="min-h-screen w-full bg-bridge-dark text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bridge-obsidian/80 backdrop-blur-xl border-b border-white/15">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#6366F1] to-[#2DD4BF] rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('settings.title')}</h1>
              <p className="text-xs text-slate-400">{currentUser?.email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Profile Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-bridge-accent/20 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('settings.profile')}</h2>
              <p className="text-sm text-slate-400">{t('settings.profileDesc')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('settings.emailLabel')}
              </label>
              <input
                type="email"
                value={currentUser?.email || ''}
                disabled
                className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-slate-400 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">{t('settings.emailCannotChange')}</p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('settings.nameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('settings.namePlaceholder')}
                className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>

            {profileError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-400 text-sm">{profileError}</p>
              </div>
            )}

            {profileSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-green-400 text-sm">{t('settings.profileSaved')}</p>
              </div>
            )}

            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="flex items-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t('common.save')}
            </button>
          </div>
        </motion.section>

        {/* Theme Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-bridge-accent/20 rounded-xl flex items-center justify-center">
              <Moon className="w-5 h-5 text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('settings.theme')}</h2>
              <p className="text-sm text-slate-400">{t('settings.themeDesc')}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-300">{t('settings.darkMode')}</label>
            <Switch checked={isDark} onCheckedChange={handleThemeChange} />
          </div>
        </motion.section>

        {/* Password Section - 구글 로그인 사용자에게는 표시하지 않음 */}
        {!isGoogleUser && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-bridge-accent/20 rounded-xl flex items-center justify-center">
                <Lock className="w-5 h-5 text-bridge-accent" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t('settings.changePassword')}</h2>
                <p className="text-sm text-slate-400">{t('settings.changePasswordDesc')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t('settings.currentPasswordLabel')}
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('settings.currentPasswordLabel')}
                    className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t('settings.newPasswordLabel')}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('settings.newPasswordPlaceholder')}
                    className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t('settings.confirmPasswordLabel')}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('settings.confirmPasswordPlaceholder')}
                  className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                />
              </div>

              {passwordError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{passwordError}</p>
                </div>
              )}

              {passwordSuccess && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <p className="text-green-400 text-sm">{t('settings.passwordChanged')}</p>
                </div>
              )}

              <button
                onClick={handlePasswordChange}
                disabled={passwordSaving}
                className="flex items-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {t('settings.changePassword')}
              </button>
            </div>
          </motion.section>
        )}

        {/* Danger Zone */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-bridge-obsidian rounded-2xl border border-red-500/20 p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-400">{t('settings.dangerZone')}</h2>
              <p className="text-sm text-slate-400">{t('settings.dangerZoneDesc')}</p>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-bold hover:bg-red-500/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {t('settings.deleteAccountText')}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-sm mb-2">
                  {t('settings.deleteAccountWarning')}
                </p>
                <ul className="text-red-400/80 text-sm list-disc list-inside space-y-1">
                  <li>{t('settings.deleteData1')}</li>
                  <li>{t('settings.deleteData2')}</li>
                  <li>{t('settings.deleteData3')}</li>
                </ul>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-red-400/70 uppercase tracking-widest mb-2">
                  {t('settings.deleteAccountTypeLabel')}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={t('settings.deleteAccountText')}
                  className="w-full bg-red-500/5 border border-red-500/30 rounded-xl py-3 px-4 text-white placeholder-red-400/50 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all"
                />
              </div>

              {deleteError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{deleteError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== t('settings.deleteAccountText')}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t('settings.deleteAccountConfirm')}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                    setDeleteError('');
                  }}
                  className="px-6 py-3 bg-white/5 border border-white/20 text-foreground rounded-xl font-bold hover:bg-white/10 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </motion.section>
      </main>
    </div>
  );
}
