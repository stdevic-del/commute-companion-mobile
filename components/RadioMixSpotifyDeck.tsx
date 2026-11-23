import React, { useState } from 'react';
import { Music, Disc3, Check, ExternalLink, Play } from 'lucide-react';

interface RadioMixSpotifyDeckProps {
  radioMixEnabled: boolean;
  spotifyUrl?: string;
  onChangeSpotifyUrl: (url: string) => void;
}

const CURATED_SPOTIFY_PRESETS = [
  {
    id: 'daily-drive',
    label: 'Daily Drive Mix',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator&theme=0',
    appUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
  },
  {
    id: 'morning-commute',
    label: 'Jutarnja Vožnja · Indie & Pop',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2sUQwD7tbmL?utm_source=generator&theme=0',
    appUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX2sUQwD7tbmL',
  },
  {
    id: 'synthwave-drive',
    label: 'Night Drive Synthwave',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator&theme=0',
    appUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXdLEN7aqioXM',
  },
  {
    id: 'lofi-traffic',
    label: 'Lo-Fi Chill u Gužvi',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0',
    appUrl: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn',
  },
];

function toSpotifyEmbedUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return CURATED_SPOTIFY_PRESETS[0].embedUrl;
  if (trimmed.includes('open.spotify.com/embed/')) return trimmed;

  const match = trimmed.match(/open\.spotify\.com\/(playlist|album|track|show|episode)\/([a-zA-Z0-9]+)/);
  if (match) {
    return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
  }
  return CURATED_SPOTIFY_PRESETS[0].embedUrl;
}

function toSpotifyDirectUrl(embedUrl: string): string {
  return embedUrl.replace('/embed/', '/').split('?')[0];
}

export const RadioMixSpotifyDeck: React.FC<RadioMixSpotifyDeckProps> = ({
  radioMixEnabled,
  spotifyUrl,
  onChangeSpotifyUrl,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [isEmbedLoaded, setIsEmbedLoaded] = useState(false);
  const activeEmbedUrl = spotifyUrl || CURATED_SPOTIFY_PRESETS[0].embedUrl;
  const activeDirectUrl = toSpotifyDirectUrl(activeEmbedUrl);

  const handleApplyCustomSpotify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    onChangeSpotifyUrl(toSpotifyEmbedUrl(customInput));
    setIsEmbedLoaded(true);
    setCustomInput('');
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Music className="w-3.5 h-3.5 text-emerald-400" />
            <span>Spotify Pult za Vožnju</span>
            <span aria-hidden="true">·</span>
            <span>
              {radioMixEnabled
                ? 'Radio-Miks džinglovi su aktivni u plejeru'
                : 'Radio-Miks džinglovi su isključeni u plejeru'}
            </span>
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-1">
            Muzička plejlista između vesti
          </h3>
        </div>
      </div>

      {/* Preset Spotify Playlists */}
      <div className="flex flex-wrap gap-2">
        {CURATED_SPOTIFY_PRESETS.map((preset) => {
          const isSelected = activeEmbedUrl === preset.embedUrl;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChangeSpotifyUrl(preset.embedUrl)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isSelected ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Disc3 className="w-3.5 h-3.5" />}
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom Spotify URL Input */}
      <form onSubmit={handleApplyCustomSpotify} className="flex items-center gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Nalepite link svoje Spotify plejliste (https://open.spotify.com/playlist/...)..."
          className="flex-1 min-h-[42px] bg-slate-950/90 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
        />
        <button
          type="submit"
          disabled={!customInput.trim()}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
        >
          Učitaj Spotify
        </button>
      </form>

      {/* Click-to-Load Spotify Player (prevents unsolicited Android Chrome DRM permission popup while scrolling) */}
      {isEmbedLoaded ? (
        <div className="rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950">
          <iframe
            title="Spotify Commute Player"
            src={activeEmbedUrl}
            width="100%"
            height="152"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block border-0"
          />
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            Spotify plejer se učitava na zahtev kako pretraživač ne bi prekidao vožnju DRM dijalogom.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEmbedLoaded(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Uključi Spotify ovde</span>
            </button>
            <a
              href={activeDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>Spotify App</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
