import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  FastForward,
  SkipBack,
  SkipForward,
  Maximize2,
  Users,
  User,
  Music,
} from 'lucide-react';
import { decodeBase64, decodeAudioData } from '../services/geminiService';
import { trackAppEvent } from '../services/analyticsService';
import { AudioChapter, HostFormat } from '../types';

interface AudioPlayerHUDProps {
  audioData?: string;
  transcript?: string;
  title: string;
  subtitle: string;
  hostFormat?: HostFormat;
  chapters?: AudioChapter[];
  radioMixEnabled?: boolean;
  onToggleRadioMix?: () => void;
  autoPlay?: boolean;
  autoPlayTrigger?: number;
  onPlayStateChange?: (playing: boolean) => void;
  onOpenAutoDock?: () => void;
  onExpandChapter?: (chapter: AudioChapter) => void;
  isExpandedClip?: boolean;
  onReturnToMainBriefing?: () => void;
  onAnalyticsEvent?: () => void;
  externalTogglePlaySeq?: number;
  externalPauseSeq?: number;
  externalResumeSeq?: number;
  externalNextSeq?: number;
  onPlaybackProgressChange?: (progress: {
    currentTime: number;
    duration: number;
    activeChapterIndex: number;
    activeChapter: AudioChapter | null;
  }) => void;
}

const PLAYBACK_RATES = [1.0, 1.25, 1.5];

let sharedTtsAudioPool: [HTMLAudioElement, HTMLAudioElement] | null = null;
let sharedAudioUnlocked = false;

function createHiddenTtsAudio(): HTMLAudioElement {
  const el = document.createElement('audio');
  el.preload = 'auto';
  el.setAttribute('referrerpolicy', 'no-referrer');
  el.style.display = 'none';
  if (typeof document !== 'undefined' && document.body) {
    document.body.appendChild(el);
  }
  return el;
}

function getSharedTtsAudioPool(): [HTMLAudioElement, HTMLAudioElement] {
  if (!sharedTtsAudioPool) {
    sharedTtsAudioPool = [createHiddenTtsAudio(), createHiddenTtsAudio()];
  }
  return sharedTtsAudioPool;
}

