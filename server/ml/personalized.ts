import { getDb } from "../db.ts";
import { type MovieDTO, enrichMoviesBatch, rowToMovieDTO } from "../tmdb.ts";
import { type DiscoveryMode, generateUserRecommendations } from "./engine.ts";

export interface UserPreferencesDTO {
  preferredLanguages: string[];
  originalLanguages: string[];
  dubbedLanguages: string[];
  languageMode: "original" | "dubbed" | "both";
  favoriteGenres: string[];
  favoriteMaleActors: string[];
  favoriteFemaleActors: string[];
  characterTypes: string[];
  storyStyles: string[];
  pacingPreference: "fast_paced" | "slow_burn" | "balanced";
  runtimePreference: "short" | "long" | "any";
  eraPreference: "classic" | "recent" | "any";
  setupCompleted: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferencesDTO = {
  preferredLanguages: ["en"],
  originalLanguages: ["en"],
  dubbedLanguages: [],
  languageMode: "both",
  favoriteGenres: [],
  favoriteMaleActors: [],
  favoriteFemaleActors: [],
  characterTypes: [],
  storyStyles: [],
  pacingPreference: "balanced",
  runtimePreference: "any",
  eraPreference: "any",
  setupCompleted: false,
};

function parseArr(val: unknown, fallback: string[] = []): string[] {
  if (!val) return fallback;
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(val));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
}

export function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getUserPreferenceProfile(userId: number): UserPreferencesDTO {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  const modeRaw = String(row.language_mode || "both");
  const languageMode: "original" | "dubbed" | "both" =
    modeRaw === "original" || modeRaw === "dubbed" ? modeRaw : "both";

  const pacingRaw = String(row.pacing_preference || "balanced");
  const pacingPreference: "fast_paced" | "slow_burn" | "balanced" =
    pacingRaw === "fast_paced" || pacingRaw === "slow_burn" ? pacingRaw : "balanced";

  const runtimeRaw = String(row.runtime_preference || "any");
  const runtimePreference: "short" | "long" | "any" =
    runtimeRaw === "short" || runtimeRaw === "long" ? runtimeRaw : "any";

  const eraRaw = String(row.era_preference || "any");
  const eraPreference: "classic" | "recent" | "any" =
    eraRaw === "classic" || eraRaw === "recent" ? eraRaw : "any";

  return {
    preferredLanguages: parseArr(row.preferred_languages, ["en"]),
    originalLanguages: parseArr(row.original_languages, ["en"]),
    dubbedLanguages: parseArr(row.dubbed_languages, []),
    languageMode,
    favoriteGenres: parseArr(row.favorite_genres, []),
    favoriteMaleActors: parseArr(row.favorite_male_actors, []),
    favoriteFemaleActors: parseArr(row.favorite_female_actors, []),
    characterTypes: parseArr(row.character_types, []),
    storyStyles: parseArr(row.story_styles, []),
    pacingPreference,
    runtimePreference,
    eraPreference,
    setupCompleted: Boolean(row.setup_completed),
  };
}

