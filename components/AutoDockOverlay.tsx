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
} from 'lucide-react';
import { NewsReport, AudioChapter } from '../types';

interface AutoDockOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  report: NewsReport;
  onExpandChapter?: (chapter: AudioChapter) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  isExpandedClip?: boolean;
  onReturnToMainBriefing?: () => void;
  onReverseDirection?: () => void;
  activeAudioTitle?: string;
}

export const AutoDockOverlay: React.FC<AutoDockOverlayProps> = ({
  isOpen,
  onClose,
  report,
  onExpandChapter,
  isPlaying = false,
  onTogglePlay,
  isExpandedClip = false,
  onReturnToMainBriefing,
  onReverseDirection,
  activeAudioTitle,
}) => {
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [clockTime, setClockTime] = useState(() =>
    new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })
  );

  // Request Screen Wake Lock while Auto-Dock is open so phone screen never turns off while driving
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  if (!isOpen) return null;

  const totalDelay = report.trafficNodes.reduce((sum, n) => sum + (n.delayMinutes || 0), 0);
  const aheadServiceAlerts = (report.serviceRadar || []).filter((a) => a.isAhead !== false);

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16] text-slate-100 flex flex-col justify-between p-6 sm:p-10 overflow-y-auto">
      {/* Top Bar: Clock, WakeLock status, Playback/Route Controls & Exit */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="text-indigo-400 font-semibold">AUTO-DOCK REŽIM ZA VOŽNJU</span>
            <span aria-hidden="true">·</span>
            <span>Bluetooth / Komande na volanu povezane</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{wakeLockActive ? 'WakeLock aktivan (ekran ostaje uključen)' : 'HUD aktivan'}</span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 font-display">
            {report.routeTitle}
          </h2>
          {activeAudioTitle && activeAudioTitle !== report.routeTitle && (
            <div className="text-xs text-indigo-300 mt-1 font-medium">
              Aktivni audio: {activeAudioTitle}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onTogglePlay && (
            <button
              type="button"
              onClick={onTogglePlay}
              className={`min-h-[56px] px-5 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 transition-colors ${
                isPlaying
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>{isPlaying ? 'Pauziraj' : 'Nastavi audio'}</span>
            </button>
          )}

          {isExpandedClip && onReturnToMainBriefing && (
            <button
              type="button"
              onClick={onReturnToMainBriefing}
              className="min-h-[56px] px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Glavni brifing</span>
            </button>
          )}

          {onReverseDirection && (
            <button
              type="button"
              onClick={onReverseDirection}
              className="min-h-[56px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 text-sm font-semibold flex items-center gap-2"
              title="Obrni smer rute (Povratak kući)"
            >
              <span>⇄ Obrni smer</span>
            </button>
          )}

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

      {/* Center High-Contrast Driving Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-auto py-6">
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
            {(report.chapters || []).map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800"
              >
                <span className="text-xs text-slate-200 font-medium truncate">{ch.title}</span>
                {ch.expandedText && onExpandChapter && (
                  <button
                    type="button"
                    onClick={() => {
                      onExpandChapter(ch);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white whitespace-nowrap shrink-0"
                  >
                    + Ceo blok
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
