import React, { useState, useEffect, useRef } from 'react';
import { Check, X, MapPin, Building2, Landmark, Navigation } from 'lucide-react';
import {
  loadOsmBelgradeStreets,
  searchBelgradeStreets,
  StreetSuggestion,
  isOsmStreetsLoaded,
} from '../services/serviceRadarEngine';

export interface LockedStreet {
  label: string;
  street: string;
  houseNumber?: string;
  opstina?: string;
  lat: number;
  lng: number;
}

interface StreetAutocompleteInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  locked: LockedStreet | null;
  onSelect: (selected: LockedStreet) => void;
  onUnlock: () => void;
  placeholder?: string;
  leadingIcon?: React.ReactNode;
  inputClassName?: string;
  required?: boolean;
  /** Ako je true, prikazuje kompaktan zaključani prikaz (za polja u Profilu) */
  compact?: boolean;
  /** Broj predloga u padajućem meniju */
  limit?: number;
  /** Dodatno dugme unutar desne strane polja za unos (npr. Moja lokacija) */
  trailingAction?: React.ReactNode;
}

const TIP_BADGE: Record<string, { label: string; color: string }> = {
  trg: { label: 'Trg', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
  most: { label: 'Most', color: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30' },
  orijentir: { label: 'Orijentir', color: 'text-purple-300 bg-purple-500/15 border-purple-500/30' },
  naselje: { label: 'Naselje', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
  bulevar: { label: 'Bulevar', color: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30' },
};

export const StreetAutocompleteInput: React.FC<StreetAutocompleteInputProps> = ({
  value,
  onChange,
  locked,
  onSelect,
  onUnlock,
  placeholder = 'Unesite ulicu i broj...',
  leadingIcon,
  inputClassName = '',
  required = false,
  compact = false,
  limit = 8,
  trailingAction,
}) => {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<StreetSuggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [streetsReady, setStreetsReady] = useState(() => isOsmStreetsLoaded());
  const [pendingStreet, setPendingStreet] = useState<StreetSuggestion | null>(null);
  const [houseNumInput, setHouseNumInput] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const houseNumInputRef = useRef<HTMLInputElement | null>(null);

  // Učitaj punu bazu od 13.759 ulica čim se komponenta pojavi
  useEffect(() => {
    let mounted = true;
    loadOsmBelgradeStreets().then(() => {
      if (mounted) setStreetsReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Ažuriraj predloge dok korisnik kuca (samo kad nije zaključano)
  useEffect(() => {
    if (locked) {
      setSuggestions([]);
      setPendingStreet(null);
      setOpen(false);
      return;
    }
    const q = (value || '').trim();
    if (q.length < 2 || q.toLowerCase() === 'moja lokacija') {
      setSuggestions([]);
      setPendingStreet(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const results = searchBelgradeStreets(q, limit);
      setSuggestions(results);
      setActiveIdx(0);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [value, locked, streetsReady, limit]);

  // Zatvori meni klikom van komponente
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingStreet(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const finalizeSelection = (s: StreetSuggestion, customHouseNumber?: string) => {
    const num = (customHouseNumber !== undefined ? customHouseNumber : s.houseNumber || '').trim();
    const head = num ? `${s.street} ${num}` : s.street;
    const fullLabel = s.opstina ? `${head}, ${s.opstina}` : head;
    const lockedItem: LockedStreet = {
      label: fullLabel,
      street: s.street,
      houseNumber: num || undefined,
      opstina: s.opstina || undefined,
      lat: s.lat,
      lng: s.lng,
    };
    setPendingStreet(null);
    setHouseNumInput('');
    setOpen(false);
    setSuggestions([]);
    onChange(fullLabel);
    onSelect(lockedItem);
  };

  const handleSuggestionClick = (s: StreetSuggestion) => {
    // Ako je korisnik već uneo broj ili je u pitanju trg/most/orijentir/naselje -> odmah vodi cilj na to mesto
    const needsHouseNumber =
      !s.houseNumber && (s.tip === 'ulica' || s.tip === 'bulevar' || !s.tip);
    if (!needsHouseNumber) {
      finalizeSelection(s);
      return;
    }
    // Ako je samo ulica izašla, u padajućem meniju otvori polje da se dopiše broj ulice ili slovo
    setPendingStreet(s);
    setHouseNumInput('');
    window.setTimeout(() => {
      houseNumInputRef.current?.focus();
    }, 20);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      const chosen = suggestions[activeIdx];
      if (chosen) {
        e.preventDefault();
        handleSuggestionClick(chosen);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setPendingStreet(null);
    }
  };

  // ZAKLJUČANO STANJE: zelena traka sa kvačicom, tačnim nazivom, opštinom i dugmetom × za promenu
  if (locked) {
    return (
      <div ref={containerRef} className="relative flex-1 min-w-0">
        <div
          className={`w-full ${
            compact ? 'min-h-[40px] rounded-xl px-2.5 py-1.5' : 'min-h-[46px] rounded-2xl px-3.5 py-2'
          } bg-slate-900 border-2 border-emerald-500/80 flex items-center justify-between gap-2 shadow-lg transition-all`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-5 h-5 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
              <Check className="w-3.5 h-3.5 stroke-[2.75]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-emerald-100 truncate">
                  {locked.houseNumber ? `${locked.street} ${locked.houseNumber}` : locked.street}
                </span>
                {locked.opstina && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-semibold text-emerald-200 whitespace-nowrap">
                    {locked.opstina}
                  </span>
                )}
              </div>
              {!compact && (
                <div className="text-[10px] font-medium text-emerald-300/90 leading-tight mt-0.5">
                  Lokacija zaključana · spremno za putanju
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onUnlock();
              window.setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              }, 20);
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-200 hover:text-white flex items-center justify-center shrink-0 transition-colors"
            title="Promeni izabranu ulicu"
            aria-label="Promeni izabranu ulicu"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      {leadingIcon && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {leadingIcon}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        required={required}
        value={value}
        onFocus={() => {
          loadOsmBelgradeStreets().then(() => setStreetsReady(true));
          setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setPendingStreet(null);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={
          inputClassName ||
          `w-full ${
            compact ? 'min-h-[40px] rounded-xl text-xs sm:text-sm' : 'min-h-[46px] rounded-2xl text-sm'
          } bg-slate-900 border border-slate-700 focus:border-emerald-500 shadow-lg ${
            leadingIcon ? 'pl-9' : 'pl-3.5'
          } ${trailingAction ? (value && value.length > 0 ? 'pr-16' : 'pr-10') : 'pr-8'} py-1.5 text-slate-100 placeholder:text-slate-400 outline-none transition-colors`
        }
      />
      {(trailingAction || (value && value.length > 0)) && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setSuggestions([]);
                setPendingStreet(null);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              title="Obriši unos"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {trailingAction}
        </div>
      )}

      {/* Padajući meni sa ulicama ili poljem za dopisivanje broja/slova */}
      {open && (pendingStreet || suggestions.length > 0) && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[295px] sm:min-w-[340px] max-w-[92vw] bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
          {pendingStreet ? (
            <div className="p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-emerald-200 truncate">
                    {pendingStreet.street}
                  </div>
                  {pendingStreet.opstina && (
                    <div className="text-[10px] text-slate-400">{pendingStreet.opstina}</div>
                  )}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setPendingStreet(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded-lg bg-slate-800"
                >
                  Nazad
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  ref={houseNumInputRef}
                  type="text"
                  value={houseNumInput}
                  onChange={(e) => setHouseNumInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      finalizeSelection(pendingStreet, houseNumInput);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setPendingStreet(null);
                    }
                  }}
                  placeholder="Broj / slovo (npr. 12a)..."
                  className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-slate-950 border border-emerald-500/60 focus:border-emerald-400 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    finalizeSelection(pendingStreet, houseNumInput);
                  }}
                  className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1 shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{houseNumInput.trim() ? 'Kreni' : 'Cela ulica'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span>Kliknite na adresu za cilj</span>
                <span>{suggestions.length} predloga</span>
              </div>
              <ul role="listbox" className="divide-y divide-slate-800/70">
                {suggestions.map((s, idx) => {
                  const isAct = idx === activeIdx;
                  const badge = TIP_BADGE[s.tip];
                  return (
                    <li key={`${s.label}-${idx}`} role="option" aria-selected={isAct}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // onMouseDown sprečava blur pre izbora na telefonu/kompjuteru
                          e.preventDefault();
                          handleSuggestionClick(s);
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                          isAct ? 'bg-emerald-600/20 text-white' : 'hover:bg-slate-800/80 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {s.tip === 'trg' || s.tip === 'orijentir' ? (
                            <Landmark className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : s.tip === 'naselje' ? (
                            <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : s.tip === 'most' ? (
                            <Navigation className="w-4 h-4 text-cyan-400 shrink-0" />
                          ) : (
                            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold truncate">
                              {s.houseNumber ? (
                                <>
                                  <span>{s.street} </span>
                                  <span className="text-emerald-300 font-bold">{s.houseNumber}</span>
                                </>
                              ) : (
                                s.street
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}
                            >
                              {badge.label}
                            </span>
                          )}
                          {s.opstina && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-700/80 text-[10px] font-medium text-slate-300">
                              {s.opstina}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};