export function saveUserPreferenceProfile(
  userId: number,
  input: Partial<UserPreferencesDTO>
): UserPreferencesDTO {
  const db = getDb();
  const current = getUserPreferenceProfile(userId);
  const next: UserPreferencesDTO = {
    preferredLanguages:
      input.preferredLanguages !== undefined
        ? Array.from(new Set(input.preferredLanguages.map((s) => s.toLowerCase())))
        : current.preferredLanguages,
    originalLanguages:
      input.originalLanguages !== undefined
        ? Array.from(new Set(input.originalLanguages.map((s) => s.toLowerCase())))
        : current.originalLanguages,
    dubbedLanguages:
      input.dubbedLanguages !== undefined
        ? Array.from(new Set(input.dubbedLanguages.map((s) => s.toLowerCase())))
        : current.dubbedLanguages,
    languageMode: input.languageMode ?? current.languageMode,
    favoriteGenres:
      input.favoriteGenres !== undefined
        ? Array.from(new Set(input.favoriteGenres))
        : current.favoriteGenres,
    favoriteMaleActors:
      input.favoriteMaleActors !== undefined
        ? Array.from(new Set(input.favoriteMaleActors))
        : current.favoriteMaleActors,
    favoriteFemaleActors:
      input.favoriteFemaleActors !== undefined
        ? Array.from(new Set(input.favoriteFemaleActors))
        : current.favoriteFemaleActors,
    characterTypes:
      input.characterTypes !== undefined
        ? Array.from(new Set(input.characterTypes))
        : current.characterTypes,
    storyStyles:
      input.storyStyles !== undefined
        ? Array.from(new Set(input.storyStyles))
        : current.storyStyles,
    pacingPreference: input.pacingPreference ?? current.pacingPreference,
    runtimePreference: input.runtimePreference ?? current.runtimePreference,
    eraPreference: input.eraPreference ?? current.eraPreference,
    setupCompleted:
      input.setupCompleted !== undefined
        ? Boolean(input.setupCompleted)
        : current.setupCompleted,
  };

  if (next.preferredLanguages.length === 0) {
    const combined = Array.from(
      new Set([...next.originalLanguages, ...next.dubbedLanguages])
    );
    next.preferredLanguages = combined.length > 0 ? combined : ["en"];
  }

  db.prepare(
    `INSERT INTO user_preferences (
      user_id, preferred_languages, original_languages, dubbed_languages, language_mode,
      favorite_genres, favorite_male_actors, favorite_female_actors, character_types,
      story_styles, pacing_preference, runtime_preference, era_preference,
      setup_completed, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      preferred_languages = excluded.preferred_languages,
      original_languages = excluded.original_languages,
      dubbed_languages = excluded.dubbed_languages,
      language_mode = excluded.language_mode,
      favorite_genres = excluded.favorite_genres,
      favorite_male_actors = excluded.favorite_male_actors,
      favorite_female_actors = excluded.favorite_female_actors,
      character_types = excluded.character_types,
      story_styles = excluded.story_styles,
      pacing_preference = excluded.pacing_preference,
      runtime_preference = excluded.runtime_preference,
      era_preference = excluded.era_preference,
      setup_completed = excluded.setup_completed,
      updated_at = datetime('now')`
  ).run(
    userId,
    JSON.stringify(next.preferredLanguages),
    JSON.stringify(next.originalLanguages),
    JSON.stringify(next.dubbedLanguages),
    next.languageMode,
    JSON.stringify(next.favoriteGenres),
    JSON.stringify(next.favoriteMaleActors),
    JSON.stringify(next.favoriteFemaleActors),
    JSON.stringify(next.characterTypes),
    JSON.stringify(next.storyStyles),
    next.pacingPreference,
    next.runtimePreference,
    next.eraPreference,
    next.setupCompleted ? 1 : 0
  );

  if (next.setupCompleted) {
    db.prepare("UPDATE users SET onboarding_completed = 1 WHERE id = ?").run(userId);
  }

  return next;
}

export function getTodayMood(userId: number): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT mood FROM user_daily_moods WHERE user_id = ? AND mood_date = ?")
    .get(userId, getTodayDateKey()) as { mood: string } | undefined;
  return row?.mood ?? null;
}

export function setTodayMood(userId: number, mood: string): { mood: string; moodDate: string } {
  const db = getDb();
  const moodDate = getTodayDateKey();
  const cleanMood = mood.trim();
  db.prepare(
    `INSERT INTO user_daily_moods (user_id, mood_date, mood, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, mood_date) DO UPDATE SET
       mood = excluded.mood,
       updated_at = datetime('now')`
  ).run(userId, moodDate, cleanMood);
  return { mood: cleanMood, moodDate };
}

function normalizeGenre(g: string): string {
  const lower = g.trim().toLowerCase();
  if (lower === "sci-fi" || lower === "science fiction") return "science fiction";
  if (lower === "children's" || lower === "family") return "family";
  if (lower === "history" || lower === "historical") return "historical";
  if (lower === "film-noir") return "crime";
  return lower;
}

const MOOD_TO_GENRES: Record<string, string[]> = {
  "Feel-good": ["comedy", "family", "romance", "musical", "adventure"],
  Romantic: ["romance", "drama", "musical"],
  Comedy: ["comedy", "family", "animation"],
  Action: ["action", "adventure", "science fiction"],
  Suspense: ["mystery", "thriller", "crime"],
  Thriller: ["thriller", "crime", "mystery", "action"],
  Horror: ["horror", "mystery", "thriller"],
  Emotional: ["drama", "romance", "historical"],
  Inspirational: ["inspirational", "sports", "drama", "documentary", "historical"],
  "Family time": ["family", "animation", "comedy", "adventure", "fantasy"],
  "Mind-bending": ["science fiction", "mystery", "thriller", "fantasy"],
  Nostalgic: ["drama", "comedy", "romance", "adventure", "musical"],
};

const MOOD_TO_STORY_TAGS: Record<string, string[]> = {
  "Feel-good": ["feel_good"],
  Romantic: ["emotional", "feel_good"],
  Comedy: ["feel_good", "fast_paced"],
  Action: ["fast_paced"],
  Suspense: ["plot_twists", "intelligent"],
  Thriller: ["plot_twists", "fast_paced"],
  Horror: ["plot_twists"],
  Emotional: ["emotional"],
  Inspirational: ["real_life", "emotional"],
  "Family time": ["feel_good"],
  "Mind-bending": ["intelligent", "plot_twists"],
  Nostalgic: ["classic"],
};

