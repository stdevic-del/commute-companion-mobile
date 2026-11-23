import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Volume2, Sparkles } from 'lucide-react';
import { ConversationTurn } from '../types';

interface VoiceAssistantBarProps {
  isAsking: boolean;
  onAskQuestion: (question: string) => Promise<void>;
  conversation: ConversationTurn[];
  onPlayTurnAudio: (audioData: string | undefined, text: string) => void;
  languageVariant: 'ekavica' | 'ijekavica';
}

const QUICK_DRIVER_QUESTIONS = [
  'Kakvo je stanje na Gazeli i mostovima?',
  'Postoji li brži alternativni pravac?',
  'Kakva je vremenska prognoza za popodne?',
  'Najvažnije ekonomske i tehnološke vesti danas?',
];

export const VoiceAssistantBar: React.FC<VoiceAssistantBarProps> = ({
  isAsking,
  onAskQuestion,
  conversation,
  onPlayTurnAudio,
}) => {
  const [query, setQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    setSpeechError(null);

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      inputRef.current?.focus();
      setSpeechError(
        'Polje za unos je aktivirano — dodirnite ikonicu mikrofona na vašoj tastaturi telefona ili izaberite jedno od brzih pitanja.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'sr-RS';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = async (event: any) => {
        const transcriptText = event.results?.[0]?.[0]?.transcript?.trim();
        setIsListening(false);
        if (transcriptText) {
          setQuery(transcriptText);
          await onAskQuestion(transcriptText);
          setQuery('');
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        inputRef.current?.focus();
        if (event.error === 'not-allowed') {
          setSpeechError(
            'Pristup mikrofonu u pretraživaču nije dozvoljen — koristite mikrofon na tastaturi telefona ili brza pitanja ispod.'
          );
        } else {
          setSpeechError(
            'Glasovni unos je prebačen na polje ispod — možete diktirati pomoću mikrofona na tastaturi ili kliknuti na brzo pitanje.'
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      inputRef.current?.focus();
      setSpeechError(
        'Polje za unos je aktivirano — koristite mikrofon na tastaturi telefona ili izaberite brzo pitanje.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAsking) return;
    const textToAsk = query.trim();
    setQuery('');
    await onAskQuestion(textToAsk);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Hands-Free Kopilot</span>
            <span aria-hidden="true">·</span>
            <span>Glasovni ili tekstualni upit u vožnji</span>
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-1">
            Postavite potpitanje o saobraćaju ili vestima
          </h3>
        </div>

        {/* Large Ergonomic Hands-Free Mic Trigger */}
        <button
          type="button"
          onClick={toggleVoiceInput}
          disabled={isAsking}
          className={`min-h-[48px] px-5 py-3 rounded-2xl font-semibold text-xs flex items-center gap-2.5 transition-all active:scale-95 whitespace-nowrap shrink-0 ${
            isListening
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4" />
              <span>Slušam... (Dodirni za kraj)</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>Govori pitanje</span>
            </>
          )}
        </button>
      </div>

      {/* One-Tap Quick Questions for Safe Driving */}
      <div className="flex flex-wrap gap-2">
        {QUICK_DRIVER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={isAsking}
            onClick={() => onAskQuestion(q)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors text-left"
          >
            {q}
          </button>
        ))}
      </div>

      {speechError && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
          {speechError}
        </p>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isAsking}
          placeholder="Unesite pitanje (npr. Ima li gužve na Brankovom mostu?)..."
          className="flex-1 min-h-[48px] bg-slate-950/90 border border-slate-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={isAsking || !query.trim()}
          className="min-h-[48px] min-w-[48px] px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          {isAsking ? (
            <span className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Pošalji</span>
            </>
          )}
        </button>
      </form>

      {/* Conversation History */}
      {conversation.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-slate-800/80 max-h-72 overflow-y-auto">
          {conversation.map((turn) => (
            <div
              key={turn.id}
              className={`p-4 rounded-2xl border ${
                turn.role === 'user'
                  ? 'bg-slate-950/50 border-slate-800/80 text-slate-300'
                  : 'bg-indigo-950/20 border-indigo-500/30 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">
                    {turn.role === 'user' ? 'Vi' : 'Commute Companion'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{turn.timestamp}</span>
                </div>
                {turn.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => onPlayTurnAudio(turn.audioData, turn.text)}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Pusti odgovor</span>
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed">{turn.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
