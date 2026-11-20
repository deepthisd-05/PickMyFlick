import type {
  AlgorithmType,
  AuthUser,
  DailyMood,
  DiscoveryMode,
  DiscoverySectionsResponse,
  DiscoverResponse,
  LanguagePreferenceMode,
  MLStatusResponse,
  Movie,
  RecommendationItem,
  UserInsights,
  UserPreferences,
  UserRating,
  UserStats,
} from "../types";

const TOKEN_STORAGE_KEY = "cinevae_auth_token";

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface SavePreferencesPayload {
  preferredLanguages?: string[];
  originalLanguages?: string[];
  dubbedLanguages?: string[];
  languageMode?: LanguagePreferenceMode;
  preferredGenres?: string[];
  favoriteGenres?: string[];
  favoriteActors?: string[];
  favoriteMaleActors?: string[];
  favoriteFemaleActors?: string[];
  characterTypes?: string[];
  tasteStyle?: string | null;
  tasteMovieIds?: number[];
  storyStyles?: string[];
  pacingPreference?: "fast_paced" | "slow_burn" | "balanced";
  runtimePreference?: "short" | "standard" | "long" | "any";
  eraPreference?: "classic" | "recent" | "any";
  setupCompleted?: boolean;
  skippedSteps?: number[];
  starterRatings?: Array<{ movielensId: number; rating: number }>;
}

