import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Users, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { organizationService } from '../utils/services';
import type { OrgInvitePublicInfo } from '../types';

export function OrgInviteAcceptPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, currentUser } = useAuth();

  const [inviteInfo, setInviteInfo] = useState<OrgInvitePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      if (!code) return;
      try {
        const info = await organizationService.getInviteInfo(code);
        setInviteInfo(info);
      } catch (err: any) {
        setError(err?.message || t('organization.invite.invalidLink', 'This invite link is invalid or expired.'));
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [code, t]);

  const handleAccept = async () => {
    if (!code) return;
    try {
      setAccepting(true);
      const result = await organizationService.acceptInvite(code);
      setAccepted(true);
      setTimeout(() => {
        navigate(`/organizations/${result.organization_id}`);
      }, 1500);
    } catch (err: any) {
      setError(err?.message || t('organization.invite.acceptFailed', 'Failed to accept invite.'));
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center" role="status" aria-label="로딩 중">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
        <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-8 max-w-sm text-center">
          <AlertCircle size={40} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-lg font-bold text-white mb-2">{t('organization.invite.error', 'Invite Error')}</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 transition-all"
          >
            {t('common.goHome', 'Go Home')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-8 max-w-sm w-full text-center">
        {accepted ? (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">{t('organization.invite.accepted', 'Welcome!')}</h2>
            <p className="text-sm text-slate-400">{t('organization.invite.redirecting', 'Redirecting to organization...')}</p>
          </>
        ) : (
          <>
            {inviteInfo?.logo_url ? (
              <img src={inviteInfo.logo_url} alt={inviteInfo.org_name || '조직 로고'} className="w-16 h-16 rounded-2xl mx-auto mb-4 object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-bridge-accent/20 flex items-center justify-center mx-auto mb-4">
                <Building2 size={28} className="text-bridge-accent" />
              </div>
            )}
            <h2 className="text-lg font-bold text-white mb-1">{inviteInfo?.organization_name}</h2>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mb-6">
              <Users size={12} />
              <span>{inviteInfo?.member_count} {t('organization.invite.members', 'members')}</span>
              <span className="px-2 py-0.5 bg-bridge-accent/20 text-bridge-accent rounded-full text-xs font-bold uppercase">
                {inviteInfo?.role}
              </span>
            </div>

            {isAuthenticated ? (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
              >
                {accepting
                  ? t('organization.invite.joining', 'Joining...')
                  : t('organization.invite.join', 'Join Organization')}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (code) {
                    localStorage.setItem('pending_org_invite_code', code);
                  }
                  navigate('/login');
                }}
                className="w-full px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
              >
                {t('organization.invite.loginToJoin', 'Log in to Join')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
