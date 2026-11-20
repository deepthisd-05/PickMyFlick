import {
  Loader2,
  Pencil,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MovieCard } from "../components/MovieCard";
import { MoviePoster } from "../components/MoviePoster";
import { LANGUAGE_OPTIONS, MOOD_TAGS } from "../data/presets";
import { api } from "../services/api";
import type { AuthUser, Movie, UserRating } from "../types";

interface RateMoviesProps {
  user: AuthUser | null;
  userRatings: UserRating[];
  ratingsMap: Map<number, number>;
  watchlistSet: Set<number>;
  onRate: (
    movielensId: number,
    rating: number,
    options?: { note?: string | null; moodTag?: string | null }
  ) => Promise<void>;
  onDeleteRating: (movielensId: number) => Promise<void>;
  onResetRatings: () => Promise<void>;
  onToggleWatchlist: (movielensId: number) => Promise<void>;
  onSelectMovie: (movie: Movie) => void;
  onRequireAuth: () => void;
}

export function RateMovies({
  user,
  userRatings,
  watchlistSet,
  onRate,
  onDeleteRating,
  onResetRatings,
  onToggleWatchlist,
  onSelectMovie,
  onRequireAuth,
}: RateMoviesProps) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [language, setLanguage] = useState("all");
  const [genres, setGenres] = useState<string[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Optional active mood tag & short review note applied on next card star click
  const [composerMood, setComposerMood] = useState<string | null>(null);
  const [composerNote, setComposerNote] = useState("");

  // Inline note/mood editing inside Rating History
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMood, setEditMood] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const ratingDetailsMap = useMemo(() => {
    const m = new Map<number, UserRating>();
    for (const r of userRatings) m.set(r.movielens_id, r);
    return m;
  }, [userRatings]);

  useEffect(() => {
    api.genres().then((res) => setGenres(res.genres.slice(0, 12).map((g) => g.name)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchMovies(query, genre, 18, offset, language)
        .then((res) => {
          if (!cancelled) {
            setMovies(res.movies);
            setTotal(res.total);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, genre, language, offset]);

  const handleRate = async (movielensId: number, rating: number) => {
    const hasComposerMeta = Boolean(composerMood) || Boolean(composerNote.trim());
    await onRate(
      movielensId,
      rating,
      hasComposerMeta
        ? {
            note: composerNote.trim() || undefined,
            moodTag: composerMood ?? undefined,
          }
        : undefined
    );
    setFeedbackBanner(
      user
        ? `Saved ${rating}/5 rating to your preference vector.`
        : `Saved ${rating}/5 rating to your guest preference vector.`
    );
    setTimeout(() => setFeedbackBanner(null), 3000);
  };

  const avgRating =
    userRatings.length > 0
      ? (
          userRatings.reduce((acc, r) => acc + r.rating, 0) / userRatings.length
        ).toFixed(2)
      : "0.00";

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Rate Movies
          </h1>
          <p className="mt-1 text-sm text-neutral-400 max-w-2xl">
            Rate movies with stars, optional mood tags, and short review notes to build your personal taste profile.
          </p>
        </div>
      </div>

      {!user && (
        <div className="rounded-xl border border-white/10 bg-[#181818] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Guest Mode Active — Rate movies right away or sign in to sync
            </h2>
            <p className="mt-1 text-sm text-neutral-300">
              Ratings, mood tags, and notes are saved locally and immediately power Personalized Recommendations. Sign in anytime to persist them in SQLite.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequireAuth}
            className="rounded-md bg-[#E50914] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F40612] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign In / Register
          </button>
        </div>
      )}

      {feedbackBanner && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 text-sm text-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <span>{feedbackBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Interactive Movie Browser */}
        <div className="lg:col-span-8 space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOffset(0);
                }}
                placeholder="Search English & regional titles, actors, directors..."
                className="w-full rounded-md border border-white/15 bg-[#181818] pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-neutral-400 shrink-0" />
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setOffset(0);
                }}
                aria-label="Filter by language"
                className="rounded-md border border-white/15 bg-[#181818] px-3 py-2 text-sm text-white focus:border-white/50 focus:outline-none"
              >
                <option value="all">All Languages</option>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <select
                value={genre}
                onChange={(e) => {
                  setGenre(e.target.value);
                  setOffset(0);
                }}
                aria-label="Filter by genre"
                className="rounded-md border border-white/15 bg-[#181818] px-3 py-2 text-sm text-white focus:border-white/50 focus:outline-none"
              >
                <option value="All">All Genres</option>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Quick Mood Tag & Note Composer */}
          <div className="rounded-xl border border-white/10 bg-[#181818] p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-neutral-300">
                Optional tag or short note attached when you click a card star:
              </span>
              {(composerMood || composerNote) && (
                <button
                  type="button"
                  onClick={() => {
                    setComposerMood(null);
                    setComposerNote("");
                  }}
                  className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                >
                  Clear tag/note
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {MOOD_TAGS.map((tag) => {
                const selected = composerMood === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setComposerMood((cur) => (cur === tag ? null : tag))
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? "bg-[#E50914] text-white"
                        : "bg-[#141414] text-neutral-300 border border-white/10 hover:border-white/25"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
              <input
                type="text"
                maxLength={140}
                value={composerNote}
                onChange={(e) => setComposerNote(e.target.value)}
                placeholder="Short review note (optional)..."
                className="flex-1 min-w-[200px] rounded-md border border-white/15 bg-[#141414] px-3 py-1 text-xs text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin text-[#E50914]" />
              <span>Loading movies...</span>
            </div>
          ) : movies.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#181818] p-10 text-center text-sm text-neutral-400">
              No movies found matching your search.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {movies.map((movie) => {
                  const detail = movie.movielens_id
                    ? ratingDetailsMap.get(movie.movielens_id)
                    : undefined;
                  return (
                    <MovieCard
                      key={movie.movielens_id ?? movie.title}
                      movie={movie}
                      onSelectMovie={onSelectMovie}
                      userRating={detail?.rating}
                      userMoodTag={detail?.mood_tag}
                      userNote={detail?.note}
                      onRate={handleRate}
                      onDeleteRating={onDeleteRating}
                      inWatchlist={
                        movie.movielens_id
                          ? watchlistSet.has(movie.movielens_id)
                          : false
                      }
                      onToggleWatchlist={onToggleWatchlist}
                    />
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 text-xs text-neutral-400">
                <span className="tabular-nums">
                  Showing {offset + 1}–{Math.min(offset + movies.length, total)} of{" "}
                  {total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => setOffset((o) => Math.max(0, o - 18))}
                    className="rounded-md border border-white/15 bg-[#181818] px-3 py-1.5 text-neutral-200 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={offset + 18 >= total}
                    onClick={() => setOffset((o) => o + 18)}
                    className="rounded-md border border-white/15 bg-[#181818] px-3 py-1.5 text-neutral-200 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: User Rating History */}
        <aside className="lg:col-span-4 rounded-xl border border-white/10 bg-[#181818] p-5 space-y-4 lg:sticky lg:top-20">
          <div className="flex items-start justify-between border-b border-white/10 pb-4 gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Your Rating History
              </h2>
              <p className="text-xs text-neutral-400">
                Active input vector for Mult-VAE
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xl font-bold text-white tabular-nums">
                {userRatings.length}
              </p>
              <p className="text-[11px] text-neutral-400 tabular-nums">
                Avg {avgRating}/5
              </p>
            </div>
          </div>

          {userRatings.length > 0 && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-neutral-400">
                Edit stars, notes, or reset vector
              </span>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="text-xs font-medium text-neutral-400 hover:text-rose-400 cursor-pointer"
                >
                  Reset All
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onResetRatings();
                      setConfirmReset(false);
                      setFeedbackBanner("Cleared all ratings from your preference vector.");
                    }}
                    className="rounded bg-[#E50914] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#F40612] cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="text-[11px] text-neutral-400 hover:text-neutral-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {userRatings.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm font-medium text-neutral-200">
                No movies rated yet
              </p>
              <p className="text-xs text-neutral-400">
                Tap any star on the movie cards to rate and review a movie.
              </p>
            </div>
          ) : (
            <div className="max-h-[540px] overflow-y-auto space-y-3 pr-1">
              {userRatings.map((item) => {
                const isEditing = editingId === item.movielens_id;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-white/10 bg-[#141414] p-2.5 space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => item.movie && onSelectMovie(item.movie)}
                        className="h-14 w-10 shrink-0 rounded overflow-hidden cursor-pointer"
                      >
                        <MoviePoster
                          posterUrl={item.movie?.poster_url ?? null}
                          title={item.movie?.title ?? `Movie #${item.movielens_id}`}
                          releaseYear={item.movie?.release_year}
                          className="h-full w-full"
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => item.movie && onSelectMovie(item.movie)}
                          className="block text-left text-sm font-medium text-white truncate hover:text-neutral-300 cursor-pointer"
                        >
                          {item.movie?.title ?? `Movie #${item.movielens_id}`}
                        </button>
                        <div className="mt-1 flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => void handleRate(item.movielens_id, star)}
                              aria-label={`Update rating to ${star}`}
                              className="cursor-pointer"
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${
                                  item.rating >= star
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-neutral-600 hover:text-neutral-400"
                                }`}
                              />
                            </button>
                          ))}
                          <span className="ml-1 font-mono text-xs text-neutral-300 tabular-nums">
                            {item.rating}/5
                          </span>
                        </div>
                        {(item.mood_tag || item.note) && !isEditing && (
                          <p className="mt-1 text-[11px] text-neutral-400 truncate">
                            {item.mood_tag ? (
                              <span className="text-neutral-200 font-medium">
                                #{item.mood_tag}
                              </span>
                            ) : null}
                            {item.mood_tag && item.note ? " · " : ""}
                            {item.note ? <span>"{item.note}"</span> : null}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                            } else {
                              setEditingId(item.movielens_id);
                              setEditMood(item.mood_tag ?? null);
                              setEditNote(item.note ?? "");
                            }
                          }}
                          title="Add or edit note & mood tag"
                          aria-label="Edit note and mood tag"
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            isEditing
                              ? "text-white bg-white/15"
                              : "text-neutral-500 hover:text-white"
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteRating(item.movielens_id)}
                          aria-label="Delete rating"
                          className="p-1.5 text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {MOOD_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                setEditMood((cur) => (cur === tag ? null : tag))
                              }
                              className={`rounded px-2 py-0.5 text-[11px] cursor-pointer ${
                                editMood === tag
                                  ? "bg-[#E50914] text-white"
                                  : "bg-[#242424] text-neutral-300 hover:bg-white/15"
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            maxLength={140}
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Short review note..."
                            className="flex-1 rounded border border-white/15 bg-[#181818] px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await onRate(item.movielens_id, item.rating, {
                                note: editNote.trim() || null,
                                moodTag: editMood,
                              });
                              setEditingId(null);
                            }}
                            className="rounded bg-[#E50914] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#F40612] cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
