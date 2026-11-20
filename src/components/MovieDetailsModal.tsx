import {
  Check,
  Clock,
  Film,
  Globe,
  Loader2,
  Plus,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LANGUAGE_NAME_BY_CODE, MOOD_TAGS } from "../data/presets";
import { getStreamingPlatforms } from "../data/streamingPlatforms";
import { api } from "../services/api";
import type { Movie } from "../types";
import { MoviePoster } from "./MoviePoster";

interface MovieDetailsModalProps {
  movie: Movie | null;
  onClose: () => void;
  userRating?: number;
  userNote?: string | null;
  userMoodTag?: string | null;
  inWatchlist?: boolean;
  isAuthenticated: boolean;
  onRate: (
    movielensId: number,
    rating: number,
    options?: { note?: string | null; moodTag?: string | null }
  ) => Promise<void>;
  onDeleteRating: (movielensId: number) => Promise<void>;
  onToggleWatchlist: (movielensId: number) => Promise<void>;
  onSelectSimilar: (movie: Movie) => void;
  onRequireAuth: () => void;
}

export function MovieDetailsModal({
  movie,
  onClose,
  userRating,
  userNote = null,
  userMoodTag = null,
  inWatchlist,
  isAuthenticated,
  onRate,
  onDeleteRating,
  onToggleWatchlist,
  onSelectSimilar,
  onRequireAuth,
}: MovieDetailsModalProps) {
  const [detailed, setDetailed] = useState<Movie | null>(null);
  const [similar, setSimilar] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [noteDraft, setNoteDraft] = useState(userNote ?? "");
  const [moodDraft, setMoodDraft] = useState<string | null>(userMoodTag ?? null);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setNoteDraft(userNote ?? "");
    setMoodDraft(userMoodTag ?? null);
    setNoteSaved(false);
  }, [movie?.movielens_id, userNote, userMoodTag]);

  useEffect(() => {
    if (!movie) return;
    setDetailed(movie);
    setSimilar([]);
    if (!movie.movielens_id) return;

    if (isAuthenticated) {
      void api.trackInteraction(movie.movielens_id, "view", 0.5).catch(() => {});
    }

    let cancelled = false;
    setLoading(true);
    api
      .movieDetails(movie.movielens_id)
      .then((res) => {
        if (!cancelled) {
          setDetailed(res.movie);
          setSimilar(res.similar);
        }
      })
      .catch(() => {
        // Keep initial movie data on transient fetch error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [movie, isAuthenticated]);

  if (!movie) return null;
  const activeMovie = detailed ?? movie;
  const langCode = activeMovie.language_code || "en";
  const langName = LANGUAGE_NAME_BY_CODE[langCode] ?? langCode.toUpperCase();
  const streamingPlatforms = getStreamingPlatforms(activeMovie);
  const isLiked = (userRating ?? 0) >= 4;
  const isDisliked = userRating != null && userRating <= 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${activeMovie.title} details`}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl border border-white/15 bg-[#181818] text-neutral-100 shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close movie details"
          className="absolute right-4 top-4 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/75 border border-white/25 text-white hover:bg-black transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wide Top Backdrop Banner */}
        <div className="relative overflow-hidden border-b border-white/10 bg-[#141414]">
          {(activeMovie.backdrop_url || activeMovie.poster_url) && (
            <img
              src={activeMovie.backdrop_url || activeMovie.poster_url || ""}
              alt={`${activeMovie.title} backdrop`}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover object-center opacity-30 blur-[2px] scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/75 to-black/40" />

          <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-32 sm:w-40 aspect-[2/3] shrink-0 rounded-lg overflow-hidden border border-white/20 shadow-2xl bg-[#141414]">
              <MoviePoster
                posterUrl={activeMovie.poster_url}
                title={activeMovie.title}
                originalTitle={activeMovie.original_title}
                languageCode={langCode}
                releaseYear={activeMovie.release_year}
                genres={activeMovie.genres}
                className="h-full w-full"
              />
            </div>

            <div className="flex-1 min-w-0 space-y-3 pr-8">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1 rounded bg-[#E50914] px-2 py-0.5 text-white">
                  <Globe className="h-3 w-3" />
                  {langName} {activeMovie.is_dubbed ? "Dubbed" : "Original"}
                </span>
                {activeMovie.available_dubs && activeMovie.available_dubs.length > 0 && (
                  <span className="rounded bg-white/10 border border-white/15 px-2 py-0.5 text-neutral-200">
                    Dubs:{" "}
                    {activeMovie.available_dubs
                      .map((d) => LANGUAGE_NAME_BY_CODE[d] ?? d.toUpperCase())
                      .join(", ")}
                  </span>
                )}
                <span className="rounded bg-black/50 border border-white/15 px-2 py-0.5 text-neutral-300">
                  {activeMovie.item_idx >= 0
                    ? "Mult-VAE Catalog"
                    : "Cold-Start Metadata Strategy"}
                </span>
              </div>

              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {activeMovie.title}
                </h2>
                {activeMovie.original_title &&
                  activeMovie.original_title !== activeMovie.title && (
                    <p className="mt-0.5 text-sm font-medium text-neutral-300">
                      {activeMovie.original_title}
                    </p>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-neutral-300">
                {activeMovie.vote_average != null && (
                  <span className="font-bold text-emerald-400 tabular-nums">
                    ★ {activeMovie.vote_average.toFixed(1)}/10
                  </span>
                )}
                {activeMovie.release_year && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums font-medium">
                      {activeMovie.release_year}
                    </span>
                  </>
                )}
                {activeMovie.runtime && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" />
                      {activeMovie.runtime} min
                    </span>
                  </>
                )}
                {activeMovie.genres.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{activeMovie.genres.join(", ")}</span>
                  </>
                )}
              </div>

              {/* Action Bar */}
              {activeMovie.movielens_id != null && (
                <div className="pt-1 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        onRequireAuth();
                        return;
                      }
                      void onToggleWatchlist(activeMovie.movielens_id!);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      inWatchlist
                        ? "bg-[#E50914] text-white hover:bg-[#F40612]"
                        : "bg-white text-black hover:bg-neutral-200"
                    }`}
                  >
                    {inWatchlist ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span>{inWatchlist ? "In My List" : "My List"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isLiked) {
                        void onDeleteRating(activeMovie.movielens_id!);
                      } else {
                        void onRate(activeMovie.movielens_id!, 5, {
                          note: noteDraft.trim() || null,
                          moodTag: moodDraft,
                        });
                      }
                    }}
                    aria-label="Like movie (5 stars)"
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors cursor-pointer ${
                      isLiked
                        ? "border-white bg-white text-black"
                        : "border-white/30 bg-black/50 text-white hover:border-white"
                    }`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isDisliked) {
                        void onDeleteRating(activeMovie.movielens_id!);
                      } else {
                        void onRate(activeMovie.movielens_id!, 1, {
                          note: noteDraft.trim() || null,
                          moodTag: moodDraft,
                        });
                      }
                    }}
                    aria-label="Dislike movie (1 star)"
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors cursor-pointer ${
                      isDisliked
                        ? "border-[#E50914] bg-[#E50914] text-white"
                        : "border-white/30 bg-black/50 text-white hover:border-white"
                    }`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>

                  <div
                    className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/60 px-3 py-1.5"
                    onMouseLeave={() => setHoverStar(0)}
                  >
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = (hoverStar || userRating || 0) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverStar(star)}
                          onClick={() =>
                            void onRate(activeMovie.movielens_id!, star, {
                              note: noteDraft.trim() || null,
                              moodTag: moodDraft,
                            })
                          }
                          aria-label={`Rate ${star} stars`}
                          className="p-0.5 cursor-pointer transition-transform hover:scale-110"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              active
                                ? "fill-amber-400 text-amber-400"
                                : "text-neutral-500 hover:text-neutral-300"
                            }`}
                          />
                        </button>
                      );
                    })}
                    {userRating && (
                      <button
                        type="button"
                        onClick={() => void onDeleteRating(activeMovie.movielens_id!)}
                        title="Clear rating"
                        aria-label="Clear rating"
                        className="ml-1 text-neutral-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details Body */}
        <div className="p-6 sm:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-8 space-y-4">
              <p className="text-sm sm:text-base text-neutral-200 leading-relaxed">
                {activeMovie.overview ||
                  "Synopsis loads from verified TMDB / Wikipedia film records."}
              </p>

              {activeMovie.movielens_id != null && (
                <div className="rounded-xl border border-white/10 bg-[#141414] p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-400 mr-1">
                      Mood tag:
                    </span>
                    {MOOD_TAGS.map((tag) => {
                      const selected = moodDraft === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setMoodDraft((cur) => (cur === tag ? null : tag))
                          }
                          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                            selected
                              ? "bg-[#E50914] text-white"
                              : "bg-[#1f1f1f] border border-white/10 text-neutral-300 hover:border-white/30"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={180}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a short review note (e.g., great plot twist, emotional)..."
                      className="flex-1 rounded-md border border-white/15 bg-[#181818] px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await onRate(
                          activeMovie.movielens_id!,
                          userRating ?? 4,
                          {
                            note: noteDraft.trim() || null,
                            moodTag: moodDraft,
                          }
                        );
                        setNoteSaved(true);
                        setTimeout(() => setNoteSaved(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#E50914] hover:bg-[#F40612] px-3.5 py-2 text-xs font-semibold text-white cursor-pointer shrink-0 transition-colors"
                    >
                      {noteSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <span>Save Note</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-4 space-y-2.5 text-xs text-neutral-300 rounded-xl border border-white/10 bg-[#141414] p-4 h-fit">
              {activeMovie.director && (
                <div>
                  <span className="font-semibold text-neutral-400">Director: </span>
                  <span className="text-white font-medium">
                    {activeMovie.director}
                  </span>
                </div>
              )}
              {activeMovie.cast && activeMovie.cast.length > 0 && (
                <div>
                  <span className="font-semibold text-neutral-400">Cast: </span>
                  <span className="text-neutral-200">
                    {activeMovie.cast.join(", ")}
                  </span>
                </div>
              )}
              <div>
                <span className="font-semibold text-neutral-400">Language: </span>
                <span className="text-white">{langName}</span>
              </div>
              {activeMovie.mood_tags && activeMovie.mood_tags.length > 0 && (
                <div>
                  <span className="font-semibold text-neutral-400">Mood Fit: </span>
                  <span className="text-neutral-200 font-medium">
                    {activeMovie.mood_tags.join(", ")}
                  </span>
                </div>
              )}
              <div>
                <span className="font-semibold text-neutral-400 block mb-1.5">
                  Available to Stream:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {streamingPlatforms.map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-[#181818] px-2 py-0.5 text-[11px] font-medium text-neutral-100"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${platform.dotClass}`}
                        aria-hidden="true"
                      />
                      <span>{platform.name}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Source: </span>
                <span className="text-neutral-200">{activeMovie.metadata_source}</span>
              </div>
            </div>
          </div>

          {activeMovie.movielens_id && activeMovie.item_idx >= 0 && (
            <div className="pt-6 border-t border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    More Like This
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Nearest titles by cosine similarity in the trained Mult-VAE decoder embedding space
                  </p>
                </div>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[#E50914]" />}
              </div>

              {similar.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {similar.map((sim) => (
                    <button
                      key={sim.movielens_id ?? sim.title}
                      type="button"
                      onClick={() => onSelectSimilar(sim)}
                      className="group flex flex-col text-left rounded-lg border border-white/10 bg-[#141414] overflow-hidden hover:border-white/30 transition-all cursor-pointer"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-[#181818]">
                        <MoviePoster
                          posterUrl={sim.poster_url}
                          title={sim.title}
                          languageCode={sim.language_code}
                          releaseYear={sim.release_year}
                          genres={sim.genres}
                          className="h-full w-full"
                        />
                        {sim.latent_similarity != null && (
                          <span className="absolute top-2 right-2 rounded bg-black/85 border border-white/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white tabular-nums">
                            {(sim.latent_similarity * 100).toFixed(0)}% match
                          </span>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <p className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                          {sim.title}
                        </p>
                        <p className="text-[11px] text-neutral-400 tabular-nums">
                          {sim.release_year ?? ""}
                          {sim.genres.length > 0
                            ? ` · ${sim.genres.slice(0, 2).join(", ")}`
                            : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                !loading && (
                  <p className="text-xs text-neutral-400 flex items-center gap-1.5">
                    <Film className="h-3.5 w-3.5" />
                    <span>No latent neighbors computed for this title.</span>
                  </p>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
