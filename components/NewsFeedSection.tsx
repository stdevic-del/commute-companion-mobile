import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  ExternalLink,
  Flame,
  Lock,
  Newspaper,
  Radio,
  RefreshCw,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { ScrapedArticle } from '../types';
import {
  formatRelativeTimeSr,
  isArticleListened,
  NewsSortMode,
  readListenedArticleMap,
  sortArticlesForFeed,
} from '../services/newsFeedClient';
import { ArticleThumbnail } from './ArticleThumbnail';

export interface NewsFeedSectionProps {
  lastSyncedAt: string | null;
  isOfflineFeed: boolean;
  isScraping: boolean;
  homeNewsCategoryFilter: string;
  onSelectCategoryFilter: (category: string) => void;
  homeNewsCategories: string[];
  homeFeedArticles: ScrapedArticle[];
  activeAudioTitle: string;
  deepDiveLoadingId: string | null;
  onRefreshFeed: () => void;
  onTriggerArticleBriefing: (article: ScrapedArticle) => void;
  newsSortMode?: NewsSortMode;
  onSelectNewsSortMode?: (mode: NewsSortMode) => void;
  listenedArticleMap?: Record<string, number>;
}

function getNormalizedPrimarySource(art: ScrapedArticle): string {
  const raw =
    art.sourceName ||
    (art.relatedSources && art.relatedSources[0]) ||
    (art.clusterSources && art.clusterSources[0]) ||
    '';
  return raw
    .replace(/\s*\(\+\d+\s*medija\)/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Pravilo raznovrsnosti izvora (Source Diversity Cap):
 * Isti medij ne sme da ima više od `maxConsecutive` (podrazumevano 2) članka zaredom na listi,
 * kako jedan portal (npr. Radar) ne bi zauzeo ceo prvi ekran.
 */
export function enforceArticleSourceDiversity(
  articles: ScrapedArticle[],
  maxConsecutive = 2
): ScrapedArticle[] {
  const cap = Math.max(1, maxConsecutive);
  if (articles.length <= cap) return [...articles];

  const pool = [...articles];
  const out: ScrapedArticle[] = [];

  while (pool.length > 0) {
    let lastSource: string | null = null;
    let consecutiveCount = 0;

    if (out.length >= cap) {
      lastSource = getNormalizedPrimarySource(out[out.length - 1]);
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (getNormalizedPrimarySource(out[i]) === lastSource) {
          consecutiveCount += 1;
        } else {
          break;
        }
      }
    }

    if (consecutiveCount >= cap && lastSource) {
      const altIdx = pool.findIndex(
        (candidate) => getNormalizedPrimarySource(candidate) !== lastSource
      );
      if (altIdx !== -1) {
        const [picked] = pool.splice(altIdx, 1);
        out.push(picked);
        continue;
      }
    }

    out.push(pool.shift()!);
  }

  return out;
}

export const NewsFeedSection: React.FC<NewsFeedSectionProps> = ({
  lastSyncedAt,
  isOfflineFeed,
  isScraping,
  homeNewsCategoryFilter,
  onSelectCategoryFilter,
  homeNewsCategories,
  homeFeedArticles,
  activeAudioTitle,
  deepDiveLoadingId,
  onRefreshFeed,
  onTriggerArticleBriefing,
  newsSortMode,
  onSelectNewsSortMode,
  listenedArticleMap,
}) => {
  const [internalSortMode, setInternalSortMode] = useState<NewsSortMode>('important');
  const activeSortMode: NewsSortMode = newsSortMode ?? internalSortMode;
  const handleSelectSortMode = (mode: NewsSortMode) => {
    setInternalSortMode(mode);
    onSelectNewsSortMode?.(mode);
  };

  const effectiveListenedMap = useMemo(
    () => listenedArticleMap ?? readListenedArticleMap(),
    [listenedArticleMap]
  );

  const displayedArticles = useMemo(() => {
    const sorted = sortArticlesForFeed(homeFeedArticles, activeSortMode, effectiveListenedMap);

    if (activeSortMode === 'important') {
      const unlistened = sorted.filter((art) => !isArticleListened(art.id, effectiveListenedMap));
      const listened = sorted.filter((art) => isArticleListened(art.id, effectiveListenedMap));
      const diverseUnlistened = enforceArticleSourceDiversity(unlistened, 2);
      const diverseListened = enforceArticleSourceDiversity(listened, 2);
      return [...diverseUnlistened, ...diverseListened].slice(0, 24);
    }

    return enforceArticleSourceDiversity(sorted, 2).slice(0, 24);
  }, [homeFeedArticles, activeSortMode, effectiveListenedMap]);

  return (
    <div className="bg-slate-900/85 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-indigo-400" />
            <span>{activeSortMode === 'important' ? 'Najvažnije vesti' : 'Najnovije vesti'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span>Kliknite „Pročitaj članak“ da pokrenete čitanje od te vesti</span>
            {lastSyncedAt && (
              <>
                <span className="text-slate-600">·</span>
                <span className={isOfflineFeed ? 'text-amber-300/90 inline-flex items-center gap-1' : ''}>
                  {isOfflineFeed && <WifiOff className="w-3 h-3" />}
                  {isOfflineFeed ? `keširano (${lastSyncedAt})` : `osveženo u ${lastSyncedAt}`}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented Tab Switch: Najvažnije vs Najnovije */}
          <div
            role="tablist"
            aria-label="Režim sortiranja vesti"
            className="inline-flex items-center p-0.5 rounded-xl bg-slate-950/85 border border-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSortMode === 'important'}
              onClick={() => handleSelectSortMode('important')}
              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                activeSortMode === 'important'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Višeizvorne vesti dana (po broju medija u 24h) uz nepreslušane na vrhu"
            >
              <Flame className="w-3 h-3 shrink-0" />
              <span>Najvažnije</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSortMode === 'latest'}
              onClick={() => handleSelectSortMode('latest')}
              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                activeSortMode === 'latest'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Hronološki od najnovije ka najstarijoj objavi"
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>Najnovije</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onRefreshFeed}
            disabled={isScraping}
            className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Osveži statički feed vesti"
          >
            <RefreshCw className={`w-3 h-3 ${isScraping ? 'animate-spin' : ''}`} />
            <span>Osveži</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills — Sve vesti + top 5 user-ordered categories */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => onSelectCategoryFilter('all')}
          className={`min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
            homeNewsCategoryFilter === 'all'
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Sve vesti
        </button>
        {homeNewsCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategoryFilter(cat)}
            className={`min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
              homeNewsCategoryFilter === cat
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Articles List */}
      {displayedArticles.length === 0 ? (
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-2">
          <div className="text-xs sm:text-sm text-slate-300 font-medium">
            {isScraping
              ? 'Učitavamo najnovije vesti...'
              : 'Trenutno nema učitanih vesti za izabranu kategoriju.'}
          </div>
          {!isScraping && (
            <button
              type="button"
              onClick={onRefreshFeed}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Učitaj najnovije vesti</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-950/75 border border-slate-800/90 max-h-[540px] overflow-y-auto divide-y divide-slate-800/75">
          {displayedArticles.map((art) => {
            const rawSourcesList =
              art.relatedSources && art.relatedSources.length > 0
                ? art.relatedSources
                : art.clusterSources && art.clusterSources.length > 0
                ? art.clusterSources
                : [art.sourceName.replace(/\s*\(\+\d+\s*medija\)/i, '').trim()];
            const uniqueSources = Array.from(
              new Set(
                rawSourcesList
                  .map((s) => s.replace(/\s*\(\+\d+\s*medija\)/i, '').trim())
                  .filter(Boolean)
              )
            );
            const totalCount = Math.max(uniqueSources.length, Number(art.mediaCount) || 1);
            const shownSources = uniqueSources.slice(0, 5).join(', ');
            const hasMoreSources =
              uniqueSources.length > 5 || totalCount > uniqueSources.slice(0, 5).length;
            const formattedSourcesLine =
              totalCount > 1
                ? `${shownSources}${hasMoreSources ? ' i drugi' : ''} (${totalCount} medija)`
                : shownSources;

            const rawCleanedSummary = (art.summary || '')
              .replace(/^Udarna tema u više redakcija\s*\([^)]+\)\.\s*/i, '')
              .trim();
            const normTitle = art.title
              .toLowerCase()
              .replace(/[^a-z0-9čćžšđ]+/gi, '')
              .slice(0, 28);
            const normSum = rawCleanedSummary
              .toLowerCase()
              .replace(/[^a-z0-9čćžšđ]+/gi, '')
              .slice(0, 28);
            const cleanSummaryText =
              rawCleanedSummary &&
              normSum !== normTitle &&
              !rawCleanedSummary.toLowerCase().startsWith(art.title.toLowerCase().slice(0, 22))
                ? rawCleanedSummary
                : '';

            const relativeTimeLabel = formatRelativeTimeSr(
              art.updatedAtIso || art.publishedAtIso
            );

            const isArticleActive =
              activeAudioTitle === art.title || activeAudioTitle === `Deep-Dive: ${art.title}`;
            const isListened = isArticleListened(art.id, effectiveListenedMap);
            return (
              <article
                key={art.id}
                className={`px-3 py-2.5 sm:px-3.5 sm:py-3 hover:bg-slate-900/55 transition-all flex items-center justify-between gap-3 ${
                  isListened && !isArticleActive ? 'opacity-60 hover:opacity-95' : ''
                }`}
              >
                <ArticleThumbnail
                  src={art.imageUrl}
                  alt={art.title}
                  sourceName={art.sourceName}
                />

                {/* Sredina: 1. Naslov gore, 2. Uvod (1–2 rečenice), 3. Izvori, relativno vreme, kategorija i paywall */}
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-[13px] sm:text-sm font-semibold text-slate-100 leading-snug">
                    {art.title}
                  </h3>

                  {cleanSummaryText && (
                    <p className="text-xs text-slate-400 leading-snug line-clamp-2">
                      {cleanSummaryText}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
                    <span className="font-semibold text-indigo-400">{formattedSourcesLine}</span>
                    {relativeTimeLabel && (
                      <>
                        <span className="text-slate-600 shrink-0">·</span>
                        <span className="text-slate-400 shrink-0">{relativeTimeLabel}</span>
                      </>
                    )}
                    {art.category && (
                      <>
                        <span className="text-slate-600 shrink-0">·</span>
                        <span className="text-slate-300 font-medium shrink-0">{art.category}</span>
                      </>
                    )}
                    {isListened && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-700/80 text-slate-400 text-[10px] font-medium shrink-0"
                        title="Ova vest je već preslušana ili otvorena danas"
                      >
                        <Check className="w-2.5 h-2.5 text-emerald-400/80" />
                        <span>Preslušano</span>
                      </span>
                    )}
                    {art.paywall === 'hard' && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-semibold shrink-0"
                        title="Članak na izvornom portalu zahteva pretplatu"
                      >
                        <Lock className="w-2.5 h-2.5" />
                        <span>Pretplata</span>
                      </span>
                    )}
                    {art.paywall === 'soft' && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium shrink-0"
                        title="Ograničen broj besplatnih članaka"
                      >
                        <Lock className="w-2.5 h-2.5" />
                        <span>Ograničeno</span>
                      </span>
                    )}
                    {art.aiBriefing && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold shrink-0"
                        title="Spreman AI audio brifing"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>AI</span>
                      </span>
                    )}
                    {art.url && (
                      <a
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-slate-200 inline-flex items-center ml-0.5 shrink-0"
                        title="Otvori originalnu vest"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Desna strana okvira vesti: "Pročitaj članak" (čita AI brifing ili fallback i nastavlja dalje) */}
                <button
                  type="button"
                  onClick={() => onTriggerArticleBriefing(art)}
                  disabled={deepDiveLoadingId === art.id}
                  className={`min-h-[36px] px-2.5 py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50 ${
                    isArticleActive
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                      : 'bg-indigo-600/20 hover:bg-indigo-600/30 border-indigo-500/40 text-indigo-300'
                  }`}
                  title="Pročitaj brifing ove vesti i nastavi dalje"
                >
                  <Radio
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isArticleActive ? 'text-emerald-400' : 'text-indigo-400'
                    }`}
                  />
                  <span className="whitespace-nowrap">
                    {deepDiveLoadingId === art.id ? 'Učitavam...' : 'Pročitaj članak'}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
