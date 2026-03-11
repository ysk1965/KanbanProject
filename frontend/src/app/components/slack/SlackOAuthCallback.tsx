import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SlackOAuthCallback() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(t('slackApp.connectFailed', 'Failed to connect to Slack'));
      return;
    }

    // The backend OAuth callback redirects directly to the board/org page
    // This page only shows if there's an error or the redirect failed
    const timer = setTimeout(() => {
      navigate('/', { replace: true });
    }, 3000);

    return () => clearTimeout(timer);
  }, [searchParams, navigate, t]);

  if (error) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 max-w-sm text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-foreground font-bold mb-2">{error}</h2>
          <p className="text-slate-400 text-sm mb-4">
            {t('slackApp.tryAgainDesc', 'Please try installing Slack again from your board settings.')}
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="flex items-center gap-2 mx-auto px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-bold hover:bg-bridge-accent/90 transition-all"
          >
            <RefreshCw size={14} />
            {t('slackApp.goHome', 'Go to Dashboard')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 max-w-sm text-center">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent mx-auto mb-4" />
        <h2 className="text-foreground font-bold mb-1">{t('slackApp.connecting', 'Connecting to Slack...')}</h2>
        <p className="text-slate-400 text-sm">{t('slackApp.redirecting', 'Redirecting you back...')}</p>
      </div>
    </div>
  );
}
