import type { DatabaseSync } from "node:sqlite";
import { enrichMoviesBatch, type MovieDTO } from "../tmdb.ts";
import { generateUserRecommendations, loadMultVAEModel } from "./engine.ts";

export interface UserPrefRecord {
  preferredLanguages: string[];
  originalLanguages: string[];
  dubbedLanguages: string[];
  languageMode: "original" | "dubbed" | "both";
  preferredGenres: string[];
  favoriteActors: string[];
  favoriteMaleActors: string[];
  favoriteFemaleActors: string[];
  characterTypes: string[];
  tasteStyle: string | null;
  storyStyles: string[];
  pacingPreference: "fast_paced" | "slow_burn" | "balanced";
  runtimePreference: "short" | "standard" | "long" | "any";
  eraPreference: "classic" | "recent" | "any";
}

export interface DiscoverySectionItemDTO {
  movie: MovieDTO;
  score: number;
  normalizedScore: number;
  strategy: "multvae" | "cold_start_metadata" | "hybrid";
  reason: string;
  matchedSignals?: string[];
}

export interface DiscoverySectionDTO {
  id:
    | "recommended_for_you"
    | "todays_mood_picks"
    | "because_you_like_actors"
    | "based_on_favourite_genres"
    | "regional_cinema_for_you"
    | "discover_something_new";
  title: string;
  subtitle: string;
  strategyLabel: string;
  items: DiscoverySectionItemDTO[];
}

export const MOOD_TO_GENRES_MAP: Record<string, string[]> = {
  "Feel-good": ["Comedy", "Family", "Children's", "Musical", "Animation"],
  "Romantic": ["Romance", "Drama", "Musical"],
  "Comedy": ["Comedy", "Animation"],
  "Action": ["Action", "Adventure"],
  "Suspense": ["Mystery", "Thriller", "Crime", "Film-Noir"],
  "Thriller": ["Thriller", "Crime", "Mystery", "Action"],
  "Horror": ["Horror", "Mystery", "Thriller"],
  "Emotional": ["Drama", "Romance"],
  "Inspirational": ["Inspirational", "Sports", "Documentary", "Drama"],
  "Family time": ["Family", "Children's", "Animation", "Adventure"],
  "Mind-bending": ["Science Fiction", "Sci-Fi", "Mystery", "Thriller"],
  "Nostalgic": ["Drama", "Comedy", "Musical", "Western"],
  // Backward-compatible legacy keys
  feel_good: ["Comedy", "Animation", "Musical", "Children's"],
  mind_bending: ["Sci-Fi", "Science Fiction", "Mystery", "Thriller"],
  adrenaline: ["Action", "Crime", "Adventure", "Thriller"],
  heartfelt: ["Romance", "Drama"],
  nostalgic: ["Western", "Musical", "Drama", "Comedy"],
  hidden_gems: ["Film-Noir", "Documentary", "Mystery", "Drama"],
};

const CHARACTER_TYPE_GENRES: Record<string, string[]> = {
  "Action-oriented protagonists": ["Action", "Adventure"],
  "Romantic leads": ["Romance", "Drama"],
  "Comedy characters": ["Comedy", "Animation"],
  "Strong independent protagonists": ["Drama", "Thriller", "Inspirational"],
  "Detectives and investigators": ["Mystery", "Crime", "Thriller", "Film-Noir"],
  "Anti-heroes": ["Crime", "Thriller", "Drama"],
  "Family-oriented characters": ["Family", "Children's", "Animation", "Comedy"],
  "Emotional and dramatic roles": ["Drama", "Romance", "Inspirational"],
};

const LANG_NAME_BY_CODE: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
};

function normalizeGenre(g: string): string {
  const s = g.trim().toLowerCase();
  if (s === "sci-fi" || s === "science fiction") return "science fiction";
  if (s === "children's" || s === "family") return "family";
  if (s === "history" || s === "historical") return "historical";
  return s;
}

function normalizeLanguageCode(val: string): string {
  const lower = val.trim().toLowerCase();
  const map: Record<string, string> = {
    english: "en",
    en: "en",
    hindi: "hi",
    hi: "hi",
    kannada: "kn",
    kn: "kn",
    telugu: "te",
    te: "te",
    tamil: "ta",
    ta: "ta",
    malayalam: "ml",
    ml: "ml",
  };
  return map[lower] ?? lower;
}

function parseArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

interface CandidateRow {
  movielens_id: number;
  item_idx: number;
  title: string;
  language_code: string;
  is_dubbed: number;
  available_dubs: string;
  release_year: number | null;
  runtime: number | null;
  genres: string;
  director: string | null;
  cast_list: string;
  mood_tags: string;
  story_tags: string;
  ml_rating_count: number;
  ml_avg_rating: number;
}

export async function buildHybridDiscoverySections(
  db: DatabaseSync,
  options: {
    userId: number | null;
    preferences?: UserPrefRecord | null;
    moodKey?: string | null;
    guestRatings?: Array<{ movielensId: number; rating: number }>;
    refresh?: boolean;
    surpriseMe?: boolean;
    excludeIds?: number[];
  }
): Promise<{
  sections: DiscoverySectionDTO[];
  surprisePick: DiscoverySectionItemDTO | null;
  activeMood: string | null;
  ratedMoviesCount: number;
  coldStartActive: boolean;
}> {
  const { userId, preferences, moodKey, guestRatings, refresh, surpriseMe, excludeIds = [] } =
    options;

  // 1. Gather user ratings + review tags
  let userRatingRows: Array<{
    movielens_id: number;
    rating: number;
    item_idx: number;
    title: string;
    genres: string;
    mood_tag: string | null;
  }> = [];

  if (userId) {
    userRatingRows = db
      .prepare(
        `SELECT r.movielens_id, r.rating, r.mood_tag, m.item_idx, m.title, m.genres
         FROM ratings r JOIN movies m ON r.movielens_id = m.movielens_id
         WHERE r.user_id = ?`
      )
      .all(userId) as typeof userRatingRows;
  } else if (Array.isArray(guestRatings) && guestRatings.length > 0) {
    const valid = guestRatings
      .map((g) => ({ movielensId: Number(g.movielensId), rating: Number(g.rating) }))
      .filter((g) => Number.isFinite(g.movielensId) && g.rating >= 1 && g.rating <= 5);
    if (valid.length > 0) {
      const ph = valid.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT movielens_id, item_idx, title, genres FROM movies WHERE movielens_id IN (${ph})`
        )
        .all(...valid.map((v) => v.movielensId)) as Array<{
        movielens_id: number;
        item_idx: number;
        title: string;
        genres: string;
      }>;
      const rMap = new Map(valid.map((v) => [v.movielensId, v.rating]));
      userRatingRows = rows.map((m) => ({
        ...m,
        rating: rMap.get(m.movielens_id) ?? 4,
        mood_tag: null,
      }));
    }
  }

  const ratedSet = new Set(userRatingRows.map((r) => r.movielens_id));

  // Recent recommendation history + interaction signals for rotation & affinity
  const recentHistorySet = new Set<number>(excludeIds);
  const interactionGenreBoost = new Map<string, number>();

  if (userId) {
    if (refresh || surpriseMe) {
      const recentRows = db
        .prepare(
          `SELECT DISTINCT movielens_id FROM recommendation_history
           WHERE user_id = ? ORDER BY id DESC LIMIT 45`
        )
        .all(userId) as Array<{ movielens_id: number }>;
      for (const rr of recentRows) recentHistorySet.add(rr.movielens_id);
    }

    const intRows = db
      .prepare(
        `SELECT m.genres, ui.weight FROM user_interactions ui
         JOIN movies m ON ui.movielens_id = m.movielens_id
         WHERE ui.user_id = ? ORDER BY ui.id DESC LIMIT 30`
      )
      .all(userId) as Array<{ genres: string; weight: number }>;
    for (const ir of intRows) {
      for (const g of parseArray(ir.genres)) {
        const ng = normalizeGenre(g);
        interactionGenreBoost.set(ng, (interactionGenreBoost.get(ng) ?? 0) + ir.weight * 0.15);
      }
    }
  }

  // 2. Run trained Mult-VAE as primary model for in-vocabulary items
  const vaeScoreById = new Map<number, { score: number; anchor: string | null }>();
  const hasVaeVocabRatings = userRatingRows.some((r) => r.item_idx >= 0);
  if (hasVaeVocabRatings && loadMultVAEModel()) {
    try {
      const vaeItems = generateUserRecommendations(
        "multvae",
        userRatingRows.map((r) => ({
          movielensId: r.movielens_id,
          itemIdx: r.item_idx,
          rating: r.rating,
          title: r.title,
        })),
        500,
        "top_ranked"
      );
      const maxS = Math.max(...vaeItems.map((v) => v.score), 1e-6);
      const minS = Math.min(...vaeItems.map((v) => v.score), 0);
      const span = Math.max(1e-8, maxS - minS);
      for (const item of vaeItems) {
        vaeScoreById.set(item.movielensId, {
          score: (item.score - minS) / span,
          anchor: item.anchorMovieTitle,
        });
      }
    } catch {
      // ignore fallback gracefully
    }
  }

  // 3. Gather candidate pool (all verified multilingual films + top 600 MovieLens 1M films)
  const regionalCandidates = db
    .prepare(
      `SELECT movielens_id, item_idx, title, language_code, is_dubbed, available_dubs,
              release_year, runtime, genres, director, cast_list, mood_tags, story_tags,
              ml_rating_count, ml_avg_rating
       FROM movies WHERE language_code != 'en'`
    )
    .all() as unknown as CandidateRow[];

  const englishCandidates = db
    .prepare(
      `SELECT movielens_id, item_idx, title, language_code, is_dubbed, available_dubs,
              release_year, runtime, genres, director, cast_list, mood_tags, story_tags,
              ml_rating_count, ml_avg_rating
       FROM movies
       WHERE language_code = 'en' AND ml_rating_count >= 40
       ORDER BY (ml_avg_rating * LOG10(ml_rating_count + 10)) DESC
       LIMIT 650`
    )
    .all() as unknown as CandidateRow[];

  const allCandidates = [...regionalCandidates, ...englishCandidates];

  // Normalize preference signals
  const origLangs = new Set(
    (preferences?.originalLanguages?.length
      ? preferences.originalLanguages
      : preferences?.preferredLanguages ?? []
    ).map(normalizeLanguageCode)
  );
  const dubLangs = new Set((preferences?.dubbedLanguages ?? []).map(normalizeLanguageCode));
  const langMode = preferences?.languageMode ?? "both";
  const prefGenres = new Set((preferences?.preferredGenres ?? []).map(normalizeGenre));

  // If user didn't save setup genres, infer from 4-5 star rated titles
  if (prefGenres.size === 0) {
    for (const r of userRatingRows) {
      if (r.rating >= 4) {
        for (const g of parseArray(r.genres)) prefGenres.add(normalizeGenre(g));
      }
    }
  }

  const allActors = Array.from(
    new Set([
      ...(preferences?.favoriteMaleActors ?? []),
      ...(preferences?.favoriteFemaleActors ?? []),
      ...(preferences?.favoriteActors ?? []),
    ])
  ).filter(Boolean);
  const actorLowerSet = new Set(allActors.map((a) => a.toLowerCase()));

  const charTypeGenres = new Set<string>();
  for (const ct of preferences?.characterTypes ?? []) {
    for (const g of CHARACTER_TYPE_GENRES[ct] ?? []) charTypeGenres.add(normalizeGenre(g));
  }

  const storyStyleSet = new Set(preferences?.storyStyles ?? []);
  const activeMoodKey = moodKey || null;
  const moodGenres = new Set(
    (activeMoodKey ? MOOD_TO_GENRES_MAP[activeMoodKey] ?? [] : []).map(normalizeGenre)
  );

  // Also capture review mood notes if user liked twisty/emotional films
  const reviewMoodNotes = new Set(
    userRatingRows
      .filter((r) => r.rating >= 4 && r.mood_tag)
      .map((r) => r.mood_tag!.toLowerCase())
  );

  const jitterSeed = refresh || surpriseMe ? Math.random() * 0.14 : 0;

  interface ScoredCandidate {
    row: CandidateRow;
    totalScore: number;
    vaeScore: number;
    langScore: number;
    moodScore: number;
    actorScore: number;
    genreScore: number;
    tasteScore: number;
    matchedActor: string | null;
    matchedGenres: string[];
    strategy: "multvae" | "cold_start_metadata" | "hybrid";
    vaeAnchor: string | null;
  }

  const scoredPool: ScoredCandidate[] = [];

  for (const c of allCandidates) {
    if (ratedSet.has(c.movielens_id)) continue;

    const cGenres = parseArray(c.genres);
    const cNormGenres = cGenres.map(normalizeGenre);
    const cDubs = parseArray(c.available_dubs).map(normalizeLanguageCode);
    const cCast = parseArray(c.cast_list);
    const cMoodTags = parseArray(c.mood_tags);
    const cStoryTags = parseArray(c.story_tags);

    const vaeEntry = vaeScoreById.get(c.movielens_id);
    const vaeScore = vaeEntry ? vaeEntry.score : 0;

    // Language affinity
    let langScore = 0;
    const isOrigMatch = origLangs.has(c.language_code);
    const dubOverlap = cDubs.some((d) => dubLangs.has(d) || origLangs.has(d));
    if (langMode === "original") {
      langScore = isOrigMatch && !c.is_dubbed ? 1.0 : origLangs.size === 0 ? 0.4 : 0.05;
    } else if (langMode === "dubbed") {
      langScore = dubOverlap || c.is_dubbed ? 1.0 : isOrigMatch ? 0.6 : 0.1;
    } else {
      langScore = isOrigMatch ? 1.0 : dubOverlap ? 0.78 : origLangs.size === 0 && dubLangs.size === 0 ? 0.4 : 0.1;
    }

    // Mood alignment
    let moodScore = 0;
    if (activeMoodKey) {
      if (cMoodTags.some((mt) => mt.toLowerCase() === activeMoodKey.toLowerCase())) {
        moodScore += 0.75;
      }
      const mOverlap = cNormGenres.filter((g) => moodGenres.has(g)).length;
      moodScore += Math.min(0.6, mOverlap * 0.25);
    }

    // Actor alignment
    let matchedActor: string | null = null;
    for (const member of cCast) {
      if (actorLowerSet.has(member.toLowerCase())) {
        matchedActor = member;
        break;
      }
    }
    const actorScore = matchedActor ? 1.0 : 0;

    // Genre alignment
    const matchedGenres = cGenres.filter((g) => prefGenres.has(normalizeGenre(g)));
    let genreScore = matchedGenres.length > 0 ? Math.min(1.0, matchedGenres.length * 0.42) : 0;
    for (const ng of cNormGenres) {
      genreScore += interactionGenreBoost.get(ng) ?? 0;
    }
    if (charTypeGenres.size > 0 && cNormGenres.some((g) => charTypeGenres.has(g))) {
      genreScore += 0.22;
    }

    // Story / Pacing / Runtime / Era alignment
    let tasteScore = 0;
    if (storyStyleSet.size > 0) {
      const tagMatches = cStoryTags.filter((t) => storyStyleSet.has(t)).length;
      tasteScore += Math.min(0.5, tagMatches * 0.25);
    }
    if (
      preferences?.pacingPreference &&
      preferences.pacingPreference !== "balanced" &&
      cStoryTags.includes(preferences.pacingPreference)
    ) {
      tasteScore += 0.2;
    }
    if (preferences?.runtimePreference && preferences.runtimePreference !== "any" && c.runtime) {
      if (preferences.runtimePreference === "short" && c.runtime <= 125) tasteScore += 0.2;
      if (preferences.runtimePreference === "standard" && c.runtime > 125 && c.runtime <= 155)
        tasteScore += 0.2;
      if (preferences.runtimePreference === "long" && c.runtime > 155) tasteScore += 0.2;
    }
    if (preferences?.eraPreference && preferences.eraPreference !== "any" && c.release_year) {
      if (preferences.eraPreference === "classic" && c.release_year < 2005) tasteScore += 0.22;
      if (preferences.eraPreference === "recent" && c.release_year >= 2015) tasteScore += 0.22;
    }
    if (reviewMoodNotes.has("great plot twist") && cStoryTags.includes("plot_twists")) {
      tasteScore += 0.25;
    }
    if (reviewMoodNotes.has("mind-bending") && (cMoodTags.includes("Mind-bending") || cNormGenres.includes("science fiction"))) {
      tasteScore += 0.25;
    }

    const qualityPrior = Math.min(0.45, (c.ml_avg_rating / 5.0) * 0.35 + Math.log10(c.ml_rating_count + 10) * 0.04);
    const repeatPenalty = recentHistorySet.has(c.movielens_id) ? -0.55 : 0;
    const jitter = jitterSeed > 0 ? (Math.random() - 0.5) * jitterSeed : 0;

    const totalScore =
      vaeScore * 1.35 +
      langScore * 0.62 +
      moodScore * 0.58 +
      actorScore * 0.85 +
      genreScore * 0.52 +
      tasteScore * 0.35 +
      qualityPrior +
      repeatPenalty +
      jitter;

    const strategy: "multvae" | "cold_start_metadata" | "hybrid" =
      c.item_idx >= 0 && vaeScore > 0.1
        ? langScore > 0.5 || moodScore > 0.3 || genreScore > 0.3
          ? "hybrid"
          : "multvae"
        : "cold_start_metadata";

    scoredPool.push({
      row: c,
      totalScore,
      vaeScore,
      langScore,
      moodScore,
      actorScore,
      genreScore,
      tasteScore,
      matchedActor,
      matchedGenres,
      strategy,
      vaeAnchor: vaeEntry?.anchor ?? null,
    });
  }

  // Pick IDs cleanly per section so we batch-enrich only visible candidates
  const usedAcrossPrimary = new Set<number>();

  // Section 1: Recommended for You (Mult-VAE primary + Cold-Start regional blend)
  const recTop = [...scoredPool]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 12);
  recTop.forEach((s) => usedAcrossPrimary.add(s.row.movielens_id));

  // Section 2: Today's Mood Picks
  const effectiveMood = activeMoodKey ?? "Feel-good";
  const effectiveMoodGenres = new Set(
    (MOOD_TO_GENRES_MAP[effectiveMood] ?? ["Drama", "Comedy"]).map(normalizeGenre)
  );
  const moodSorted = [...scoredPool]
    .filter((s) => {
      const mTags = parseArray(s.row.mood_tags).map((x) => x.toLowerCase());
      const gs = parseArray(s.row.genres).map(normalizeGenre);
      return (
        mTags.includes(effectiveMood.toLowerCase()) ||
        gs.some((g) => effectiveMoodGenres.has(g))
      );
    })
    .sort(
      (a, b) =>
        b.moodScore * 1.4 +
        b.langScore * 0.6 +
        b.vaeScore * 0.5 -
        (a.moodScore * 1.4 + a.langScore * 0.6 + a.vaeScore * 0.5) ||
        b.totalScore - a.totalScore
    )
    .slice(0, 12);

  // Section 3: Because You Like These Actors
  const actorPool = allActors.length > 0
    ? scoredPool.filter((s) => s.matchedActor !== null)
    : scoredPool.filter((s) => parseArray(s.row.cast_list).length > 0);
  const actorSorted = [...actorPool]
    .sort((a, b) => b.actorScore - a.actorScore || b.totalScore - a.totalScore)
    .slice(0, 12);

  // Section 4: Based on Your Favourite Genres
  const genrePool = prefGenres.size > 0
    ? scoredPool.filter((s) => s.matchedGenres.length > 0)
    : scoredPool.filter((s) => s.row.ml_avg_rating >= 4.0);
  const genreSorted = [...genrePool]
    .sort((a, b) => b.genreScore + b.vaeScore - (a.genreScore + a.vaeScore) || b.totalScore - a.totalScore)
    .slice(0, 12);

  // Section 5: Regional Cinema for You (kn, hi, te, ta, ml)
  const preferredNonEn = Array.from(new Set([...origLangs, ...dubLangs])).filter(
    (c) => c !== "en"
  );
  const regionalPool = scoredPool.filter((s) => {
    if (s.row.language_code === "en") return false;
    if (preferredNonEn.length === 0) return true;
    const dubs = parseArray(s.row.available_dubs);
    return (
      preferredNonEn.includes(s.row.language_code) ||
      dubs.some((d) => preferredNonEn.includes(d))
    );
  });
  // Ensure language variety across selected regional languages
  const regionalSorted = [...regionalPool]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 14);

  // Section 6: Discover Something New (high quality, excluded from primary top & recent history)
  const discoverSorted = [...scoredPool]
    .filter(
      (s) =>
        !usedAcrossPrimary.has(s.row.movielens_id) &&
        !recentHistorySet.has(s.row.movielens_id) &&
        s.row.ml_avg_rating >= 3.8
    )
    .sort((a, b) => {
      const aExp = a.row.ml_rating_count < 600 ? 0.35 : 0;
      const bExp = b.row.ml_rating_count < 600 ? 0.35 : 0;
      return b.totalScore + bExp - (a.totalScore + aExp);
    })
    .slice(0, 12);

  // Surprise pick: pick 1 standout fresh title from top 18 discover/rec pool
  const surpriseCandidatePool = discoverSorted.length > 0 ? discoverSorted : recTop;
  const surpriseCandidate =
    surpriseCandidatePool[
      Math.floor(Math.random() * Math.min(surpriseCandidatePool.length, 8))
    ] ?? null;

  // Batch enrich all referenced movie IDs in one pass
  const neededIds = Array.from(
    new Set([
      ...recTop.map((s) => s.row.movielens_id),
      ...moodSorted.map((s) => s.row.movielens_id),
      ...actorSorted.map((s) => s.row.movielens_id),
      ...genreSorted.map((s) => s.row.movielens_id),
      ...regionalSorted.map((s) => s.row.movielens_id),
      ...discoverSorted.map((s) => s.row.movielens_id),
      ...(surpriseCandidate ? [surpriseCandidate.row.movielens_id] : []),
    ])
  );

  const enrichedMovies = await enrichMoviesBatch(neededIds, 6);
  const movieById = new Map(enrichedMovies.map((m) => [m.movielens_id, m]));

  const toItem = (
    sc: ScoredCandidate,
    customReason: string
  ): DiscoverySectionItemDTO | null => {
    const mv = movieById.get(sc.row.movielens_id);
    if (!mv) return null;
    const norm = Math.max(0.55, Math.min(0.99, Number((0.68 + sc.totalScore * 0.12).toFixed(2))));
    return {
      movie: mv,
      score: Number(sc.totalScore.toFixed(4)),
      normalizedScore: norm,
      strategy: sc.strategy,
      reason: customReason,
      matchedSignals: [
        sc.vaeAnchor ? `Near ${sc.vaeAnchor}` : null,
        sc.matchedActor ? `Starring ${sc.matchedActor}` : null,
        sc.matchedGenres.length > 0 ? sc.matchedGenres.slice(0, 2).join(", ") : null,
        LANG_NAME_BY_CODE[sc.row.language_code] ?? sc.row.language_code,
      ].filter((x): x is string => Boolean(x)),
    };
  };

  const buildReasonForRecommended = (sc: ScoredCandidate): string => {
    const parts: string[] = [];
    if (sc.vaeAnchor) parts.push(`Aligned with your rating of ${sc.vaeAnchor}`);
    if (sc.matchedActor) parts.push(`Features ${sc.matchedActor}`);
    if (activeMoodKey && sc.moodScore > 0.3) parts.push(`Matches ${activeMoodKey} mood`);
    if (sc.matchedGenres.length > 0) parts.push(`Fits ${sc.matchedGenres.slice(0, 2).join(" & ")}`);
    if (parts.length === 0) {
      const langLabel = LANG_NAME_BY_CODE[sc.row.language_code] ?? "Featured";
      parts.push(
        sc.row.item_idx >= 0
          ? "Top latent Mult-VAE match for your taste vector"
          : `${langLabel} cold-start metadata match (${sc.row.ml_avg_rating.toFixed(1)}/5 avg)`
      );
    }
    return parts.slice(0, 2).join(" · ");
  };

  const sections: DiscoverySectionDTO[] = [
    {
      id: "recommended_for_you",
      title: "Recommended for You",
      subtitle: hasVaeVocabRatings
        ? "Trained Mult-VAE latent probabilities blended with your language, mood, actor & taste profile"
        : "Cold-Start Metadata Strategy combining your setup preferences, language mode, and catalog acclaim",
      strategyLabel: hasVaeVocabRatings ? "Mult-VAE + Hybrid Signals" : "Cold-Start Metadata",
      items: recTop
        .map((s) => toItem(s, buildReasonForRecommended(s)))
        .filter((x): x is DiscoverySectionItemDTO => Boolean(x)),
    },
    {
      id: "todays_mood_picks",
      title: activeMoodKey ? `Today's Mood Picks (${activeMoodKey})` : "Today's Mood Picks (Feel-good)",
      subtitle: activeMoodKey
        ? `Curated for your "${activeMoodKey}" mood today without altering your saved genre preferences`
        : "Pick a mood on Home anytime — showing uplifting crowd-pleasers for now",
      strategyLabel: "Daily Mood Alignment",
      items: moodSorted
        .map((s) => {
          const langLabel = LANG_NAME_BY_CODE[s.row.language_code] ?? s.row.language_code;
          return toItem(
            s,
            `Matches "${effectiveMood}" mood · ${langLabel} ${
              s.row.is_dubbed ? "Dubbed" : "Original"
            }`
          );
        })
        .filter((x): x is DiscoverySectionItemDTO => Boolean(x)),
    },
    {
      id: "because_you_like_actors",
      title: "Because You Like These Actors",
      subtitle:
        allActors.length > 0
          ? `Titles starring ${allActors.slice(0, 4).join(", ")}${allActors.length > 4 ? ` +${allActors.length - 4}` : ""}`
          : "Celebrated star-driven regional & international cinema (select favourite heroes & heroines in Preferences)",
      strategyLabel: "Cast & Character Affinity",
      items: actorSorted
        .map((s) => {
          const cast = parseArray(s.row.cast_list);
          const star = s.matchedActor ?? cast[0] ?? "Acclaimed cast";
          const langLabel = LANG_NAME_BY_CODE[s.row.language_code] ?? s.row.language_code;
          return toItem(
            s,
            s.matchedActor
              ? `Stars your favourite: ${star} (${langLabel})`
              : `Features ${star} · Directed by ${s.row.director || "acclaimed filmmaker"}`
          );
        })
        .filter((x): x is DiscoverySectionItemDTO => Boolean(x)),
    },
    {
      id: "based_on_favourite_genres",
      title: "Based on Your Favourite Genres",
      subtitle:
        prefGenres.size > 0
          ? "Matched against your selected genres, character types & story style preferences"
          : "Top-acclaimed genre standouts (personalize genres in Edit Preferences)",
      strategyLabel: "Genre & Story Profile",
      items: genreSorted
        .map((s) => {
          const gs = s.matchedGenres.length > 0 ? s.matchedGenres : parseArray(s.row.genres);
          return toItem(
            s,
            `Matches ${gs.slice(0, 2).join(" / ")}${
              s.vaeAnchor ? ` · Near ${s.vaeAnchor}` : ""
            }`
          );
        })
        .filter((x): x is DiscoverySectionItemDTO => Boolean(x)),
    },
    {
      id: "regional_cinema_for_you",
      title: "Regional Cinema for You",
      subtitle:
        preferredNonEn.length > 0
          ? `Tailored in ${preferredNonEn
              .map((c) => LANG_NAME_BY_CODE[c] ?? c.toUpperCase())
              .join(", ")} (${langMode === "original" ? "Original audio" : langMode === "dubbed" ? "Dubbed preferred" : "Original & dubbed"})`
          : "Verified Kannada, Hindi, Telugu, Tamil & Malayalam cinema via Cold-Start Metadata Strategy",
      strategyLabel: "Cold-Start Metadata (item_idx = -1)",
      items: regionalSorted
        .map((s) => {
          const langLabel = LANG_NAME_BY_CODE[s.row.language_code] ?? s.row.language_code;
          const cast = parseArray(s.row.cast_list);
          return toItem(
            s,
            `${langLabel} Original${cast[0] ? ` · Starring ${cast[0]}` : ""}`
          );
        })
        .filter((x): x is DiscoverySectionItemDTO => Boolean(x)),
    },
    {
      id: "discover_something_new",
      title: "Discover Something New",
      subtitle: "Fresh cross-language and higher-coverage picks outside your recent history",
      strategyLabel: "Exploration & Coverage",
      items: discoverSorted
        .map((s) => {
          const langLabel = LANG_NAME_BY_CODE[s.row.language_code] ?? s.row.language_code;
          return toItem(
            s,
            `Fresh ${langLabel} discovery · ${parseArray(s.row.genres).slice(0, 2).join(", ")}`
          );
        })
        .filter((x): x is DiscoverySectionItemDTO => Boolean(x)),
    },
  ];

  const surprisePick = surpriseCandidate
    ? toItem(
        surpriseCandidate,
        `Surprise pick (${LANG_NAME_BY_CODE[surpriseCandidate.row.language_code] ?? surpriseCandidate.row.language_code}) · ${parseArray(
          surpriseCandidate.row.genres
        )
          .slice(0, 2)
          .join(", ")}`
      )
    : null;

  return {
    sections,
    surprisePick,
    activeMood: activeMoodKey,
    ratedMoviesCount: userRatingRows.length,
    coldStartActive: !hasVaeVocabRatings,
  };
}
