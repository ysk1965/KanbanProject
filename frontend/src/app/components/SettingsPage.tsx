import { useState, useEffect, useCallback } from 'react';
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
  Globe,
  Camera,
  CalendarDays,
  Smartphone,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { userService } from '../utils/services';
import { resolveFileUrl } from '../utils/api';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import { Switch } from './ui/switch';
import { COUNTRY_LIST, LOCALE_TO_COUNTRY } from '../hooks/useHolidays';
import type { HolidaySource } from '../hooks/useHolidays';
import { isWhiteLabelDomain } from '../utils/domain';
import { isNative } from '../utils/platform';

export function SettingsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const { theme, setTheme, isDark } = useTheme();

  // Profile State
  const [name, setName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Profile Image State
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Holiday Country State (useHolidays 훅과 동일한 기본값 로직)
  const HOLIDAY_STORAGE_KEY = 'bridge_holiday_country';
  const SOURCE_STORAGE_KEY = 'bridge_holiday_source';
  const [holidayCountry, setHolidayCountry] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(HOLIDAY_STORAGE_KEY);
      if (stored !== null) return stored;
      return LOCALE_TO_COUNTRY[i18n.resolvedLanguage || i18n.language] || '';
    } catch { return ''; }
  });
  const [holidaySource, setHolidaySource] = useState<HolidaySource>(() => {
    try {
      const stored = localStorage.getItem(SOURCE_STORAGE_KEY);
      if (stored === 'device' || stored === 'library' || stored === 'off') return stored;
    } catch {}
    return isNative() ? 'device' : 'library';
  });
  const handleHolidayCountryChange = useCallback((code: string) => {
    setHolidayCountry(code);
    try {
      if (code) localStorage.setItem(HOLIDAY_STORAGE_KEY, code);
      else localStorage.removeItem(HOLIDAY_STORAGE_KEY);
    } catch {}
  }, []);
  const handleHolidaySourceChange = useCallback((source: HolidaySource) => {
    setHolidaySource(source);
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, source);
    } catch {}
    // When switching to 'library', ensure a country is set
    if (source === 'library' && !holidayCountry) {
      const defaultCode = LOCALE_TO_COUNTRY[i18n.resolvedLanguage || i18n.language] || 'US';
      setHolidayCountry(defaultCode);
      try { localStorage.setItem(HOLIDAY_STORAGE_KEY, defaultCode); } catch {}
    }
  }, [holidayCountry, i18n]);

  // Delete Account State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setProfileImage(currentUser.profile_image || null);
    }
  }, [currentUser]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setImageError(t('settings.imageTypeError'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError(t('settings.imageSizeError'));
      return;
    }

    setImageUploading(true);
    setImageError('');

    try {
      const response = await userService.uploadProfileImage(file);
      setProfileImage(response.profile_image);
      updateCurrentUser({ profile_image: response.profile_image });
    } catch (err: any) {
      setImageError(err.message || t('settings.imageUploadFailed'));
    } finally {
      setImageUploading(false);
      e.target.value = '';
    }
  };

  const handleImageDelete = async () => {
    setImageUploading(true);
    setImageError('');

    try {
      await userService.deleteProfileImage();
      setProfileImage(null);
      updateCurrentUser({ profile_image: null });
    } catch (err: any) {
      setImageError(err.message || t('settings.imageDeleteFailed'));
    } finally {
      setImageUploading(false);
    }
  };

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
      updateCurrentUser({ name: name.trim() });
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

  const resolvedImageUrl = profileImage ? resolveFileUrl(profileImage) : null;

  return (
    <div className="min-h-screen w-full bg-bridge-dark text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bridge-obsidian/80 backdrop-blur-xl border-b border-bridge-border safe-top">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-bridge-accent to-bridge-secondary rounded-xl flex items-center justify-center">
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
          className="bg-bridge-obsidian rounded-2xl border border-bridge-border p-6"
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

          {/* Profile Image */}
          <div className="flex items-center gap-6 mb-6">
            <div className="relative group">
              {resolvedImageUrl ? (
                <img
                  src={resolvedImageUrl}
                  alt={currentUser?.name || ''}
                  className="w-20 h-20 rounded-full object-cover border-2 border-foreground/10"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold border-2 border-foreground/10"
                  style={{ backgroundColor: getAssigneeHex(currentUser?.name || '') }}
                >
                  {getInitials(currentUser?.name || '')}
                </div>
              )}

              {/* Upload overlay on hover */}
              <label
                className={`absolute inset-0 rounded-full bg-black/50 flex items-center justify-center cursor-pointer
                  opacity-0 group-hover:opacity-100 transition-opacity
                  ${imageUploading ? 'opacity-100 cursor-wait' : ''}`}
              >
                {imageUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={imageUploading}
                />
              </label>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('settings.profileImageDesc')}</p>
              <p className="text-xs text-slate-500">{t('settings.profileImageHint')}</p>
              {profileImage && (
                <button
                  onClick={handleImageDelete}
                  disabled={imageUploading}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('settings.removeProfileImage')}
                </button>
              )}
            </div>
          </div>

          {imageError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <p className="text-red-400 text-sm">{imageError}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('settings.emailLabel')}
              </label>
              <input
                type="email"
                value={currentUser?.email || ''}
                disabled
                className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 text-slate-400 cursor-not-allowed"
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
                className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
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
          className="bg-bridge-obsidian rounded-2xl border border-bridge-border p-6"
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
            <label className="text-sm text-muted-foreground">{t('settings.darkMode')}</label>
            <Switch checked={isDark} onCheckedChange={handleThemeChange} />
          </div>
        </motion.section>

        {/* Language Section - hidden on milkyway.pe.kr */}
        {!window.location.hostname.endsWith('milkyway.pe.kr') && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-bridge-obsidian rounded-2xl border border-bridge-border p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-bridge-accent/20 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('settings.language')}</h2>
              <p className="text-sm text-slate-400">{t('settings.languageDesc')}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
            {[
              { code: 'ko', label: '한국어' },
              { code: 'en', label: 'English' },
              { code: 'ja', label: '日本語' },
              { code: 'zh', label: '简体中文' },
              { code: 'zh-TW', label: '繁體中文' },
              { code: 'hi', label: 'हिन्दी' },
              { code: 'vi', label: 'Tiếng Việt' },
              { code: 'es', label: 'Español' },
              { code: 'pt-BR', label: 'Português' },
              { code: 'th', label: 'ไทย' },
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all truncate text-center min-w-0 ${
                  (i18n.resolvedLanguage || i18n.language) === lang.code
                    ? 'bg-bridge-accent/15 border border-bridge-accent/50 text-bridge-accent'
                    : 'bg-foreground/5 border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </motion.section>
        )}

        {/* Holiday Country Section */}
        {!isWhiteLabelDomain && <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="bg-bridge-obsidian rounded-2xl border border-bridge-border p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-400/20 rounded-xl flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('settings.holidayCountry')}</h2>
              <p className="text-sm text-slate-400">{t('settings.holidayCountryDesc')}</p>
            </div>
          </div>

          {/* Holiday Source Selector (native only: device / library / off) */}
          {isNative() && (
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <button
                onClick={() => handleHolidaySourceChange('device')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  holidaySource === 'device'
                    ? 'bg-bridge-accent/15 border border-bridge-accent/50 text-bridge-accent'
                    : 'bg-foreground/5 border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                {t('settings.holidayDevice', { defaultValue: '디바이스 캘린더' })}
              </button>
              <button
                onClick={() => handleHolidaySourceChange('library')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  holidaySource === 'library'
                    ? 'bg-bridge-accent/15 border border-bridge-accent/50 text-bridge-accent'
                    : 'bg-foreground/5 border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                }`}
              >
                <Globe className="w-4 h-4" />
                {t('settings.holidayLibrary', { defaultValue: '국가 선택' })}
              </button>
              <button
                onClick={() => handleHolidaySourceChange('off')}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  holidaySource === 'off'
                    ? 'bg-bridge-accent/15 border border-bridge-accent/50 text-bridge-accent'
                    : 'bg-foreground/5 border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                }`}
              >
                {t('settings.holidayOff')}
              </button>
            </div>
          )}

          {/* Device calendar hint */}
          {isNative() && holidaySource === 'device' && (
            <p className="text-xs text-slate-400 mb-2">
              {t('settings.holidayDeviceDesc', { defaultValue: '기기에 등록된 공휴일 캘린더에서 자동으로 가져옵니다. 임시 공휴일도 반영됩니다.' })}
            </p>
          )}

          {/* Country grid: always shown on web, shown on native only when source is 'library' */}
          {((!isNative()) || holidaySource === 'library') && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Off button only for web (native has it in source selector) */}
              {!isNative() && (
                <button
                  onClick={() => handleHolidayCountryChange('')}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all truncate text-center min-w-0 ${
                    !holidayCountry
                      ? 'bg-bridge-accent/15 border border-bridge-accent/50 text-bridge-accent'
                      : 'bg-foreground/5 border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                  }`}
                >
                  {t('settings.holidayOff')}
                </button>
              )}
              {COUNTRY_LIST.map((c) => (
                <button
                  key={c.code}
                  onClick={() => handleHolidayCountryChange(c.code)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all truncate text-center min-w-0 ${
                    holidayCountry === c.code
                      ? 'bg-bridge-accent/15 border border-bridge-accent/50 text-bridge-accent'
                      : 'bg-foreground/5 border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                  }`}
                >
                  {c.flag} {c.label}
                </button>
              ))}
            </div>
          )}
        </motion.section>}

        {/* Password Section - 구글 로그인 사용자에게는 표시하지 않음 */}
        {!isGoogleUser && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-bridge-obsidian rounded-2xl border border-bridge-border p-6"
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
                    className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 pr-12 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
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
                    className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 pr-12 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
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
                  className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
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
                  className="w-full bg-red-500/5 border border-red-500/30 rounded-xl py-3 px-4 text-foreground placeholder-red-400/50 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all"
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
                  className="px-6 py-3 bg-foreground/5 border border-bridge-border text-foreground rounded-xl font-bold hover:bg-foreground/10 transition-all"
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