export const api = {
  health: () =>
    request<{ status: string; tmdbConfigured: boolean; geminiConfigured: boolean }>(
      "/api/health"
    ),

  me: async (date?: string) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const res = await request<{
      user: AuthUser | null;
      stats?: UserStats;
      preferences?: UserPreferences;
      todayMood?: DailyMood | null;
    }>(`/api/auth/me${query}`);
    if (!res.user) {
      setStoredToken(null);
    }
    return res;
  },

  register: async (payload: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    username?: string;
    displayName?: string;
  }) => {
    const res = await request<{
      user: AuthUser;
      token?: string;
      preferences?: UserPreferences;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  login: async (payload: { emailOrUsername: string; password: string }) => {
    const res = await request<{ user: AuthUser; token?: string }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    if (res.token) setStoredToken(res.token);
    return res;
  },

  logout: async () => {
    setStoredToken(null);
    return request<{ status: string }>("/api/auth/logout", { method: "POST" });
  },

  updateProfile: (displayName: string) =>
    request<{ user: AuthUser }>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName }),
    }),

  getPreferences: () =>
    request<{ preferences: UserPreferences }>("/api/user/preferences"),

  savePreferences: (payload: SavePreferencesPayload) =>
    request<{ preferences: UserPreferences }>("/api/user/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getActorsCatalog: (q = "") =>
    request<{ maleActors: string[]; femaleActors: string[] }>(
      `/api/actors${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`
    ),

  trackInteraction: (
    movielensId: number,
    interactionType: "view" | "watchlist" | "rate" | "like" | "dislike",
    weight = 1.0
  ) =>
    request<{ status: string }>("/api/interactions", {
      method: "POST",
      body: JSON.stringify({ movielensId, interactionType, weight }),
    }),

  getTodayMood: (date?: string) =>
    request<{ moodDate: string; mood: DailyMood | null }>(
      `/api/user/mood${date ? `?date=${encodeURIComponent(date)}` : ""}`
    ),

  saveTodayMood: (payload: {
    moodKey: string;
    moodLabel: string;
    date?: string;
  }) =>
    request<{ mood: DailyMood }>("/api/user/mood", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  clearTodayMood: (date?: string) =>
    request<{ status: string; moodDate: string }>(
      `/api/user/mood${date ? `?date=${encodeURIComponent(date)}` : ""}`,
      { method: "DELETE" }
    ),

  getMoodMovies: (moodKey: string) =>
    request<{ moodKey: string; movies: Movie[] }>(
      `/api/user/mood-movies?moodKey=${encodeURIComponent(moodKey)}`
    ),

  discover: () => request<DiscoverResponse>("/api/movies/discover"),

  getMoviesByLanguage: (limit = 14) =>
    request<{
      rows: Record<"en" | "hi" | "kn" | "te" | "ta" | "ml", Movie[]>;
    }>(`/api/movies/by-language?limit=${limit}`),

  genres: () =>
    request<{ genres: Array<{ name: string; count: number }> }>("/api/movies/genres"),

  searchMovies: (
    q: string,
    genre = "All",
    limit = 24,
    offset = 0,
    language = "all",
    audioMode = "all"
  ) =>
    request<{ movies: Movie[]; total: number }>(
      `/api/movies/search?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(
        genre
      )}&limit=${limit}&offset=${offset}&language=${encodeURIComponent(
        language
      )}&audioMode=${encodeURIComponent(audioMode)}`
    ),

  lookupMovies: (movielensIds: number[]) =>
    request<{ movies: Movie[] }>("/api/movies/lookup", {
      method: "POST",
      body: JSON.stringify({ movielensIds }),
    }),

  movieDetails: (movielensId: number) =>
    request<{ movie: Movie; similar: Movie[] }>(`/api/movies/${movielensId}`),

  getRatings: () =>
    request<{ ratings: UserRating[]; total: number }>("/api/ratings"),

  saveRating: (
    movielensId: number,
    rating: number,
    note?: string | null,
    moodTag?: string | null
  ) =>
    request<{ status: string }>("/api/ratings", {
      method: "POST",
      body: JSON.stringify({ movielensId, rating, note, moodTag }),
    }),

  bulkSaveRatings: (
    ratings: Array<{
      movielensId: number;
      rating: number;
      note?: string | null;
      moodTag?: string | null;
    }>,
    replaceExisting = false
  ) =>
    request<{ status: string; count: number }>("/api/ratings/bulk", {
      method: "POST",
      body: JSON.stringify({ ratings, replaceExisting }),
    }),

  deleteRating: (movielensId: number) =>
    request<{ status: string }>(`/api/ratings/${movielensId}`, {
      method: "DELETE",
    }),

  clearAllRatings: () =>
    request<{ status: string }>("/api/ratings", {
      method: "DELETE",
    }),

  getWatchlist: () => request<{ movies: Movie[] }>("/api/watchlist"),

  addToWatchlist: (movielensId: number) =>
    request<{ status: string }>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ movielensId }),
    }),

  removeFromWatchlist: (movielensId: number) =>
    request<{ status: string }>(`/api/watchlist/${movielensId}`, {
      method: "DELETE",
    }),

  generateRecommendations: (
    algorithm: AlgorithmType,
    guestRatings?: Array<{ movielensId: number; rating: number }>,
    discoveryMode: DiscoveryMode = "top_ranked",
    options?: { refresh?: boolean; surpriseMe?: boolean }
  ) =>
    request<{
      batchId: string;
      algorithm: AlgorithmType;
      discoveryMode: DiscoveryMode;
      ratedMoviesCount: number;
      recommendations: RecommendationItem[];
    }>("/api/recommendations/generate", {
      method: "POST",
      body: JSON.stringify({
        algorithm,
        guestRatings,
        discoveryMode,
        refresh: options?.refresh ?? false,
        surpriseMe: options?.surpriseMe ?? false,
      }),
    }),

  getRecommendationSections: (payload?: {
    guestRatings?: Array<{ movielensId: number; rating: number }>;
    moodKey?: string | null;
    refresh?: boolean;
    surpriseMe?: boolean;
    excludeIds?: number[];
  }) =>
    request<DiscoverySectionsResponse>("/api/recommendations/sections", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  getRecommendationHistory: (
    algorithm?: AlgorithmType,
    discoveryMode: DiscoveryMode = "top_ranked"
  ) =>
    request<{
      batchId: string | null;
      algorithm?: AlgorithmType;
      discoveryMode?: DiscoveryMode;
      recommendations: RecommendationItem[];
    }>(
      algorithm
        ? `/api/recommendations/history?algorithm=${algorithm}&discoveryMode=${discoveryMode}`
        : "/api/recommendations/history"
    ),

  sendRecommendationFeedback: (
    historyId: number,
    feedback: "like" | "dislike" | null
  ) =>
    request<{ status: string }>("/api/recommendations/feedback", {
      method: "POST",
      body: JSON.stringify({ historyId, feedback }),
    }),

  explainRecommendation: (
    movielensId: number,
    algorithm: AlgorithmType,
    score: number
  ) =>
    request<{ explanation: string }>("/api/recommendations/explain", {
      method: "POST",
      body: JSON.stringify({ movielensId, algorithm, score }),
    }),

  getMLStatus: () => request<MLStatusResponse>("/api/ml/status"),

  trainVAE: (cfg: {
    hiddenDim?: number;
    latentDim?: number;
    epochs?: number;
    betaMax?: number;
    learningRate?: number;
  }) =>
    request<{ status: string }>("/api/ml/train/vae", {
      method: "POST",
      body: JSON.stringify(cfg),
    }),

  trainMF: (cfg: {
    latentDim?: number;
    epochs?: number;
    learningRate?: number;
    reg?: number;
  }) =>
    request<{ status: string }>("/api/ml/train/mf", {
      method: "POST",
      body: JSON.stringify(cfg),
    }),

  trainPopularity: () =>
    request<{ status: string }>("/api/ml/train/popularity", { method: "POST" }),

  evaluateModels: () =>
    request<{ status: string; metrics: unknown[] }>("/api/ml/evaluate", {
      method: "POST",
    }),

  getUserInsights: () => request<UserInsights>("/api/insights/user"),
};
