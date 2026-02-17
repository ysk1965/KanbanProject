import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full bg-bridge-dark text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bridge-obsidian/80 backdrop-blur-xl border-b border-white/15">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">{t('terms.backToHome')}</span>
          </Link>
          <Link to="/" className="text-xl font-bold text-white">
            BRIDGE SPOTS
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-bridge-accent to-bridge-secondary rounded-2xl flex items-center justify-center">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{t('terms.title')}</h1>
              <p className="text-slate-400 text-sm mt-1">{t('terms.lastModified')}</p>
            </div>
          </div>

          {/* Content Box */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-8 space-y-8">
            {/* Section 1 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article1Title')}</h2>
              <p className="text-slate-400 leading-relaxed">
                {t('terms.article1Content')}
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article2Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article2Item1')}</p>
                <p>{t('terms.article2Item2')}</p>
                <p>{t('terms.article2Item3')}</p>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article3Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article3Item1')}</p>
                <p>{t('terms.article3Item2')}</p>
                <p>{t('terms.article3Item3')}</p>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article4Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article4Item1')}</p>
                <p>{t('terms.article4Item2')}</p>
                <p>{t('terms.article4Item3')}</p>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article5Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article5Item1')}</p>
                <p>{t('terms.article5Item2')}</p>
                <p>{t('terms.article5Item3')}</p>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article6Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article6Content')}</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>{t('terms.article6Item1')}</li>
                  <li>{t('terms.article6Item2')}</li>
                  <li>{t('terms.article6Item3')}</li>
                  <li>{t('terms.article6Item4')}</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article7Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article7Item1')}</p>
                <p>{t('terms.article7Item2')}</p>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('terms.article8Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('terms.article8Item1')}</p>
                <p>{t('terms.article8Item2')}</p>
              </div>
            </section>

            {/* Placeholder Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-8">
              <p className="text-yellow-400 text-sm">
                {t('terms.draftNotice')}
              </p>
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-8 flex items-center justify-center gap-6 text-sm">
            <Link
              to="/privacy"
              className="text-slate-400 hover:text-white transition-colors"
            >
              {t('terms.privacyLink')}
            </Link>
            <span className="text-slate-400">|</span>
            <Link
              to="/login"
              className="text-bridge-accent hover:text-bridge-secondary transition-colors"
            >
              {t('terms.startService')}
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
