import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield } from 'lucide-react';

export function PrivacyPage() {
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
            <span className="font-medium">{t('privacy.backToHome')}</span>
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
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{t('privacy.title')}</h1>
              <p className="text-slate-400 text-sm mt-1">{t('privacy.lastModified')}</p>
            </div>
          </div>

          {/* Content Box */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-8 space-y-8">
            {/* Intro */}
            <section>
              <p className="text-slate-400 leading-relaxed">
                {t('privacy.intro')}
              </p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section1Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('privacy.section1Content')}</p>
                <div className="bg-white/5 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-white font-medium mb-1">{t('privacy.required')}</p>
                    <p className="text-sm">{t('privacy.requiredItems')}</p>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">{t('privacy.optional')}</p>
                    <p className="text-sm">{t('privacy.optionalItems')}</p>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">{t('privacy.autoCollected')}</p>
                    <p className="text-sm">{t('privacy.autoCollectedItems')}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section2Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('privacy.section2Content')}</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>{t('privacy.section2Item1')}</li>
                  <li>{t('privacy.section2Item2')}</li>
                  <li>{t('privacy.section2Item3')}</li>
                  <li>{t('privacy.section2Item4')}</li>
                  <li>{t('privacy.section2Item5')}</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section3Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('privacy.section3Content')}</p>
                <div className="bg-white/5 rounded-xl p-4 space-y-2">
                  <p className="text-white font-medium">{t('privacy.retentionTitle')}</p>
                  <ul className="text-sm space-y-1">
                    <li>{t('privacy.retentionItem1')}</li>
                    <li>{t('privacy.retentionItem2')}</li>
                    <li>{t('privacy.retentionItem3')}</li>
                    <li>{t('privacy.retentionItem4')}</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section4Title')}</h2>
              <p className="text-slate-400 leading-relaxed">
                {t('privacy.section4Content')}
              </p>
              <ul className="list-disc list-inside ml-4 text-slate-400 space-y-2 mt-3">
                <li>{t('privacy.section4Item1')}</li>
                <li>{t('privacy.section4Item2')}</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section5Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('privacy.section5Content')}</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>{t('privacy.section5Item1')}</li>
                  <li>{t('privacy.section5Item2')}</li>
                  <li>{t('privacy.section5Item3')}</li>
                  <li>{t('privacy.section5Item4')}</li>
                </ul>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section6Title')}</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>{t('privacy.section6Content')}</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>{t('privacy.section6Item1')}</li>
                  <li>{t('privacy.section6Item2')}</li>
                  <li>{t('privacy.section6Item3')}</li>
                  <li>{t('privacy.section6Item4')}</li>
                </ul>
                <p className="mt-3">
                  {t('privacy.section6Footer')}
                </p>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section7Title')}</h2>
              <p className="text-slate-400 leading-relaxed">
                {t('privacy.section7Content')}
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section8Title')}</h2>
              <div className="bg-white/5 rounded-xl p-4 text-slate-400">
                <p className="mb-2">{t('privacy.section8Content')}</p>
                <p>{t('privacy.section8Officer')}</p>
                <p>{t('privacy.section8Email')}</p>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">{t('privacy.section9Title')}</h2>
              <p className="text-slate-400 leading-relaxed">
                {t('privacy.section9Content')}
              </p>
            </section>

            {/* Placeholder Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-8">
              <p className="text-yellow-400 text-sm">
                {t('privacy.draftNotice')}
              </p>
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-8 flex items-center justify-center gap-6 text-sm">
            <Link
              to="/terms"
              className="text-slate-400 hover:text-white transition-colors"
            >
              {t('privacy.termsLink')}
            </Link>
            <span className="text-slate-400">|</span>
            <Link
              to="/login"
              className="text-bridge-accent hover:text-bridge-secondary transition-colors"
            >
              {t('privacy.startService')}
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