const CHARACTER_TO_GENRES: Record<string, string[]> = {
  "Action-oriented protagonists": ["action", "adventure"],
  "Romantic leads": ["romance", "drama"],
  "Comedy characters": ["comedy"],
  "Strong independent protagonists": ["drama", "inspirational", "thriller"],
  "Detectives and investigators": ["mystery", "crime", "thriller"],
  "Anti-heroes": ["crime", "thriller", "action"],
  "Family-oriented characters": ["family", "comedy", "drama"],
  "Emotional and dramatic roles": ["drama", "emotional", "romance"],
};

const LANG_LABEL: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
};

export interface HybridCandidateResult {
  movie: MovieDTO;
  score: number;
  normalizedScore: number;
  scoringEngine: "multvae" | "mf" | "popularity" | "metadata_cold_start";
  isColdStart: boolean;
  anchorMovieTitle: string | null;
  anchorMovieRating: number | null;
  anchorSimilarity: number | null;
  matchReasons: string[];
  explanation: string;
}

export interface DiscoverySectionDTO {
  key: string;
  title: string;
  subtitle: string;
  items: HybridCandidateResult[];
}

function loadCandidatePool(
  inVocabIds: number[],
  excludeSet: Set<number>
): MovieDTO[] {
  const db = getDb();
  const byId = new Map<number, MovieDTO>();

  // 1. All regional/curated titles (125 verified films)
  const regionalRows = db
    .prepare("SELECT * FROM movies WHERE catalog_origin = 'regional_curated'")
    .all() as Record<string, unknown>[];
  for (const r of regionalRows) {
    const dto = rowToMovieDTO(r);
    if (dto.movielens_id && !excludeSet.has(dto.movielens_id)) {
      byId.set(dto.movielens_id, dto);
    }
  }

  // 2. Top collaborative candidates from Mult-VAE / MF / Popularity
  if (inVocabIds.length > 0) {
    const placeholders = inVocabIds.map(() => "?").join(",");
    const vocabRows = db
      .prepare(`SELECT * FROM movies WHERE movielens_id IN (${placeholders})`)
      .all(...inVocabIds) as Record<string, unknown>[];
    for (const r of vocabRows) {
      const dto = rowToMovieDTO(r);
      if (dto.movielens_id && !excludeSet.has(dto.movielens_id)) {
        byId.set(dto.movielens_id, dto);
      }
    }
  }

  // 3. Popular / diverse English MovieLens movies across genres for preference/mood coverage
  const extraRows = db
    .prepare(
      `SELECT * FROM movies
       WHERE language_code = 'en' AND ml_rating_count >= 120
       ORDER BY (ml_rating_count * ml_avg_rating) DESC
       LIMIT 240`
    )
    .all() as Record<string, unknown>[];
  for (const r of extraRows) {
    const dto = rowToMovieDTO(r);
    if (dto.movielens_id && !excludeSet.has(dto.movielens_id) && !byId.has(dto.movielens_id)) {
      byId.set(dto.movielens_id, dto);
    }
  }

  return Array.from(byId.values());
}

