import {
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CarouselRow } from "../components/CarouselRow";
import { MOOD_ICON_MAP } from "../components/MoodPickerModal";
import { MovieCard } from "../components/MovieCard";
import type { NavPage } from "../components/Navbar";
import {
  DAILY_MOODS,
  getTodayDateString,
  type DailyMoodOption,
} from "../data/preferencesData";
import { LANGUAGE_OPTIONS } from "../data/presets";
import { api } from "../services/api";
import type {
  AuthUser,
  DailyMood,
  DiscoverResponse,
  LanguageCode,
  Movie,
  RecommendationItem,
  UserPreferences,
  UserRating,
} from "../types";

const HERO_FALLBACK = "/src/assets/images/cinema_hero_backdrop_1795156650815.jpg";

const HERO_LANGUAGE_LABELS: Record<string, string> = {
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  ta: "Tamil",
  kn: "Kannada",
  en: "English",
};

const LANGUAGE_ROW_META: Array<{
  code: LanguageCode;
  title: string;
  subtitle: string;
}> = [
  {
    code: "en",
    title: "English Movies",
    subtitle: "Acclaimed Hollywood classics & MovieLens 1M favorites",
  },
  {
    code: "hi",
    title: "Hindi Movies",
    subtitle: "Iconic Bollywood dramas, thrillers & crowd-pleasers",
  },
  {
    code: "kn",
    title: "Kannada Movies",
    subtitle: "Sandalwood blockbusters, folklore epics & acclaimed indies",
  },
  {
    code: "te",
    title: "Telugu Movies",
    subtitle: "Tollywood spectacle, action dramas & memorable romances",
  },
  {
    code: "ta",
    title: "Tamil Movies",
    subtitle: "Kollywood thrillers, realism & high-energy entertainers",
  },
  {
    code: "ml",
    title: "Malayalam Movies",
    subtitle: "Mollywood character-driven cinema, mysteries & slice-of-life gems",
  },
];

interface HomeProps {
  user: AuthUser | null;
  preferences?: UserPreferences | null;
  todayMood?: DailyMood | null;
  activeRatings: UserRating[];
  globalSearchQuery: string;
  onClearGlobalSearch: () => void;
  onNavigate: (page: NavPage) => void;
  onSelectMovie: (movie: Movie) => void;
  ratingsMap: Map<number, number>;
  watchlistSet: Set<number>;
  onRate: (movielensId: number, rating: number) => Promise<void>;
  onDeleteRating: (movielensId: number) => Promise<void>;
  onToggleWatchlist: (movielensId: number) => Promise<void>;
  onSelectMood: (option: DailyMoodOption) => Promise<void>;
  onClearMood: () => Promise<void>;
  onOpenEditPreferences: () => void;
}

