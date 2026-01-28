import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AMASFlowVisualization } from '../components/amas';
import {
  Brain,
  ChartLine,
  Clock,
  Sparkle,
  ArrowRight,
  Globe,
  Users,
  Books,
  Target,
} from '../components/Icon';
import { getOverviewStatsWithSource } from '../services/aboutApi';
import { useQuery } from '@tanstack/react-query';

const CARD_SPRING = { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.85 };
const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: CARD_SPRING },
};

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language.startsWith('zh') ? 'zh' : 'en';

  const toggleLanguage = () => {
    i18n.changeLanguage(currentLang === 'zh' ? 'en' : 'zh');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-soft transition-colors hover:bg-gray-50"
    >
      <Globe size={16} />
      {currentLang === 'zh' ? 'EN' : '中文'}
    </button>
  );
}

function HeroSection() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden bg-white px-6 py-24">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="relative mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="mb-4 text-5xl font-bold tracking-tight text-gray-900 md:text-6xl">
            {t('landing.hero.title')}
          </h1>
          <p className="mb-2 text-xl font-medium text-gray-600">{t('landing.hero.subtitle')}</p>
          <p className="mb-8 text-lg text-gray-500">{t('landing.hero.description')}</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-full bg-gray-900 px-8 py-3 font-semibold text-white shadow-elevated transition-all hover:scale-105 hover:bg-gray-800 hover:shadow-floating"
            >
              {t('landing.hero.cta.start')}
              <ArrowRight size={20} />
            </Link>
            <a
              href="#demo"
              className="flex items-center gap-2 rounded-full border-2 border-gray-300 px-8 py-3 font-semibold text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50"
            >
              {t('landing.hero.cta.demo')}
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useTranslation();

  const features = [
    {
      icon: Brain,
      title: t('landing.features.adaptive.title'),
      description: t('landing.features.adaptive.description'),
      color: 'blue',
    },
    {
      icon: Clock,
      title: t('landing.features.memory.title'),
      description: t('landing.features.memory.description'),
      color: 'purple',
    },
    {
      icon: ChartLine,
      title: t('landing.features.analytics.title'),
      description: t('landing.features.analytics.description'),
      color: 'amber',
    },
    {
      icon: Sparkle,
      title: t('landing.features.personalized.title'),
      description: t('landing.features.personalized.description'),
      color: 'emerald',
    },
  ];

  const colorClasses: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'bg-gray-100', icon: 'text-gray-600' },
    purple: { bg: 'bg-gray-100', icon: 'text-gray-600' },
    amber: { bg: 'bg-gray-100', icon: 'text-gray-600' },
    emerald: { bg: 'bg-gray-100', icon: 'text-gray-600' },
  };

  return (
    <section className="bg-gray-50 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          className="mb-12 text-center text-3xl font-bold text-gray-900"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {t('landing.features.title')}
        </motion.h2>
        <motion.div
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
          variants={STAGGER_VARIANTS}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {features.map((feature) => {
            const colors = colorClasses[feature.color];
            return (
              <motion.div
                key={feature.title}
                variants={STAGGER_ITEM}
                className="rounded-card border border-gray-100 bg-white p-6 shadow-soft transition-shadow hover:shadow-elevated"
              >
                <div className={`mb-4 inline-flex rounded-card ${colors.bg} p-3`}>
                  <feature.icon size={28} className={colors.icon} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function DemoSection() {
  const { t } = useTranslation();

  return (
    <section id="demo" className="bg-white px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-3 text-3xl font-bold text-gray-900">{t('landing.demo.title')}</h2>
          <p className="text-gray-600">{t('landing.demo.description')}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <AMASFlowVisualization mode="demo" autoPlay showControls />
        </motion.div>
      </div>
    </section>
  );
}

function StatsSection() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['landing', 'stats'],
    queryFn: () => getOverviewStatsWithSource(),
    staleTime: 60 * 1000,
  });

  const hasData = data && !error && !isLoading;

  const stats = [
    {
      icon: Users,
      value: hasData ? data.data.activeUsers : '-',
      label: t('landing.stats.users'),
      color: 'blue',
    },
    {
      icon: Books,
      value: '50,000+',
      label: t('landing.stats.words'),
      color: 'purple',
    },
    {
      icon: Target,
      value: hasData ? data.data.todayDecisions : '-',
      label: t('landing.stats.decisions'),
      color: 'amber',
    },
    {
      icon: ChartLine,
      value: hasData ? `${Math.round(data.data.avgEfficiencyGain * 100)}%` : '-',
      label: t('landing.stats.accuracy'),
      color: 'emerald',
    },
  ];

  const colorClasses: Record<string, { bg: string; icon: string; text: string }> = {
    blue: { bg: 'bg-gray-800', icon: 'text-white', text: 'text-gray-900' },
    purple: { bg: 'bg-gray-800', icon: 'text-white', text: 'text-gray-900' },
    amber: { bg: 'bg-gray-800', icon: 'text-white', text: 'text-gray-900' },
    emerald: { bg: 'bg-gray-800', icon: 'text-white', text: 'text-gray-900' },
  };

  return (
    <section className="bg-gray-50 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          className="mb-12 text-center text-3xl font-bold text-gray-900"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {t('landing.stats.title')}
        </motion.h2>
        <motion.div
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
          variants={STAGGER_VARIANTS}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {stats.map((stat) => {
            const colors = colorClasses[stat.color];
            return (
              <motion.div
                key={stat.label}
                variants={STAGGER_ITEM}
                className="rounded-card border border-gray-100 bg-white p-6 text-center shadow-soft"
              >
                <div className={`mx-auto mb-4 inline-flex rounded-full ${colors.bg} p-3`}>
                  <stat.icon size={24} className={colors.icon} />
                </div>
                <p className={`text-3xl font-bold ${colors.text}`}>{stat.value}</p>
                <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  const { t } = useTranslation();

  return (
    <section className="border-t border-gray-100 bg-gray-50 px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold text-gray-900">{t('landing.cta.title')}</h2>
          <p className="mb-8 text-lg text-gray-600">{t('landing.cta.description')}</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-8 py-3 font-semibold text-white shadow-elevated transition-all hover:scale-105 hover:bg-gray-800 hover:shadow-floating"
          >
            {t('landing.cta.button')}
            <ArrowRight size={20} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  const docsBaseUrl = 'https://heartcoolman.github.io/vocabulary-learning-app';

  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
        <p className="text-sm text-gray-500">{t('landing.footer.copyright')}</p>
        <div className="flex gap-6">
          <a
            href={`${docsBaseUrl}/ABOUT`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('landing.footer.about')}
          </a>
          <a
            href={`${docsBaseUrl}/PRIVACY`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('landing.footer.privacy')}
          </a>
          <a
            href={`${docsBaseUrl}/TERMS`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('landing.footer.terms')}
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <DemoSection />
      <StatsSection />
      <CTASection />
      <Footer />
    </div>
  );
}
