import React, { useState } from 'react';
import {
  Newspaper,
  Globe,
  CheckSquare,
  Square,
  Plus,
  RefreshCw,
  Headphones,
  ExternalLink,
  Radio,
  Sparkles,
  Flame,
  Layers,
} from 'lucide-react';
import { ScrapedArticle, SourceGroupId } from '../types';

interface NewsScraperDeskProps {
  sourceGroups: SourceGroupId[];
  onToggleSourceGroup: (group: SourceGroupId) => void;
  articles: ScrapedArticle[];
  isScraping: boolean;
  onScanPortals: () => Promise<void>;
  lastSyncedAt?: string | null;
  autoScanOnLoad?: boolean;
  onToggleAutoScan?: () => void;
  onAddCustomUrl: (url: string) => Promise<void>;
  onToggleArticleSelect: (id: string) => void;
  onSelectAllArticles: (selectAll: boolean) => void;
  onSelectBreakingOnly?: () => void;
  onTriggerDeepDive: (article: ScrapedArticle) => Promise<void>;
  deepDiveLoadingId: string | null;
  onGenerateFromSelected: () => Promise<void>;
  isGeneratingBriefing: boolean;
}

const SOURCE_GROUP_META: Array<{
  id: SourceGroupId;
  title: string;
  portals: string;
}> = [
  {
    id: 'domaci_info',
    title: 'Domaći Info i Biznis Klasteri',
    portals: 'RTS · Danas · Nova.rs · N1 · Blic · B92 · BizLife',
  },
  {
    id: 'it_tech',
    title: 'IT, Startapi i Global Tech',
    portals: 'Startit · Netokracija · TechCrunch · The Verge · HN',
  },
  {
    id: 'saobracaj_servisi',
    title: 'Saobraćaj i Gradski Servisi',
    portals: 'AMSS · Beoinfo · RHMZ · Beograd Uživo Klaster',
  },
  {
    id: 'custom_urls',
    title: 'Moji URL i RSS Izvori',
    portals: 'Direktno čitanje unetih linkova i sajtova',
  },
];

