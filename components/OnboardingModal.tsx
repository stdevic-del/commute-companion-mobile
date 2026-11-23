import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Home,
  MapPin,
  Radio,
  Sparkles,
} from 'lucide-react';
import { CANONICAL_CATEGORIES } from '../shared/categories';
import { LockedStreet, StreetAutocompleteInput } from './StreetAutocompleteInput';

export interface OnboardingCompletionResult {
  orderedCategories: string[];
  homeAddress: string;
  homeLocked: LockedStreet | null;
  workAddress: string;
  workLocked: LockedStreet | null;
  startBriefing: boolean;
}

export interface OnboardingModalProps {
  isOpen: boolean;
  initialSelected?: string[];
  initialHomeAddress?: string;
  initialHomeLocked?: LockedStreet | null;
  initialWorkAddress?: string;
  initialWorkLocked?: LockedStreet | null;
  onComplete: (result: OnboardingCompletionResult) => void;
  onSkip: () => void;
}

const MIN_TOPICS = 3;
const MAX_TOPICS = 5;
const DEFAULT_TOPICS = ['Politika', 'Društvo', 'Biznis i Finansije', 'Tehnologija'];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  initialSelected = [],
  initialHomeAddress = '',
  initialHomeLocked = null,
  initialWorkAddress = '',
  initialWorkLocked = null,
  onComplete,
  onSkip,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [homeAddress, setHomeAddress] = useState<string>(initialHomeAddress);
  const [homeLocked, setHomeLocked] = useState<LockedStreet | null>(initialHomeLocked);
  const [workAddress, setWorkAddress] = useState<string>(initialWorkAddress);
  const [workLocked, setWorkLocked] = useState<LockedStreet | null>(initialWorkLocked);
  const [selected, setSelected] = useState<string[]>(() => {
    const valid = initialSelected
      .filter((c) => (CANONICAL_CATEGORIES as readonly string[]).includes(c))
      .slice(0, MAX_TOPICS);
    return valid.length >= MIN_TOPICS ? valid : DEFAULT_TOPICS;
  });

  // Resetuj na Korak 1 i osveži početne vrednosti svaki put kad se modal otvori
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setHomeAddress(initialHomeAddress);
      setHomeLocked(initialHomeLocked);
      setWorkAddress(initialWorkAddress);
      setWorkLocked(initialWorkLocked);
      const valid = initialSelected
        .filter((c) => (CANONICAL_CATEGORIES as readonly string[]).includes(c))
        .slice(0, MAX_TOPICS);
      setSelected(valid.length >= MIN_TOPICS ? valid : DEFAULT_TOPICS);
    }
  }, [isOpen, initialHomeAddress, initialHomeLocked, initialWorkAddress, initialWorkLocked, initialSelected]);

  if (!isOpen) return null;

  const toggleCategory = (cat: string) => {
    setSelected((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((item) => item !== cat);
      }
      if (prev.length >= MAX_TOPICS) {
        return prev;
      }
      return [...prev, cat];
    });
  };

  const canProceedFromTopics = selected.length >= MIN_TOPICS && selected.length <= MAX_TOPICS;

  const handleFinishAndStartBriefing = () => {
    const chosen = canProceedFromTopics ? selected : DEFAULT_TOPICS;
    const rest = (CANONICAL_CATEGORIES as readonly string[]).filter((c) => !chosen.includes(c));
    onComplete({
      orderedCategories: [...chosen, ...rest],
      homeAddress: homeAddress.trim(),
      homeLocked,
      workAddress: workAddress.trim(),
      workLocked,
      startBriefing: true,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl p-5 sm:p-6 space-y-5 my-auto">
        {/* Zaglavlje: Indikator koraka + jasno dugme "Preskoči" */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Uvodno podešavanje · Korak {step} od 3</span>
            </div>
            <button
              type="button"
              onClick={onSkip}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Preskoči
            </button>
          </div>

          {/* Vizuelni indikator 3 koraka */}
          <div className="grid grid-cols-3 gap-2" aria-label={`Korak ${step} od 3`}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-colors ${
                  s <= step ? 'bg-emerald-400' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* =================================================================
            KORAK 1: Unos adrese Kuće i Posla (opciono)
           ================================================================= */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 id="onboarding-title" className="text-lg sm:text-xl font-bold text-slate-100">
                1. Vaše glavne lokacije (opciono)
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Unesite adresu Kuće i Posla za brzu rutu jednim dodirom i automatski čuvar isključenja struje i vode za vašu ulicu.
              </p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Adresa kuće (ulica i broj — opciono)</span>
                </label>
                <StreetAutocompleteInput
                  value={homeAddress}
                  onChange={(val) => {
                    if (homeLocked) setHomeLocked(null);
                    setHomeAddress(val);
                  }}
                  locked={homeLocked}
                  onSelect={(sel) => {
                    setHomeLocked(sel);
                    setHomeAddress(sel.label);
                  }}
                  onUnlock={() => setHomeLocked(null)}
                  placeholder="Npr. Koriška 4, Zvezdara"
                  compact
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Adresa posla (opciono)</span>
                </label>
                <StreetAutocompleteInput
                  value={workAddress}
                  onChange={(val) => {
                    if (workLocked) setWorkLocked(null);
                    setWorkAddress(val);
                  }}
                  locked={workLocked}
                  onSelect={(sel) => {
                    setWorkLocked(sel);
                    setWorkAddress(sel.label);
                  }}
                  onUnlock={() => setWorkLocked(null)}
                  placeholder="Npr. Trg Republike, Stari grad"
                  compact
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
              >
                Preskoči adrese
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-xs sm:text-sm font-bold text-white inline-flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-colors"
              >
                <span>Dalje: Teme vesti</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            KORAK 2: Brzi izbor 3 do 5 omiljenih tema vesti (veliki čipovi)
           ================================================================= */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h2 id="onboarding-title" className="text-lg sm:text-xl font-bold text-slate-100">
                  2. Izaberite 3 do 5 omiljenih tema
                </h2>
                <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-emerald-300 shrink-0">
                  {selected.length}/{MAX_TOPICS}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                Redosled kojim dodirnete čipove određuje koje teme idu na sam vrh vašeg jutarnjeg brifinga.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {CANONICAL_CATEGORIES.map((cat) => {
                const orderIdx = selected.indexOf(cat);
                const isSelected = orderIdx !== -1;
                const isDisabled = !isSelected && selected.length >= MAX_TOPICS;
                return (
                  <button
                    key={cat}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => toggleCategory(cat)}
                    className={`min-h-[48px] px-4 py-2.5 rounded-2xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2.5 transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                        : isDisabled
                        ? 'bg-slate-950/40 border-slate-800/60 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-950/80 border-slate-800 text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    <span>{cat}</span>
                    {isSelected ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {orderIdx + 1}
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-slate-700 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {!canProceedFromTopics && (
              <div className="text-xs text-amber-300/90 flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                <span>Izaberite još najmanje {MIN_TOPICS - selected.length} teme.</span>
                <button
                  type="button"
                  onClick={() => setSelected(DEFAULT_TOPICS)}
                  className="underline font-semibold text-amber-200 hover:text-white"
                >
                  Vrati podrazumevane (4)
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-semibold text-slate-300 inline-flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Nazad</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canProceedFromTopics}
                className={`min-h-[48px] px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors ${
                  canProceedFromTopics
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span>Dalje: Pregled</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            KORAK 3: Pregled podešenog i veliko CTA dugme za prvi brifing
           ================================================================= */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 id="onboarding-title" className="text-lg sm:text-xl font-bold text-slate-100">
                3. Sve je spremno za vaš putni vodič
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Proverite izabrana podešavanja. Sve opcije možete u bilo kom trenutku izmeniti na ekranu Profil.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-3.5">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Glavne lokacije</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Home className="w-3 h-3 text-emerald-400" />
                      <span>Kuća</span>
                    </div>
                    <div className="text-slate-100 font-semibold mt-0.5 truncate">
                      {homeAddress.trim() || 'Podrazumevano / GPS lokacija'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Briefcase className="w-3 h-3 text-indigo-400" />
                      <span>Posao</span>
                    </div>
                    <div className="text-slate-100 font-semibold mt-0.5 truncate">
                      {workAddress.trim() || 'Podrazumevano / Nije uneto'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Prioritetne teme vesti ({selected.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((cat, idx) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold"
                    >
                      <span className="w-4 h-4 rounded-full bg-emerald-500/25 text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span>{cat}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-semibold text-slate-300 inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Nazad</span>
              </button>

              <button
                type="button"
                onClick={handleFinishAndStartBriefing}
                className="min-h-[54px] flex-1 px-5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 transition-all"
              >
                <Radio className="w-5 h-5 shrink-0" />
                <span>Završi i pokreni prvi brifing</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
