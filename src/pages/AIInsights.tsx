import {
  Bookmark,
  Eye,
  Heart,
  History,
  Info,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
  RotateCcw,
  Smile,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ViewedMovieEntry } from "../App";
import type { NavPage } from "../components/Navbar";
import { LANGUAGE_NAME_BY_CODE } from "../data/presets";
import { api } from "../services/api";
import type {
  AuthUser,
  DailyMood,
  Movie,
  UserInsights,
  UserPreferences,
  UserRating,
} from "../types";

interface AIInsightsProps {
  user: AuthUser | null;
  activeRatings: UserRating[];
  preferences?: UserPreferences | null;
  todayMood?: DailyMood | null;
  watchlist?: Movie[];
  guestViewed?: ViewedMovieEntry[];
  tmdbConfigured: boolean;
  onResetRatings: () => Promise<void>;
  onRequireAuth: () => void;
  onNavigate: (page: NavPage) => void;
}

export function AIInsights({
  user,
  activeRatings,
  preferences = null,
  todayMood = null,
  watchlist = [],
  guestViewed = [],
  tmdbConfigured,
  onResetRatings,
  onRequireAuth,
  onNavigate,
}: AIInsightsProps) {
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetBusy, setResetBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      if (user) {
        const ui = await api.getUserInsights();
        setUserInsights(ui);
      } else {
        setUserInsights(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll, activeRatings.length]);

  // Build client-side guest insights automatically when not signed in
  const guestInsights = useMemo<UserInsights | null>(() => {
    if (user) return null;
    const totalRated = activeRatings.length;
    const avgRating =
      totalRated > 0
        ? Number(
            (
              activeRatings.reduce((acc, r) => acc + r.rating, 0) / totalRated
            ).toFixed(2)
          )
        : 0;
    const distMap = new Map<number, number>([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);
    const genreAgg = new Map<string, { count: number; sum: number }>();
    const moodAgg = new Map<string, { count: number; sum: number }>();
    for (const r of activeRatings) {
      const star = Math.round(r.rating);
      distMap.set(star, (distMap.get(star) ?? 0) + 1);
      if (r.mood_tag) {
        const curM = moodAgg.get(r.mood_tag) ?? { count: 0, sum: 0 };
        curM.count += 1;
        curM.sum += r.rating;
        moodAgg.set(r.mood_tag, curM);
      }
      for (const g of r.movie?.genres ?? []) {
        const curG = genreAgg.get(g) ?? { count: 0, sum: 0 };
        curG.count += 1;
        curG.sum += r.rating;
        genreAgg.set(g, curG);
      }
    }
    const genreAnalytics = Array.from(genreAgg.entries())
      .map(([genre, v]) => ({
        genre,
        count: v.count,
        avgRating: Number((v.sum / v.count).toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating);
    const moodTagSummary = Array.from(moodAgg.entries())
      .map(([tag, v]) => ({
        tag,
        count: v.count,
        avgRating: Number((v.sum / v.count).toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating);
    const ratedNotes = activeRatings
      .filter((r) => Boolean(r.note) || Boolean(r.mood_tag))
      .slice(0, 12)
      .map((r) => ({
        movielens_id: r.movielens_id,
        title: r.movie?.title ?? `Movie #${r.movielens_id}`,
        release_year: r.movie?.release_year ?? null,
        rating: r.rating,
        note: r.note ?? null,
        mood_tag: r.mood_tag ?? null,
        updated_at: r.updated_at,
      }));
    return {
      totalRated,
      avgRating,
      mostPreferredGenre: genreAnalytics[0]?.genre ?? null,
      highestRatedGenres: [...genreAnalytics]
        .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count)
        .slice(0, 3),
      ratingDistribution: Array.from(distMap.entries()).map(
        ([stars, count]) => ({
          stars: `${stars} ★`,
          starValue: stars,
          count,
        })
      ),
      genreAnalytics,
      moodTagSummary,
      ratedNotes,
      viewedMovies: guestViewed,
      recStats: [],
      recentRecommendations: [],
    };
  }, [user, activeRatings, guestViewed]);

  const effectiveInsights = user ? userInsights : guestInsights;

  const viewedMovies = useMemo(() => {
    const serverViewed = userInsights?.viewedMovies ?? [];
    if (user) {
      return serverViewed.length > 0 ? serverViewed : guestViewed;
    }
    return guestViewed;
  }, [user, userInsights?.viewedMovies, guestViewed]);

  const likedRatings = useMemo(
    () => activeRatings.filter((r) => r.rating >= 4),
    [activeRatings]
  );

  const handleResetAll = async () => {
    setError(null);
    setResetBusy(true);
    try {
      await onResetRatings();
      if (user) {
        await fetchAll();
      }
      setMessage("Cleared all your movie ratings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset ratings");
    } finally {
      setResetBusy(false);
    }
  };

  if (loading && user && !userInsights) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin text-[#E50914]" />
        <span>Loading your personal activity &amp; history...</span>
      </div>
    );
  }

  const preferredLangNames = (
    preferences?.originalLanguages?.length
      ? preferences.originalLanguages
      : preferences?.preferredLanguages ?? []
  ).map((code) => LANGUAGE_NAME_BY_CODE[code] ?? code.toUpperCase());

  const dubbedLangNames = (preferences?.dubbedLanguages ?? []).map(
    (code) => LANGUAGE_NAME_BY_CODE[code] ?? code.toUpperCase()
  );

  const preferredGenres = preferences?.favoriteGenres?.length
    ? preferences.favoriteGenres
    : preferences?.preferredGenres ?? [];

  const favoriteActors = Array.from(
    new Set([
      ...(preferences?.favoriteActors ?? []),
      ...(preferences?.favoriteMaleActors ?? []),
      ...(preferences?.favoriteFemaleActors ?? []),
    ])
  );

  return (
    <div className="space-y-12 pb-16">
      {/* Page Title */}
      <div className="border-b border-white/10 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Insights
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Your personal movie activity, app overview, and saved history and choices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start">
          {activeRatings.length > 0 && (
            <button
              type="button"
              disabled={resetBusy}
              onClick={() => void handleResetAll()}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#181818] px-3.5 py-2 text-xs font-medium text-neutral-300 hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Ratings</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void fetchAll()}
            className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#181818] px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-white/10 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* ==================== MY PERSONAL ACTIVITY ==================== */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              My Personal Activity
            </h2>
            <p className="text-sm text-neutral-400">
              Movies you have viewed, liked/rated, and added to your wishlist.
            </p>
          </div>
          {!user && (
            <button
              type="button"
              onClick={onRequireAuth}
              className="rounded-md bg-[#E50914] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#F40612] whitespace-nowrap self-start cursor-pointer"
            >
              Sign In to Sync Profile
            </button>
          )}
        </div>

        {/* Personal Activity KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-[#181818] p-4">
            <p className="text-xs text-neutral-400 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-[#E50914]" />
              <span>Viewed Movies</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
              {viewedMovies.length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#181818] p-4">
            <p className="text-xs text-neutral-400 flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-[#E50914]" />
              <span>Liked (4★–5★)</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-300 tabular-nums">
              {likedRatings.length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#181818] p-4">
            <p className="text-xs text-neutral-400 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-400" />
              <span>Total Rated</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-300 tabular-nums">
              {activeRatings.length}
              {activeRatings.length > 0 && effectiveInsights
                ? ` (${effectiveInsights.avgRating.toFixed(1)}★ avg)`
                : ""}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#181818] p-4">
            <p className="text-xs text-neutral-400 flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-[#E50914]" />
              <span>Wishlist</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
              {watchlist.length}
            </p>
          </div>
        </div>

        {/* Viewed Movies, Liked/Rated, and Wishlist Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Viewed Movies */}
          <div className="rounded-xl border border-white/10 bg-[#181818] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-sm font-semibold text-white flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-[#E50914]" />
                <span>Viewed Movies</span>
              </h3>
              <span className="font-mono text-xs text-neutral-400 tabular-nums">
                {viewedMovies.length}
              </span>
            </div>
            {viewedMovies.length === 0 ? (
              <p className="text-xs text-neutral-400 py-3">
                No movies viewed yet. Open any movie&apos;s details to see it tracked here.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {viewedMovies.map((m) => (
                  <div
                    key={`viewed-${m.movielens_id}`}
                    className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-white truncate">
                      {m.title}
                      {m.release_year ? ` (${m.release_year})` : ""}
                    </p>
                    {m.genres.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
                        {m.genres.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Liked / Rated */}
          <div className="rounded-xl border border-white/10 bg-[#181818] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-sm font-semibold text-white flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-[#E50914]" />
                <span>Liked &amp; Rated Movies</span>
              </h3>
              <span className="font-mono text-xs text-neutral-400 tabular-nums">
                {activeRatings.length}
              </span>
            </div>
            {activeRatings.length === 0 ? (
              <div className="py-3 space-y-2">
                <p className="text-xs text-neutral-400">
                  You haven&apos;t liked or rated any movies yet.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate("rate")}
                  className="rounded-md bg-[#E50914] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#F40612] cursor-pointer"
                >
                  Rate Movies
                </button>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {[...activeRatings]
                  .sort((a, b) => b.rating - a.rating)
                  .slice(0, 12)
                  .map((r) => (
                    <div
                      key={`liked-rated-${r.movielens_id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white truncate">
                          {r.movie?.title ?? `Movie #${r.movielens_id}`}
                        </p>
                        {r.movie?.genres && r.movie.genres.length > 0 && (
                          <p className="text-[11px] text-neutral-400 truncate">
                            {r.movie.genres.slice(0, 2).join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-300 tabular-nums shrink-0">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {r.rating}/5
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Wishlist */}
          <div className="rounded-xl border border-white/10 bg-[#181818] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-sm font-semibold text-white flex items-center gap-1.5">
                <Bookmark className="h-4 w-4 text-[#E50914]" />
                <span>Added to Wishlist</span>
              </h3>
              <span className="font-mono text-xs text-neutral-400 tabular-nums">
                {watchlist.length}
              </span>
            </div>
            {watchlist.length === 0 ? (
              <p className="text-xs text-neutral-400 py-3">
                {user
                  ? "No movies added to your wishlist yet. Click My List on any movie card to save it for later."
                  : "Sign in and click My List on any movie card to save movies to your wishlist."}
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {watchlist.map((m) => (
                  <div
                    key={`wish-activity-${m.movielens_id ?? m.title}`}
                    className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-white truncate">
                      {m.title}
                      {m.release_year ? ` (${m.release_year})` : ""}
                    </p>
                    {m.genres.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
                        {m.genres.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Charts & Saved Mood Tags when ratings exist */}
        {effectiveInsights && effectiveInsights.totalRated > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 bg-[#181818] p-5">
                <h3 className="font-display text-sm font-semibold text-white mb-4">
                  Rating Distribution (1★ – 5★)
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={effectiveInsights.ratingDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey="stars" stroke="#A3A3A3" fontSize={12} />
                      <YAxis allowDecimals={false} stroke="#A3A3A3" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#141414",
                          borderColor: "#2E2E2E",
                          color: "#F5F5F5",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Movies"
                        fill="#E50914"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#181818] p-5">
                <h3 className="font-display text-sm font-semibold text-white mb-4">
                  Genre Count &amp; Mean Rating
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={effectiveInsights.genreAnalytics.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey="genre" stroke="#A3A3A3" fontSize={11} />
                      <YAxis stroke="#A3A3A3" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#141414",
                          borderColor: "#2E2E2E",
                          color: "#F5F5F5",
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="count"
                        name="Rated Films"
                        fill="#E50914"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="avgRating"
                        name="Avg Rating"
                        fill="#E5E5E5"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {((effectiveInsights.moodTagSummary?.length ?? 0) > 0 ||
              (effectiveInsights.ratedNotes?.length ?? 0) > 0) && (
              <div className="rounded-xl border border-white/10 bg-[#181818] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquareQuote className="h-4 w-4 text-[#E50914]" />
                  <h3 className="font-display text-sm font-semibold text-white">
                    Saved Mood Tags &amp; Review Notes
                  </h3>
                </div>

                {(effectiveInsights.moodTagSummary?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {effectiveInsights.moodTagSummary!.map((m) => (
                      <div
                        key={m.tag}
                        className="rounded-md border border-white/10 bg-[#141414] px-3 py-1.5 font-mono tabular-nums"
                      >
                        <span className="text-white font-sans font-semibold">
                          #{m.tag}
                        </span>{" "}
                        <span className="text-neutral-400">
                          · {m.count} {m.count === 1 ? "film" : "films"} · avg{" "}
                          {m.avgRating}/5
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {(effectiveInsights.ratedNotes?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {effectiveInsights.ratedNotes!.slice(0, 6).map((n) => (
                      <div
                        key={`insight-note-${n.movielens_id}`}
                        className="rounded-lg border border-white/10 bg-[#141414] p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white truncate">
                            {n.title}
                            {n.release_year ? ` (${n.release_year})` : ""}
                          </span>
                          <span className="font-mono text-amber-300 tabular-nums shrink-0">
                            {n.rating}/5
                          </span>
                        </div>
                        {n.mood_tag && (
                          <p className="text-[11px] font-medium text-neutral-300">
                            #{n.mood_tag}
                          </p>
                        )}
                        {n.note && (
                          <p className="text-neutral-400 italic leading-relaxed">
                            "{n.note}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ==================== ABOUT APP ==================== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-[#E50914]" />
          <h2 className="font-display text-xl font-bold text-white">
            About App
          </h2>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#181818] p-6 space-y-4">
          <div className="space-y-1.5">
            <h3 className="font-display text-base font-bold text-white">
              PICKMYFLICK — Personalized Multilingual Movie Recommendation Platform
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed">
              PICKMYFLICK helps you discover movies tailored to your ratings, preferred languages, favorite genres, actors, and daily mood. It combines collaborative filtering on MovieLens 1M with curated multilingual cinema across English, Hindi, Kannada, Telugu, Tamil, and Malayalam.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="rounded-lg border border-white/10 bg-[#141414] p-4">
              <p className="text-xs font-semibold text-white">
                Catalog &amp; Languages
              </p>
              <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                Explore MovieLens 1M classics alongside regional Indian blockbusters and dubbed titles with streaming platform availability.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#141414] p-4">
              <p className="text-xs font-semibold text-white">
                Personalization Engine
              </p>
              <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                Your star ratings, mood tags, review notes, and profile preferences continuously refine your Top 10 and discovery picks.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#141414] p-4">
              <p className="text-xs font-semibold text-white">
                Metadata Source
              </p>
              <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                {tmdbConfigured
                  ? "Live TMDB metadata active alongside GroupLens MovieLens 1M and Wikipedia film records."
                  : "Powered by GroupLens MovieLens 1M and enriched Wikipedia regional cinema metadata."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== MY HISTORY AND CHOICES ==================== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-[#E50914]" />
          <h2 className="font-display text-xl font-bold text-white">
            My History and Choices
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Saved Choices & Preferences */}
          <div className="rounded-xl border border-white/10 bg-[#181818] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <h3 className="font-display text-sm font-semibold text-white">
                My Preferences &amp; Mood Choice
              </h3>
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                <Smile className="h-3.5 w-3.5 text-[#E50914]" />
                {todayMood ? todayMood.moodLabel : "No daily mood set"}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-neutral-400">Preferred Languages: </span>
                <span className="text-white">
                  {preferredLangNames.length > 0
                    ? preferredLangNames.join(", ")
                    : "Not selected yet"}
                </span>
              </div>
              {dubbedLangNames.length > 0 && (
                <div>
                  <span className="text-neutral-400">Dubbed Languages: </span>
                  <span className="text-white">
                    {dubbedLangNames.join(", ")}
                  </span>
                </div>
              )}
              <div>
                <span className="text-neutral-400">Favorite Genres: </span>
                <span className="text-white">
                  {preferredGenres.length > 0
                    ? preferredGenres.join(", ")
                    : "Not selected yet"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400">Favorite Actors: </span>
                <span className="text-white">
                  {favoriteActors.length > 0
                    ? favoriteActors.join(", ")
                    : "Not selected yet"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400">
                  Taste &amp; Story Choices:{" "}
                </span>
                <span className="text-white">
                  {[
                    preferences?.tasteStyle,
                    ...(preferences?.storyStyles ?? []),
                    preferences?.pacingPreference &&
                    preferences.pacingPreference !== "balanced"
                      ? preferences.pacingPreference.replace("_", "-")
                      : null,
                    preferences?.eraPreference &&
                    preferences.eraPreference !== "any"
                      ? `${preferences.eraPreference} era`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Default balanced"}
                </span>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-neutral-300">
                <span className="inline-flex items-center gap-1.5">
                  <Bookmark className="h-3.5 w-3.5 text-[#E50914]" />
                  <span>Saved to Wishlist (My List):</span>
                </span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {watchlist.length}{" "}
                  {watchlist.length === 1 ? "movie" : "movies"}
                </span>
              </div>
            </div>
          </div>

          {/* Rating & Review History */}
          <div className="rounded-xl border border-white/10 bg-[#181818] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <h3 className="font-display text-sm font-semibold text-white">
                My Rating &amp; Review History
              </h3>
              <span className="font-mono text-xs text-neutral-400 tabular-nums">
                {activeRatings.length} rated
              </span>
            </div>

            {activeRatings.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-neutral-400">
                  No movie ratings in your history yet.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate("rate")}
                  className="rounded-md bg-[#E50914] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#F40612] cursor-pointer"
                >
                  Rate Movies
                </button>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {activeRatings.map((item) => (
                  <div
                    key={`history-choice-${item.movielens_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#141414] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {item.movie?.title ?? `Movie #${item.movielens_id}`}
                        {item.movie?.release_year
                          ? ` (${item.movie.release_year})`
                          : ""}
                      </p>
                      {(item.mood_tag || item.note) && (
                        <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
                          {item.mood_tag ? `#${item.mood_tag}` : ""}
                          {item.mood_tag && item.note ? " · " : ""}
                          {item.note ? `"${item.note}"` : ""}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs text-amber-300 tabular-nums shrink-0">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {item.rating}/5
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
