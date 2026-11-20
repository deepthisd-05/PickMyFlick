import {
  Bookmark,
  Check,
  Film,
  Loader2,
  MessageSquareQuote,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MovieCard } from "../components/MovieCard";
import { MoviePoster } from "../components/MoviePoster";
import type { NavPage } from "../components/Navbar";
import { LANGUAGE_NAME_BY_CODE } from "../data/presets";
import { getStreamingPlatforms } from "../data/streamingPlatforms";
import { api } from "../services/api";
import type {
  AuthUser,
  DailyMood,
  DiscoverySectionItem,
  Movie,
  RecommendationItem,
  UserRating,
} from "../types";

interface RecommendationsProps {
  user: AuthUser | null;
  todayMood?: DailyMood | null;
  activeRatings: UserRating[];
  ratingsMap: Map<number, number>;
  watchlist: Movie[];
  watchlistSet: Set<number>;
  onRate: (movielensId: number, rating: number) => Promise<void>;
  onDeleteRating: (movielensId: number) => Promise<void>;
  onToggleWatchlist: (movielensId: number) => Promise<void>;
  onSelectMovie: (movie: Movie) => void;
  onNavigate: (page: NavPage) => void;
  onRequireAuth: () => void;
}

export function Recommendations({
  user,
  todayMood = null,
  activeRatings,
  ratingsMap,
  watchlist,
  watchlistSet,
  onRate,
  onDeleteRating,
  onToggleWatchlist,
  onSelectMovie,
  onNavigate,
  onRequireAuth,
}: RecommendationsProps) {
  const [top10, setTop10] = useState<RecommendationItem[]>([]);
  const [relevantReviews, setRelevantReviews] = useState<DiscoverySectionItem[]>(
    []
  );
  const [ratedBasedMovie, setRatedBasedMovie] = useState<Movie | null>(null);
  const [ratedBasedAnchor, setRatedBasedAnchor] = useState<string | null>(null);
  const [loadingTop10, setLoadingTop10] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const ratingCount = activeRatings.length;

  const getGuestRatingsPayload = useCallback(() => {
    if (user) return undefined;
    if (activeRatings.length > 0) {
      return activeRatings.map((r) => ({
        movielensId: r.movielens_id,
        rating: r.rating,
      }));
    }
    try {
      const raw = window.localStorage.getItem("cinevae_guest_ratings");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<{
        movielens_id: number;
        rating: number;
      }>;
      return Array.isArray(parsed)
        ? parsed.map((r) => ({
            movielensId: r.movielens_id,
            rating: r.rating,
          }))
        : [];
    } catch {
      return [];
    }
  }, [user, activeRatings]);

  const ratingsSignature = useMemo(
    () =>
      activeRatings
        .map((r) => `${r.movielens_id}:${r.rating}`)
        .sort()
        .join(","),
    [activeRatings]
  );

  const loadRecommendations = useCallback(async () => {
    setLoadingTop10(true);
    setLoadingReviews(true);
    const guestPayload = getGuestRatingsPayload();

    try {
      const secPromise = api.getRecommendationSections({
        guestRatings: guestPayload,
        moodKey: todayMood?.moodKey ?? null,
      });

      let recs: RecommendationItem[] = [];
      if (ratingCount > 0) {
        const hasVaeVocabRatings = activeRatings.some(
          (r) => r.movie == null || r.movie.item_idx >= 0
        );

        if (hasVaeVocabRatings) {
          try {
            const res = await api.generateRecommendations(
              "multvae",
              guestPayload,
              "top_ranked"
            );
            recs = res.recommendations.slice(0, 10);
          } catch {
            recs = [];
          }
        }

        if (recs.length === 0) {
          const secRes = await secPromise;
          const seenRec = new Set<number>();
          const hybridList: RecommendationItem[] = [];
          const topRatedAnchor = [...activeRatings].sort(
            (a, b) => b.rating - a.rating
          )[0];

          for (const sec of secRes.sections) {
            for (const entry of sec.items) {
              const id = entry.movie.movielens_id;
              if (id == null || ratingsMap.has(id) || seenRec.has(id)) continue;
              seenRec.add(id);
              hybridList.push({
                historyId: -(hybridList.length + 1),
                rank: hybridList.length + 1,
                score: entry.score,
                normalizedScore: entry.normalizedScore,
                similarToTitle: topRatedAnchor?.movie?.title ?? null,
                anchorMovieTitle: topRatedAnchor?.movie?.title ?? null,
                anchorMovieRating: topRatedAnchor?.rating ?? null,
                anchorSimilarity: null,
                itemRatingCount: entry.movie.ml_rating_count,
                discoveryMode: "top_ranked",
                explanation: entry.reason,
                feedback: null,
                movie: entry.movie,
              });
              if (hybridList.length >= 10) break;
            }
            if (hybridList.length >= 10) break;
          }
          recs = hybridList;
        }
      }
      setTop10(recs);

      // Derive a movie recommendation specifically from the user's rated movies
      if (activeRatings.length > 0) {
        const topRated = [...activeRatings].sort(
          (a, b) => b.rating - a.rating
        )[0];
        const anchoredRec = recs.find(
          (r) => r.movie && (r.anchorMovieTitle || r.similarToTitle)
        );
        if (anchoredRec?.movie) {
          setRatedBasedMovie(anchoredRec.movie);
          setRatedBasedAnchor(
            anchoredRec.anchorMovieTitle ??
              anchoredRec.similarToTitle ??
              topRated.movie?.title ??
              null
          );
        } else if (topRated?.movielens_id) {
          try {
            const det = await api.movieDetails(topRated.movielens_id);
            const candidate =
              det.similar.find(
                (m) => m.movielens_id != null && !ratingsMap.has(m.movielens_id)
              ) ??
              det.similar[0] ??
              recs[0]?.movie ??
              null;
            setRatedBasedMovie(candidate);
            setRatedBasedAnchor(topRated.movie?.title ?? null);
          } catch {
            setRatedBasedMovie(recs[0]?.movie ?? null);
            setRatedBasedAnchor(topRated.movie?.title ?? null);
          }
        }
      } else {
        setRatedBasedMovie(null);
        setRatedBasedAnchor(null);
      }

      const secRes = await secPromise;
      const pool: DiscoverySectionItem[] = [];
      const seen = new Set<number>();
      for (const sec of secRes.sections) {
        for (const item of sec.items) {
          const id = item.movie.movielens_id;
          if (id != null && seen.has(id)) continue;
          if (id != null) seen.add(id);
          pool.push(item);
        }
      }
      setRelevantReviews(pool.slice(0, 6));
    } catch {
      setTop10([]);
      setRelevantReviews([]);
    } finally {
      setLoadingTop10(false);
      setLoadingReviews(false);
    }
  }, [
    activeRatings,
    getGuestRatingsPayload,
    ratingCount,
    ratingsMap,
    todayMood?.moodKey,
  ]);

  useEffect(() => {
    void loadRecommendations();
  }, [user?.id, ratingsSignature, todayMood?.moodKey]);

  // Reviews written by the user (rating + note or mood tag)
  const userWrittenReviews = useMemo(
    () =>
      activeRatings.filter(
        (r) => Boolean(r.note?.trim()) || Boolean(r.mood_tag)
      ),
    [activeRatings]
  );

  // Deduplicate relevant community movies against movies already shown in userWrittenReviews
  const relevantCommunityMovies = useMemo(() => {
    const writtenIds = new Set(userWrittenReviews.map((r) => r.movielens_id));
    return relevantReviews.filter(
      (entry) =>
        entry.movie.movielens_id == null ||
        !writtenIds.has(entry.movie.movielens_id)
    );
  }, [relevantReviews, userWrittenReviews]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 py-8 space-y-12 pb-16">
      {/* Simple Page Header */}
      <div className="border-b border-white/10 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Recommendations
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Your Top 10 picks, wishlist, relevant user reviews, and rated movies.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRecommendations()}
          disabled={loadingTop10 || loadingReviews}
          className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#181818] px-4 py-2 text-xs font-semibold text-neutral-100 hover:bg-white/10 disabled:opacity-50 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              loadingTop10 || loadingReviews ? "animate-spin" : ""
            }`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* 1. My Top 10 Movies */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              My Top 10 Movies
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              {ratingCount > 0
                ? `Top 10 personalized movie recommendations generated from your ${ratingCount} ${
                    ratingCount === 1 ? "rating" : "ratings"
                  }.`
                : "Rate movies to generate your personalized Top 10 recommendations."}
            </p>
          </div>
          {ratingCount > 0 && (
            <button
              type="button"
              onClick={() => void loadRecommendations()}
              disabled={loadingTop10}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#E50914] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#F40612] disabled:opacity-50 self-start sm:self-auto cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate Top 10</span>
            </button>
          )}
        </div>

        {loadingTop10 ? (
          <div className="flex items-center justify-center py-12 gap-2 text-sm text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#E50914]" />
            <span>Generating your Top 10 movies from your ratings...</span>
          </div>
        ) : ratingCount === 0 || top10.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#181818] p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">
              {ratingCount === 0
                ? "Rate at least 1 movie so we can generate your personalized Top 10 movie recommendations based on your taste."
                : "No recommendations available yet. Rate another movie to update your Top 10 list."}
            </p>
            <button
              type="button"
              onClick={() => onNavigate("rate")}
              className="rounded-md bg-[#E50914] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F40612] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Rate Movies
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {top10.slice(0, 10).map((rec, idx) =>
              rec.movie ? (
                <MovieCard
                  key={`top10-${rec.movie.movielens_id ?? idx}`}
                  movie={rec.movie}
                  rankIndex={idx + 1}
                  matchLabel={
                    rec.normalizedScore > 0
                      ? `${Math.round(rec.normalizedScore * 100)}% match`
                      : null
                  }
                  onSelectMovie={onSelectMovie}
                  userRating={
                    rec.movie.movielens_id != null
                      ? ratingsMap.get(rec.movie.movielens_id)
                      : undefined
                  }
                  onRate={onRate}
                  onDeleteRating={onDeleteRating}
                  inWatchlist={
                    rec.movie.movielens_id != null
                      ? watchlistSet.has(rec.movie.movielens_id)
                      : false
                  }
                  onToggleWatchlist={onToggleWatchlist}
                />
              ) : null
            )}
          </div>
        )}
      </section>

      {/* 2. Wishlist (Saved Picks) */}
      <section className="space-y-4 border-t border-white/10 pt-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-[#E50914]" />
              <span>Wishlist</span>
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              Movies you might want to watch later
            </p>
          </div>
          <span className="font-mono text-xs text-neutral-400 tabular-nums">
            {watchlist.length} {watchlist.length === 1 ? "movie" : "movies"}
          </span>
        </div>

        {watchlist.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#181818] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">
              {user
                ? "Your wishlist is empty. Click My List on any movie card to save movies you might want to watch later."
                : "Sign in to save movies you might want to watch later to your Wishlist."}
            </p>
            {!user && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="rounded-md bg-[#E50914] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F40612] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {watchlist.map((movie) => (
              <MovieCard
                key={`wish-${movie.movielens_id ?? movie.title}`}
                movie={movie}
                onSelectMovie={onSelectMovie}
                userRating={
                  movie.movielens_id != null
                    ? ratingsMap.get(movie.movielens_id)
                    : undefined
                }
                onRate={onRate}
                onDeleteRating={onDeleteRating}
                inWatchlist={true}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. Relevant Users Review Movies */}
      <section className="space-y-4 border-t border-white/10 pt-8">
        <div>
          <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <MessageSquareQuote className="h-5 w-5 text-[#E50914]" />
            <span>Relevant Users Review Movies</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400">
            User reviews, mood notes, and community-rated movies matched to your taste.
          </p>
        </div>

        {loadingReviews && userWrittenReviews.length === 0 ? (
          <div className="flex items-center justify-center py-10 gap-2 text-sm text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#E50914]" />
            <span>Loading relevant reviews...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userWrittenReviews.map((entry) => {
              const m = entry.movie;
              const platforms = m ? getStreamingPlatforms(m) : [];
              return (
                <article
                  key={`user-review-${entry.movielens_id}`}
                  className="flex gap-3.5 rounded-xl border border-white/10 bg-[#181818] p-4 hover:border-white/25 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => m && onSelectMovie(m)}
                    className="w-20 shrink-0 aspect-[2/3] rounded-md overflow-hidden cursor-pointer"
                  >
                    <MoviePoster
                      posterUrl={m?.poster_url ?? null}
                      title={m?.title ?? `Movie #${entry.movielens_id}`}
                      releaseYear={m?.release_year}
                      className="h-full w-full"
                    />
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => m && onSelectMovie(m)}
                          className="text-left font-display text-sm font-bold text-white hover:text-neutral-300 line-clamp-1 cursor-pointer"
                        >
                          {m?.title ?? `Movie #${entry.movielens_id}`}
                        </button>
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-amber-300 tabular-nums shrink-0">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {entry.rating}/5
                        </span>
                      </div>

                      {m && (
                        <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
                          {m.release_year ? `${m.release_year} · ` : ""}
                          {m.genres.slice(0, 2).join(", ")}
                        </p>
                      )}

                      {platforms.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {platforms.slice(0, 2).map((platform) => (
                            <span
                              key={platform.name}
                              className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#141414] px-1.5 py-0.5 text-[10px] font-medium text-neutral-300"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${platform.dotClass}`}
                                aria-hidden="true"
                              />
                              <span>{platform.name}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {entry.mood_tag && (
                        <p className="mt-2 text-[11px] font-semibold text-[#E50914]">
                          #{entry.mood_tag}
                        </p>
                      )}
                      {entry.note && (
                        <p className="mt-1 text-xs text-neutral-300 italic line-clamp-2">
                          "{entry.note}"
                        </p>
                      )}
                    </div>

                    <p className="text-[11px] text-neutral-500">
                      Your review
                    </p>
                  </div>
                </article>
              );
            })}

            {relevantCommunityMovies.slice(0, 6).map((entry) => {
              const m = entry.movie;
              const platforms = getStreamingPlatforms(m);
              const communityScore =
                m.ml_avg_rating > 0
                  ? m.ml_avg_rating.toFixed(1)
                  : m.vote_average != null
                  ? (m.vote_average / 2).toFixed(1)
                  : "4.0";
              const langName = m.language_code
                ? LANGUAGE_NAME_BY_CODE[m.language_code] ??
                  m.language_code.toUpperCase()
                : "English";

              return (
                <article
                  key={`community-review-${m.movielens_id ?? m.title}`}
                  className="flex gap-3.5 rounded-xl border border-white/10 bg-[#181818] p-4 hover:border-white/25 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelectMovie(m)}
                    className="w-20 shrink-0 aspect-[2/3] rounded-md overflow-hidden cursor-pointer"
                  >
                    <MoviePoster
                      posterUrl={m.poster_url}
                      title={m.title}
                      releaseYear={m.release_year}
                      className="h-full w-full"
                    />
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectMovie(m)}
                          className="text-left font-display text-sm font-bold text-white hover:text-neutral-300 line-clamp-1 cursor-pointer"
                        >
                          {m.title}
                        </button>
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-400 tabular-nums shrink-0">
                          ★ {communityScore}/5
                        </span>
                      </div>

                      <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
                        {langName}
                        {m.release_year ? ` · ${m.release_year}` : ""}
                        {m.genres.length > 0
                          ? ` · ${m.genres.slice(0, 2).join(", ")}`
                          : ""}
                      </p>

                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {platforms.slice(0, 2).map((platform) => (
                          <span
                            key={platform.name}
                            className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#141414] px-1.5 py-0.5 text-[10px] font-medium text-neutral-300"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${platform.dotClass}`}
                              aria-hidden="true"
                            />
                            <span>{platform.name}</span>
                          </span>
                        ))}
                      </div>

                      {m.overview && (
                        <p className="mt-2 text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                          {m.overview}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="tabular-nums">
                        {m.ml_rating_count > 0
                          ? `${m.ml_rating_count.toLocaleString()} user ratings`
                          : "Audience pick"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectMovie(m)}
                        className="font-medium text-neutral-200 hover:text-white cursor-pointer"
                      >
                        Read &amp; Review →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Rated Movies (including a movie recommendation based on user's rated movies) */}
      <section className="space-y-5 border-t border-white/10 pt-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Film className="h-5 w-5 text-[#E50914]" />
              <span>Rated Movies</span>
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              Movies you have rated and a movie recommendation based on your rated movies.
            </p>
          </div>
          <span className="font-mono text-xs text-neutral-400 tabular-nums">
            {activeRatings.length} rated
          </span>
        </div>

        {/* Movie recommendation based on user's rated movies */}
        {ratedBasedMovie && (
          <div className="rounded-xl border border-[#E50914]/40 bg-gradient-to-r from-[#221415] via-[#181818] to-[#141414] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <button
              type="button"
              onClick={() => onSelectMovie(ratedBasedMovie)}
              className="w-24 sm:w-28 aspect-[2/3] shrink-0 rounded-md overflow-hidden border border-white/15 cursor-pointer"
            >
              <MoviePoster
                posterUrl={ratedBasedMovie.poster_url}
                title={ratedBasedMovie.title}
                releaseYear={ratedBasedMovie.release_year}
                className="h-full w-full"
              />
            </button>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded bg-[#E50914] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                  <Sparkles className="h-3 w-3" />
                  Recommended Based on Your Rated Movies
                </span>
                {ratedBasedAnchor && (
                  <span className="text-xs text-neutral-300">
                    Inspired by <strong className="text-white">{ratedBasedAnchor}</strong>
                  </span>
                )}
              </div>

              <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                {ratedBasedMovie.title}
                {ratedBasedMovie.release_year
                  ? ` (${ratedBasedMovie.release_year})`
                  : ""}
              </h3>

              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                {ratedBasedMovie.genres.length > 0 && (
                  <span>{ratedBasedMovie.genres.slice(0, 3).join(" · ")}</span>
                )}
                {getStreamingPlatforms(ratedBasedMovie)
                  .slice(0, 2)
                  .map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#141414] px-1.5 py-0.5 text-[10px] font-medium text-neutral-300"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${platform.dotClass}`}
                        aria-hidden="true"
                      />
                      <span>{platform.name}</span>
                    </span>
                  ))}
              </div>

              {ratedBasedMovie.overview && (
                <p className="text-xs sm:text-sm text-neutral-300 line-clamp-2 max-w-2xl">
                  {ratedBasedMovie.overview}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectMovie(ratedBasedMovie)}
                  className="rounded-md bg-white hover:bg-neutral-200 px-3.5 py-1.5 text-xs font-bold text-black cursor-pointer"
                >
                  More Info &amp; Rate
                </button>
                {ratedBasedMovie.movielens_id != null && (
                  <button
                    type="button"
                    onClick={() =>
                      void onToggleWatchlist(ratedBasedMovie.movielens_id!)
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[#141414] px-3 py-1.5 text-xs font-medium text-white hover:border-white/40 cursor-pointer"
                  >
                    {watchlistSet.has(ratedBasedMovie.movielens_id) ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {watchlistSet.has(ratedBasedMovie.movielens_id)
                        ? "In My List"
                        : "My List"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* User's Rated Movies List */}
        {activeRatings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#181818] p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">
              You haven&apos;t rated any movies yet. Rate movies to see them here and get a tailored recommendation.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("rate")}
              className="rounded-md bg-[#E50914] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F40612] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Rate Movies
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRatings.map((item) => {
              const m = item.movie;
              const platforms = m ? getStreamingPlatforms(m) : [];
              return (
                <div
                  key={`rated-${item.movielens_id}`}
                  className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-[#181818] p-3.5"
                >
                  <button
                    type="button"
                    onClick={() => m && onSelectMovie(m)}
                    className="h-20 w-14 shrink-0 rounded overflow-hidden cursor-pointer"
                  >
                    <MoviePoster
                      posterUrl={m?.poster_url ?? null}
                      title={m?.title ?? `Movie #${item.movielens_id}`}
                      releaseYear={m?.release_year}
                      className="h-full w-full"
                    />
                  </button>

                  <div className="flex-1 min-w-0 space-y-1">
                    <button
                      type="button"
                      onClick={() => m && onSelectMovie(m)}
                      className="block text-left text-sm font-bold text-white truncate hover:text-neutral-300 cursor-pointer"
                    >
                      {m?.title ?? `Movie #${item.movielens_id}`}
                    </button>

                    {m && (
                      <p className="text-[11px] text-neutral-400 truncate">
                        {m.release_year ? `${m.release_year} · ` : ""}
                        {m.genres.slice(0, 2).join(", ")}
                      </p>
                    )}

                    {platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {platforms.slice(0, 2).map((platform) => (
                          <span
                            key={platform.name}
                            className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#141414] px-1.5 py-0.5 text-[10px] font-medium text-neutral-300"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${platform.dotClass}`}
                              aria-hidden="true"
                            />
                            <span>{platform.name}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 pt-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => void onRate(item.movielens_id, star)}
                          aria-label={`Rate ${star} stars`}
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

                    {(item.mood_tag || item.note) && (
                      <p className="text-[11px] text-neutral-400 truncate">
                        {item.mood_tag ? `#${item.mood_tag}` : ""}
                        {item.mood_tag && item.note ? " · " : ""}
                        {item.note ? `"${item.note}"` : ""}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void onDeleteRating(item.movielens_id)}
                    aria-label={`Remove rating for ${m?.title ?? item.movielens_id}`}
                    className="p-1.5 text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
