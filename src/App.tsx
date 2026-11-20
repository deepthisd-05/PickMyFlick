import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthModal } from "./components/AuthModal";
import { MoodPickerModal } from "./components/MoodPickerModal";
import { MovieDetailsModal } from "./components/MovieDetailsModal";
import { Navbar, type NavPage } from "./components/Navbar";
import { SetupWizardModal } from "./components/SetupWizardModal";
import {
  getTodayDateString,
  type DailyMoodOption,
} from "./data/preferencesData";
import type { PresetRatingItem } from "./data/presets";
import { AIInsights } from "./pages/AIInsights";
import { Home } from "./pages/Home";
import { RateMovies } from "./pages/RateMovies";
import { Recommendations } from "./pages/Recommendations";
import { api, type SavePreferencesPayload } from "./services/api";
import type {
  AuthUser,
  DailyMood,
  Movie,
  UserPreferences,
  UserRating,
  UserStats,
} from "./types";

const GUEST_RATINGS_KEY = "cinevae_guest_ratings";
const GUEST_MOOD_PREFIX = "marrow_guest_mood_";
const GUEST_VIEWED_KEY = "cinevae_guest_viewed";

export interface ViewedMovieEntry {
  movielens_id: number;
  title: string;
  release_year: number | null;
  genres: string[];
  viewed_at: string;
}

