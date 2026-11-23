import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  Thermometer,
  AlertTriangle,
  Radio,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Newspaper,
} from 'lucide-react';
import {
  AudioChapter,
  ConversationTurn,
  NewsReport,
  ScrapedArticle,
  UserPreferences,
} from '../types';

export interface PlaybackProgressInfo {
  currentTime: number;
  duration: number;
  activeChapterIndex: number;
  activeChapter: AudioChapter | null;
}

export interface DriveModeViewProps {
  report: NewsReport | null;
  isOpen: boolean;
  onClose: () => void;
  isAsking: boolean;
  onAskQuestion: (question: string) => void;
  onExpandChapter: (chapter: AudioChapter) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipNext?: () => void;
  activeAudioTitle: string;
  onReturnToMainBriefing: (report: NewsReport) => void;
  onReverseDirection: () => void;
  conversation: ConversationTurn[];
  prefs?: UserPreferences;
  isCurrentlyAtWork?: boolean;
  playbackProgress?: PlaybackProgressInfo;
  feedArticles?: ScrapedArticle[];
}

function matchesSavedAddress(a?: string, b?: string): boolean {
  const cleanA = (a || '').trim().toLowerCase();
  const cleanB = (b || '').trim().toLowerCase();
  if (!cleanA || !cleanB) return false;
  const streetA = cleanA.split(',')[0].trim();
  const streetB = cleanB.split(',')[0].trim();
  return (
    cleanA === cleanB ||
    (streetB.length >= 3 && cleanA.includes(streetB)) ||
    (streetA.length >= 3 && cleanB.includes(streetA))
  );
}

/**
 * Određuje naslov aktivne relacije za zaglavlje ekrana Vožnja:
 * - Ako je izabrana ili podešena relacija (npr. "Kuća → Posao", "Posao → Kuća" ili naziv odredišta), prikazuje nju.
 * - "Moja lokacija" koristi isključivo kao fallback kada ruta nije aktivna niti podešena.
 */
export function resolveDriveModeRouteRelation(
  report: NewsReport,
  prefs?: UserPreferences,
  isCurrentlyAtWork = false
): { title: string; subtitle: string | null } {
  const dest = (prefs?.destination || '').trim();
  const start = (prefs?.startPoint || '').trim();
  const home = (prefs?.homeAddress || '').trim();
  const work = (prefs?.workAddress || '').trim();

  const hasCustomStart = Boolean(
    start && start.toLowerCase() !== 'moja lokacija' && start.toLowerCase() !== 'beograd'
  );

  // 1) Eksplicitno izabrano odredište / aktivna ruta
  if (dest) {
    const isDestWork = matchesSavedAddress(dest, work);
    const isDestHome = matchesSavedAddress(dest, home);
    const isStartHome = matchesSavedAddress(start, home);
    const isStartWork = matchesSavedAddress(start, work);

    if (isDestWork && (isStartHome || !hasCustomStart)) {
      return {
        title: 'Kuća → Posao',
        subtitle: home && work ? `${home} → ${work}` : dest,
      };
    }
    if (isDestHome && (isStartWork || isCurrentlyAtWork || !hasCustomStart)) {
      return {
        title: 'Posao → Kuća',
        subtitle: work && home ? `${work} → ${home}` : dest,
      };
    }
    if (isDestWork && hasCustomStart) {
      return {
        title: `${start} → Posao`,
        subtitle: dest,
      };
    }
    if (isDestHome && hasCustomStart) {
      return {
        title: `${start} → Kuća`,
        subtitle: dest,
      };
    }
    return {
      title: hasCustomStart ? `${start} → ${dest}` : dest,
      subtitle: hasCustomStart ? null : 'Aktivno odredište',
    };
  }

  // 2) Ako izveštaj već nosi konkretnu relaciju (koja nije generičko "Moja lokacija" ili "Beograd")
  const repTitle = (report.routeTitle || '').trim();
  if (
    repTitle &&
    repTitle.toLowerCase() !== 'moja lokacija' &&
    repTitle.toLowerCase() !== 'beograd'
  ) {
    if (/^moja lokacija\s*→\s*/i.test(repTitle)) {
      const targetPart = repTitle.replace(/^moja lokacija\s*→\s*/i, '').trim();
      if (matchesSavedAddress(targetPart, work)) {
        return {
          title: 'Kuća → Posao',
          subtitle: home ? `${home} → ${targetPart}` : targetPart,
        };
      }
      if (matchesSavedAddress(targetPart, home)) {
        return {
          title: 'Posao → Kuća',
          subtitle: work ? `${work} → ${targetPart}` : targetPart,
        };
      }
      return {
        title: home ? `Kuća → ${targetPart}` : targetPart,
        subtitle: null,
      };
    }
    return { title: repTitle, subtitle: null };
  }

  // 3) Podešena relacija Kuća / Posao u profilu
  if (home && work) {
    return isCurrentlyAtWork
      ? { title: 'Posao → Kuća', subtitle: `${work} → ${home}` }
      : { title: 'Kuća → Posao', subtitle: `${home} → ${work}` };
  }
  if (work) {
    return { title: `Ka poslu (${work})`, subtitle: null };
  }
  if (home) {
    return { title: `Ka kući (${home})`, subtitle: null };
  }

  // 4) Fallback kada nikakva ruta nije aktivna
  return { title: 'Moja lokacija', subtitle: null };
}