export function Home({
  user,
  preferences = null,
  todayMood = null,
  activeRatings,
  globalSearchQuery,
  onClearGlobalSearch,
  onNavigate,
  onSelectMovie,
  ratingsMap,
  watchlistSet,
  onRate,
  onDeleteRating,
  onToggleWatchlist,
  onSelectMood,
  onClearMood,
  onOpenEditPreferences,
}: HomeProps) {
  const [discover, setDiscover] = useState<DiscoverResponse | null>(null);
  const [genres, setGenres] = useState<Array<{ name: string; count: number }>>(
    []
  );
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedAudioMode, setSelectedAudioMode] = useState<
    "all" | "original" | "dubbed"
  >("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searchTotal, setSearchTotal] = useState<number>(0);

  // Personalized Mult-VAE rows when user/guest has ratings
  const [vaeTopPicks, setVaeTopPicks] = useState<RecommendationItem[]>([]);
  const [vaeHiddenGems, setVaeHiddenGems] = useState<RecommendationItem[]>([]);

  // Today's mood picks & setup preferred genre picks
  const [moodMovies, setMoodMovies] = useState<Movie[]>([]);
  const [loadingMoodMovies, setLoadingMoodMovies] = useState<boolean>(false);
  const [savingMoodKey, setSavingMoodKey] = useState<string | null>(null);
  const [prefGenreMovies, setPrefGenreMovies] = useState<Movie[]>([]);

  // 6 Language carousel rows + genre showcase rows
  const [languageRows, setLanguageRows] = useState<
    Partial<Record<LanguageCode, Movie[]>>
  >({});
  const [scifiRow, setScifiRow] = useState<Movie[]>([]);
  const [thrillerRow, setThrillerRow] = useState<Movie[]>([]);
  const [dramaRow, setDramaRow] = useState<Movie[]>([]);

  const [loadingDiscover, setLoadingDiscover] = useState<boolean>(true);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [heroSlideIndex, setHeroSlideIndex] = useState<number>(0);
  const [heroPaused, setHeroPaused] = useState<boolean>(false);
  const catalogSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (globalSearchQuery) {
      setSearchQuery(globalSearchQuery);
      setSelectedGenre("All");
      setSelectedLanguage("all");
      setSelectedAudioMode("all");
      setTimeout(() => {
        catalogSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 60);
      onClearGlobalSearch();
    }
  }, [globalSearchQuery, onClearGlobalSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDiscover(true);
    Promise.all([
      api.discover(),
      api.genres(),
      api.getMoviesByLanguage(14),
      api.searchMovies("", "Sci-Fi", 12, 0),
      api.searchMovies("", "Thriller", 12, 0),
      api.searchMovies("", "Drama", 12, 0),
    ])
      .then(([disc, gen, byLang, scifi, thriller, drama]) => {
        if (cancelled) return;
        setDiscover(disc);
        setGenres(gen.genres.slice(0, 14));
        setLanguageRows(byLang.rows);
        setScifiRow(scifi.movies);
        setThrillerRow(thriller.movies);
        setDramaRow(drama.movies);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load movie catalog"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDiscover(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live personalized Mult-VAE rows whenever user or guest has >= 1 rating
  useEffect(() => {
    if (activeRatings.length === 0) {
      setVaeTopPicks([]);
      setVaeHiddenGems([]);
      return;
    }
    let cancelled = false;
    const guestPayload = user
      ? undefined
      : activeRatings.map((r) => ({
          movielensId: r.movielens_id,
          rating: r.rating,
        }));

    Promise.all([
      api.generateRecommendations("multvae", guestPayload, "top_ranked"),
      api.generateRecommendations("multvae", guestPayload, "hidden_gems"),
    ])
      .then(([topRes, gemRes]) => {
        if (cancelled) return;
        setVaeTopPicks(topRes.recommendations);
        setVaeHiddenGems(gemRes.recommendations);
      })
      .catch(() => {
        if (!cancelled) {
          setVaeTopPicks([]);
          setVaeHiddenGems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, activeRatings]);

  // Fetch mood-aligned MovieLens 1M picks whenever todayMood changes
  useEffect(() => {
    const moodKey = todayMood?.moodKey;
    if (!moodKey) {
      setMoodMovies([]);
      return;
    }
    let cancelled = false;
    setLoadingMoodMovies(true);
    api
      .getMoodMovies(moodKey)
      .then((res) => {
        if (!cancelled) setMoodMovies(res.movies);
      })
      .catch(() => {
        if (!cancelled) setMoodMovies([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMoodMovies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [todayMood?.moodKey, user?.id]);

  // Fetch picks aligned with user's saved genre preferences (kept separate from daily mood)
  const primaryPrefGenre =
    preferences?.favoriteGenres?.[0] ?? preferences?.preferredGenres?.[0] ?? null;
  const primaryPrefLanguage = preferences?.originalLanguages?.[0] ?? "all";
  useEffect(() => {
    if (!user || !primaryPrefGenre) {
      setPrefGenreMovies([]);
      return;
    }
    let cancelled = false;
    api
      .searchMovies("", primaryPrefGenre, 12, 0, primaryPrefLanguage)
      .then((res) => {
        if (!cancelled) {
          if (res.movies.length > 0) {
            setPrefGenreMovies(res.movies);
          } else {
            api
              .searchMovies("", primaryPrefGenre, 12, 0, "all")
              .then((fallback) => {
                if (!cancelled) setPrefGenreMovies(fallback.movies);
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {
        if (!cancelled) setPrefGenreMovies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, primaryPrefGenre, primaryPrefLanguage]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSearch(true);
    const timer = setTimeout(() => {
      api
        .searchMovies(
          searchQuery,
          selectedGenre,
          18,
          0,
          selectedLanguage,
          selectedAudioMode
        )
        .then((res) => {
          if (!cancelled) {
            setSearchResults(res.movies);
            setSearchTotal(res.total);
          }
        })
        .catch(() => {
          // keep previous state on transient search error
        })
        .finally(() => {
          if (!cancelled) setLoadingSearch(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedGenre, selectedLanguage, selectedAudioMode]);

  const orderedLanguageRows = useMemo(() => {
    const preferredOrder = [
      ...(preferences?.originalLanguages ?? []),
      ...(preferences?.dubbedLanguages ?? []),
    ];
    if (preferredOrder.length === 0) return LANGUAGE_ROW_META;
    const rank = new Map<string, number>();
    preferredOrder.forEach((code, idx) => {
      if (!rank.has(code)) rank.set(code, idx);
    });
    return [...LANGUAGE_ROW_META].sort((a, b) => {
      const ra = rank.get(a.code) ?? 99;
      const rb = rank.get(b.code) ?? 99;
      return ra - rb;
    });
  }, [preferences?.originalLanguages, preferences?.dubbedLanguages]);

  // Build auto-sliding hero showcase from recent movies across Hindi, Telugu, Malayalam, Tamil & Kannada
  const heroSlides = useMemo(() => {
    const targetLanguages: LanguageCode[] = ["hi", "te", "ml", "ta", "kn"];
    const poolByLang = new Map<LanguageCode, Movie[]>();
    const seenIds = new Set<string>();

    const allCandidates: Movie[] = [
      ...(discover?.trending ?? []),
      ...(languageRows.hi ?? []),
      ...(languageRows.te ?? []),
      ...(languageRows.ml ?? []),
      ...(languageRows.ta ?? []),
      ...(languageRows.kn ?? []),
    ];

    for (const lang of targetLanguages) {
      const langCandidates = allCandidates
        .filter((m) => m.language_code === lang && (m.backdrop_url || m.poster_url))
        .sort((a, b) => {
          const yearDiff = (b.release_year ?? 0) - (a.release_year ?? 0);
          if (yearDiff !== 0) return yearDiff;
          return (b.vote_average ?? b.ml_avg_rating ?? 0) - (a.vote_average ?? a.ml_avg_rating ?? 0);
        });

      const uniqueForLang: Movie[] = [];
      for (const m of langCandidates) {
        const key = String(m.movielens_id ?? m.tmdb_id ?? m.title);
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        uniqueForLang.push(m);
        if (uniqueForLang.length >= 2) break;
      }
      if (uniqueForLang.length > 0) {
        poolByLang.set(lang, uniqueForLang);
      }
    }

    const slides: Movie[] = [];
    for (let round = 0; round < 2; round++) {
      for (const lang of targetLanguages) {
        const list = poolByLang.get(lang);
        if (list && list[round]) {
          slides.push(list[round]);
        }
      }
    }

    if (slides.length > 0) return slides;
    return discover?.featured ? [discover.featured] : [];
  }, [discover, languageRows]);

  useEffect(() => {
    setHeroSlideIndex((prev) =>
      heroSlides.length > 0 ? prev % heroSlides.length : 0
    );
  }, [heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length <= 1 || heroPaused) return;
    const timer = window.setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, heroPaused]);

  const featured = heroSlides[heroSlideIndex] ?? discover?.featured ?? null;
  const featuredInWatchlist = featured?.movielens_id
    ? watchlistSet.has(featured.movielens_id)
    : false;

  // Group a "Because You Rated <Top Anchor>" row from live Mult-VAE output
  const becauseYouRated = useMemo(() => {
    if (vaeTopPicks.length === 0) return null;
    const counts = new Map<string, number>();
    for (const item of vaeTopPicks) {
      const anchor = item.anchorMovieTitle ?? item.similarToTitle;
      if (anchor) counts.set(anchor, (counts.get(anchor) ?? 0) + 1);
    }
    let topAnchor: string | null = null;
    let bestCount = 0;
    for (const [title, cnt] of counts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        topAnchor = title;
      }
    }
    if (!topAnchor) return null;
    const matches = vaeTopPicks.filter(
      (i) => (i.anchorMovieTitle ?? i.similarToTitle) === topAnchor
    );
    const list = matches.length >= 4 ? matches : vaeTopPicks.slice(0, 10);
    return { anchorTitle: topAnchor, items: list };
  }, [vaeTopPicks]);

  const isFilteredBrowse =
    Boolean(searchQuery.trim()) ||
    selectedGenre !== "All" ||
    selectedLanguage !== "all" ||
    selectedAudioMode !== "all";

  const renderMovieCard = (
    movie: Movie,
    keyPrefix: string,
    extra?: {
      matchLabel?: string | null;
      rankIndex?: number;
      whyText?: string | null;
    }
  ) => (
    <MovieCard
      key={`${keyPrefix}-${movie.movielens_id ?? movie.tmdb_id ?? movie.title}`}
      movie={movie}
      variant="carousel"
      onSelectMovie={onSelectMovie}
      userRating={
        movie.movielens_id ? ratingsMap.get(movie.movielens_id) : undefined
      }
      onRate={onRate}
      onDeleteRating={onDeleteRating}
      inWatchlist={
        movie.movielens_id ? watchlistSet.has(movie.movielens_id) : false
      }
      onToggleWatchlist={onToggleWatchlist}
      matchLabel={extra?.matchLabel}
      rankIndex={extra?.rankIndex}
      whyText={extra?.whyText}
    />
  );

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Full-Bleed Widescreen Auto-Sliding Hero Showcase */}
      <section
        className="relative w-full min-h-[70vh] sm:min-h-[76vh] max-h-[760px] flex items-end overflow-hidden bg-[#141414]"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
      >
        {heroSlides.length > 0 ? (
          heroSlides.map((slide, idx) => {
            const isActive = idx === heroSlideIndex;
            const slideKey = `hero-bg-${slide.movielens_id ?? slide.tmdb_id ?? slide.title}-${idx}`;
            return (
              <img
                key={slideKey}
                src={slide.backdrop_url || slide.poster_url || HERO_FALLBACK}
                alt={`${slide.title} backdrop`}
                referrerPolicy="no-referrer"
                className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-[1400ms] ease-out ${
                  isActive
                    ? "opacity-70 scale-105 z-0"
                    : "opacity-0 scale-100 z-0 pointer-events-none"
                }`}
              />
            );
          })
        ) : (
          <img
            src={HERO_FALLBACK}
            alt="Cinema hero backdrop"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-70"
          />
        )}
        {/* Rich multi-stop bottom & left gradient vignettes */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/55 to-black/30 z-[1]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/70 to-transparent z-[1]" />

        {heroSlides.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous featured movie"
              onClick={() =>
                setHeroSlideIndex((prev) =>
                  (prev - 1 + heroSlides.length) % heroSlides.length
                )
              }
              className="hidden sm:inline-flex absolute left-3 lg:left-5 top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white hover:bg-black/80 hover:border-white/40 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next featured movie"
              onClick={() =>
                setHeroSlideIndex((prev) => (prev + 1) % heroSlides.length)
              }
              className="hidden sm:inline-flex absolute right-3 lg:right-5 top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white hover:bg-black/80 hover:border-white/40 transition-colors cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <div className="relative z-10 mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12 pb-12 sm:pb-16 pt-24">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div
              key={featured ? `hero-info-${featured.movielens_id ?? featured.title}` : "hero-default"}
              className="max-w-2xl space-y-4 transition-opacity duration-500"
            >
              <p className="text-xs sm:text-sm font-semibold tracking-wide text-[#E50914] uppercase">
                Featured on PICKMYFLICK
                {featured?.language_code && HERO_LANGUAGE_LABELS[featured.language_code]
                  ? ` · ${HERO_LANGUAGE_LABELS[featured.language_code]} Cinema`
                  : ""}
              </p>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight text-balance drop-shadow-md">
                {featured
                  ? featured.title
                  : "Cinema Learned From Your Taste"}
              </h1>

              {featured && (
                <div className="flex flex-wrap items-center gap-2.5 text-sm text-neutral-200">
                  {featured.vote_average != null && (
                    <span className="font-semibold text-emerald-400 tabular-nums">
                      ★ {featured.vote_average.toFixed(1)}/10
                    </span>
                  )}
                  {featured.release_year && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums font-medium">
                        {featured.release_year}
                      </span>
                    </>
                  )}
                  {featured.language_code && HERO_LANGUAGE_LABELS[featured.language_code] && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-neutral-200">
                        {HERO_LANGUAGE_LABELS[featured.language_code]}
                      </span>
                    </>
                  )}
                  {featured.genres.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{featured.genres.slice(0, 3).join(" / ")}</span>
                    </>
                  )}
                  {featured.ml_rating_count > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-xs text-neutral-300 tabular-nums">
                        {featured.ml_rating_count.toLocaleString()} ratings
                      </span>
                    </>
                  )}
                </div>
              )}

              <p className="text-sm sm:text-base text-neutral-200 leading-relaxed line-clamp-3 max-w-xl">
                {featured?.overview ||
                  "Discover curated cinema across Hindi, Telugu, Malayalam, Tamil, Kannada, and global classics tailored to your taste."}
              </p>

              {/* Primary & Secondary Streaming CTAs */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate("rate")}
                  className="inline-flex items-center gap-2 rounded-md bg-[#E50914] hover:bg-[#F40612] px-5 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Star className="h-4 w-4 fill-white" />
                  <span>Rate &amp; Explore</span>
                </button>

                {featured && (
                  <button
                    type="button"
                    onClick={() => onSelectMovie(featured)}
                    className="inline-flex items-center gap-2 rounded-md bg-neutral-600/70 hover:bg-neutral-600/90 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Info className="h-4 w-4" />
                    <span>More Info</span>
                  </button>
                )}

                {featured?.movielens_id != null && (
                  <button
                    type="button"
                    onClick={() => void onToggleWatchlist(featured.movielens_id!)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-black/50 hover:border-white px-4 py-2.5 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {featuredInWatchlist ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span>{featuredInWatchlist ? "In My List" : "My List"}</span>
                  </button>
                )}
              </div>
            </div>

            {heroSlides.length > 1 && (
              <div
                className="flex items-center gap-2 self-start sm:self-end pb-1"
                aria-label="Hero showcase slides"
              >
                {heroSlides.map((slide, idx) => {
                  const active = idx === heroSlideIndex;
                  return (
                    <button
                      key={`hero-dot-${slide.movielens_id ?? slide.title}-${idx}`}
                      type="button"
                      aria-label={`Show ${slide.title} (${(slide.language_code && HERO_LANGUAGE_LABELS[slide.language_code]) || "Featured"})`}
                      onClick={() => setHeroSlideIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        active
                          ? "w-7 bg-[#E50914]"
                          : "w-2.5 bg-white/40 hover:bg-white/70"
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200">
            {error}
          </div>
        </div>
      )}

      {/* 2. What's Your Mood Today? Interactive Daily Selector */}
      <section className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 -mt-6 relative z-20">
        <div className="rounded-xl border border-white/10 bg-[#181818] p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  What&apos;s Your Mood Today?
                </h2>
                <span className="rounded border border-white/15 bg-[#141414] px-2 py-0.5 font-mono text-[11px] text-neutral-300">
                  {todayMood?.moodDate ?? getTodayDateString()}
                </span>
                {todayMood && (
                  <span className="rounded bg-[#E50914]/20 border border-[#E50914]/50 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Active: {todayMood.moodLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                Saved per user for today only — does not overwrite your saved genre preferences.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {user && (
                <button
                  type="button"
                  onClick={onOpenEditPreferences}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#141414] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-white/35 hover:text-white transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#E50914]" />
                  <span>
                    {preferences && preferences.preferredGenres.length > 0
                      ? `Preferences (${preferences.preferredGenres.slice(0, 2).join(", ")})`
                      : "Set Preferences"}
                  </span>
                </button>
              )}
              {todayMood && (
                <button
                  type="button"
                  disabled={savingMoodKey !== null}
                  onClick={() => {
                    setSavingMoodKey("clear");
                    void onClearMood().finally(() => setSavingMoodKey(null));
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {DAILY_MOODS.map((opt) => {
              const Icon = MOOD_ICON_MAP[opt.key] ?? Sparkles;
              const active = todayMood?.moodKey === opt.key;
              const busy = savingMoodKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={savingMoodKey !== null}
                  onClick={() => {
                    setSavingMoodKey(opt.key);
                    void onSelectMood(opt).finally(() => setSavingMoodKey(null));
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                    active
                      ? "border-[#E50914] bg-[#E50914]/15 text-white"
                      : "border-white/10 bg-[#141414] text-neutral-200 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold truncate">
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? "text-[#E50914]" : "text-neutral-300"
                        }`}
                      />
                      <span className="truncate">{opt.shortLabel}</span>
                    </span>
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin text-[#E50914] shrink-0" />
                    ) : active ? (
                      <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400 truncate">
                    {opt.genres.slice(0, 2).join(" · ")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Personalized & Curated Horizontal Carousels */}
      {loadingDiscover ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin text-[#E50914]" />
          <span>Loading streaming rows...</span>
        </div>
      ) : (
        <div className="space-y-10 relative z-20">
          {/* Today's Mood Carousel */}
          {todayMood && (loadingMoodMovies || moodMovies.length > 0) && (
            <CarouselRow
              title={`Picked for Today's Mood: ${todayMood.moodLabel}`}
              subtitle={`Mood for ${todayMood.moodDate} · Your saved genre preferences remain intact`}
            >
              {loadingMoodMovies && moodMovies.length === 0 ? (
                <div className="flex items-center gap-2 py-8 px-4 text-xs text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin text-[#E50914]" />
                  <span>Curating mood picks...</span>
                </div>
              ) : (
                moodMovies.map((m) => renderMovieCard(m, "today-mood"))
              )}
            </CarouselRow>
          )}

          {/* Setup Genre Preferences Carousel */}
          {user && prefGenreMovies.length > 0 && preferences && preferences.preferredGenres.length > 0 && (
            <CarouselRow
              title={`From Your Saved Genres (${preferences.preferredGenres.slice(0, 3).join(", ")})`}
              subtitle={
                preferences.tasteStyle
                  ? `Aligned with your ${preferences.tasteStyle} setup`
                  : "Based on your saved profile preferences"
              }
              rightMeta={
                <button
                  type="button"
                  onClick={onOpenEditPreferences}
                  className="text-xs font-medium text-neutral-300 hover:text-white cursor-pointer"
                >
                  Edit preferences
                </button>
              }
            >
              {prefGenreMovies.map((m) => renderMovieCard(m, "pref-genre"))}
            </CarouselRow>
          )}

          {/* Personalized Picks Row */}
          {vaeTopPicks.length > 0 && (
            <CarouselRow
              title="Top Picks for You"
              subtitle={`Generated live from your ${activeRatings.length} rated movies`}
              rightMeta={
                <button
                  type="button"
                  onClick={() => onNavigate("recommendations")}
                  className="text-xs font-medium text-neutral-300 hover:text-white cursor-pointer"
                >
                  Explore all 20 →
                </button>
              }
            >
              {vaeTopPicks.slice(0, 14).map((rec) =>
                rec.movie
                  ? renderMovieCard(rec.movie, "vae-top", {
                      rankIndex: rec.rank,
                      matchLabel: `${(rec.normalizedScore * 100).toFixed(0)}% match`,
                      whyText: rec.anchorMovieTitle
                        ? `Because you liked ${rec.anchorMovieTitle}`
                        : null,
                    })
                  : null
              )}
            </CarouselRow>
          )}

          {/* Because You Rated Anchor Row */}
          {becauseYouRated && (
            <CarouselRow
              title={`Because You Rated ${becauseYouRated.anchorTitle}`}
              subtitle="Titles closely aligned with your favorite rated movie"
            >
              {becauseYouRated.items.map((rec) =>
                rec.movie
                  ? renderMovieCard(rec.movie, "because-rated", {
                      matchLabel:
                        rec.anchorSimilarity && rec.anchorSimilarity > 0
                          ? `${(rec.anchorSimilarity * 100).toFixed(0)}% sim`
                          : null,
                    })
                  : null
              )}
            </CarouselRow>
          )}

          {/* Trending Now */}
          {discover && discover.trending.length > 0 && (
            <CarouselRow
              title="Trending Now"
              subtitle="Popular Kannada, regional, and Hollywood blockbusters"
            >
              {discover.trending.map((m) => renderMovieCard(m, "trending"))}
            </CarouselRow>
          )}

          {/* Hidden Gems (Personalized when rated, otherwise curated lower-exposure high-rated ML-1M) */}
          {vaeHiddenGems.length > 0 ? (
            <CarouselRow
              title="Hidden Gems for You"
              subtitle="Curated lesser-known picks tailored to your ratings"
            >
              {vaeHiddenGems.slice(0, 14).map((rec) =>
                rec.movie
                  ? renderMovieCard(rec.movie, "vae-gems", {
                      matchLabel: `${(rec.normalizedScore * 100).toFixed(0)}% match`,
                      whyText: rec.anchorMovieTitle
                        ? `Similar to ${rec.anchorMovieTitle}`
                        : null,
                    })
                  : null
              )}
            </CarouselRow>
          ) : (
            discover &&
            discover.upcoming.length > 0 && (
              <CarouselRow
                title="Hidden Gems & Late-90s Highlights"
                subtitle="Explore beyond mainstream blockbusters"
              >
                {discover.upcoming.map((m) => renderMovieCard(m, "gems"))}
              </CarouselRow>
            )
          )}

          {/* Top-Rated Classics */}
          {discover && discover.top_rated.length > 0 && (
            <CarouselRow
              title="Top-Rated Classics"
              subtitle="Highest Bayesian-weighted MovieLens 1M ratings"
            >
              {discover.top_rated.map((m) => renderMovieCard(m, "top-rated"))}
            </CarouselRow>
          )}

          {/* 6 Multilingual Cinema Carousels */}
          {orderedLanguageRows.map((rowMeta) => {
            const list = languageRows[rowMeta.code] ?? [];
            if (list.length === 0) return null;
            return (
              <CarouselRow
                key={`lang-row-${rowMeta.code}`}
                title={rowMeta.title}
                subtitle={rowMeta.subtitle}
                rightMeta={
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLanguage(rowMeta.code);
                      setTimeout(() => {
                        catalogSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                        });
                      }, 50);
                    }}
                    className="text-xs font-medium text-neutral-300 hover:text-white cursor-pointer"
                  >
                    Filter {rowMeta.title} →
                  </button>
                }
              >
                {list.map((m) => renderMovieCard(m, `lang-${rowMeta.code}`))}
              </CarouselRow>
            );
          })}

          {/* Genre Rows */}
          {scifiRow.length > 0 && (
            <CarouselRow
              title="Sci-Fi & Speculative Worlds"
              subtitle="Cyberpunk, space epics & cerebral futures"
            >
              {scifiRow.map((m) => renderMovieCard(m, "genre-scifi"))}
            </CarouselRow>
          )}

          {thrillerRow.length > 0 && (
            <CarouselRow
              title="90s Thrillers & Neo-Noir"
              subtitle="Suspenseful mysteries and psychological dramas"
            >
              {thrillerRow.map((m) => renderMovieCard(m, "genre-thriller"))}
            </CarouselRow>
          )}

          {dramaRow.length > 0 && (
            <CarouselRow
              title="Critically Acclaimed Dramas"
              subtitle="Character-driven cinema across the catalog"
            >
              {dramaRow.map((m) => renderMovieCard(m, "genre-drama"))}
            </CarouselRow>
          )}
        </div>
      )}

      {/* 3. Interactive Catalog Search, Language & Genre Explorer */}
      <section
        ref={catalogSectionRef}
        className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 pt-4 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-white/10 pt-8">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Browse Full Catalog
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              {searchTotal > 0
                ? `${searchTotal.toLocaleString()} titles matching your filter`
                : "Search across MovieLens 1M & curated multilingual cinema"}
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, actor, or director..."
              className="w-full rounded-md border border-white/15 bg-[#181818] pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:border-white/40 focus:outline-none"
            />
          </div>
        </div>

        {/* Language & Audio Mode Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedLanguage("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedLanguage === "all"
                  ? "bg-[#E50914] text-white font-semibold"
                  : "bg-[#181818] text-neutral-300 border border-white/10 hover:border-white/30"
              }`}
            >
              All Languages
            </button>
            {LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setSelectedLanguage(lang.code)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedLanguage === lang.code
                    ? "bg-[#E50914] text-white font-semibold"
                    : "bg-[#181818] text-neutral-300 border border-white/10 hover:border-white/30"
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-md bg-[#181818] p-1 border border-white/10">
            {(
              [
                { id: "all", label: "All Audio" },
                { id: "original", label: "Original" },
                { id: "dubbed", label: "Dubbed Available" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedAudioMode(opt.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  selectedAudioMode === opt.id
                    ? "bg-white text-black font-semibold"
                    : "text-neutral-300 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Genre filter buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <SlidersHorizontal className="h-4 w-4 text-neutral-400 shrink-0 mr-1" />
          <button
            type="button"
            onClick={() => setSelectedGenre("All")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedGenre === "All"
                ? "bg-white text-black font-semibold"
                : "bg-[#181818] text-neutral-300 border border-white/10 hover:border-white/30"
            }`}
          >
            All Genres
          </button>
          {genres.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => setSelectedGenre(g.name)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedGenre === g.name
                  ? "bg-white text-black font-semibold"
                  : "bg-[#181818] text-neutral-300 border border-white/10 hover:border-white/30"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {loadingSearch && searchResults.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[2/3] rounded-md bg-[#181818] border border-white/10 animate-pulse"
              />
            ))}
          </div>
        ) : searchResults.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#181818] p-8 text-center space-y-3">
            <p className="text-sm text-neutral-300">
              No movies matched your filter. Try clearing the search, genre, or language filters.
            </p>
            {isFilteredBrowse && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedGenre("All");
                  setSelectedLanguage("all");
                  setSelectedAudioMode("all");
                }}
                className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-1.5 text-xs font-medium text-white cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {searchResults.map((movie) => (
              <MovieCard
                key={`catalog-${movie.movielens_id}-${movie.tmdb_id}`}
                movie={movie}
                onSelectMovie={onSelectMovie}
                userRating={
                  movie.movielens_id
                    ? ratingsMap.get(movie.movielens_id)
                    : undefined
                }
                onRate={onRate}
                onDeleteRating={onDeleteRating}
                inWatchlist={
                  movie.movielens_id
                    ? watchlistSet.has(movie.movielens_id)
                    : false
                }
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 border-t border-white/10 pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-neutral-400">
        <div>
          <p className="font-semibold text-neutral-200">
            PICKMYFLICK · Personalized Movie Recommendation System
          </p>
          <p className="mt-1">
            Trained on GroupLens MovieLens 1M (1,000,209 ratings). Enriched with TMDB &amp; Wikipedia film metadata.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onNavigate("rate")}
            className="hover:text-white cursor-pointer"
          >
            Rate Movies
          </button>
          <button
            type="button"
            onClick={() => onNavigate("recommendations")}
            className="hover:text-white cursor-pointer"
          >
            Recommendations
          </button>
          <button
            type="button"
            onClick={() => onNavigate("insights")}
            className="hover:text-white cursor-pointer"
          >
            Insights
          </button>
        </div>
      </footer>
    </div>
  );
}
