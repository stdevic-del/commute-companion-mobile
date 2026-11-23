import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  Bus,
  Check,
  History,
  Home,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { BriefingPacingMode, NewsReport, UserPreferences } from '../types';
import { LockedStreet, StreetAutocompleteInput } from './StreetAutocompleteInput';
import { SourceHealthPanel } from './SourceHealthPanel';

export interface ProfileViewProps {
  prefs: UserPreferences;
  setPrefs: React.Dispatch<React.SetStateAction<UserPreferences>>;
  interestsList: string[];
  lockedHome: LockedStreet | null;
  setLockedHome: React.Dispatch<React.SetStateAction<LockedStreet | null>>;
  lockedWork: LockedStreet | null;
  setLockedWork: React.Dispatch<React.SetStateAction<LockedStreet | null>>;
  transitLinesInput: string;
  setTransitLinesInput: React.Dispatch<React.SetStateAction<string>>;
  savedStreetsInput: string;
  setSavedStreetsInput: React.Dispatch<React.SetStateAction<string>>;
  notifPermission: NotificationPermission | 'unsupported';
  onRequestHomeNotificationPermission: () => void;
  computeAdaptiveDuration: (commuteMins?: number) => number;
  isQuickOrderingCategories: boolean;
  setIsQuickOrderingCategories: React.Dispatch<React.SetStateAction<boolean>>;
  quickOrderedCategories: string[];
  setQuickOrderedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  onQuickOrderCategoryTap: (interest: string) => void;
  onResetDefaultCategoryOrder: () => void;
  onOpenOnboarding: () => void;
  onToggleInterest: (interest: string) => void;
  onMoveCategoryPriority: (interest: string, direction: 'up' | 'down') => void;
  isAdvancedSettingsOpen: boolean;
  setIsAdvancedSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  reportHistory: NewsReport[];
  onPlayHistoricalReport: (item: NewsReport) => void;
  appVersion: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  prefs,
  setPrefs,
  interestsList,
  lockedHome,
  setLockedHome,
  lockedWork,
  setLockedWork,
  transitLinesInput,
  setTransitLinesInput,
  savedStreetsInput,
  setSavedStreetsInput,
  notifPermission,
  onRequestHomeNotificationPermission,
  computeAdaptiveDuration,
  isQuickOrderingCategories,
  setIsQuickOrderingCategories,
  quickOrderedCategories,
  setQuickOrderedCategories,
  onQuickOrderCategoryTap,
  onResetDefaultCategoryOrder,
  onOpenOnboarding,
  onToggleInterest,
  onMoveCategoryPriority,
  isAdvancedSettingsOpen,
  setIsAdvancedSettingsOpen,
  reportHistory,
  onPlayHistoricalReport,
  appVersion,
}) => {
  const [lineDraft, setLineDraft] = useState('');
  const [showIosPushGuide, setShowIosPushGuide] = useState(false);

  const isIosOutsideStandalonePwa = (): boolean => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return false;

    const isStandaloneNavigator =
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isStandaloneDisplayMode =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;

    return !isStandaloneNavigator && !isStandaloneDisplayMode;
  };

  const handleNotificationButtonClick = () => {
    if (isIosOutsideStandalonePwa()) {
      setShowIosPushGuide(true);
      return;
    }
    onRequestHomeNotificationPermission();
  };

  // Aktivna lista GSP linija kompatibilna sa postojećim prefs.favoriteTransitLines i transitLinesInput
  const activeTransitLines: string[] =
    Array.isArray(prefs.favoriteTransitLines) && prefs.favoriteTransitLines.length > 0
      ? prefs.favoriteTransitLines
      : transitLinesInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  const syncTransitLines = (nextLines: string[]) => {
    setPrefs((p) => ({ ...p, favoriteTransitLines: nextLines }));
    setTransitLinesInput(nextLines.join(', '));
  };

  const addTransitLinesFromText = (rawText: string) => {
    const candidates = rawText
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (candidates.length === 0) return;

    const existingUpper = new Set(activeTransitLines.map((l) => l.toUpperCase()));
    const merged = [...activeTransitLines];
    for (const c of candidates) {
      if (!existingUpper.has(c)) {
        existingUpper.add(c);
        merged.push(c);
      }
    }
    syncTransitLines(merged);
    setLineDraft('');
  };

  const removeTransitLine = (lineToRemove: string) => {
    const next = activeTransitLines.filter((l) => l !== lineToRemove);
    syncTransitLines(next);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Kuća, Posao, Moje GSP linije, Obaveštenja na telefon */}
      <div className="lg:col-span-7 space-y-5">
        {/* 1. Moje glavne tačke: Kuća i Posao */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Moje glavne lokacije (Kuća i Posao)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ove adrese pokreću brze dugmiće „Kuća“ i „Posao“ i čuvar struje/vode za kuću.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-emerald-400" />
                <span>Adresa kuće (ulica i broj)</span>
              </label>
              <StreetAutocompleteInput
                value={prefs.homeAddress || ''}
                onChange={(val) => {
                  if (lockedHome) setLockedHome(null);
                  setPrefs((p) => ({ ...p, homeAddress: val, homeCoords: undefined }));
                }}
                locked={lockedHome}
                onSelect={(sel) => {
                  setLockedHome(sel);
                  setPrefs((p) => ({
                    ...p,
                    homeAddress: sel.label,
                    homeCoords: { lat: sel.lat, lng: sel.lng },
                  }));
                }}
                onUnlock={() => setLockedHome(null)}
                placeholder="Npr. Koriška 4, Zvezdara"
                compact
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                <span>Adresa posla</span>
              </label>
              <StreetAutocompleteInput
                value={prefs.workAddress || ''}
                onChange={(val) => {
                  if (lockedWork) setLockedWork(null);
                  setPrefs((p) => ({ ...p, workAddress: val, workCoords: undefined }));
                }}
                locked={lockedWork}
                onSelect={(sel) => {
                  setLockedWork(sel);
                  setPrefs((p) => ({
                    ...p,
                    workAddress: sel.label,
                    workCoords: { lat: sel.lat, lng: sel.lng },
                  }));
                }}
                onUnlock={() => setLockedWork(null)}
                placeholder="Npr. Trg Republike, Stari grad"
                compact
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-800/70">
            {/* Interaktivni unos GSP linija (čipovi/tagovi) */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Bus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Moje GSP linije (Enter, zarez ili + za dodavanje)</span>
              </label>

              <div className="p-2 rounded-2xl bg-slate-950 border border-slate-800 focus-within:border-indigo-500 space-y-2 transition-colors">
                {activeTransitLines.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeTransitLines.map((line) => (
                      <span
                        key={line}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
                      >
                        <span>{line}</span>
                        <button
                          type="button"
                          onClick={() => removeTransitLine(line)}
                          className="w-6 h-6 rounded-lg hover:bg-emerald-500/25 text-emerald-200 hover:text-white inline-flex items-center justify-center transition-colors"
                          title={`Ukloni liniju ${line}`}
                          aria-label={`Ukloni liniju ${line}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={lineDraft}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes(',')) {
                        addTransitLinesFromText(val);
                      } else {
                        setLineDraft(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTransitLinesFromText(lineDraft);
                      } else if (
                        e.key === 'Backspace' &&
                        lineDraft === '' &&
                        activeTransitLines.length > 0
                      ) {
                        removeTransitLine(activeTransitLines[activeTransitLines.length - 1]);
                      }
                    }}
                    placeholder={
                      activeTransitLines.length === 0
                        ? 'Dodaj liniju (npr. 25, EKO1, 71)...'
                        : 'Dodaj liniju (npr. EKO1)...'
                    }
                    className="flex-1 min-w-0 min-h-[38px] bg-transparent px-2 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => addTransitLinesFromText(lineDraft)}
                    disabled={!lineDraft.trim()}
                    className="min-w-[44px] min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900 disabled:text-slate-600 text-white inline-flex items-center justify-center transition-colors shrink-0"
                    title="Dodaj GSP liniju"
                    aria-label="Dodaj GSP liniju"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Dodatne praćene adrese (za struju i vodu)
              </label>
              <input
                type="text"
                value={savedStreetsInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSavedStreetsInput(val);
                  const parsed = val
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setPrefs((p) => ({ ...p, savedStreets: parsed }));
                }}
                placeholder="Npr. Kneza Višeslava 88"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none"
              />
            </div>
          </div>

          {/* Sistemska obaveštenja na telefon za kućnu adresu */}
          <div className="pt-3 border-t border-slate-800/70 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-slate-100">Obaveštenja na telefonu</span>{' '}
                <span className="text-slate-400">
                  (javi na zaključanom ekranu ako struja ili voda pogađaju kućnu adresu)
                </span>
              </div>
              <button
                type="button"
                onClick={handleNotificationButtonClick}
                disabled={
                  notifPermission === 'granted' ||
                  (notifPermission === 'unsupported' && !isIosOutsideStandalonePwa())
                }
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  notifPermission === 'granted'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : notifPermission === 'denied'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white'
                }`}
              >
                {notifPermission === 'granted'
                  ? '✓ Obaveštenja uključena'
                  : notifPermission === 'denied'
                  ? 'Blokirano u pretraživaču'
                  : notifPermission === 'unsupported' && !isIosOutsideStandalonePwa()
                  ? 'Nije podržano'
                  : 'Uključi obaveštenja'}
              </button>
            </div>

            {showIosPushGuide && (
              <div
                role="alert"
                className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-100 flex items-start justify-between gap-3"
              >
                <p className="leading-relaxed">
                  Na iPhone-u obaveštenja rade tek kada aplikaciju dodate na početni ekran: dodirnite ikonicu Share (Deli) u Safariju -&gt; Add to Home Screen (Dodaj na početni ekran).
                </p>
                <button
                  type="button"
                  onClick={() => setShowIosPushGuide(false)}
                  className="p-1.5 rounded-lg bg-slate-950/60 hover:bg-slate-900 text-amber-200 shrink-0"
                  title="Zatvori uputstvo"
                  aria-label="Zatvori uputstvo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Glas, Teme i Napredne opcije */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-5">
          {/* Trajanje brifinga */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Dužina audio brifinga</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'commute_adaptive' as BriefingPacingMode,
                  title: 'Po putanji',
                },
                {
                  id: 'all_breaking' as BriefingPacingMode,
                  title: 'Sve vesti',
                },
                {
                  id: 'express_90s' as BriefingPacingMode,
                  title: 'Kratko (90s)',
                },
              ].map((modeOpt) => {
                const isCurrentMode = (prefs.pacingMode || 'commute_adaptive') === modeOpt.id;
                return (
                  <button
                    key={modeOpt.id}
                    type="button"
                    onClick={() => {
                      setPrefs((p) => ({
                        ...p,
                        pacingMode: modeOpt.id,
                        adaptiveDuration: modeOpt.id === 'commute_adaptive',
                        duration:
                          modeOpt.id === 'all_breaking'
                            ? 6
                            : modeOpt.id === 'express_90s'
                            ? 2
                            : computeAdaptiveDuration(p.estimatedCommuteMinutes),
                      }));
                    }}
                    className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      isCurrentMode
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {modeOpt.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Teme za vesti i redosled važnosti (Mobile-first: 1 kolona i 44x44px dugmići za palac) */}
          <div className="pt-3 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-200">
                  Teme za vesti i redosled važnosti
                </label>
                <p className="text-[11px] text-slate-400">
                  Vesti na Početnoj strani ređaju se po vašem redosledu kategorija (1. najvažnija → dalje redom), a unutar svake kategorije od najobjavljenijih vesti.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isQuickOrderingCategories) {
                      setIsQuickOrderingCategories(false);
                    } else {
                      setQuickOrderedCategories([]);
                      setIsQuickOrderingCategories(true);
                    }
                  }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${
                    isQuickOrderingCategories
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {isQuickOrderingCategories
                    ? 'Završi ređanje kliktanjem'
                    : 'Poređaj kliktanjem (1 → 10)'}
                </button>
                <button
                  type="button"
                  onClick={onResetDefaultCategoryOrder}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-[11px] font-medium bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Podrazumevani redosled
                </button>
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-[11px] font-medium bg-slate-950/80 border border-slate-800 text-emerald-300 hover:border-emerald-500/40 transition-colors inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Čarobnjak (3–5 tema)</span>
                </button>
              </div>
            </div>

            {isQuickOrderingCategories ? (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30 space-y-2">
                <div className="text-[11px] text-emerald-300 font-medium">
                  Klikćite redom na kategorije od najvažnije (1.) ka manje važnim ({quickOrderedCategories.length}/{interestsList.length} odabrano):
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {interestsList.map((interest) => {
                    const orderIdx = quickOrderedCategories.indexOf(interest);
                    const isPicked = orderIdx !== -1;
                    return (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => onQuickOrderCategoryTap(interest)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center justify-between gap-2 ${
                          isPicked
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                            : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>{interest}</span>
                        {isPicked && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-[11px] font-bold text-emerald-300">
                            {orderIdx + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Uvek 1 kolona ispod 640px (i u vertikalnom steku za udobno korišćenje jednom rukom) */}
                <div className="grid grid-cols-1 gap-2">
                  {(prefs.interests.length > 0 ? prefs.interests : interestsList).map(
                    (interest, idx, arr) => (
                      <div
                        key={interest}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-200"
                      >
                        <button
                          type="button"
                          onClick={() => onToggleInterest(interest)}
                          className="min-h-[44px] flex items-center gap-2.5 text-left min-w-0 flex-1 py-1"
                          title="Dodirnite da isključite kategoriju"
                        >
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-xs font-bold text-emerald-300 shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="text-xs sm:text-sm font-semibold truncate">
                            {interest}
                          </span>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onMoveCategoryPriority(interest, 'up')}
                            disabled={idx === 0}
                            title="Pomeri nagore (veća važnost)"
                            aria-label={`Pomeri ${interest} nagore`}
                            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center transition-colors"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveCategoryPriority(interest, 'down')}
                            disabled={idx === arr.length - 1}
                            title="Pomeri nadole (manja važnost)"
                            aria-label={`Pomeri ${interest} nadole`}
                            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center transition-colors"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleInterest(interest)}
                            title="Isključi kategoriju"
                            aria-label={`Isključi kategoriju ${interest}`}
                            className="min-w-[44px] min-h-[44px] rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 inline-flex items-center justify-center transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>

                {interestsList.filter((i) => !prefs.interests.includes(i)).length > 0 && (
                  <div className="pt-1.5">
                    <div className="text-[11px] text-slate-400 mb-1.5">
                      Isključene kategorije (dodirnite da ih uključite i dodate na listu):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {interestsList
                        .filter((i) => !prefs.interests.includes(i))
                        .map((interest) => (
                          <button
                            key={interest}
                            type="button"
                            onClick={() => onToggleInterest(interest)}
                            className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-between gap-2"
                          >
                            <span>+ {interest}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Izgled aplikacije: Tamna tema */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-200">Tamna tema</div>
              <div className="text-[11px] text-slate-400">
                Tamni izgled aplikacije za prijatnije korišćenje u vožnji
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.darkMapTheme !== false}
              aria-label="Tamna tema aplikacije"
              onClick={() =>
                setPrefs((p) => ({
                  ...p,
                  darkMapTheme: p.darkMapTheme === false,
                }))
              }
              className={`group min-h-[44px] inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors shrink-0 ${
                prefs.darkMapTheme !== false
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{prefs.darkMapTheme !== false ? 'Uključena' : 'Isključena'}</span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out ${
                  prefs.darkMapTheme !== false
                    ? 'bg-emerald-500/40 border-emerald-400/60'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                    prefs.darkMapTheme !== false
                      ? 'translate-x-4 bg-emerald-300'
                      : 'translate-x-0.5 bg-slate-400'
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Napredna podešavanja (sklopljena po difoltu) */}
          <div className="pt-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsAdvancedSettingsOpen((v) => !v)}
              className="w-full min-h-[44px] flex items-center justify-between text-xs font-semibold text-slate-300 py-1"
            >
              <span>Napredne opcije (GPS, glasovna upozorenja, radio džingl, arhiva)</span>
              <span className="text-indigo-400">
                {isAdvancedSettingsOpen ? 'Sakrij' : 'Prikaži'}
              </span>
            </button>

            {isAdvancedSettingsOpen && (
              <div className="mt-3 space-y-3 pt-3 border-t border-slate-800/60">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        proactiveAudioAlerts: p.proactiveAudioAlerts === false,
                      }))
                    }
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      prefs.proactiveAudioAlerts !== false
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Glasovni alarm (&lt;500m):{' '}
                    {prefs.proactiveAudioAlerts !== false ? 'Uključen' : 'Isključen'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        backgroundLocationEnabled: p.backgroundLocationEnabled === false,
                      }))
                    }
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      prefs.backgroundLocationEnabled !== false
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Praćenje lokacije:{' '}
                    {prefs.backgroundLocationEnabled !== false ? 'Uključeno' : 'Isključeno'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        radioMixEnabled: !p.radioMixEnabled,
                      }))
                    }
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      prefs.radioMixEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Radio džingl između poglavlja:{' '}
                    {prefs.radioMixEnabled ? 'Uključen' : 'Isključen'}
                  </button>
                </div>

                {reportHistory.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Prethodni brifinzi ({reportHistory.length})</span>
                    </div>
                    {reportHistory.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-200 truncate">
                            {item.routeTitle}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.timestamp}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPlayHistoricalReport(item)}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-indigo-300 shrink-0"
                        >
                          Pusti
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <SourceHealthPanel />

          {/* O aplikaciji — dinamička oznaka verzije iz package.json i dugme za ponovno pokretanje uvodnog podešavanja */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span>O aplikaciji</span>
              <span>·</span>
              <span className="font-mono text-slate-400">Putni Vodič v{appVersion}</span>
            </div>
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-emerald-300 transition-colors py-1"
              title="Ponovo otvori uvodni čarobnjak u 3 koraka"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Ponovo pokreni uvodno podešavanje</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