function formatTimeMmSs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const DriveModeView: React.FC<DriveModeViewProps> = ({
  report,
  isOpen,
  onClose,
  onExpandChapter,
  isPlaying,
  onTogglePlay,
  onSkipNext,
  activeAudioTitle,
  onReturnToMainBriefing,
  onReverseDirection,
  prefs,
  isCurrentlyAtWork = false,
  playbackProgress,
  feedArticles = [],
}) => {
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [clockTime, setClockTime] = useState(() =>
    new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })
  );

  // Request Screen Wake Lock while Auto-Dock is open so phone screen never turns off while driving
  useEffect(() => {
    if (!isOpen || !report) return;
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
        }
      } catch {
        setWakeLockActive(false);
      }
    };

    requestWakeLock();

    const timer = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }));
    }, 10000);

    return () => {
      clearInterval(timer);
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch {
          // ignore
        }
      }
      setWakeLockActive(false);
    };
  }, [isOpen, report]);

  if (!report || !isOpen) return null;

  const isExpandedClip = Boolean(activeAudioTitle && activeAudioTitle !== report.routeTitle);
  const relation = resolveDriveModeRouteRelation(report, prefs, isCurrentlyAtWork);

  const chapters = report.chapters || [];
  const activeChapterIndex = playbackProgress?.activeChapterIndex ?? 0;
  const activeChapter =
    playbackProgress?.activeChapter || chapters[activeChapterIndex] || chapters[0] || null;

  const currentTime = playbackProgress?.currentTime ?? 0;
  const duration = playbackProgress?.duration ?? 0;

  // Izračunaj napredak (0–100%)
  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, Math.round((currentTime / duration) * 100))) : 0;

  // Odredi naslov aktivne vesti i izvor (medij) za karticu "Trenutno se čita"
  const allKnownArticles =
    feedArticles.length > 0 ? feedArticles : report.scrapedArticles || [];

  const matchedExpandedArticle = isExpandedClip
    ? allKnownArticles.find(
        (a) =>
          a.title === activeAudioTitle ||
          `Deep-Dive: ${a.title}` === activeAudioTitle ||
          activeAudioTitle.includes(a.title)
      )
    : undefined;

  const matchedChapterArticle =
    !isExpandedClip && activeChapter
      ? allKnownArticles.find(
          (a) =>
            (activeChapter.articleUrl && a.url === activeChapter.articleUrl) ||
            (activeChapter.leadTitle && a.title === activeChapter.leadTitle)
        )
      : undefined;

  const nowPlayingTitle = (() => {
    if (isExpandedClip) {
      if (matchedExpandedArticle) return matchedExpandedArticle.title;
      return activeAudioTitle.replace(/^Deep-Dive:\s*/i, '');
    }
    if (activeChapter?.leadTitle) {
      return activeChapter.leadTitle;
    }
    if (matchedChapterArticle) {
      return matchedChapterArticle.title;
    }
    if (activeChapter) {
      return activeChapter.title;
    }
    return allKnownArticles[0]?.title || relation.title;
  })();

  const nowPlayingSource = (() => {
    if (isExpandedClip && matchedExpandedArticle) {
      const cnt = Math.max(
        Number(matchedExpandedArticle.mediaCount) || 1,
        matchedExpandedArticle.relatedSources?.length || 1
      );
      return cnt > 1
        ? `${matchedExpandedArticle.sourceName} (${cnt} medija)`
        : matchedExpandedArticle.sourceName;
    }
    if (activeChapter?.sourceName) {
      return activeChapter.sourceName;
    }
    if (matchedChapterArticle?.sourceName) {
      return matchedChapterArticle.sourceName;
    }
    if (activeChapter?.category) {
      return activeChapter.category;
    }
    return allKnownArticles[0]?.sourceName || 'Putni Vodič Radio';
  })();

  const totalDelay = report.trafficNodes.reduce((sum, n) => sum + (n.delayMinutes || 0), 0);
  const aheadServiceAlerts = (report.serviceRadar || []).filter((a) => a.isAhead !== false);

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16] text-slate-100 flex flex-col justify-between p-5 sm:p-8 overflow-y-auto">
      {/* Top Bar: Aktivna relacija, WakeLock status, Velike kontrole plejera (Play/Pause + Sledeća vest) & Izlaz */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="text-indigo-400 font-semibold">AUTO-DOCK REŽIM ZA VOŽNJU</span>
            <span aria-hidden="true">·</span>
            <span>Bluetooth / Komande na volanu povezane</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {wakeLockActive ? 'WakeLock aktivan (ekran ostaje uključen)' : 'HUD aktivan'}
              </span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 font-display truncate">
            {relation.title}
          </h2>
          {relation.subtitle && (
            <div className="text-xs text-slate-400 mt-0.5 truncate">{relation.subtitle}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Glavno dugme za reprodukciju (min 56px) */}
          <button
            type="button"
            onClick={onTogglePlay}
            className={`min-h-[56px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold flex items-center gap-2.5 transition-colors ${
              isPlaying
                ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span>{isPlaying ? 'Pauziraj' : 'Nastavi audio'}</span>
          </button>

          {/* Veliko dugme "Sledeća vest" (Skip) minimalne visine 56px za lako pogađanje palcem u vožnji */}
          {onSkipNext && (
            <button
              type="button"
              onClick={onSkipNext}
              className="min-h-[56px] px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 border border-indigo-400/40 text-white text-sm sm:text-base font-bold flex items-center gap-2.5 shadow-lg shadow-indigo-600/25 transition-all"
              title="Pređi na sledeću vest u audio brifingu"
              aria-label="Sledeća vest"
            >
              <span>Sledeća vest</span>
              <SkipForward className="w-5 h-5" />
            </button>
          )}

          {isExpandedClip && (
            <button
              type="button"
              onClick={() => onReturnToMainBriefing(report)}
              className="min-h-[56px] px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-indigo-500/40 text-indigo-200 text-sm font-semibold flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Glavni brifing</span>
            </button>
          )}

          <button
            type="button"
            onClick={onReverseDirection}
            className="min-h-[56px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 text-sm font-semibold flex items-center gap-2"
            title="Obrni smer rute (Povratak kući)"
          >
            <span>⇄ Obrni smer</span>
          </button>

          <div className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-slate-100 px-2">
            {clockTime}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[56px] px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold flex items-center gap-2"
          >
            <X className="w-5 h-5" />
            <span>Izađi</span>
          </button>
        </div>
      </div>

      {/* Kartica "Trenutno se čita" (Now Playing) — iznad poglavlja i telemetrije */}
      <div className="mt-5 bg-slate-900/95 border border-indigo-500/40 rounded-3xl p-5 sm:p-6 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>Trenutno se čita</span>
            {!isExpandedClip && chapters.length > 0 && (
              <span className="text-slate-400 font-semibold normal-case">
                · Poglavlje {activeChapterIndex + 1}/{chapters.length}
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/40 text-xs font-semibold text-indigo-300">
            <Newspaper className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Izvor: {nowPlayingSource}</span>
          </div>
        </div>

        <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
          {nowPlayingTitle}
        </h3>

        {/* Vizuelni progress bar napretka */}
        <div className="space-y-1.5 pt-1">
          <div
            role="progressbar"
            aria-label="Napredak čitanja audio brifinga"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-3 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden"
          >
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
            <span>{formatTimeMmSs(currentTime)}</span>
            <span className="text-emerald-300 font-semibold">{progressPercent}%</span>
            <span>{formatTimeMmSs(duration)}</span>
          </div>
        </div>
      </div>

      {/* Center High-Contrast Driving Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-auto py-5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Servisni Radar u 3 tačke</span>
            </span>
            <span className="text-indigo-300 font-semibold">
              {aheadServiceAlerts.length} ispred vas
            </span>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white">
            {totalDelay > 0 ? `+${totalDelay} min` : '0 min zastoja'}
          </div>
          <div className="space-y-1.5 pt-1">
            {aheadServiceAlerts.slice(0, 3).map((srv) => (
              <div key={srv.id} className="text-xs text-slate-200 leading-snug">
                <span className="text-amber-300 font-semibold">
                  [{srv.zone === 'start' ? 'Start' : srv.zone === 'route' ? 'Trasa' : 'Cilj'}]
                </span>{' '}
                {srv.title}
              </div>
            ))}
            {aheadServiceAlerts.length === 0 && (
              <p className="text-sm text-slate-300">
                {report.trafficNodes[0]?.title}: {report.trafficNodes[0]?.description}
              </p>
            )}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Thermometer className="w-4 h-4 text-sky-400" />
            <span>Vreme i kolovoz</span>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white">
            {report.weather.tempC}°C · {report.weather.condition}
          </div>
          <p className="text-sm text-slate-300">{report.weather.roadCondition}</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-400" />
              <span>Kratka poglavlja (dodirnite za ceo blok)</span>
            </span>
            {isExpandedClip && (
              <span className="text-[11px] font-semibold text-indigo-300">Prošireni blok</span>
            )}
          </div>
          <div className="space-y-2 pt-1">
            {chapters.map((ch, idx) => {
              const isCurrentChapter = !isExpandedClip && idx === activeChapterIndex;
              return (
                <div
                  key={ch.id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
                    isCurrentChapter
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-950/70 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{ch.title}</div>
                    {ch.leadTitle && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {ch.sourceName ? `${ch.sourceName}: ` : ''}
                        {ch.leadTitle}
                      </div>
                    )}
                  </div>
                  {ch.expandedText && (
                    <button
                      type="button"
                      onClick={() => onExpandChapter(ch)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white whitespace-nowrap shrink-0"
                    >
                      + Ceo blok
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