export const NewsScraperDesk: React.FC<NewsScraperDeskProps> = ({
  sourceGroups,
  onToggleSourceGroup,
  articles,
  isScraping,
  onScanPortals,
  lastSyncedAt,
  autoScanOnLoad = true,
  onToggleAutoScan,
  onAddCustomUrl,
  onToggleArticleSelect,
  onSelectAllArticles,
  onSelectBreakingOnly,
  onTriggerDeepDive,
  deepDiveLoadingId,
  onGenerateFromSelected,
  isGeneratingBriefing,
}) => {
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);

  const selectedCount = articles.filter((a) => a.selected).length;
  const breakingClusterCount = articles.filter(
    (a) => a.isBreakingCluster || (a.mediaCount && a.mediaCount >= 2)
  ).length;

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrlInput.trim() || addingCustom) return;
    setAddingCustom(true);
    try {
      await onAddCustomUrl(customUrlInput.trim());
      setCustomUrlInput('');
    } finally {
      setAddingCustom(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Live Scan Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 font-display">
            Vesti dana ({articles.length})
          </h2>
          {lastSyncedAt && (
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              Ažurirano: {lastSyncedAt}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onScanPortals}
            disabled={isScraping}
            className="min-h-[42px] px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-indigo-400 ${isScraping ? 'animate-spin' : ''}`} />
            <span>{isScraping ? 'Osvežavam...' : 'Osveži vesti'}</span>
          </button>

          {articles.length > 0 && (
            <button
              type="button"
              onClick={onGenerateFromSelected}
              disabled={isGeneratingBriefing || selectedCount === 0}
              className="min-h-[42px] px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-colors whitespace-nowrap shrink-0"
            >
              <Radio className="w-4 h-4" />
              <span>
                {isGeneratingBriefing
                  ? 'Priprema...'
                  : `Pusti brifing (${selectedCount})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Source Groups Toggle Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SOURCE_GROUP_META.map((group) => {
          const isActive = sourceGroups.includes(group.id);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onToggleSourceGroup(group.id)}
              className={`min-h-[68px] p-4 rounded-2xl border text-left transition-colors flex flex-col justify-between ${
                isActive
                  ? 'bg-indigo-600/15 border-indigo-500 text-slate-100'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{group.title}</span>
                {isActive ? (
                  <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600 shrink-0" />
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5">{group.portals}</div>
            </button>
          );
        })}
      </div>

      {/* Custom URL / Article / RSS Input Bar */}
      <form
        onSubmit={handleCustomSubmit}
        className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
      >
        <div className="flex items-center gap-2.5 flex-1">
          <Globe className="w-4 h-4 text-indigo-400 shrink-0 ml-1" />
          <input
            type="text"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="Nalepite bilo koji URL članka, portala ili RSS izvora (npr. https://danas.rs/... ili link vesti)..."
            className="w-full min-h-[44px] bg-slate-950/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={addingCustom || !customUrlInput.trim()}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-100 flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 text-indigo-400" />
          <span>{addingCustom ? 'Čitanje URL-a...' : 'Dodaj link'}</span>
        </button>
      </form>

      {/* Scraped Articles List with Checkboxes & Deep-Dive Reader */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-semibold text-slate-100">
                Rangirani klasteri vesti ({articles.length})
              </h3>
              {breakingClusterCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Flame className="w-3 h-3 text-amber-400" />
                  {breakingClusterCount} udarnih tema iz više medija
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Algoritam bez urednika automatski grupira iste događaje sa više portala i diže najvažnije teme na vrh liste
            </p>
          </div>

          {articles.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {onSelectBreakingOnly && (
                <>
                  <button
                    type="button"
                    onClick={onSelectBreakingOnly}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold transition-colors"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>Samo udarne teme (Više medija)</span>
                  </button>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => onSelectAllArticles(true)}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Označi sve
              </button>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <button
                type="button"
                onClick={() => onSelectAllArticles(false)}
                className="text-slate-400 hover:text-slate-200 font-medium"
              >
                Poništi izbor
              </button>
            </div>
          )}
        </div>

        {articles.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <Sparkles className="w-8 h-8 text-indigo-400 mx-auto" />
            <div className="text-sm font-medium text-slate-200">
              Kliknite na „Skeniraj i rangiraj portale uživo" da povučete i grupišete vesti po broju objava u medijima
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Ili odmah kliknite na „Pokreni Brifing" u gornjem uglu — server će automatski klasterovati izvore u pozadini.
            </p>
            <button
              type="button"
              onClick={onScanPortals}
              disabled={isScraping}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isScraping ? 'animate-spin' : ''}`} />
              <span>{isScraping ? 'Klasterovanje u toku...' : 'Povuci i rangiraj vesti sada'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article, idx) => {
              const isDeepDiveLoading = deepDiveLoadingId === article.id;
              const mediaCount = article.mediaCount || 1;
              const importanceScore = article.importanceScore || 60;
              const isBreaking = Boolean(
                article.isBreakingCluster || mediaCount >= 2 || importanceScore >= 75
              );
              const relatedSources =
                Array.isArray(article.relatedSources) && article.relatedSources.length > 0
                  ? article.relatedSources
                  : [article.sourceName];

              return (
                <div
                  key={article.id}
                  className={`p-4 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    article.selected
                      ? isBreaking
                        ? 'bg-slate-950/85 border-amber-500/45 text-slate-100 shadow-sm shadow-amber-500/5'
                        : 'bg-slate-950/70 border-indigo-500/40 text-slate-100'
                      : 'bg-slate-950/30 border-slate-800/60 text-slate-400 opacity-75'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleArticleSelect(article.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 shrink-0 mt-0.5"
                      title={article.selected ? 'Izbaci iz brifinga' : 'Uključi u brifing'}
                    >
                      {article.selected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-bold text-slate-300 tabular-nums">
                          #{idx + 1}
                        </span>

                        {isBreaking && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-semibold">
                            <Flame className="w-3 h-3 text-amber-400" />
                            <span>
                              {mediaCount >= 3
                                ? `Udarna tema · ${mediaCount} medija`
                                : mediaCount === 2
                                ? `U fokusu · 2 medija`
                                : 'Udarna vest'}
                            </span>
                          </span>
                        )}

                        <span className="font-semibold text-indigo-400">{article.sourceName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{article.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{article.publishedAt}</span>
                      </div>

                      <h4
                        onClick={() => onToggleArticleSelect(article.id)}
                        className="text-sm font-semibold text-slate-100 mt-1.5 cursor-pointer hover:text-indigo-300 transition-colors"
                      >
                        {article.title}
                      </h4>

                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {article.summary}
                      </p>

                      {relatedSources.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 mr-1">
                            <Layers className="w-3 h-3 text-amber-400" />
                            <span>Pokrivaju:</span>
                          </span>
                          {relatedSources.map((src) => (
                            <span
                              key={src}
                              className="px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 font-medium"
                            >
                              {src}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions: Deep-Dive Full Article Audio & External Link */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onTriggerDeepDive(article)}
                      disabled={isDeepDiveLoading}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      title="Učitaj ceo tekst članka i pročitaj ga detaljno"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>
                        {isDeepDiveLoading ? 'Čitam članak...' : 'Deep-Dive Audio'}
                      </span>
                    </button>

                    {article.url && (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[42px] min-w-[42px] p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors shrink-0"
                        title="Otvori originalni članak"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
