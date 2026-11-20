import { Film } from "lucide-react";
import { useEffect, useState } from "react";
import { LANGUAGE_NAME_BY_CODE } from "../data/presets";

interface MoviePosterProps {
  posterUrl: string | null;
  title: string;
  originalTitle?: string | null;
  languageCode?: string;
  releaseYear?: number | null;
  genres?: string[];
  className?: string;
}

export function MoviePoster({
  posterUrl,
  title,
  originalTitle,
  languageCode = "en",
  releaseYear,
  genres = [],
  className = "",
}: MoviePosterProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [posterUrl]);

  const showFallback = !posterUrl || failed;
  const langLabel =
    LANGUAGE_NAME_BY_CODE[languageCode] ?? languageCode.toUpperCase();

  return (
    <div
      className={`relative overflow-hidden bg-[#181818] select-none ${className}`}
    >
      {!showFallback ? (
        <img
          src={posterUrl}
          alt={`${title} poster`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="relative h-full w-full bg-gradient-to-br from-[#262626] via-[#181818] to-[#111111] border border-white/10 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-neutral-300">
            <span className="inline-flex items-center gap-1 rounded bg-[#E50914]/20 border border-[#E50914]/40 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <Film className="h-3 w-3 text-[#E50914]" />
              {langLabel}
            </span>
            {releaseYear && (
              <span className="tabular-nums font-mono text-neutral-400">
                {releaseYear}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <p className="font-display text-sm font-bold text-white leading-snug line-clamp-3">
              {title}
            </p>
            {originalTitle && originalTitle !== title && (
              <p className="text-[11px] font-medium text-neutral-300 line-clamp-1">
                {originalTitle}
              </p>
            )}
            {genres.length > 0 && (
              <p className="text-[10px] text-neutral-400 line-clamp-1">
                {genres.slice(0, 2).join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
