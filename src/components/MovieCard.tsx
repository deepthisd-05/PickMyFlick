import { Check, Info, Plus, RotateCcw, Star } from "lucide-react";
import { useState } from "react";
import { LANGUAGE_NAME_BY_CODE } from "../data/presets";
import { getStreamingPlatforms } from "../data/streamingPlatforms";
import type { Movie } from "../types";
import { MoviePoster } from "./MoviePoster";

interface MovieCardProps {
  movie: Movie;
  onSelectMovie: (movie: Movie) => void;
  userRating?: number;
  userMoodTag?: string | null;
  userNote?: string | null;
  matchLabel?: string | null;
  rankIndex?: number;
  whyText?: string | null;
  onRate?: (movielensId: number, rating: number) => void;
  onDeleteRating?: (movielensId: number) => void;
  inWatchlist?: boolean;
  onToggleWatchlist?: (movielensId: number) => void;
  variant?: "carousel" | "grid";
}

export function MovieCard({
  movie,
  onSelectMovie,
  userRating,
  userMoodTag,
  userNote,
  matchLabel,
  rankIndex,
  onRate,
  onDeleteRating,
  inWatchlist,
  onToggleWatchlist,
  variant = "grid",
}: MovieCardProps) {
  const [hoverStar, setHoverStar] = useState<number>(0);
  const genreLine = movie.genres.slice(0, 2).join(" · ") || "Feature Film";
  const langCode = movie.language_code || "en";
  const langName = LANGUAGE_NAME_BY_CODE[langCode] ?? langCode.toUpperCase();
  const streamingPlatforms = getStreamingPlatforms(movie);
  const displayRating =
    movie.vote_average != null
      ? movie.vote_average.toFixed(1)
      : movie.ml_avg_rating
      ? (movie.ml_avg_rating * 2).toFixed(1)
      : null;

  const widthClass =
    variant === "carousel"
      ? "w-[164px] sm:w-[192px] md:w-[210px] shrink-0 snap-start"
      : "w-full";

  return (
    <article
      className={`group relative flex flex-col rounded-lg bg-[#181818] overflow-hidden border border-white/10 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-white/30 focus-within:border-white/40 ${widthClass}`}
    >
      {/* Poster Image Surface */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#141414]">
        <button
          type="button"
          onClick={() => onSelectMovie(movie)}
          aria-label={`Open details for ${movie.title}`}
          className="h-full w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
        >
          <MoviePoster
            posterUrl={movie.poster_url}
            title={movie.title}
            originalTitle={movie.original_title}
            languageCode={langCode}
            releaseYear={movie.release_year}
            genres={movie.genres}
            className="h-full w-full"
          />
        </button>

        {/* Subtle bottom vignette on hover */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150" />

        {/* Subtle rank / match overlay */}
        {(rankIndex != null || matchLabel) && (
          <div className="pointer-events-none absolute top-2 left-2 right-2 flex items-center justify-between gap-1 text-[11px] font-mono font-semibold">
            {rankIndex != null ? (
              <span className="rounded bg-black/85 border border-white/15 px-1.5 py-0.5 text-white tabular-nums">
                #{rankIndex}
              </span>
            ) : (
              <span />
            )}
            {matchLabel && (
              <span className="rounded bg-[#E50914] px-1.5 py-0.5 text-white tabular-nums shadow">
                {matchLabel}
              </span>
            )}
          </div>
        )}

        {/* Quick hover/focus action strip */}
        <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-1.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150">
          {onToggleWatchlist && movie.movielens_id != null ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatchlist(movie.movielens_id!);
              }}
              title={inWatchlist ? "Remove from My List" : "Add to My List"}
              aria-label={inWatchlist ? "Remove from My List" : "Add to My List"}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-colors cursor-pointer ${
                inWatchlist
                  ? "bg-[#E50914] text-white"
                  : "bg-black/85 text-white border border-white/30 hover:border-white"
              }`}
            >
              {inWatchlist ? (
                <Check className="h-3 w-3" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              <span>My List</span>
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={() => onSelectMovie(movie)}
            title="More Info"
            aria-label={`More info for ${movie.title}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/85 border border-white/30 text-white hover:border-white hover:bg-black shadow-sm transition-colors cursor-pointer"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-3 gap-2">
        <div>
          <button
            type="button"
            onClick={() => onSelectMovie(movie)}
            className="text-left font-display text-sm font-bold text-white line-clamp-1 hover:text-neutral-300 transition-colors cursor-pointer"
            title={movie.title}
          >
            {movie.title}
          </button>

          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400 truncate">
            <span className="font-semibold text-neutral-200 shrink-0">
              {langName}
            </span>
            <span aria-hidden="true">·</span>
            {movie.release_year && (
              <>
                <span className="tabular-nums">{movie.release_year}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="truncate">{genreLine}</span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
            <span className="truncate">
              {movie.is_dubbed
                ? "Dubbed"
                : movie.available_dubs && movie.available_dubs.length > 0
                ? `Original + ${movie.available_dubs.length} dubs`
                : "Original"}
            </span>
            {displayRating && (
              <span className="tabular-nums font-semibold text-emerald-400 shrink-0">
                ★ {displayRating}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {streamingPlatforms.slice(0, 2).map((platform) => (
              <span
                key={platform.name}
                className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#141414] px-1.5 py-0.5 text-[10px] font-medium text-neutral-300"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${platform.dotClass}`}
                  aria-hidden="true"
                />
                <span className="truncate">{platform.name}</span>
              </span>
            ))}
          </div>
        </div>

        {onRate && movie.movielens_id != null && (
          <div className="pt-2 border-t border-white/10 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <div
                className="flex items-center gap-0.5"
                onMouseLeave={() => setHoverStar(0)}
                aria-label={`Rate ${movie.title}`}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoverStar || userRating || 0) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverStar(star)}
                      onClick={() => onRate(movie.movielens_id!, star)}
                      aria-label={`Rate ${star} stars`}
                      className="p-0.5 cursor-pointer transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          active
                            ? "fill-amber-400 text-amber-400"
                            : "text-neutral-600 hover:text-neutral-400"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {userRating ? (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] tabular-nums font-semibold text-white">
                    {userRating}/5
                  </span>
                  {onDeleteRating && (
                    <button
                      type="button"
                      onClick={() => onDeleteRating(movie.movielens_id!)}
                      title="Remove rating"
                      aria-label={`Remove rating for ${movie.title}`}
                      className="p-0.5 rounded text-neutral-500 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-neutral-500">Rate</span>
              )}
            </div>

            {(userMoodTag || userNote) && (
              <p className="text-[11px] text-neutral-300 truncate">
                {userMoodTag ? `#${userMoodTag}` : ""}
                {userMoodTag && userNote ? " · " : ""}
                {userNote ?? ""}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
