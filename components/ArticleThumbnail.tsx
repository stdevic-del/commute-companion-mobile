import React, { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react';

interface ArticleThumbnailProps {
  src?: string | null;
  alt: string;
  sourceName?: string;
}

function getSourceInitials(sourceName?: string): string {
  const clean = (sourceName || '')
    .replace(/\s*\(\+\d+\s*medija\)/i, '')
    .replace(/\.[a-z]{2,3}$/i, '')
    .trim();
  if (!clean) return '';
  const words = clean.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return clean.slice(0, 3).toUpperCase();
}

/**
 * Prikazuje optimizovanu WebP sliku (wsrv.nl) ako postoji.
 * Ako je `src` null ili učitavanje ne uspe (`onError`), prikazuje diskretan placeholder kvadrat
 * istih dimenzija (sa suptilnom ikonicom novina i inicijalom medija) radi savršenog vertikalnog poravnanja naslova.
 */
export const ArticleThumbnail: React.FC<ArticleThumbnailProps> = ({
  src,
  alt,
  sourceName,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    const initials = getSourceInitials(sourceName);
    return (
      <div
        aria-hidden="true"
        className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-xl bg-slate-900/90 border border-slate-800/80 shrink-0 flex flex-col items-center justify-center gap-0.5 text-slate-500 select-none"
      >
        <Newspaper className="w-4 h-4 text-slate-600" />
        {initials && (
          <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            {initials}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-xl overflow-hidden bg-slate-800/70 border border-slate-700/60 shrink-0">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
};