function buildGoogleTtsUrl(chunkText: string): string {
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=sr&client=tw-ob&q=${encodeURIComponent(
    chunkText
  )}`;
}

if (typeof window !== 'undefined') {
  const unlockOnGesture = () => {
    if (sharedAudioUnlocked) return;
    sharedAudioUnlocked = true;
    try {
      const pool = getSharedTtsAudioPool();
      const silentWav =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      for (const a of pool) {
        a.src = silentWav;
        a.dataset.prefetchedChunk = '';
        a.volume = 0.01;
        const p = a.play();
        if (p !== undefined) {
          p.then(() => {
            a.pause();
            a.volume = 1;
          }).catch(() => {});
        }
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
      }
    } catch {
      // ignore
    }
  };
  window.addEventListener('pointerdown', unlockOnGesture, { once: true, passive: true });
  window.addEventListener('touchstart', unlockOnGesture, { once: true, passive: true });
  window.addEventListener('click', unlockOnGesture, { once: true, passive: true });
}

function satRec(h: number): string {
  const abs = Math.abs(h);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'čas';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'časa';
  return 'časova';
}

function stepenRec(deg: number): string {
  const abs = Math.abs(deg);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'stepen';
  return 'stepeni';
}

/**
 * Opcija C — Pametni normalizator teksta za prirodan izgovor na srpskom jeziku:
 * Pretvara simbole (~18 min, 7°C, →, 08:00–17:00, do 22:00, brojevi 4) u čist govorni srpski.
 */
export function normalizeTextForSerbianSpeech(rawText: string): string {
  if (!rawText) return '';
  let text = rawText
    .replace(/^(Jelena|Milan):\s*/gim, '')
    .replace(/\bCommute\s+Companion\b/gi, 'Putni vodič')
    .replace(/\s*→\s*/g, ' ka ')
    .replace(/\s*\|\s*/g, ', ');

  // 1) ~18 min -> oko 18 minuta, 18 min -> 18 minuta, 6.2 km -> 6,2 kilometra
  text = text.replace(/~\s*(\d+)\s*min(?:uta)?\b/gi, 'oko $1 minuta');
  text = text.replace(/\b(\d+)\s*min\b/gi, '$1 minuta');
  text = text.replace(/\b(\d+)\.(\d+)\s*km\b/gi, '$1 zarez $2 kilometara');
  text = text.replace(/\b(\d+)\s*km\b/gi, '$1 kilometara');

  // 2) Temperature: 7°C ili -2 °C -> 7 stepeni
  text = text.replace(/(-?\d+)\s*°\s*C?\b/gi, (_, dStr) => {
    const n = Number(dStr);
    return `${n} ${stepenRec(n)}`;
  });

  // 3) Jednina kućnog broja: "brojevi 4" ili "kućni brojevi 4" (kada nije raspon ni lista) -> "broj 4"
  text = text.replace(
    /\b(kućni\s+)?brojevi\s+(\d+[a-zA-Z]?|bb)\b(?!\s*[-–,])/gi,
    (_, kucni, br) => `${kucni ? 'kućni ' : ''}broj ${br}`
  );

  // 4) Vremenski rasponi: "od 08:00 do 17:00 časova" ili "(08:00–17:00)" ili "08:30–15:00"
  text = text.replace(
    /\b(?:od\s+)?0?(\d{1,2}):(\d{2})\s*(?:[-–]|do)\s*0?(\d{1,2}):(\d{2})(?:\s*(?:časova|časa|čas|sati))?/gi,
    (_, h1Str, m1Str, h2Str, m2Str) => {
      const h1 = Number(h1Str);
      const m1 = Number(m1Str);
      const h2 = Number(h2Str);
      const m2 = Number(m2Str);
      const startPart = m1 === 0 ? `${h1}` : `${h1} i ${m1}`;
      const endPart = m2 === 0 ? `${h2} ${satRec(h2)}` : `${h2} i ${m2}`;
      return `od ${startPart} do ${endPart}`;
    }
  );

  // 5) "do 22:00 časova" ili "do 22:00" -> "do 22 časa"
  text = text.replace(
    /\bdo\s+0?(\d{1,2}):(\d{2})(?:\s*(?:časova|časa|čas|sati))?/gi,
    (_, hStr, mStr) => {
      const h = Number(hStr);
      const m = Number(mStr);
      if (m === 0) return `do ${h} ${satRec(h)}`;
      return `do ${h} i ${m}`;
    }
  );

  // 6) Preostala samostalna vremena HH:00 ili HH:MM
  text = text.replace(
    /\b0?(\d{1,2}):(\d{2})(?:\s*(?:časova|časa|čas|sati))?\b/gi,
    (_, hStr, mStr) => {
      const h = Number(hStr);
      const m = Number(mStr);
      if (m === 0) return `${h} ${satRec(h)}`;
      return `${h} i ${m}`;
    }
  );

  // 7) Ukloni zagrade oko vremenskih odrednica kako TTS ne bi pravio neprirodnu pauzu
  text = text.replace(/\(\s*(od\s+\d+[^)]+)\)/gi, ', $1,');
  text = text.replace(/\(\s*(do\s+\d+[^)]+)\)/gi, ', $1,');
  text = text.replace(/\(\s*(broj(?:evi)?\s+[^)]+)\)/gi, ', $1,');

  return text
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SpeechChunkItem {
  text: string;
  speaker: 'jelena' | 'milan' | 'solo';
}

function splitIntoSpeechChunks(rawText: string, maxLen = 175): SpeechChunkItem[] {
  if (!rawText) return [];
  const lines = rawText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const chunks: SpeechChunkItem[] = [];

  for (const line of lines) {
    let speaker: 'jelena' | 'milan' | 'solo' = 'solo';
    if (/^Jelena:/i.test(line)) {
      speaker = 'jelena';
    } else if (/^Milan:/i.test(line)) {
      speaker = 'milan';
    }

    const cleaned = normalizeTextForSerbianSpeech(line);
    if (!cleaned) continue;

    const rawSentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
    for (const s of rawSentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      if (trimmed.length <= maxLen) {
        chunks.push({ text: trimmed, speaker });
      } else {
        const words = trimmed.split(' ');
        let current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length > maxLen) {
            if (current.trim()) chunks.push({ text: current.trim(), speaker });
            current = w;
          } else {
            current = (current + ' ' + w).trim();
          }
        }
        if (current.trim()) chunks.push({ text: current.trim(), speaker });
      }
    }
  }
  return chunks;
}

export const AudioPlayerHUD: React.FC<AudioPlayerHUDProps> = ({
  audioData,
  transcript = '',
  title,
  subtitle,
  hostFormat = 'duo',
  chapters = [],
  radioMixEnabled = true,
  onToggleRadioMix,
  autoPlay = false,
  autoPlayTrigger = 0,
  onPlayStateChange,
  onOpenAutoDock,
  onExpandChapter,
  isExpandedClip = false,
  onReturnToMainBriefing,
  onAnalyticsEvent,
  externalTogglePlaySeq = 0,
  externalPauseSeq = 0,
  externalResumeSeq = 0,
  externalNextSeq = 0,
  onPlaybackProgressChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chimeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const startOffsetRef = useRef<number>(0);
  const startWallTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const lastUiTimeUpdateRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const radioMixRef = useRef<boolean>(radioMixEnabled);
  const rateRef = useRef<number>(1.0);
  const playbackSessionIdRef = useRef<number>(0);
  const speechTimeoutRef = useRef<number | null>(null);
  const ttsWatchdogTimeoutRef = useRef<number | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const onPlayStateChangeRef = useRef(onPlayStateChange);
  onPlayStateChangeRef.current = onPlayStateChange;
  const onAnalyticsEventRef = useRef(onAnalyticsEvent);
  onAnalyticsEventRef.current = onAnalyticsEvent;
  const onPlaybackProgressChangeRef = useRef(onPlaybackProgressChange);
  onPlaybackProgressChangeRef.current = onPlaybackProgressChange;

  useEffect(() => {
    radioMixRef.current = radioMixEnabled;
  }, [radioMixEnabled]);

  const fallbackText =
    transcript.trim() ||
    chapters
      .map((c) => c.text)
      .join('\n\n')
      .trim();

  const hasPlayableContent = Boolean(audioData || fallbackText);
  const isUsingWebSpeech = !audioData && Boolean(fallbackText);
  const isUsingWebSpeechRef = useRef(isUsingWebSpeech);
  isUsingWebSpeechRef.current = isUsingWebSpeech;

  const currentRatio = duration > 0 ? currentTime / duration : 0;
  const activeChapterIndex =
    chapters.length > 0
      ? Math.max(
          0,
          chapters.findIndex(
            (ch, idx) =>
              currentRatio >= ch.startRatio &&
              (currentRatio <= ch.endRatio || idx === chapters.length - 1)
          )
        )
      : 0;
  const activeChapter = chapters[activeChapterIndex] || null;

  useEffect(() => {
    onPlaybackProgressChangeRef.current?.({
      currentTime,
      duration,
      activeChapterIndex,
      activeChapter,
    });
  }, [currentTime, duration, activeChapterIndex, activeChapter]);

  const ensureAudioContext = async (): Promise<AudioContext> => {
    if (!audioCtxRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const stopChimeOscillators = useCallback(() => {
    chimeOscillatorsRef.current.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    });
    chimeOscillatorsRef.current = [];
  }, []);

  // Short, gentle 0.25s broadcast chime on chapter transitions when Radio-Mix is enabled (no continuous drone)
  const playRadioChime = useCallback(async () => {
    if (!radioMixRef.current || isMutedRef.current) return;
    try {
      stopChimeOscillators();
      const ctx = await ensureAudioContext();
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25]; // Warm 2-note C5 -> E5 chime
      const created: OscillatorNode[] = [];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.07);
        g.gain.setValueAtTime(0.001, now + idx * 0.07);
        g.gain.exponentialRampToValueAtTime(0.028, now + idx * 0.07 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.22);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.24);
        created.push(osc);
      });
      chimeOscillatorsRef.current = created;
    } catch {
      // ignore
    }
  }, [stopChimeOscillators]);

  const prevChapterIdxRef = useRef<number>(0);

  useEffect(() => {
    if (isPlayingRef.current && activeChapterIndex !== prevChapterIdxRef.current) {
      playRadioChime();
    }
    prevChapterIdxRef.current = activeChapterIndex;
  }, [activeChapterIndex, playRadioChime]);

  const updatePlayState = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
    onPlayStateChangeRef.current?.(playing);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  }, []);

  const stopCurrentSource = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch {
        // Ignore already stopped source
      }
      sourceRef.current = null;
    }
    if (ttsWatchdogTimeoutRef.current) {
      window.clearTimeout(ttsWatchdogTimeoutRef.current);
      ttsWatchdogTimeoutRef.current = null;
    }
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.onplaying = null;
        ttsAudioRef.current.onended = null;
        ttsAudioRef.current.onerror = null;
        ttsAudioRef.current.pause();
      } catch {
        // ignore
      }
      ttsAudioRef.current = null;
    }
    if (sharedTtsAudioPool) {
      for (const el of sharedTtsAudioPool) {
        try {
          el.onplaying = null;
          el.onended = null;
          el.onerror = null;
          el.pause();
        } catch {
          // ignore
        }
      }
    }
    if (speechTimeoutRef.current) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    activeUtteranceRef.current = null;
    if ('speechSynthesis' in window) {
      try {
        // On Android Chrome, calling cancel() when not speaking breaks subsequent speak() calls
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // ignore
      }
    }
    stopChimeOscillators();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [stopChimeOscillators]);

  // Draw waveform reading refs only — zero state dependencies so it never triggers effect loops!
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const barCount = 44;
    const barGap = 4;
    const barWidth = (width - barGap * (barCount - 1)) / barCount;

    if (analyser && isPlayingRef.current && !isUsingWebSpeechRef.current) {
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);

      for (let i = 0; i < barCount; i++) {
        const binIndex = Math.min(
          freqData.length - 1,
          Math.floor((i / barCount) * (freqData.length * 0.55))
        );
        const value = freqData[binIndex] / 255;
        const barHeight = Math.max(6, value * (height - 8));
        const x = i * (barWidth + barGap);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = value > 0.6 ? '#6366f1' : '#3b82f6';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    } else if (isPlayingRef.current) {
      const t = performance.now() / 160;
      for (let i = 0; i < barCount; i++) {
        const value =
          0.25 +
          0.35 * Math.abs(Math.sin(t + i * 0.45)) +
          0.25 * Math.abs(Math.cos(t * 1.3 - i * 0.3));
        const barHeight = Math.max(6, Math.min(height - 6, value * (height - 8)));
        const x = i * (barWidth + barGap);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = value > 0.6 ? '#6366f1' : '#3b82f6';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    } else {
      const dur = durationRef.current;
      const cur = currentTimeRef.current;
      const progressRatio = dur > 0 ? cur / dur : 0;
      for (let i = 0; i < barCount; i++) {
        const barRatio = i / barCount;
        const wave = Math.sin(i * 0.45) * 0.3 + Math.cos(i * 0.2) * 0.2 + 0.5;
        const barHeight = Math.max(6, wave * (height * 0.45));
        const x = i * (barWidth + barGap);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = barRatio <= progressRatio ? '#6366f1' : '#1e293b';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    }
  }, []);

  const startWebSpeechFrom = useCallback(
    async (offsetSeconds: number, withJingle = false) => {
      if (!fallbackText) return;

      const sessionId = ++playbackSessionIdRef.current;
      stopCurrentSource();

      if (withJingle) {
        playRadioChime();
      }

      const totalEstimatedDuration = Math.max(15, Math.round(fallbackText.length / 13.5));
      durationRef.current = totalEstimatedDuration;
      setDuration(totalEstimatedDuration);

      const clampedOffset = Math.max(0, Math.min(offsetSeconds, totalEstimatedDuration - 0.5));
      startOffsetRef.current = clampedOffset;
      startWallTimeRef.current = performance.now() / 1000;
      currentTimeRef.current = clampedOffset;
      setCurrentTime(clampedOffset);
      updatePlayState(true);

      const ratio = clampedOffset / totalEstimatedDuration;
      const charStart = Math.floor(ratio * fallbackText.length);
      const remainingText = fallbackText.slice(charStart).trim();
      const chunks = splitIntoSpeechChunks(remainingText, 175);

      const speakChunkWithBrowserSynthesis = (
        chunkItem: SpeechChunkItem,
        onDone: () => void,
        useDefaultVoice = false
      ) => {
        if (
          sessionId !== playbackSessionIdRef.current ||
          !isPlayingRef.current ||
          isMutedRef.current ||
          !('speechSynthesis' in window)
        ) {
          return;
        }
        try {
          try {
            window.speechSynthesis.resume();
          } catch {
            // ignore
          }
          const utterance = new SpeechSynthesisUtterance(chunkItem.text);
          activeUtteranceRef.current = utterance;
          if (!useDefaultVoice) {
            const voices = window.speechSynthesis.getVoices();
            const srVoices = voices.filter((v) => /^(sr|hr|bs|sl)/i.test(v.lang));
            if (srVoices.length > 1 && chunkItem.speaker === 'milan') {
              utterance.voice = srVoices[1];
              utterance.lang = srVoices[1].lang;
            } else if (srVoices.length > 0) {
              utterance.voice = srVoices[0];
              utterance.lang = srVoices[0].lang;
            } else {
              utterance.lang = 'sr-RS';
            }
          }
          // Distinct pitch & pacing for Jelena vs Milan in Duo mode
          const speakerRateFactor =
            chunkItem.speaker === 'milan' ? 0.94 : chunkItem.speaker === 'jelena' ? 1.04 : 1.0;
          utterance.pitch =
            chunkItem.speaker === 'milan' ? 0.85 : chunkItem.speaker === 'jelena' ? 1.12 : 1.0;
          utterance.rate = Math.max(0.75, Math.min(1.75, rateRef.current * speakerRateFactor));
          utterance.volume = isMutedRef.current ? 0 : 1;
          utterance.onstart = () => {
            if (!hasFirstAudioStarted) {
              hasFirstAudioStarted = true;
              startWallTimeRef.current = performance.now() / 1000;
            }
          };
          utterance.onend = () => {
            if (sessionId === playbackSessionIdRef.current && isPlayingRef.current) {
              onDone();
            }
          };
          utterance.onerror = () => {
            if (sessionId === playbackSessionIdRef.current && isPlayingRef.current) {
              if (!useDefaultVoice) {
                speakChunkWithBrowserSynthesis(chunkItem, onDone, true);
              } else {
                onDone();
              }
            }
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          onDone();
        }
      };

      const prefetchChunkIntoAudio = (audioEl: HTMLAudioElement, itemToPrefetch?: SpeechChunkItem) => {
        if (!itemToPrefetch) return;
        const textToPrefetch = itemToPrefetch.text;
        try {
          if (audioEl.dataset.prefetchedChunk === textToPrefetch && audioEl.src) {
            return;
          }
          audioEl.onplaying = null;
          audioEl.onended = null;
          audioEl.onerror = null;
          audioEl.src = buildGoogleTtsUrl(textToPrefetch);
          audioEl.dataset.prefetchedChunk = textToPrefetch;
          audioEl.load();
        } catch {
          // ignore prefetch errors
        }
      };

      let hasFirstAudioStarted = false;
      let prevSpeaker: 'jelena' | 'milan' | 'solo' | null = null;

      const playChunkIndex = (idx: number) => {
        if (
          sessionId !== playbackSessionIdRef.current ||
          !isPlayingRef.current ||
          isMutedRef.current
        ) {
          return;
        }
        if (idx >= chunks.length) {
          // Speech finished naturally
          startOffsetRef.current = 0;
          currentTimeRef.current = 0;
          setCurrentTime(0);
          stopCurrentSource();
          updatePlayState(false);
          trackAppEvent('audio_completed', title, { duration: totalEstimatedDuration });
          onAnalyticsEventRef.current?.();
          return;
        }

        const chunkItem = chunks[idx];
        const chunkText = chunkItem.text;
        const speakerChanged =
          prevSpeaker !== null &&
          prevSpeaker !== chunkItem.speaker &&
          chunkItem.speaker !== 'solo';
        prevSpeaker = chunkItem.speaker;

        // Primary: Stream natural Serbian MP3 voice via A/B pre-buffered no-referrer HTMLAudioElement pool
        try {
          const pool = getSharedTtsAudioPool();
          const audio = pool[idx % 2];
          const nextAudio = pool[(idx + 1) % 2];

          const isDeviceOffline =
            typeof navigator !== 'undefined' && navigator.onLine === false;
          const isChunkAlreadyBuffered =
            audio.dataset.prefetchedChunk === chunkText &&
            Boolean(audio.src) &&
            audio.readyState >= 2;

          if (isDeviceOffline && !isChunkAlreadyBuffered) {
            speakChunkWithBrowserSynthesis(chunkItem, () => playChunkIndex(idx + 1));
            return;
          }

          audio.onplaying = null;
          audio.onended = null;
          audio.onerror = null;

          if (audio.dataset.prefetchedChunk !== chunkText || !audio.src) {
            audio.src = buildGoogleTtsUrl(chunkText);
            audio.dataset.prefetchedChunk = chunkText;
          } else {
            try {
              audio.currentTime = 0;
            } catch {
              // ignore
            }
          }

          // Distinct vocal tone/pacing between Jelena and Milan in Duo mode
          const speakerRateFactor =
            chunkItem.speaker === 'milan' ? 0.93 : chunkItem.speaker === 'jelena' ? 1.04 : 1.0;
          try {
            (audio as any).preservesPitch = chunkItem.speaker === 'solo';
            (audio as any).mozPreservesPitch = chunkItem.speaker === 'solo';
            (audio as any).webkitPreservesPitch = chunkItem.speaker === 'solo';
          } catch {
            // ignore
          }
          audio.playbackRate = Math.max(0.75, Math.min(1.75, rateRef.current * speakerRateFactor));
          audio.muted = isMutedRef.current;
          audio.volume = isMutedRef.current ? 0 : 1;
          ttsAudioRef.current = audio;

          // Immediately pre-buffer the NEXT sentence in the alternate audio element so there is 0s gap on transition!
          if (idx + 1 < chunks.length) {
            prefetchChunkIntoAudio(nextAudio, chunks[idx + 1]);
          }

          let fallbackTriggered = false;
          const clearWatchdog = () => {
            if (ttsWatchdogTimeoutRef.current) {
              window.clearTimeout(ttsWatchdogTimeoutRef.current);
              ttsWatchdogTimeoutRef.current = null;
            }
          };
          const triggerFallback = () => {
            clearWatchdog();
            if (fallbackTriggered || sessionId !== playbackSessionIdRef.current) return;
            fallbackTriggered = true;
            audio.dataset.prefetchedChunk = '';
            ttsAudioRef.current = null;
            speakChunkWithBrowserSynthesis(chunkItem, () => playChunkIndex(idx + 1));
          };

          ttsWatchdogTimeoutRef.current = window.setTimeout(() => {
            triggerFallback();
          }, 2800);

          audio.onplaying = () => {
            clearWatchdog();
            if (!hasFirstAudioStarted) {
              hasFirstAudioStarted = true;
              startWallTimeRef.current = performance.now() / 1000;
            }
          };

          audio.onended = () => {
            clearWatchdog();
            audio.dataset.prefetchedChunk = '';
            if (sessionId !== playbackSessionIdRef.current || !isPlayingRef.current) return;
            const nextSpeaker = chunks[idx + 1]?.speaker;
            if (nextSpeaker && nextSpeaker !== chunkItem.speaker && nextSpeaker !== 'solo') {
              speechTimeoutRef.current = window.setTimeout(() => {
                playChunkIndex(idx + 1);
              }, 180);
            } else {
              playChunkIndex(idx + 1);
            }
          };

          audio.onerror = () => {
            triggerFallback();
          };

          const launchPlay = () => {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                triggerFallback();
              });
            }
          };

          if (speakerChanged) {
            speechTimeoutRef.current = window.setTimeout(launchPlay, 140);
          } else {
            launchPlay();
          }
        } catch {
          speakChunkWithBrowserSynthesis(chunkItem, () => playChunkIndex(idx + 1));
        }
      };

      if (!isMutedRef.current && chunks.length > 0) {
        playChunkIndex(0);
      } else {
        hasFirstAudioStarted = true;
      }

      const tick = () => {
        if (sessionId !== playbackSessionIdRef.current || !isPlayingRef.current) return;
        if (!hasFirstAudioStarted) {
          startWallTimeRef.current = performance.now() / 1000;
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const nowSec = performance.now() / 1000;
        const elapsed = (nowSec - startWallTimeRef.current) * rateRef.current;
        const nextTime = Math.min(totalEstimatedDuration, startOffsetRef.current + elapsed);
        currentTimeRef.current = nextTime;

        if (nowSec - lastUiTimeUpdateRef.current >= 0.2 || nextTime >= totalEstimatedDuration) {
          lastUiTimeUpdateRef.current = nowSec;
          setCurrentTime(nextTime);
        }

        drawWaveform();

        if (nextTime < totalEstimatedDuration) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          startOffsetRef.current = 0;
          currentTimeRef.current = 0;
          setCurrentTime(0);
          stopCurrentSource();
          updatePlayState(false);
          trackAppEvent('audio_completed', title, { duration: totalEstimatedDuration });
          onAnalyticsEventRef.current?.();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [drawWaveform, fallbackText, playRadioChime, stopCurrentSource, title, updatePlayState]
  );

  const startPlaybackFrom = useCallback(
    async (offsetSeconds: number, withJingle = false) => {
      if (!bufferRef.current) {
        if (fallbackText) {
          await startWebSpeechFrom(offsetSeconds, withJingle);
        }
        return;
      }

      const sessionId = ++playbackSessionIdRef.current;
      const ctx = await ensureAudioContext();
      stopCurrentSource();

      if (withJingle) {
        playRadioChime();
      }

      const totalDur = bufferRef.current.duration;
      durationRef.current = totalDur;
      const clampedOffset = Math.max(0, Math.min(offsetSeconds, totalDur));
      startOffsetRef.current = clampedOffset;
      startWallTimeRef.current = performance.now() / 1000;
      currentTimeRef.current = clampedOffset;
      setCurrentTime(clampedOffset);

      const source = ctx.createBufferSource();
      source.buffer = bufferRef.current;
      source.playbackRate.value = rateRef.current;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;

      const gainNode = ctx.createGain();
      gainNode.gain.value = isMutedRef.current ? 0 : 1;

      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      sourceRef.current = source;
      analyserRef.current = analyser;
      gainNodeRef.current = gainNode;

      source.onended = () => {
        if (sessionId === playbackSessionIdRef.current && isPlayingRef.current) {
          startOffsetRef.current = 0;
          currentTimeRef.current = 0;
          setCurrentTime(0);
          updatePlayState(false);
          trackAppEvent('audio_completed', title, {
            duration: bufferRef.current?.duration || 0,
          });
          onAnalyticsEventRef.current?.();
        }
      };

      source.start(0, clampedOffset);
      updatePlayState(true);

      const tick = () => {
        if (
          sessionId !== playbackSessionIdRef.current ||
          !isPlayingRef.current ||
          !bufferRef.current
        ) {
          return;
        }
        const nowSec = performance.now() / 1000;
        const elapsed = (nowSec - startWallTimeRef.current) * rateRef.current;
        const nextTime = Math.min(bufferRef.current.duration, startOffsetRef.current + elapsed);
        currentTimeRef.current = nextTime;

        if (nowSec - lastUiTimeUpdateRef.current >= 0.2 || nextTime >= bufferRef.current.duration) {
          lastUiTimeUpdateRef.current = nowSec;
          setCurrentTime(nextTime);
        }

        drawWaveform();
        if (nextTime < bufferRef.current.duration) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [drawWaveform, fallbackText, playRadioChime, startWebSpeechFrom, stopCurrentSource, title, updatePlayState]
  );

  // Initialize duration/buffer ONLY when actual content or explicit autoPlayTrigger changes
  useEffect(() => {
    let cancelled = false;
    playbackSessionIdRef.current += 1;
    stopCurrentSource();
    updatePlayState(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    startOffsetRef.current = 0;

    const shouldStartNow = Boolean(autoPlay && autoPlayTrigger > 0);

    if (!audioData) {
      bufferRef.current = null;
      if (fallbackText) {
        const est = Math.max(15, Math.round(fallbackText.length / 13.5));
        durationRef.current = est;
        setDuration(est);
        drawWaveform();
        if (shouldStartNow) {
          startWebSpeechFrom(0, true);
        }
      } else {
        durationRef.current = 0;
        setDuration(0);
      }
      return () => {
        cancelled = true;
        stopCurrentSource();
      };
    }

    const loadAudio = async () => {
      try {
        const ctx = await ensureAudioContext();
        const bytes = decodeBase64(audioData);
        const decoded = await decodeAudioData(bytes, ctx);
        if (cancelled) return;
        bufferRef.current = decoded;
        durationRef.current = decoded.duration;
        setDuration(decoded.duration);
        drawWaveform();
        if (shouldStartNow) {
          await startPlaybackFrom(0, true);
        }
      } catch (err) {
        console.error('Failed to decode audio buffer, falling back to speech:', err);
        bufferRef.current = null;
        if (fallbackText && !cancelled) {
          const est = Math.max(15, Math.round(fallbackText.length / 13.5));
          durationRef.current = est;
          setDuration(est);
          drawWaveform();
          if (shouldStartNow) {
            await startWebSpeechFrom(0, true);
          }
        }
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      stopCurrentSource();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioData, fallbackText, title, autoPlayTrigger]);

  useEffect(() => {
    if (!isPlaying) {
      drawWaveform();
    }
  }, [isPlaying, currentTime, duration, drawWaveform]);

  const handleTogglePlay = useCallback(async () => {
    if (!hasPlayableContent) return;

    if (isPlayingRef.current) {
      playbackSessionIdRef.current += 1;
      const nowSec = performance.now() / 1000;
      const elapsed = (nowSec - startWallTimeRef.current) * rateRef.current;
      const savedOffset = Math.min(
        durationRef.current || duration,
        startOffsetRef.current + elapsed
      );
      startOffsetRef.current = savedOffset;
      currentTimeRef.current = savedOffset;
      setCurrentTime(savedOffset);
      stopCurrentSource();
      updatePlayState(false);
      trackAppEvent('audio_play_toggled', 'Pauzirano', { playing: false });
      onAnalyticsEventRef.current?.();
    } else {
      const totalDur = durationRef.current || duration;
      const nextStart =
        startOffsetRef.current >= totalDur - 0.5 ? 0 : startOffsetRef.current;
      await startPlaybackFrom(nextStart, false);
      trackAppEvent('audio_play_toggled', 'Pušteno', { playing: true });
      onAnalyticsEventRef.current?.();
    }
  }, [duration, hasPlayableContent, startPlaybackFrom, stopCurrentSource, updatePlayState]);

  // External toggle play/pause trigger (e.g., from Auto-Dock overlay or top mini-banner)
  useEffect(() => {
    if (externalTogglePlaySeq > 0) {
      handleTogglePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTogglePlaySeq]);

  // External pause trigger (e.g., when urgent <500m Audio-bikon interrupts main speech)
  useEffect(() => {
    if (externalPauseSeq > 0 && isPlayingRef.current) {
      handleTogglePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPauseSeq]);

  // External resume trigger (e.g., after urgent <500m Audio-bikon finishes speaking)
  useEffect(() => {
    if (externalResumeSeq > 0 && !isPlayingRef.current && hasPlayableContent) {
      handleTogglePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalResumeSeq]);

  // Close AudioContext on component unmount to prevent browser AudioContext leaks
  useEffect(() => {
    return () => {
      playbackSessionIdRef.current += 1;
      stopCurrentSource();
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {
          // ignore
        }
        audioCtxRef.current = null;
      }
    };
  }, [stopCurrentSource]);

  const handleJumpToChapter = useCallback(
    async (index: number, source: 'click' | 'prev' | 'next' = 'click') => {
      const totalDur = durationRef.current || duration;
      if (!hasPlayableContent || chapters.length === 0 || totalDur <= 0) return;
      const clampedIndex = Math.max(0, Math.min(index, chapters.length - 1));
      const targetChapter = chapters[clampedIndex];
      const targetSeconds = targetChapter.startRatio * totalDur;
      startOffsetRef.current = targetSeconds;
      currentTimeRef.current = targetSeconds;
      setCurrentTime(targetSeconds);
      if (source === 'click') {
        trackAppEvent('chapter_jumped', targetChapter.category, {
          chapterId: targetChapter.id,
          category: targetChapter.category,
          title: targetChapter.title,
        });
        onAnalyticsEventRef.current?.();
      }
      await startPlaybackFrom(targetSeconds, true);
    },
    [chapters, duration, hasPlayableContent, startPlaybackFrom]
  );

  const handlePrevChapter = useCallback(() => {
    if (chapters.length === 0) return;
    const prevIdx = Math.max(0, activeChapterIndex - 1);
    handleJumpToChapter(prevIdx, 'prev');
  }, [activeChapterIndex, chapters.length, handleJumpToChapter]);

  const handleNextChapter = useCallback(() => {
    if (chapters.length === 0) return;
    const skipped = chapters[activeChapterIndex];
    if (skipped) {
      trackAppEvent('chapter_skipped', skipped.category, {
        chapterId: skipped.id,
        category: skipped.category,
        title: skipped.title,
      });
      onAnalyticsEventRef.current?.();
    }
    const nextIdx =
      activeChapterIndex >= chapters.length - 1 ? 0 : activeChapterIndex + 1;
    handleJumpToChapter(nextIdx, 'next');
  }, [activeChapterIndex, chapters, handleJumpToChapter]);

  // External skip-to-next chapter trigger (e.g., from DriveModeView "Sledeća vest" button)
  useEffect(() => {
    if (externalNextSeq > 0) {
      handleNextChapter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalNextSeq]);

  // Wire Car Bluetooth / Steering Wheel Controls via MediaSession API
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: activeChapter ? activeChapter.title : title,
      artist:
        hostFormat === 'duo'
          ? 'Commute Companion · Radio Duo (Jelena & Milan)'
          : 'Commute Companion · Solo Spiker',
      album: title,
    });

    navigator.mediaSession.setActionHandler('play', () => {
      if (!isPlayingRef.current) handleTogglePlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (isPlayingRef.current) handleTogglePlay();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      handlePrevChapter();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      handleNextChapter();
    });

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {
        // ignore
      }
    };
  }, [activeChapter, title, hostFormat, handleTogglePlay, handlePrevChapter, handleNextChapter]);

  const handleReplay = async () => {
    if (!hasPlayableContent) return;
    startOffsetRef.current = 0;
    currentTimeRef.current = 0;
    setCurrentTime(0);
    await startPlaybackFrom(0, true);
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    currentTimeRef.current = newTime;
    setCurrentTime(newTime);
    startOffsetRef.current = newTime;
    if (isPlayingRef.current) {
      await startPlaybackFrom(newTime, false);
    } else {
      drawWaveform();
    }
  };

  const handleCycleRate = () => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    const prevRate = rateRef.current;
    setPlaybackRate(nextRate);
    rateRef.current = nextRate;
    trackAppEvent('playback_rate_changed', `${nextRate}x`, { rate: `${nextRate}x` });
    onAnalyticsEventRef.current?.();

    if (isPlayingRef.current) {
      const nowSec = performance.now() / 1000;
      const elapsed = (nowSec - startWallTimeRef.current) * prevRate;
      const totalDur = durationRef.current || duration;
      const updatedOffset = Math.min(totalDur, startOffsetRef.current + elapsed);
      startOffsetRef.current = updatedOffset;
      startWallTimeRef.current = nowSec;
      currentTimeRef.current = updatedOffset;

      if (sourceRef.current) {
        sourceRef.current.playbackRate.value = nextRate;
      } else if (ttsAudioRef.current) {
        ttsAudioRef.current.playbackRate = nextRate;
      } else if (isUsingWebSpeechRef.current) {
        startWebSpeechFrom(updatedOffset, false);
      }
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMutedRef.current;
    isMutedRef.current = nextMute;
    setIsMuted(nextMute);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextMute ? 0 : 1;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.muted = nextMute;
    }
    if (nextMute) {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
    } else if (isPlayingRef.current && isUsingWebSpeechRef.current && !ttsAudioRef.current) {
      startWebSpeechFrom(currentTimeRef.current, false);
    }
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md space-y-5">
      {isExpandedClip && onReturnToMainBriefing && (
        <div className="px-4 py-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-indigo-200 font-medium">
            Slušate prošireni blok / pojedinačni prilog van glavnog toka
          </div>
          <button
            type="button"
            onClick={onReturnToMainBriefing}
            className="min-h-[34px] px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Vrati na glavni brifing</span>
          </button>
        </div>
      )}

      {/* Compact Waveform Visualizer & Active Chapter Header */}
      <div className="relative bg-slate-950/70 border border-slate-800/80 rounded-2xl px-3.5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <span className="font-semibold text-slate-200 truncate">
              {activeChapter ? activeChapter.title : title}
            </span>
            {activeChapter && (
              <span className="shrink-0 text-[11px] text-indigo-400">
                · {activeChapter.category}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleRadioMix && (
              <button
                type="button"
                onClick={onToggleRadioMix}
                className={`h-7 px-2 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                  radioMixEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Uključi/isključi kratki radio-džingl prelaz između poglavlja"
              >
                <Music className="w-3 h-3" />
                <span>{radioMixEnabled ? 'Džingl' : 'Džingl OFF'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCycleRate}
              className="h-7 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-semibold tabular-nums flex items-center gap-1 transition-colors"
              title="Promeni brzinu reprodukcije"
            >
              <FastForward className="w-3 h-3 text-indigo-400" />
              <span>{playbackRate}x</span>
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center transition-colors"
              title={isMuted ? 'Uključi zvuk' : 'Isključi zvuk'}
              aria-label={isMuted ? 'Uključi zvuk' : 'Isključi zvuk'}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-slate-300" />
              )}
            </button>
          </div>
        </div>

        <canvas ref={canvasRef} width={560} height={36} className="w-full h-9 block" />

        {!hasPlayableContent && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            Audio zapis se priprema ili trenutno nije dostupan
          </div>
        )}
      </div>

      {/* Progress Scrubber */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            disabled={!hasPlayableContent || duration === 0}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-40"
            aria-label="Pozicija u audio izveštaju"
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>
            Poglavlje {chapters.length > 0 ? `${activeChapterIndex + 1}/${chapters.length}` : '1/1'} ·{' '}
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Ergonomic Primary Transport Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handlePrevChapter}
          disabled={!hasPlayableContent || chapters.length <= 1 || activeChapterIndex === 0}
          className="min-h-[48px] min-w-[48px] px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap shrink-0"
          title="Prethodno poglavlje"
        >
          <SkipBack className="w-4 h-4" />
          <span className="hidden sm:inline">Prethodno</span>
        </button>

        <button
          type="button"
          onClick={handleTogglePlay}
          disabled={!hasPlayableContent}
          className="min-h-[52px] px-7 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-600/25 transition-transform active:scale-95 whitespace-nowrap shrink-0"
        >
          {isPlaying ? (
            <>
              <Pause className="w-5 h-5 fill-current" />
              <span>Pauziraj</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>{currentTime > 0 ? 'Nastavi' : 'Pusti brifing'}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleNextChapter}
          disabled={!hasPlayableContent || chapters.length <= 1 || activeChapterIndex >= chapters.length - 1}
          className="min-h-[48px] min-w-[48px] px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap shrink-0"
          title="Sledeće poglavlje"
        >
          <span className="hidden sm:inline">Sledeće</span>
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleReplay}
          disabled={!hasPlayableContent}
          className="min-h-[48px] px-4 py-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap shrink-0"
          title="Ponovi od početka"
        >
          <RotateCcw className="w-4 h-4 text-slate-400" />
          <span>Ispočetka</span>
        </button>
      </div>
    </div>
  );
};