function hashJitter(id: number, seed: number): number {
  const x = Math.sin(id * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export async function generateHybridRecommendations(opts: {
  userId: number | null;
  userRatings: Array<{
    movielensId: number;
    itemIdx: number;
    rating: number;
    title: string;
    genres: string[];
    languageCode?: string;
    note?: string | null;
    moodTag?: string | null;
  }>;
  algorithm: "multvae" | "mf" | "popularity";
  discoveryMode?: DiscoveryMode;
  preferences?: UserPreferencesDTO;
  todayMood?: string | null;
  languageFilter?: string;
  excludeRecentlyShown?: boolean;
  refreshSeed?: number;
  topK?: number;
  enrichTop?: boolean;
}): Promise<HybridCandidateResult[]> {
  const {
    userId,
    userRatings,
    algorithm,
    discoveryMode = "top_ranked",
    todayMood = null,
    languageFilter = "all",
    excludeRecentlyShown = true,
    refreshSeed = 0,
    topK = 24,
    enrichTop = true,
  } = opts;

  const prefs =
    opts.preferences ??
    (userId ? getUserPreferenceProfile(userId) : DEFAULT_USER_PREFERENCES);

  const ratedIds = new Set(userRatings.map((r) => r.movielensId));

  // Recently shown recommendation IDs for this user (for repetition reduction)
  const recentlyShownCounts = new Map<number, number>();
  const dislikedIds = new Set<number>();
  const interactionBoosts = new Map<number, number>();
  const interactedGenres = new Map<string, number>();

  if (userId) {
    const db = getDb();
    const recentRows = db
      .prepare(
        `SELECT movielens_id, feedback FROM recommendation_history
         WHERE user_id = ?
         ORDER BY id DESC LIMIT 75`
      )
      .all(userId) as Array<{ movielens_id: number; feedback: string | null }>;
    recentRows.forEach((row, idx) => {
      if (row.feedback === "dislike") {
        dislikedIds.add(row.movielens_id);
      }
      if (excludeRecentlyShown) {
        const recencyWeight = idx < 25 ? 1.0 : 0.45;
        recentlyShownCounts.set(
          row.movielens_id,
          (recentlyShownCounts.get(row.movielens_id) ?? 0) + recencyWeight
        );
      }
    });

    const interRows = db
      .prepare(
        `SELECT ui.movielens_id, ui.interaction_type, ui.weight, m.genres
         FROM user_interactions ui
         JOIN movies m ON m.movielens_id = ui.movielens_id
         WHERE ui.user_id = ?
         ORDER BY ui.id DESC LIMIT 60`
      )
      .all(userId) as Array<{
      movielens_id: number;
      interaction_type: string;
      weight: number;
      genres: string;
    }>;
    for (const ir of interRows) {
      const sign = ir.interaction_type === "dislike" ? -0.4 : 0.15 * ir.weight;
      interactionBoosts.set(
        ir.movielens_id,
        (interactionBoosts.get(ir.movielens_id) ?? 0) + sign
      );
      for (const g of parseArr(ir.genres)) {
        const ng = normalizeGenre(g);
        interactedGenres.set(ng, (interactedGenres.get(ng) ?? 0) + sign);
      }
    }
  }

  // Derive liked/disliked genre affinities from user's ratings & review mood tags
  const ratingGenreAffinity = new Map<string, number>();
  const likedReviewKeywords = new Set<string>();
  for (const r of userRatings) {
    const delta = r.rating >= 4 ? (r.rating - 3) * 0.4 : r.rating <= 2 ? -0.45 : 0.05;
    for (const g of r.genres) {
      const ng = normalizeGenre(g);
      ratingGenreAffinity.set(ng, (ratingGenreAffinity.get(ng) ?? 0) + delta);
    }
    if (r.moodTag && r.rating >= 4) {
      likedReviewKeywords.add(r.moodTag.toLowerCase());
    }
    if (r.note && r.rating >= 4) {
      const low = r.note.toLowerCase();
      if (low.includes("twist")) likedReviewKeywords.add("plot_twists");
      if (low.includes("emotional")) likedReviewKeywords.add("emotional");
      if (low.includes("re-watch") || low.includes("rewatch")) likedReviewKeywords.add("feel_good");
    }
  }

  // Run trained Mult-VAE / MF / Popularity over MovieLens 1M vocabulary
  const mlRatedInputs = userRatings.map((r) => ({
    movielensId: r.movielensId,
    itemIdx: r.itemIdx,
    rating: r.rating,
    title: r.title,
  }));
  const baseRecs = generateUserRecommendations(
    algorithm,
    mlRatedInputs,
    240,
    discoveryMode
  );
  const baseById = new Map(baseRecs.map((item) => [item.movielensId, item]));

  const pool = loadCandidatePool(
    baseRecs.map((b) => b.movielensId),
    ratedIds
  );

  const favGenresNorm = new Set(prefs.favoriteGenres.map(normalizeGenre));
  const favActorsLower = new Set(
    [...prefs.favoriteMaleActors, ...prefs.favoriteFemaleActors].map((a) =>
      a.toLowerCase()
    )
  );
  const prefLangSet = new Set(prefs.preferredLanguages.map((l) => l.toLowerCase()));
  const origLangSet = new Set(prefs.originalLanguages.map((l) => l.toLowerCase()));
  const dubLangSet = new Set(prefs.dubbedLanguages.map((l) => l.toLowerCase()));
  const moodGenres = todayMood ? new Set(MOOD_TO_GENRES[todayMood] ?? []) : new Set<string>();
  const moodStoryTags = todayMood
    ? new Set(MOOD_TO_STORY_TAGS[todayMood] ?? [])
    : new Set<string>();

  const charGenres = new Set<string>();
  for (const ct of prefs.characterTypes) {
    for (const g of CHARACTER_TO_GENRES[ct] ?? []) {
      charGenres.add(g);
    }
  }

  const scored: HybridCandidateResult[] = [];

  for (const movie of pool) {
    const mlId = movie.movielens_id;
    if (!mlId || dislikedIds.has(mlId)) continue;

    // Optional strict language filter (used by search/filter tabs)
    const movieLang = movie.language_code.toLowerCase();
    if (languageFilter !== "all") {
      const target = languageFilter.toLowerCase();
      const hasDub = movie.available_dubs.map((d) => d.toLowerCase()).includes(target);
      if (movieLang !== target && !hasDub) continue;
    }

    const baseInfo = baseById.get(mlId);
    const isInVocab = movie.item_idx >= 0;
    const isColdStart = !isInVocab;

    // Base collaborative score for in-vocab or Bayesian quality baseline for metadata cold-start
    const qualityPrior =
      movie.ml_avg_rating > 0
        ? (movie.ml_avg_rating / 5.0) * 0.42 +
          Math.min(1, Math.log10(Math.max(10, movie.ml_rating_count)) / 3.4) * 0.14
        : 0.42;

    let score = baseInfo ? baseInfo.normalizedScore * 0.68 : qualityPrior * 0.72;
    const matchReasons: string[] = [];

    if (baseInfo?.anchorMovieTitle && algorithm !== "popularity") {
      matchReasons.push(`Anchored by ${baseInfo.anchorMovieTitle}`);
    }

    // 1. Language & Audio Mode alignment
    const matchesOrig = origLangSet.has(movieLang) || prefLangSet.has(movieLang);
    const matchingDub = movie.available_dubs.find((d) =>
      dubLangSet.has(d.toLowerCase()) || prefLangSet.has(d.toLowerCase())
    );

    if (prefs.languageMode === "original") {
      if (!movie.is_dubbed && matchesOrig) {
        score += 0.32;
        matchReasons.push(`${LANG_LABEL[movieLang] ?? movieLang.toUpperCase()} original`);
      } else if (movieLang !== "en") {
        score -= 0.08;
      }
    } else if (prefs.languageMode === "dubbed") {
      if (matchingDub || movie.is_dubbed) {
        score += 0.3;
        matchReasons.push(
          matchingDub
            ? `Available dubbed in ${LANG_LABEL[matchingDub] ?? matchingDub.toUpperCase()}`
            : `Dubbed release`
        );
      } else if (matchesOrig) {
        score += 0.16;
      }
    } else {
      if (matchesOrig) {
        score += 0.28;
        if (movieLang !== "en" || prefLangSet.size === 1) {
          matchReasons.push(`${LANG_LABEL[movieLang] ?? movieLang.toUpperCase()} match`);
        }
      } else if (matchingDub) {
        score += 0.22;
        matchReasons.push(`Dubbed in ${LANG_LABEL[matchingDub] ?? matchingDub.toUpperCase()}`);
      }
    }

    // Encourage regional diversity when user picked regional languages
    const hasRegionalPref = Array.from(prefLangSet).some((l) => l !== "en");
    if (hasRegionalPref && movieLang !== "en" && prefLangSet.has(movieLang)) {
      score += 0.18;
    }

    // 2. Daily Mood alignment
    const movieGenresNorm = movie.genres.map(normalizeGenre);
    if (todayMood) {
      const explicitMoodMatch = movie.mood_tags.some(
        (m) => m.toLowerCase() === todayMood.toLowerCase()
      );
      const genreMoodHits = movieGenresNorm.filter((g) => moodGenres.has(g)).length;
      const storyMoodHits = movie.story_tags.filter((t) => moodStoryTags.has(t)).length;
      if (explicitMoodMatch) {
        score += 0.36;
        matchReasons.push(`Matches today's ${todayMood} mood`);
      } else if (genreMoodHits > 0 || storyMoodHits > 0) {
        score += Math.min(0.24, genreMoodHits * 0.12 + storyMoodHits * 0.08);
        matchReasons.push(`Fits your ${todayMood} mood`);
      }
    }

    // 3. Favourite Male & Female Actors
    const matchedActors = movie.cast.filter((actor) =>
      favActorsLower.has(actor.toLowerCase())
    );
    if (matchedActors.length > 0) {
      score += 0.44 + Math.min(0.18, (matchedActors.length - 1) * 0.09);
      matchReasons.push(`Features ${matchedActors[0]}`);
    }

    // 4. Favourite Genres + Rating/Interaction History Genre Affinity
    const matchedFavGenres = movie.genres.filter((g) =>
      favGenresNorm.has(normalizeGenre(g))
    );
    if (matchedFavGenres.length > 0) {
      score += Math.min(0.32, matchedFavGenres.length * 0.15);
      matchReasons.push(`${matchedFavGenres[0]} favourite`);
    }

    let inferredGenreScore = 0;
    for (const gNorm of movieGenresNorm) {
      inferredGenreScore +=
        (ratingGenreAffinity.get(gNorm) ?? 0) * 0.08 +
        (interactedGenres.get(gNorm) ?? 0) * 0.04;
      if (charGenres.has(gNorm)) inferredGenreScore += 0.05;
    }
    score += Math.max(-0.2, Math.min(0.24, inferredGenreScore));

    // 5. Story style, pacing, runtime, era preferences
    const storyMatches = movie.story_tags.filter(
      (tag) =>
        prefs.storyStyles.includes(tag) ||
        likedReviewKeywords.has(tag) ||
        (prefs.pacingPreference !== "balanced" && tag === prefs.pacingPreference)
    );
    if (storyMatches.length > 0) {
      score += Math.min(0.2, storyMatches.length * 0.09);
      if (storyMatches.includes("plot_twists")) matchReasons.push("Plot-twist driven");
      else if (storyMatches.includes("intelligent")) matchReasons.push("Intelligent storytelling");
      else if (storyMatches.includes("real_life")) matchReasons.push("Real-life inspired");
    }

    if (prefs.characterTypes.includes("Anti-heroes") && movie.story_tags.includes("anti_hero")) {
      score += 0.14;
    }

    if (movie.runtime) {
      if (prefs.runtimePreference === "short" && movie.runtime <= 130) score += 0.08;
      if (prefs.runtimePreference === "long" && movie.runtime >= 150) score += 0.08;
    }

    if (movie.release_year) {
      if (prefs.eraPreference === "recent" && movie.release_year >= 2015) score += 0.1;
      if (prefs.eraPreference === "classic" && movie.release_year <= 2008) score += 0.1;
    }

    // Hidden Gems / Higher Coverage boost
    if (discoveryMode === "hidden_gems") {
      const novelty = 1 / Math.log2(Math.max(16, movie.ml_rating_count) + 8);
      score += novelty * 0.35;
    }

    // 6. Direct user interaction signal + Repetition penalty
    score += Math.max(-0.3, Math.min(0.25, interactionBoosts.get(mlId) ?? 0));
    const repPenalty = (recentlyShownCounts.get(mlId) ?? 0) * 0.22;
    score -= repPenalty;

    if (refreshSeed > 0) {
      score += (hashJitter(mlId, refreshSeed) - 0.5) * 0.16;
    }

    const scoringEngine: HybridCandidateResult["scoringEngine"] = isColdStart
      ? "metadata_cold_start"
      : algorithm;

    let explanation = "";
    if (matchReasons.length > 0) {
      const lead = isColdStart
        ? "Metadata Cold-Start match"
        : algorithm === "multvae"
        ? "Mult-VAE + preference blend"
        : algorithm === "mf"
        ? "Matrix Factorization + preference blend"
        : "Popularity + preference blend";
      explanation = `${lead}: ${matchReasons.slice(0, 3).join(" · ")}.`;
    } else if (isColdStart) {
      explanation = `Metadata Cold-Start pick in ${LANG_LABEL[movieLang] ?? movieLang} matching your catalog profile.`;
    } else if (algorithm === "multvae") {
      explanation =
        "Decoded by Mult-VAE from your latent preference profile and genre affinities.";
    } else if (algorithm === "mf") {
      explanation =
        "Predicted high latent dot-product affinity via Matrix Factorization.";
    } else {
      explanation =
        "High Bayesian-weighted MovieLens 1M community rating score.";
    }

    scored.push({
      movie,
      score: Number(score.toFixed(4)),
      normalizedScore: 0.75,
      scoringEngine,
      isColdStart,
      anchorMovieTitle: baseInfo?.anchorMovieTitle ?? null,
      anchorMovieRating: baseInfo?.anchorMovieRating ?? null,
      anchorSimilarity: baseInfo?.anchorSimilarity ?? null,
      matchReasons: matchReasons.slice(0, 4),
      explanation,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const topSlice = scored.slice(0, topK);

  if (topSlice.length > 0) {
    const maxS = Math.max(...topSlice.map((x) => x.score));
    const minS = Math.min(...topSlice.map((x) => x.score));
    const span = Math.max(1e-6, maxS - minS);
    for (const item of topSlice) {
      item.normalizedScore = Number(
        (0.66 + ((item.score - minS) / span) * 0.32).toFixed(4)
      );
    }
  }

  if (enrichTop && topSlice.length > 0) {
    const idsToEnrich = topSlice
      .map((s) => s.movie.movielens_id)
      .filter((id): id is number => Boolean(id))
      .slice(0, 24);
    const enriched = await enrichMoviesBatch(idsToEnrich, 6);
    const enrichedMap = new Map(enriched.map((m) => [m.movielens_id, m]));
    for (const item of topSlice) {
      const fresh = item.movie.movielens_id
        ? enrichedMap.get(item.movie.movielens_id)
        : undefined;
      if (fresh) item.movie = fresh;
    }
  }

  return topSlice;
}

export async function buildDailyDiscoverySections(opts: {
  userId: number | null;
  userRatings: Array<{
    movielensId: number;
    itemIdx: number;
    rating: number;
    title: string;
    genres: string[];
    languageCode?: string;
    note?: string | null;
    moodTag?: string | null;
  }>;
  preferences?: UserPreferencesDTO;
  todayMood?: string | null;
  refreshSeed?: number;
}): Promise<DiscoverySectionDTO[]> {
  const { userId, userRatings, refreshSeed = 0 } = opts;
  const prefs =
    opts.preferences ??
    (userId ? getUserPreferenceProfile(userId) : DEFAULT_USER_PREFERENCES);
  const todayMood =
    opts.todayMood ?? (userId ? getTodayMood(userId) : null) ?? "Feel-good";

  // Master scored pool (fast without enriching yet, enrich union once at the end!)
  const master = await generateHybridRecommendations({
    userId,
    userRatings,
    algorithm: "multvae",
    discoveryMode: "top_ranked",
    preferences: prefs,
    todayMood,
    excludeRecentlyShown: true,
    refreshSeed,
    topK: 140,
    enrichTop: false,
  });

  const sections: DiscoverySectionDTO[] = [];
  const usedGlobal = new Set<number>();

  const pickDistinct = (
    candidates: HybridCandidateResult[],
    limit = 10,
    allowFallback = true
  ): HybridCandidateResult[] => {
    const chosen: HybridCandidateResult[] = [];
    for (const c of candidates) {
      const id = c.movie.movielens_id;
      if (!id || usedGlobal.has(id)) continue;
      chosen.push(c);
      usedGlobal.add(id);
      if (chosen.length >= limit) break;
    }
    if (allowFallback && chosen.length < limit) {
      for (const c of candidates) {
        const id = c.movie.movielens_id;
        if (!id || chosen.some((x) => x.movie.movielens_id === id)) continue;
        chosen.push(c);
        if (chosen.length >= limit) break;
      }
    }
    return chosen;
  };

  // 1. Recommended for You (balance collaborative Mult-VAE + personalized profile)
  sections.push({
    key: "recommended_for_you",
    title: "Recommended for You",
    subtitle: "Mult-VAE latent taste blended with your language, genre, and mood profile",
    items: pickDistinct(master, 10),
  });

  // 2. Today's Mood Picks
  const moodGenres = new Set(MOOD_TO_GENRES[todayMood] ?? []);
  const moodCandidates = master
    .filter(
      (item) =>
        item.movie.mood_tags.some((m) => m.toLowerCase() === todayMood.toLowerCase()) ||
        item.movie.genres.some((g) => moodGenres.has(normalizeGenre(g)))
    )
    .sort((a, b) => {
      const aDirect = a.movie.mood_tags.some((m) => m.toLowerCase() === todayMood.toLowerCase()) ? 1 : 0;
      const bDirect = b.movie.mood_tags.some((m) => m.toLowerCase() === todayMood.toLowerCase()) ? 1 : 0;
      return bDirect - aDirect || b.score - a.score;
    });

  sections.push({
    key: "todays_mood_picks",
    title: `Today's Mood Picks (${todayMood})`,
    subtitle: `Tuned for a ${todayMood.toLowerCase()} watch session today without altering your core taste profile`,
    items: pickDistinct(moodCandidates.length >= 4 ? moodCandidates : master, 10),
  });

  // 3. Because You Like These Actors
  const selectedActors = [...prefs.favoriteMaleActors, ...prefs.favoriteFemaleActors];
  const actorSetLower = new Set(selectedActors.map((a) => a.toLowerCase()));
  let actorCandidates =
    actorSetLower.size > 0
      ? master.filter((item) =>
          item.movie.cast.some((c) => actorSetLower.has(c.toLowerCase()))
        )
      : [];
  let actorSubtitle =
    selectedActors.length > 0
      ? `Featuring ${selectedActors.slice(0, 3).join(", ")}`
      : "Star-led highlights from regional & classic cinema";

  if (actorCandidates.length === 0) {
    actorCandidates = master.filter((item) => item.movie.cast.length > 0);
  }

  sections.push({
    key: "because_you_like_actors",
    title: "Because You Like These Actors",
    subtitle: actorSubtitle,
    items: pickDistinct(actorCandidates, 10),
  });

  // 4. Based on Your Favourite Genres
  const favGenresNorm = new Set(prefs.favoriteGenres.map(normalizeGenre));
  const genreCandidates =
    favGenresNorm.size > 0
      ? master.filter((item) =>
          item.movie.genres.some((g) => favGenresNorm.has(normalizeGenre(g)))
        )
      : master;
  sections.push({
    key: "favorite_genres_picks",
    title: "Based on Your Favourite Genres",
    subtitle:
      prefs.favoriteGenres.length > 0
        ? `Curated across ${prefs.favoriteGenres.slice(0, 4).join(" · ")}`
        : "Top-scoring matches across your favourite genres",
    items: pickDistinct(genreCandidates, 10),
  });

  // 5. Regional Cinema for You
  const regionalPrefLangs = prefs.preferredLanguages.filter((l) => l !== "en");
  const regionalCandidates = master.filter((item) => {
    const lang = item.movie.language_code.toLowerCase();
    if (lang === "en") return false;
    if (regionalPrefLangs.length > 0) {
      return (
        regionalPrefLangs.includes(lang) ||
        item.movie.available_dubs.some((d) => regionalPrefLangs.includes(d.toLowerCase()))
      );
    }
    return true;
  });
  sections.push({
    key: "regional_cinema",
    title: "Regional Cinema for You",
    subtitle:
      regionalPrefLangs.length > 0
        ? `Original & dubbed picks in ${regionalPrefLangs
            .map((l) => LANG_LABEL[l] ?? l)
            .join(", ")}`
        : "Verified Kannada, Hindi, Telugu, Tamil & Malayalam cinema",
    items: pickDistinct(
      regionalCandidates.length >= 4
        ? regionalCandidates
        : master.filter((item) => item.movie.language_code !== "en"),
      10
    ),
  });

  // 6. Discover Something New
  const discoverNew = await generateHybridRecommendations({
    userId,
    userRatings,
    algorithm: "multvae",
    discoveryMode: "hidden_gems",
    preferences: prefs,
    todayMood,
    excludeRecentlyShown: true,
    refreshSeed: refreshSeed + 17,
    topK: 36,
    enrichTop: false,
  });
  sections.push({
    key: "discover_something_new",
    title: "Discover Something New",
    subtitle: "Higher-coverage hidden gems & fresh cross-cultural picks outside your usual circle",
    items: pickDistinct(discoverNew, 10),
  });

  // Batch-enrich union of displayed section movies (limited cleanly for fast initial load)
  const allShownIds = Array.from(
    new Set(
      sections.flatMap((s) =>
        s.items
          .slice(0, 8)
          .map((it) => it.movie.movielens_id)
          .filter((id): id is number => Boolean(id))
      )
    )
  ).slice(0, 24);

  if (allShownIds.length > 0) {
    const enriched = await enrichMoviesBatch(allShownIds, 6);
    const enrichedMap = new Map(enriched.map((m) => [m.movielens_id, m]));
    for (const sec of sections) {
      for (const item of sec.items) {
        const fresh = item.movie.movielens_id
          ? enrichedMap.get(item.movie.movielens_id)
          : undefined;
        if (fresh) item.movie = fresh;
      }
    }
  }

  return sections;
}

export async function pickSurpriseMovie(opts: {
  userId: number | null;
  userRatings: Array<{
    movielensId: number;
    itemIdx: number;
    rating: number;
    title: string;
    genres: string[];
    languageCode?: string;
  }>;
  preferences?: UserPreferencesDTO;
  todayMood?: string | null;
}): Promise<HybridCandidateResult | null> {
  const { userId, userRatings, todayMood } = opts;
  const prefs =
    opts.preferences ??
    (userId ? getUserPreferenceProfile(userId) : DEFAULT_USER_PREFERENCES);

  const candidates = await generateHybridRecommendations({
    userId,
    userRatings,
    algorithm: "multvae",
    discoveryMode: "top_ranked",
    preferences: prefs,
    todayMood: todayMood ?? (userId ? getTodayMood(userId) : null),
    excludeRecentlyShown: true,
    refreshSeed: Date.now() % 1000,
    topK: 40,
    enrichTop: false,
  });

  const prefLangs = new Set(prefs.preferredLanguages.map((l) => l.toLowerCase()));
  const favGenres = new Set(prefs.favoriteGenres.map(normalizeGenre));

  let strictMatches = candidates.filter((c) => {
    const lang = c.movie.language_code.toLowerCase();
    const langMatch =
      prefLangs.size === 0 ||
      prefLangs.has(lang) ||
      (prefs.languageMode !== "original" &&
        c.movie.available_dubs.some((d) => prefLangs.has(d.toLowerCase())));
    const genreMatch =
      favGenres.size === 0 ||
      c.movie.genres.some((g) => favGenres.has(normalizeGenre(g)));
    return langMatch && genreMatch;
  });

  if (strictMatches.length === 0) {
    strictMatches = candidates.filter((c) =>
      prefLangs.size === 0 ? true : prefLangs.has(c.movie.language_code.toLowerCase())
    );
  }
  if (strictMatches.length === 0) strictMatches = candidates;
  if (strictMatches.length === 0) return null;

  const pool = strictMatches.slice(0, Math.min(8, strictMatches.length));
  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (picked.movie.movielens_id) {
    const [enriched] = await enrichMoviesBatch([picked.movie.movielens_id], 1);
    if (enriched) picked.movie = enriched;
  }
  return picked;
}