function loadGuestViewed(): ViewedMovieEntry[] {
  try {
    const raw = window.localStorage.getItem(GUEST_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestViewed(list: ViewedMovieEntry[]) {
  try {
    window.localStorage.setItem(GUEST_VIEWED_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

function loadGuestMood(): DailyMood | null {
  try {
    const today = getTodayDateString();
    const raw = window.localStorage.getItem(`${GUEST_MOOD_PREFIX}${today}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyMood;
    return parsed?.moodKey ? parsed : null;
  } catch {
    return null;
  }
}

function saveGuestMood(mood: DailyMood | null) {
  try {
    const today = getTodayDateString();
    if (mood) {
      window.localStorage.setItem(`${GUEST_MOOD_PREFIX}${today}`, JSON.stringify(mood));
    } else {
      window.localStorage.removeItem(`${GUEST_MOOD_PREFIX}${today}`);
    }
  } catch {
    // ignore storage errors
  }
}

function loadGuestRatings(): UserRating[] {
  try {
    const raw = window.localStorage.getItem(GUEST_RATINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestRatings(list: UserRating[]) {
  try {
    window.localStorage.setItem(GUEST_RATINGS_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

export interface RateOptions {
  note?: string | null;
  moodTag?: string | null;
}

export default function App() {
  const [page, setPage] = useState<NavPage>("home");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [userRatings, setUserRatings] = useState<UserRating[]>([]);
  const [guestRatings, setGuestRatings] = useState<UserRating[]>(() =>
    loadGuestRatings()
  );
  const [guestViewed, setGuestViewed] = useState<ViewedMovieEntry[]>(() =>
    loadGuestViewed()
  );
  const [watchlist, setWatchlist] = useState<Movie[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [todayMood, setTodayMood] = useState<DailyMood | null>(() => loadGuestMood());
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardMode, setSetupWizardMode] = useState<"onboarding" | "edit">("onboarding");
  const [moodModalOpen, setMoodModalOpen] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [tmdbConfigured, setTmdbConfigured] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  const authOpenRef = useRef(authModalOpen);
  const selectedMovieRef = useRef(selectedMovie);
  const setupWizardOpenRef = useRef(setupWizardOpen);
  const moodModalOpenRef = useRef(moodModalOpen);
  authOpenRef.current = authModalOpen;
  selectedMovieRef.current = selectedMovie;
  setupWizardOpenRef.current = setupWizardOpen;
  moodModalOpenRef.current = moodModalOpen;

  const openMovieModal = useCallback((movie: Movie) => {
    if (!selectedMovieRef.current) {
      try {
        window.history.pushState(
          { cinevaeModal: "movie", movieId: movie.movielens_id },
          "",
          window.location.href
        );
      } catch {
        // ignore history errors in restricted frames
      }
    }
    if (movie.movielens_id != null) {
      const entry: ViewedMovieEntry = {
        movielens_id: movie.movielens_id,
        title: movie.title,
        release_year: movie.release_year ?? null,
        genres: movie.genres ?? [],
        viewed_at: new Date().toISOString(),
      };
      setGuestViewed((prev) => {
        const next = [
          entry,
          ...prev.filter((v) => v.movielens_id !== entry.movielens_id),
        ].slice(0, 12);
        saveGuestViewed(next);
        return next;
      });
    }
    setSelectedMovie(movie);
  }, []);

  const closeMovieModal = useCallback(() => {
    setSelectedMovie(null);
    try {
      if (window.history.state?.cinevaeModal === "movie") {
        window.history.back();
      }
    } catch {
      // ignore history errors
    }
  }, []);

  const openAuthModal = useCallback(() => {
    if (!authOpenRef.current) {
      try {
        window.history.pushState(
          { cinevaeModal: "auth" },
          "",
          window.location.href
        );
      } catch {
        // ignore history errors
      }
    }
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    try {
      if (window.history.state?.cinevaeModal === "auth") {
        window.history.back();
      }
    } catch {
      // ignore history errors
    }
  }, []);

  const switchAuthToMovieModal = useCallback((movie: Movie) => {
    setAuthModalOpen(false);
    setSelectedMovie(movie);
    try {
      if (window.history.state?.cinevaeModal === "auth") {
        window.history.replaceState(
          { cinevaeModal: "movie", movieId: movie.movielens_id },
          "",
          window.location.href
        );
      } else {
        window.history.pushState(
          { cinevaeModal: "movie", movieId: movie.movielens_id },
          "",
          window.location.href
        );
      }
    } catch {
      // ignore history errors
    }
  }, []);

  // Sync browser Back button (popstate) and Escape key with modal stack
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const modalState = e.state?.cinevaeModal;
      if (authOpenRef.current && modalState !== "auth") {
        setAuthModalOpen(false);
        return;
      }
      if (selectedMovieRef.current && modalState !== "movie") {
        setSelectedMovie(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (moodModalOpenRef.current) {
        e.preventDefault();
        setMoodModalOpen(false);
      } else if (setupWizardOpenRef.current && setupWizardMode === "edit") {
        e.preventDefault();
        setSetupWizardOpen(false);
      } else if (authOpenRef.current) {
        e.preventDefault();
        closeAuthModal();
      } else if (selectedMovieRef.current) {
        e.preventDefault();
        closeMovieModal();
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAuthModal, closeMovieModal, setupWizardMode]);

  const loadUserData = useCallback(async (opts?: { justRegistered?: boolean }) => {
    try {
      const today = getTodayDateString();
      const meRes = await api.me(today);
      setUser(meRes.user);
      setUserStats(meRes.stats ?? null);
      if (meRes.user) {
        // Keep Demo Researcher sandbox isolated from personal guest ratings
        if (!meRes.user.is_demo) {
          const pendingGuest = loadGuestRatings();
          if (pendingGuest.length > 0) {
            await api
              .bulkSaveRatings(
                pendingGuest.map((gr) => ({
                  movielensId: gr.movielens_id,
                  rating: gr.rating,
                  note: gr.note ?? null,
                  moodTag: gr.mood_tag ?? null,
                })),
                false
              )
              .catch(() => {});
            saveGuestRatings([]);
            setGuestRatings([]);
          }
        }

        const [rRes, wRes, refreshedMe] = await Promise.all([
          api.getRatings(),
          api.getWatchlist(),
          api.me(today),
        ]);
        setUserRatings(rRes.ratings);
        setWatchlist(wRes.movies);
        setUserStats(refreshedMe.stats ?? null);
        setPreferences(refreshedMe.preferences ?? null);
        setTodayMood(refreshedMe.todayMood ?? null);

        if (
          !meRes.user.is_demo &&
          (opts?.justRegistered ||
            (refreshedMe.preferences && !refreshedMe.preferences.setupCompleted))
        ) {
          setSetupWizardMode("onboarding");
          setSetupWizardOpen(true);
        }
      } else {
        setUserRatings([]);
        setWatchlist([]);
        setPreferences(null);
        setTodayMood(loadGuestMood());
      }
    } catch {
      setUser(null);
      setPreferences(null);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadUserData();
    api
      .health()
      .then((h) => {
        setGeminiConfigured(h.geminiConfigured);
        setTmdbConfigured(h.tmdbConfigured);
      })
      .catch(() => {});
  }, [loadUserData]);

  const activeRatings = user ? userRatings : guestRatings;

  const ratingsMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of activeRatings) m.set(r.movielens_id, r.rating);
    return m;
  }, [activeRatings]);

  const ratingDetailsMap = useMemo(() => {
    const m = new Map<number, UserRating>();
    for (const r of activeRatings) m.set(r.movielens_id, r);
    return m;
  }, [activeRatings]);

  const watchlistSet = useMemo(() => {
    const s = new Set<number>();
    for (const m of watchlist) {
      if (m.movielens_id != null) s.add(m.movielens_id);
    }
    return s;
  }, [watchlist]);

  const handleRate = async (
    movielensId: number,
    rating: number,
    options?: RateOptions
  ) => {
    if (!user) {
      let movieMeta: Movie | null =
        selectedMovie?.movielens_id === movielensId ? selectedMovie : null;
      if (!movieMeta) {
        try {
          const det = await api.movieDetails(movielensId);
          movieMeta = det.movie;
        } catch {
          movieMeta = null;
        }
      }
      const now = new Date().toISOString();
      setGuestRatings((prev) => {
        const existing = prev.find((p) => p.movielens_id === movielensId);
        const filtered = prev.filter((r) => r.movielens_id !== movielensId);
        const nextNote =
          options?.note !== undefined ? options.note : existing?.note ?? null;
        const nextMood =
          options?.moodTag !== undefined
            ? options.moodTag
            : existing?.mood_tag ?? null;
        const next: UserRating[] = [
          {
            id: movielensId,
            movielens_id: movielensId,
            rating,
            note: nextNote,
            mood_tag: nextMood,
            created_at: existing?.created_at ?? now,
            updated_at: now,
            movie: movieMeta ?? existing?.movie ?? null,
          },
          ...filtered,
        ];
        saveGuestRatings(next);
        return next;
      });
      return;
    }
    await api.saveRating(movielensId, rating, options?.note, options?.moodTag);
    await loadUserData();
  };

  const handleBulkRate = async (
    items: PresetRatingItem[],
    replaceExisting = false
  ) => {
    if (!user) {
      const ids = items.map((i) => i.movielensId);
      const lookupRes = await api.lookupMovies(ids).catch(() => ({ movies: [] }));
      const movieById = new Map(
        lookupRes.movies.map((m) => [m.movielens_id, m])
      );
      const now = new Date().toISOString();
      setGuestRatings((prev) => {
        const base = replaceExisting ? [] : [...prev];
        const byId = new Map(base.map((r) => [r.movielens_id, r]));
        for (const item of items) {
          const prevItem = byId.get(item.movielensId);
          byId.set(item.movielensId, {
            id: item.movielensId,
            movielens_id: item.movielensId,
            rating: item.rating,
            note: item.note ?? prevItem?.note ?? null,
            mood_tag: item.moodTag ?? prevItem?.mood_tag ?? null,
            created_at: prevItem?.created_at ?? now,
            updated_at: now,
            movie: movieById.get(item.movielensId) ?? prevItem?.movie ?? null,
          });
        }
        const next = Array.from(byId.values());
        saveGuestRatings(next);
        return next;
      });
      return;
    }

    await api.bulkSaveRatings(
      items.map((item) => ({
        movielensId: item.movielensId,
        rating: item.rating,
        note: item.note ?? null,
        moodTag: item.moodTag ?? null,
      })),
      replaceExisting
    );
    await loadUserData();
  };

  const handleDeleteRating = async (movielensId: number) => {
    if (!user) {
      setGuestRatings((prev) => {
        const next = prev.filter((r) => r.movielens_id !== movielensId);
        saveGuestRatings(next);
        return next;
      });
      return;
    }
    await api.deleteRating(movielensId);
    await loadUserData();
  };

  const handleResetRatings = async () => {
    if (!user) {
      saveGuestRatings([]);
      setGuestRatings([]);
      return;
    }
    await api.clearAllRatings();
    await loadUserData();
  };

  const handleToggleWatchlist = async (movielensId: number) => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (watchlistSet.has(movielensId)) {
      await api.removeFromWatchlist(movielensId);
    } else {
      await api.addToWatchlist(movielensId);
    }
    await loadUserData();
  };

  const handleQuickDemoLogin = async () => {
    await api.login({
      emailOrUsername: "demo@cinevae.edu",
      password: "cinevae2026",
    });
    await loadUserData();
  };

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await api.logout().catch(() => {});
      setUser(null);
      setUserStats(null);
      setUserRatings([]);
      setWatchlist([]);
      setPreferences(null);
      setTodayMood(loadGuestMood());
      setSetupWizardOpen(false);
      setMoodModalOpen(false);
      setPage("home");
      if (authOpenRef.current) {
        closeAuthModal();
      }
    } finally {
      setSigningOut(false);
    }
  }, [closeAuthModal]);

  const handleSavePreferences = useCallback(
    async (payload: SavePreferencesPayload) => {
      const res = await api.savePreferences(payload);
      setPreferences(res.preferences);
      if (payload.starterRatings && payload.starterRatings.length > 0) {
        await loadUserData();
      }
    },
    [loadUserData]
  );

  const handleSelectDailyMood = useCallback(
    async (option: DailyMoodOption) => {
      const today = getTodayDateString();
      if (!user) {
        const guestMood: DailyMood = {
          moodDate: today,
          moodKey: option.key,
          moodLabel: option.label,
        };
        saveGuestMood(guestMood);
        setTodayMood(guestMood);
        return;
      }
      const res = await api.saveTodayMood({
        moodKey: option.key,
        moodLabel: option.label,
        date: today,
      });
      setTodayMood(res.mood);
    },
    [user]
  );

  const handleClearDailyMood = useCallback(async () => {
    const today = getTodayDateString();
    if (!user) {
      saveGuestMood(null);
      setTodayMood(null);
      return;
    }
    await api.clearTodayMood(today);
    setTodayMood(null);
  }, [user]);

  const openEditPreferences = useCallback(() => {
    if (!user) {
      openAuthModal();
      return;
    }
    setSetupWizardMode("edit");
    setSetupWizardOpen(true);
  }, [user, openAuthModal]);

  const openMoodPicker = useCallback(() => {
    setMoodModalOpen(true);
  }, []);

  const selectedRatingEntry = selectedMovie?.movielens_id
    ? ratingDetailsMap.get(selectedMovie.movielens_id)
    : undefined;

  const handleHeaderSearchSubmit = useCallback((query: string) => {
    setGlobalSearchQuery(query);
    setPage("home");
  }, []);

  const handleClearGlobalSearch = useCallback(() => {
    setGlobalSearchQuery("");
  }, []);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#141414] text-neutral-100 flex flex-col items-center justify-center px-4">
        <div className="font-display text-3xl font-extrabold tracking-tight text-[#E50914]">
          PICKMYFLICK
        </div>
        <p className="mt-2 text-xs text-neutral-400">Checking session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthModal
        open={true}
        fullScreenGate={true}
        onClose={() => {}}
        user={null}
        userStats={null}
        preferences={null}
        todayMood={todayMood}
        userRatings={activeRatings}
        guestRatingCount={guestRatings.length}
        watchlist={watchlist}
        onAuthSuccess={async (opts) => {
          setPage("home");
          await loadUserData(opts);
        }}
        onSignOut={handleSignOut}
        onRemoveWatchlist={async () => {}}
        onSelectMovie={() => {}}
        onOpenEditPreferences={() => {}}
        onOpenMoodPicker={() => {}}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] text-neutral-100">
      <Navbar
        activePage={page}
        onNavigate={setPage}
        user={user}
        userStats={userStats}
        todayMood={todayMood}
        guestRatingCount={guestRatings.length}
        tmdbConfigured={tmdbConfigured}
        signingOut={signingOut}
        onOpenAuth={openAuthModal}
        onOpenEditPreferences={openEditPreferences}
        onOpenMoodPicker={openMoodPicker}
        onSignOut={handleSignOut}
        onSelectMovie={openMovieModal}
        onSubmitSearch={handleHeaderSearchSubmit}
      />

      <main>
        {page === "home" && (
          <Home
            user={user}
            preferences={preferences}
            todayMood={todayMood}
            activeRatings={activeRatings}
            globalSearchQuery={globalSearchQuery}
            onClearGlobalSearch={handleClearGlobalSearch}
            onNavigate={setPage}
            onSelectMovie={openMovieModal}
            ratingsMap={ratingsMap}
            watchlistSet={watchlistSet}
            onRate={handleRate}
            onDeleteRating={handleDeleteRating}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectMood={handleSelectDailyMood}
            onClearMood={handleClearDailyMood}
            onOpenEditPreferences={openEditPreferences}
          />
        )}

        {page === "rate" && (
          <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-8 lg:px-12">
            <RateMovies
              user={user}
              userRatings={activeRatings}
              ratingsMap={ratingsMap}
              watchlistSet={watchlistSet}
              onRate={handleRate}
              onDeleteRating={handleDeleteRating}
              onResetRatings={handleResetRatings}
              onToggleWatchlist={handleToggleWatchlist}
              onSelectMovie={openMovieModal}
              onRequireAuth={openAuthModal}
            />
          </div>
        )}

        {page === "recommendations" && (
          <Recommendations
            user={user}
            todayMood={todayMood}
            activeRatings={activeRatings}
            ratingsMap={ratingsMap}
            watchlist={watchlist}
            watchlistSet={watchlistSet}
            onRate={handleRate}
            onDeleteRating={handleDeleteRating}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectMovie={openMovieModal}
            onNavigate={setPage}
            onRequireAuth={openAuthModal}
          />
        )}

        {page === "insights" && (
          <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-8 lg:px-12">
            <AIInsights
              user={user}
              activeRatings={activeRatings}
              preferences={preferences}
              todayMood={todayMood}
              watchlist={watchlist}
              guestViewed={guestViewed}
              tmdbConfigured={tmdbConfigured}
              onResetRatings={handleResetRatings}
              onRequireAuth={openAuthModal}
              onNavigate={setPage}
            />
          </div>
        )}
      </main>

      <MovieDetailsModal
        movie={selectedMovie}
        onClose={closeMovieModal}
        userRating={selectedRatingEntry?.rating}
        userNote={selectedRatingEntry?.note ?? null}
        userMoodTag={selectedRatingEntry?.mood_tag ?? null}
        inWatchlist={
          selectedMovie?.movielens_id
            ? watchlistSet.has(selectedMovie.movielens_id)
            : false
        }
        isAuthenticated={Boolean(user)}
        onRate={handleRate}
        onDeleteRating={handleDeleteRating}
        onToggleWatchlist={handleToggleWatchlist}
        onSelectSimilar={(m) => openMovieModal(m)}
        onRequireAuth={openAuthModal}
      />

      <AuthModal
        open={authModalOpen}
        onClose={closeAuthModal}
        user={user}
        userStats={userStats}
        preferences={preferences}
        todayMood={todayMood}
        userRatings={activeRatings}
        guestRatingCount={guestRatings.length}
        watchlist={watchlist}
        onAuthSuccess={loadUserData}
        onSignOut={handleSignOut}
        onRemoveWatchlist={async (id) => {
          await api.removeFromWatchlist(id);
          await loadUserData();
        }}
        onSelectMovie={switchAuthToMovieModal}
        onOpenEditPreferences={openEditPreferences}
        onOpenMoodPicker={openMoodPicker}
      />

      <SetupWizardModal
        open={setupWizardOpen}
        mode={setupWizardMode}
        userDisplayName={user?.display_name ?? "Member"}
        initialPreferences={preferences}
        onClose={() => setSetupWizardOpen(false)}
        onSavePreferences={handleSavePreferences}
      />

      <MoodPickerModal
        open={moodModalOpen}
        todayMood={todayMood}
        onClose={() => setMoodModalOpen(false)}
        onSelectMood={handleSelectDailyMood}
        onClearMood={handleClearDailyMood}
      />
    </div>
  );
}
