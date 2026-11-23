import React, { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  fetchStaticFeedMeta,
  formatRelativeTimeSr,
  formatSyncClockSr,
  type StaticFeedMeta,
} from '../services/newsFeedClient';

/**
 * Kompaktan panel „Stanje izvora“ unutar Podešavanja.
 * Podrazumevano je sklopljen i bezbedno prikazuje poruku ako `meta.json` još nije dostupan.
 */
export const SourceHealthPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<StaticFeedMeta | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const loadMeta = async () => {
    setLoading(true);
    try {
      const data = await fetchStaticFeedMeta();
      setMeta(data);
    } finally {
      setLoadedOnce(true);
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !loadedOnce && !loading) {
      loadMeta();
    }
  };

  return (
    <div className="pt-2 border-t border-slate-800/80">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 py-1.5"
      >
        <span className="inline-flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Stanje izvora vesti (nadzor agregatora)</span>
        </span>
        <span className="text-indigo-400">{isOpen ? 'Sakrij' : 'Prikaži'}</span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 pt-3 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400">
              {meta ? (
                <>
                  Poslednji izvoz: <span className="text-slate-200 font-semibold">{formatSyncClockSr(meta.generatedAt)}</span>{' '}
                  ({formatRelativeTimeSr(meta.generatedAt)}) ·{' '}
                  <span className="text-slate-200">{meta.counts.globalItems}</span> vesti ·{' '}
                  <span className="text-emerald-300">{meta.counts.briefedClusters} AI</span> ·{' '}
                  <span className="text-slate-200">{meta.counts.activeSources}</span> aktivnih izvora
                </>
              ) : loading ? (
                'Učitavanje meta.json izveštaja...'
              ) : (
                'Izveštaj o izvorima (meta.json) još nije učitan ili prvo osvežavanje još traje.'
              )}
            </div>
            <button
              type="button"
              onClick={loadMeta}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] font-semibold text-slate-300 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Osveži</span>
            </button>
          </div>

          {meta && meta.sources.length > 0 && (
            <div className="rounded-xl bg-slate-950/80 border border-slate-800/90 divide-y divide-slate-800/70 max-h-64 overflow-y-auto">
              {meta.sources.map((src) => {
                const statusBadge = !src.enabled
                  ? { label: 'Isključen', cls: 'bg-slate-800 text-slate-500 border-slate-700' }
                  : src.lastStatus === 200
                    ? { label: '200 OK', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' }
                    : src.lastStatus === 304
                      ? { label: `304 (×${src.consecutive304})`, cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40' }
                      : src.lastStatus === null
                        ? { label: 'Čeka', cls: 'bg-slate-800 text-slate-400 border-slate-700' }
                        : {
                            label: src.lastStatus === 0 ? 'Robots' : `HTTP ${src.lastStatus}`,
                            cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
                          };

                return (
                  <div
                    key={src.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold truncate ${src.enabled ? 'text-slate-200' : 'text-slate-500'}`}>
                          {src.name}
                        </span>
                        {src.role === 'signal' && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px]">
                            Signal
                          </span>
                        )}
                        <span className="text-slate-500 text-[10px]">T:{src.weight}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {src.domain} · interval {src.currentIntervalMin}m
                        {src.lastFetchedAt ? ` · ${formatRelativeTimeSr(src.lastFetchedAt)}` : ''}
                        {src.lastError ? ` · ${src.lastError}` : ''}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold shrink-0 ${statusBadge.cls}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
