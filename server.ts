import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import { createServer as createViteServer } from "vite";
import {
  type AuthUser,
  clearSessionCookie,
  getRequestUser,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from "./server/auth.ts";
import {
  closeDb,
  getDb,
  seedCatalogIfNeeded,
  seedMultilingualCatalog,
} from "./server/db.ts";
import {
  type DiscoveryMode,
  evaluateAllModels,
  generateUserRecommendations,
  getDatasetStats,
  getSimilarMoviesByLatent,
  loadMFModel,
  loadMultVAEModel,
  loadPopularityModel,
  trainMatrixFactorization,
  trainMultVAE,
  trainPopularity,
  trainingState,
} from "./server/ml/engine.ts";
import {
  buildHybridDiscoverySections,
  MOOD_TO_GENRES_MAP,
  type UserPrefRecord,
} from "./server/ml/hybridDiscovery.ts";
import {
  enrichMoviesBatch,
  getDiscoverCategory,
  getFeaturedActorDirectory,
  getMoviesByLanguage,
  hasTmdbCredentials,
  searchCatalogAndTmdb,
} from "./server/tmdb.ts";

const PORT = 3000;
const ROOT_DIR = process.cwd();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const db = getDb();
  const seededCount = seedCatalogIfNeeded();
  const multilingualCount = seedMultilingualCatalog();
  console.log(
    `[Marrow] SQLite initialized. MovieLens 1M: ${seededCount}, Multilingual verified: ${multilingualCount}`
  );

  // Ensure demo account exists for quick academic demonstration (with real MovieLens 1M ratings)
  const existingDemo = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("demo@cinevae.edu") as { id: number } | undefined;
  let demoUserId = existingDemo?.id ?? null;
  if (!existingDemo && seededCount > 0) {
    const demoPass = hashPassword("cinevae2026");
    const res = db
      .prepare(
        "INSERT INTO users (username, email, password_hash, display_name, is_demo) VALUES (?, ?, ?, ?, 1)"
      )
      .run("cinephile_demo", "demo@cinevae.edu", demoPass, "Demo Researcher");
    demoUserId = Number(res.lastInsertRowid);
    // Seed a few classic MovieLens 1M films (Matrix 1999: 2571, Shawshank 1994: 318, Toy Story 1995: 1, Blade Runner 1982: 541, Pulp Fiction 1994: 296)
    const starterRatings: Array<[number, number]> = [
      [2571, 5],
      [318, 5],
      [541, 5],
      [296, 4],
      [1, 4],
    ];
    const insertR = db.prepare(
      "INSERT OR IGNORE INTO ratings (user_id, movielens_id, rating) VALUES (?, ?, ?)"
    );
    for (const [mid, r] of starterRatings) {
      const exists = db
        .prepare("SELECT movielens_id FROM movies WHERE movielens_id = ?")
        .get(mid);
      if (exists) insertR.run(demoUserId, mid, r);
    }
  } else if (demoUserId != null) {
    db.prepare("UPDATE users SET is_demo = 1 WHERE id = ? AND is_demo != 1").run(demoUserId);
  }
  if (demoUserId != null) {
    db.prepare(
      `INSERT OR IGNORE INTO user_preferences (
        user_id, preferred_languages, original_languages, dubbed_languages, language_mode,
        preferred_genres, favorite_actors, favorite_male_actors, favorite_female_actors,
        character_types, taste_style, story_styles, setup_completed
      ) VALUES (?, '["en"]', '["en"]', '[]', 'both', '["Science Fiction","Thriller","Drama"]', '["Keanu Reeves","Harrison Ford","Morgan Freeman"]', '[]', '[]', '["Detectives and investigators"]', 'Mind-Bending & Cerebral', '["intelligent","plot_twists"]', 1)`
    ).run(demoUserId);
  }

  const parseJsonArray = <T,>(raw: unknown, fallback: T[] = []): T[] => {
    if (typeof raw !== "string") return fallback;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  };

  const getUserPreferences = (userId: number) => {
    let row = db
      .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    if (!row) {
      db.prepare("INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)").run(userId);
      row = db
        .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
        .get(userId) as Record<string, unknown>;
    }
    const preferredLanguages = parseJsonArray<string>(row.preferred_languages);
    const originalLanguages = parseJsonArray<string>(row.original_languages);
    const dubbedLanguages = parseJsonArray<string>(row.dubbed_languages);
    const preferredGenres = parseJsonArray<string>(row.preferred_genres);
    const favoriteActors = parseJsonArray<string>(row.favorite_actors);
    const favoriteMaleActors = parseJsonArray<string>(row.favorite_male_actors);
    const favoriteFemaleActors = parseJsonArray<string>(row.favorite_female_actors);
    const mergedActors = Array.from(
      new Set([...favoriteActors, ...favoriteMaleActors, ...favoriteFemaleActors])
    );

    return {
      preferredLanguages:
        preferredLanguages.length > 0 ? preferredLanguages : originalLanguages,
      originalLanguages:
        originalLanguages.length > 0 ? originalLanguages : preferredLanguages,
      dubbedLanguages,
      languageMode: (String(row.language_mode || "both") as "original" | "dubbed" | "both"),
      preferredGenres,
      favoriteGenres: preferredGenres,
      favoriteActors: mergedActors,
      favoriteMaleActors,
      favoriteFemaleActors,
      characterTypes: parseJsonArray<string>(row.character_types),
      tasteStyle: row.taste_style ? String(row.taste_style) : null,
      tasteMovieIds: parseJsonArray<number>(row.taste_movie_ids),
      storyStyles: parseJsonArray<string>(row.story_styles),
      pacingPreference: (String(row.pacing_preference || "balanced") as
        | "fast_paced"
        | "slow_burn"
        | "balanced"),
      runtimePreference: (String(row.runtime_preference || "any") as
        | "short"
        | "standard"
        | "long"
        | "any"),
      eraPreference: (String(row.era_preference || "any") as "classic" | "recent" | "any"),
      setupCompleted: Boolean(row.setup_completed),
      skippedSteps: parseJsonArray<number>(row.skipped_steps),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    };
  };

  const resolveMoodDate = (raw: unknown): string => {
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      return raw.trim();
    }
    return new Date().toISOString().slice(0, 10);
  };

  const getUserDailyMood = (userId: number, moodDate: string) => {
    const row = db
      .prepare(
        "SELECT mood_date, mood_key, mood_label, updated_at FROM user_daily_moods WHERE user_id = ? AND mood_date = ?"
      )
      .get(userId, moodDate) as
      | { mood_date: string; mood_key: string; mood_label: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      moodDate: row.mood_date,
      moodKey: row.mood_key,
      moodLabel: row.mood_label,
      updatedAt: row.updated_at,
    };
  };

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // ---------- HEALTH ----------
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      tmdbConfigured: hasTmdbCredentials(),
      geminiConfigured: Boolean(getGeminiClient()),
    });
  });

  // ---------- AUTHENTICATION ----------
  app.post("/api/auth/register", (req, res) => {
    const { fullName, username, email, password, confirmPassword, displayName } = req.body ?? {};
    const resolvedName = String(fullName || displayName || username || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const rawPassword = String(password || "");

    if (resolvedName.length < 2) {
      res.status(400).json({ error: "Full name must be at least 2 characters." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }
    if (cleanEmail === "demo@cinevae.edu") {
      res.status(409).json({ error: "This email is reserved for the Demo Researcher sandbox." });
      return;
    }
    if (rawPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    if (confirmPassword !== undefined && rawPassword !== String(confirmPassword)) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }

    const emailConflict = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(cleanEmail);
    if (emailConflict) {
      res.status(409).json({ error: "An account with this email is already registered." });
      return;
    }

    let cleanUsername = String(username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "");
    if (!cleanUsername || cleanUsername.length < 3) {
      const emailPrefix = cleanEmail
        .split("@")[0]
        .replace(/[^a-z0-9_.-]/g, "")
        .slice(0, 18);
      const baseSlug = emailPrefix.length >= 3 ? emailPrefix : "member";
      cleanUsername = baseSlug;
      let suffix = 1;
      while (db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername)) {
        cleanUsername = `${baseSlug}${suffix++}`;
      }
    } else {
      const userConflict = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(cleanUsername);
      if (userConflict) {
        res.status(409).json({ error: "Username is already taken." });
        return;
      }
    }

    const pwHash = hashPassword(rawPassword);
    const result = db
      .prepare(
        "INSERT INTO users (username, email, password_hash, display_name, is_demo) VALUES (?, ?, ?, ?, 0)"
      )
      .run(cleanUsername, cleanEmail, pwHash, resolvedName);
    const userId = Number(result.lastInsertRowid);
    db.prepare(
      "INSERT OR IGNORE INTO user_preferences (user_id, setup_completed) VALUES (?, 0)"
    ).run(userId);

    const token = setSessionCookie(res, userId);

    const userRow = db
      .prepare(
        "SELECT id, username, email, display_name, avatar_url, is_demo, created_at FROM users WHERE id = ?"
      )
      .get(userId) as Omit<AuthUser, "is_demo"> & { is_demo: number };
    const preferences = getUserPreferences(userId);
    res.status(201).json({
      user: { ...userRow, is_demo: Boolean(userRow.is_demo) },
      token,
      preferences,
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const { emailOrUsername, password } = req.body ?? {};
    if (!emailOrUsername || !password) {
      res.status(400).json({ error: "Credentials are required." });
      return;
    }
    const key = String(emailOrUsername).trim().toLowerCase();
    const row = db
      .prepare("SELECT * FROM users WHERE email = ? OR username = ?")
      .get(key, key) as
      | (Omit<AuthUser, "is_demo"> & { is_demo?: number; password_hash: string })
      | undefined;

    if (!row || !verifyPassword(String(password), row.password_hash)) {
      res.status(401).json({ error: "Invalid email/username or password." });
      return;
    }

    const token = setSessionCookie(res, row.id);
    const { password_hash: _, is_demo, ...rest } = row;
    const isDemo = Boolean(is_demo) || row.email === "demo@cinevae.edu";
    res.json({
      user: { ...rest, is_demo: isDemo },
      token,
    });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ status: "logged_out" });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.json({ user: null });
      return;
    }
    const stats = db
      .prepare(
        "SELECT COUNT(*) as ratingCount, ROUND(AVG(rating), 2) as avgRating FROM ratings WHERE user_id = ?"
      )
      .get(user.id) as { ratingCount: number; avgRating: number | null };
    const watchCount = db
      .prepare("SELECT COUNT(*) as cnt FROM watchlist WHERE user_id = ?")
      .get(user.id) as { cnt: number };
    const preferences = getUserPreferences(user.id);
    const moodDate = resolveMoodDate(req.query.date);
    const todayMood = getUserDailyMood(user.id, moodDate);

    res.json({
      user,
      stats: {
        ratingCount: stats.ratingCount,
        avgRating: stats.avgRating ?? 0,
        watchlistCount: watchCount.cnt,
      },
      preferences,
      todayMood,
    });
  });

  app.put("/api/auth/profile", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const { displayName } = req.body ?? {};
    if (!displayName || !String(displayName).trim()) {
      res.status(400).json({ error: "Display name cannot be empty." });
      return;
    }
    db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(
      String(displayName).trim(),
      user.id
    );
    const updated = db
      .prepare(
        "SELECT id, username, email, display_name, avatar_url, is_demo, created_at FROM users WHERE id = ?"
      )
      .get(user.id) as Omit<AuthUser, "is_demo"> & { is_demo: number };
    res.json({ user: { ...updated, is_demo: Boolean(updated.is_demo) } });
  });

  // ---------- PER-USER PREFERENCES & DAILY MOOD ----------
  app.get("/api/user/preferences", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    res.json({ preferences: getUserPreferences(user.id) });
  });

  app.put("/api/user/preferences", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const {
      preferredLanguages,
      originalLanguages,
      dubbedLanguages,
      languageMode,
      preferredGenres,
      favoriteGenres,
      favoriteActors,
      favoriteMaleActors,
      favoriteFemaleActors,
      characterTypes,
      tasteStyle,
      tasteMovieIds,
      storyStyles,
      pacingPreference,
      runtimePreference,
      eraPreference,
      setupCompleted,
      skippedSteps,
      starterRatings,
    } = req.body ?? {};

    const current = getUserPreferences(user.id);
    const cleanStringList = (val: unknown, fallback: string[], maxItems = 40): string[] => {
      if (!Array.isArray(val)) return fallback;
      return Array.from(
        new Set(
          val
            .map((v) => String(v ?? "").trim().slice(0, 64))
            .filter(Boolean)
        )
      ).slice(0, maxItems);
    };

    const nextOrigLangs = cleanStringList(originalLanguages, current.originalLanguages, 16);
    const nextDubLangs = cleanStringList(dubbedLanguages, current.dubbedLanguages, 16);
    const nextLangs = cleanStringList(
      preferredLanguages,
      nextOrigLangs.length > 0 ? Array.from(new Set([...nextOrigLangs, ...nextDubLangs])) : current.preferredLanguages,
      16
    );
    const nextLangMode =
      languageMode === "original" || languageMode === "dubbed" || languageMode === "both"
        ? languageMode
        : current.languageMode;

    const genreInput = favoriteGenres !== undefined ? favoriteGenres : preferredGenres;
    const nextGenres = cleanStringList(genreInput, current.preferredGenres, 24);
    const nextMaleActors = cleanStringList(favoriteMaleActors, current.favoriteMaleActors, 40);
    const nextFemaleActors = cleanStringList(favoriteFemaleActors, current.favoriteFemaleActors, 40);
    const nextActors = cleanStringList(
      favoriteActors,
      Array.from(new Set([...nextMaleActors, ...nextFemaleActors])),
      60
    );
    const nextCharTypes = cleanStringList(characterTypes, current.characterTypes, 16);
    const nextStoryStyles = cleanStringList(storyStyles, current.storyStyles, 16);

    const nextPacing =
      pacingPreference === "fast_paced" ||
      pacingPreference === "slow_burn" ||
      pacingPreference === "balanced"
        ? pacingPreference
        : current.pacingPreference;
    const nextRuntime =
      runtimePreference === "short" ||
      runtimePreference === "standard" ||
      runtimePreference === "long" ||
      runtimePreference === "any"
        ? runtimePreference
        : current.runtimePreference;
    const nextEra =
      eraPreference === "classic" || eraPreference === "recent" || eraPreference === "any"
        ? eraPreference
        : current.eraPreference;

    const nextTasteStyle =
      tasteStyle === undefined
        ? current.tasteStyle
        : typeof tasteStyle === "string" && tasteStyle.trim()
        ? tasteStyle.trim().slice(0, 80)
        : null;
    const nextTasteMovieIds = Array.isArray(tasteMovieIds)
      ? Array.from(
          new Set(
            tasteMovieIds
              .map((v) => Number(v))
              .filter((n) => Number.isFinite(n) && n > 0)
          )
        ).slice(0, 30)
      : current.tasteMovieIds;
    const nextSetupCompleted =
      setupCompleted === undefined ? current.setupCompleted : Boolean(setupCompleted);
    const nextSkippedSteps = Array.isArray(skippedSteps)
      ? Array.from(
          new Set(
            skippedSteps
              .map((v) => Number(v))
              .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4)
          )
        )
      : current.skippedSteps;

    db.exec("BEGIN TRANSACTION;");
    try {
      db.prepare(
        `INSERT INTO user_preferences (
          user_id, preferred_languages, original_languages, dubbed_languages, language_mode,
          preferred_genres, favorite_actors, favorite_male_actors, favorite_female_actors,
          character_types, taste_style, taste_movie_ids, story_styles,
          pacing_preference, runtime_preference, era_preference,
          setup_completed, skipped_steps, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          preferred_languages = excluded.preferred_languages,
          original_languages = excluded.original_languages,
          dubbed_languages = excluded.dubbed_languages,
          language_mode = excluded.language_mode,
          preferred_genres = excluded.preferred_genres,
          favorite_actors = excluded.favorite_actors,
          favorite_male_actors = excluded.favorite_male_actors,
          favorite_female_actors = excluded.favorite_female_actors,
          character_types = excluded.character_types,
          taste_style = excluded.taste_style,
          taste_movie_ids = excluded.taste_movie_ids,
          story_styles = excluded.story_styles,
          pacing_preference = excluded.pacing_preference,
          runtime_preference = excluded.runtime_preference,
          era_preference = excluded.era_preference,
          setup_completed = excluded.setup_completed,
          skipped_steps = excluded.skipped_steps,
          updated_at = datetime('now')`
      ).run(
        user.id,
        JSON.stringify(nextLangs),
        JSON.stringify(nextOrigLangs),
        JSON.stringify(nextDubLangs),
        nextLangMode,
        JSON.stringify(nextGenres),
        JSON.stringify(Array.from(new Set([...nextActors, ...nextMaleActors, ...nextFemaleActors]))),
        JSON.stringify(nextMaleActors),
        JSON.stringify(nextFemaleActors),
        JSON.stringify(nextCharTypes),
        nextTasteStyle,
        JSON.stringify(nextTasteMovieIds),
        JSON.stringify(nextStoryStyles),
        nextPacing,
        nextRuntime,
        nextEra,
        nextSetupCompleted ? 1 : 0,
        JSON.stringify(nextSkippedSteps)
      );

      if (Array.isArray(starterRatings) && starterRatings.length > 0) {
        const checkMovie = db.prepare("SELECT movielens_id FROM movies WHERE movielens_id = ?");
        const insertRating = db.prepare(
          `INSERT OR IGNORE INTO ratings (user_id, movielens_id, rating, note)
           VALUES (?, ?, ?, 'Selected during taste setup')`
        );
        for (const item of starterRatings) {
          const mlId = Number(item?.movielensId);
          const rVal = Number(item?.rating ?? 5);
          if (!Number.isFinite(mlId) || !Number.isFinite(rVal) || rVal < 1 || rVal > 5) continue;
          if (!checkMovie.get(mlId)) continue;
          insertRating.run(user.id, mlId, rVal);
        }
      }
      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }

    res.json({ preferences: getUserPreferences(user.id) });
  });

  app.get("/api/actors", (req, res) => {
    const q = String(req.query.q ?? "");
    res.json(getFeaturedActorDirectory(q));
  });

  app.post("/api/interactions", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const mlId = Number(req.body?.movielensId);
    const type = String(req.body?.interactionType || "view").slice(0, 32);
    const weight = Math.min(5, Math.max(0.1, Number(req.body?.weight ?? 1.0)));
    if (!Number.isFinite(mlId)) {
      res.status(400).json({ error: "movielensId is required." });
      return;
    }
    const exists = db.prepare("SELECT movielens_id FROM movies WHERE movielens_id = ?").get(mlId);
    if (!exists) {
      res.json({ status: "ignored" });
      return;
    }
    db.prepare(
      "INSERT INTO user_interactions (user_id, movielens_id, interaction_type, weight) VALUES (?, ?, ?, ?)"
    ).run(user.id, mlId, type, weight);
    res.status(201).json({ status: "recorded" });
  });

  app.get("/api/user/mood", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const moodDate = resolveMoodDate(req.query.date);
    res.json({
      moodDate,
      mood: getUserDailyMood(user.id, moodDate),
    });
  });

  app.put("/api/user/mood", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const { moodKey, moodLabel, date } = req.body ?? {};
    const cleanKey = String(moodKey || "").trim().slice(0, 48);
    const cleanLabel = String(moodLabel || cleanKey).trim().slice(0, 80);
    if (!cleanKey) {
      res.status(400).json({ error: "moodKey is required." });
      return;
    }
    const moodDate = resolveMoodDate(date);
    db.prepare(
      `INSERT INTO user_daily_moods (user_id, mood_date, mood_key, mood_label, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, mood_date) DO UPDATE SET
         mood_key = excluded.mood_key,
         mood_label = excluded.mood_label,
         updated_at = datetime('now')`
    ).run(user.id, moodDate, cleanKey, cleanLabel);

    res.json({
      mood: getUserDailyMood(user.id, moodDate),
    });
  });

  app.delete("/api/user/mood", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const moodDate = resolveMoodDate(req.query.date);
    db.prepare(
      "DELETE FROM user_daily_moods WHERE user_id = ? AND mood_date = ?"
    ).run(user.id, moodDate);
    res.json({ status: "cleared", moodDate });
  });

  app.get("/api/user/mood-movies", async (req, res) => {
    try {
      const moodKey = String(req.query.moodKey || "Feel-good").trim();
      const targetGenres = MOOD_TO_GENRES_MAP[moodKey] ?? ["Drama", "Comedy"];
      const genreConditions = targetGenres.map(() => "genres LIKE ?").join(" OR ");
      const genreParams = targetGenres.map((g) => `%"${g}"%`);

      const extraWhere =
        moodKey === "hidden_gems"
          ? "ml_rating_count BETWEEN 25 AND 550 AND ml_avg_rating >= 3.8"
          : moodKey === "Nostalgic" || moodKey === "nostalgic"
          ? "release_year IS NOT NULL AND release_year <= 2000 AND ml_rating_count >= 120"
          : "ml_rating_count >= 120 AND ml_avg_rating >= 3.5";

      const candidateRows = db
        .prepare(
          `SELECT movielens_id, item_idx, language_code, ml_rating_count, ml_avg_rating
           FROM movies
           WHERE (mood_tags LIKE ? OR ((${genreConditions}) AND ${extraWhere}))
           ORDER BY CASE WHEN mood_tags LIKE ? THEN 1 ELSE 0 END DESC, (ml_avg_rating * LOG10(ml_rating_count + 10)) DESC
           LIMIT 60`
        )
        .all(`%"${moodKey}"%`, ...genreParams, `%"${moodKey}"%`) as Array<{
        movielens_id: number;
        item_idx: number;
        language_code: string;
        ml_rating_count: number;
        ml_avg_rating: number;
      }>;

      const user = getRequestUser(req);
      let selectedIds = candidateRows.slice(0, 14).map((r) => r.movielens_id);

      if (user) {
        const prefs = getUserPreferences(user.id);
        const prefLangs = new Set(
          [...prefs.originalLanguages, ...prefs.preferredLanguages].map((l) => l.toLowerCase())
        );

        const userRatingRows = db
          .prepare(
            `SELECT r.movielens_id, r.rating, m.item_idx, m.title
             FROM ratings r JOIN movies m ON r.movielens_id = m.movielens_id
             WHERE r.user_id = ?`
          )
          .all(user.id) as Array<{
          movielens_id: number;
          rating: number;
          item_idx: number;
          title: string;
        }>;
        const ratedIds = new Set(userRatingRows.map((r) => r.movielens_id));
        const unratedCandidates = candidateRows.filter((c) => !ratedIds.has(c.movielens_id));

        const vaeScoreById = new Map<number, number>();
        if (userRatingRows.some((r) => r.item_idx >= 0) && loadMultVAEModel()) {
          try {
            const vaeTop = generateUserRecommendations(
              "multvae",
              userRatingRows.map((r) => ({
                movielensId: r.movielens_id,
                itemIdx: r.item_idx,
                rating: r.rating,
                title: r.title,
              })),
              180,
              moodKey === "hidden_gems" ? "hidden_gems" : "top_ranked"
            );
            for (const v of vaeTop) vaeScoreById.set(v.movielensId, v.score);
          } catch {
            // fallback cleanly
          }
        }

        unratedCandidates.sort((a, b) => {
          const la = prefLangs.has(a.language_code) ? 0.35 : 0;
          const lb = prefLangs.has(b.language_code) ? 0.35 : 0;
          const sa = (vaeScoreById.get(a.movielens_id) ?? 0) + la;
          const sb = (vaeScoreById.get(b.movielens_id) ?? 0) + lb;
          if (sa !== sb) return sb - sa;
          return b.ml_avg_rating - a.ml_avg_rating;
        });

        selectedIds = (unratedCandidates.length >= 6 ? unratedCandidates : candidateRows)
          .slice(0, 14)
          .map((r) => r.movielens_id);
      }

      const movies = await enrichMoviesBatch(selectedIds);
      res.json({ moodKey, movies });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load mood picks";
      res.status(500).json({ error: msg });
    }
  });

  // ---------- MOVIES & TMDB DISCOVERY ----------
  const SOUTH_INDIAN_TRENDING_IDS = [
    100003, // Kantara (Kannada)
    100226, // Pushpa 2: The Rule (Telugu)
    100002, // K.G.F: Chapter 2 (Kannada)
    100224, // Kalki 2898 AD (Telugu)
    100326, // Amaran (Tamil)
    100413, // Manjummel Boys (Malayalam)
    100227, // Devara: Part 1 (Telugu)
    100325, // Maharaja (Tamil)
    100407, // Aavesham (Malayalam)
    100228, // Salaar: Part 1 – Ceasefire (Telugu)
    100304, // Leo (Tamil)
    100201, // RRR (Telugu)
  ];

  const REGIONAL_HIDDEN_GEM_IDS = [
    100012, // Sapta Sagaradaache Ello - Side A (Kannada)
    100004, // 777 Charlie (Kannada)
    100121, // 12th Fail (Hindi)
    100402, // Kumbalangi Nights (Malayalam)
    100215, // C/o Kancharapalem (Telugu)
    100308, // Jai Bhim (Tamil)
  ];

  const REGIONAL_CLASSIC_IDS = [
    100025, // Kasturi Nivasa (Kannada)
    100101, // 3 Idiots (Hindi)
    100016, // Mungaru Male (Kannada)
    100425, // Manichitrathazhu (Malayalam)
    100318, // Anbe Sivam (Tamil)
    100208, // Sita Ramam (Telugu)
  ];

  function interleaveMovies<T extends { movielens_id: number | null; title: string }>(
    first: T[],
    second: T[],
    maxItems = 14
  ): T[] {
    const out: T[] = [];
    const seen = new Set<string>();
    const pushUnique = (item: T | undefined) => {
      if (!item || out.length >= maxItems) return;
      const key = item.movielens_id != null ? `ml-${item.movielens_id}` : `t-${item.title.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    const len = Math.max(first.length, second.length);
    for (let i = 0; i < len && out.length < maxItems; i++) {
      pushUnique(first[i]);
      pushUnique(second[i]);
    }
    return out;
  }

  app.get("/api/movies/discover", async (_req, res) => {
    try {
      const [
        trending,
        popular,
        topRated,
        upcoming,
        featuredRows,
        southIndianTrending,
        regionalGems,
        regionalClassics,
      ] = await Promise.all([
        getDiscoverCategory("trending"),
        getDiscoverCategory("popular"),
        getDiscoverCategory("top_rated"),
        getDiscoverCategory("upcoming"),
        enrichMoviesBatch([100201]),
        enrichMoviesBatch(SOUTH_INDIAN_TRENDING_IDS, 4),
        enrichMoviesBatch(REGIONAL_HIDDEN_GEM_IDS, 3),
        enrichMoviesBatch(REGIONAL_CLASSIC_IDS, 3),
      ]);
      const featured =
        featuredRows[0] ??
        trending.movies.find((m) => m.backdrop_url || m.poster_url) ??
        trending.movies[0] ??
        popular.movies[0] ??
        null;

      const mixedTrending =
        southIndianTrending.length > 0
          ? interleaveMovies(southIndianTrending, trending.movies, 16)
          : trending.movies;
      const mixedTopRated =
        regionalClassics.length > 0
          ? interleaveMovies(topRated.movies, regionalClassics, 14)
          : topRated.movies;
      const mixedUpcoming =
        regionalGems.length > 0
          ? interleaveMovies(regionalGems, upcoming.movies, 14)
          : upcoming.movies;

      res.json({
        featured,
        trending: mixedTrending,
        popular: popular.movies,
        top_rated: mixedTopRated,
        upcoming: mixedUpcoming,
        tmdb_configured: hasTmdbCredentials(),
        source: trending.source,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load discover feed";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/movies/by-language", async (req, res) => {
    try {
      const limit = Math.min(20, Math.max(4, Number(req.query.limit ?? 14)));
      const [en, hi, kn, te, ta, ml] = await Promise.all([
        getMoviesByLanguage("en", limit),
        getMoviesByLanguage("hi", limit),
        getMoviesByLanguage("kn", limit),
        getMoviesByLanguage("te", limit),
        getMoviesByLanguage("ta", limit),
        getMoviesByLanguage("ml", limit),
      ]);
      res.json({ rows: { en, hi, kn, te, ta, ml } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch language rows";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/movies/genres", (_req, res) => {
    const rows = db.prepare("SELECT genres FROM movies").all() as Array<{
      genres: string;
    }>;
    const counts = new Map<string, number>();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.genres) as string[];
        for (const g of arr) {
          counts.set(g, (counts.get(g) ?? 0) + 1);
        }
      } catch {
        // ignore
      }
    }
    const genres = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    res.json({ genres });
  });

  app.get("/api/movies/search", async (req, res) => {
    try {
      const q = String(req.query.q ?? "");
      const genre = req.query.genre ? String(req.query.genre) : undefined;
      const limit = Math.min(48, Math.max(1, Number(req.query.limit ?? 24)));
      const offset = Math.max(0, Number(req.query.offset ?? 0));
      const language = req.query.language ? String(req.query.language) : "all";
      const audioMode = req.query.audioMode ? String(req.query.audioMode) : "all";
      const result = await searchCatalogAndTmdb(q, genre, limit, offset, language, audioMode);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Movie search failed";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/movies/lookup", async (req, res) => {
    try {
      const rawIds = Array.isArray(req.body?.movielensIds)
        ? (req.body.movielensIds as unknown[])
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n))
            .slice(0, 48)
        : [];
      const movies = await enrichMoviesBatch(rawIds);
      res.json({ movies });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Movie lookup failed";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/movies/:id", async (req, res) => {
    try {
      const mlId = Number(req.params.id);
      if (!Number.isFinite(mlId)) {
        res.status(400).json({ error: "Invalid MovieLens ID" });
        return;
      }
      const enriched = await enrichMoviesBatch([mlId]);
      if (enriched.length === 0) {
        res.status(404).json({ error: "Movie not found" });
        return;
      }
      const movie = enriched[0];
      let similar: Array<Record<string, unknown>> = [];
      if (movie.item_idx >= 0) {
        const simItems = getSimilarMoviesByLatent(movie.item_idx, 6);
        if (simItems.length > 0) {
          const simMovies = await enrichMoviesBatch(
            simItems.map((s) => s.movielensId)
          );
          const simMap = new Map(simItems.map((s) => [s.movielensId, s.similarity]));
          similar = simMovies.map((sm) => ({
            ...sm,
            latent_similarity: simMap.get(sm.movielens_id ?? -1) ?? 0,
          }));
        }
      }
      res.json({ movie, similar });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch movie details";
      res.status(500).json({ error: msg });
    }
  });

  // ---------- USER RATINGS ----------
  app.get("/api/ratings", requireAuth, async (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const rows = db
      .prepare(
        `SELECT r.id, r.movielens_id, r.rating, r.note, r.mood_tag, r.created_at, r.updated_at
         FROM ratings r
         WHERE r.user_id = ?
         ORDER BY r.updated_at DESC`
      )
      .all(user.id) as Array<{
      id: number;
      movielens_id: number;
      rating: number;
      note: string | null;
      mood_tag: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const movies = await enrichMoviesBatch(rows.map((r) => r.movielens_id));
    const movieMap = new Map(movies.map((m) => [m.movielens_id, m]));

    const ratings = rows.map((r) => ({
      ...r,
      movie: movieMap.get(r.movielens_id) ?? null,
    }));
    res.json({ ratings, total: ratings.length });
  });

  app.post("/api/ratings", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const { movielensId, rating, note, moodTag } = req.body ?? {};
    const mlId = Number(movielensId);
    const val = Number(rating);
    const cleanNote =
      typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
    const cleanMood =
      typeof moodTag === "string" && moodTag.trim() ? moodTag.trim().slice(0, 48) : null;

    if (!Number.isFinite(mlId) || !Number.isFinite(val) || val < 1 || val > 5) {
      res.status(400).json({ error: "movielensId and rating (1-5) are required." });
      return;
    }

    const movieExists = db
      .prepare("SELECT movielens_id FROM movies WHERE movielens_id = ?")
      .get(mlId);
    if (!movieExists) {
      res.status(404).json({ error: "Movie not found in MovieLens catalog." });
      return;
    }

    db.prepare(
      `INSERT INTO ratings (user_id, movielens_id, rating, note, mood_tag)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, movielens_id) DO UPDATE SET
         rating = excluded.rating,
         note = CASE WHEN ? IS NOT NULL THEN excluded.note ELSE ratings.note END,
         mood_tag = CASE WHEN ? IS NOT NULL THEN excluded.mood_tag ELSE ratings.mood_tag END,
         updated_at = datetime('now')`
    ).run(
      user.id,
      mlId,
      val,
      cleanNote,
      cleanMood,
      note !== undefined ? 1 : null,
      moodTag !== undefined ? 1 : null
    );

    res.status(201).json({
      status: "saved",
      movielensId: mlId,
      rating: val,
      note: cleanNote,
      moodTag: cleanMood,
    });
  });

  app.post("/api/ratings/bulk", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const rawRatings = Array.isArray(req.body?.ratings)
      ? (req.body.ratings as Array<{
          movielensId: number;
          rating: number;
          note?: string | null;
          moodTag?: string | null;
        }>)
      : [];
    const replaceExisting = Boolean(req.body?.replaceExisting);

    const validItems = rawRatings
      .map((item) => ({
        movielensId: Number(item.movielensId),
        rating: Number(item.rating),
        note:
          typeof item.note === "string" && item.note.trim()
            ? item.note.trim().slice(0, 200)
            : null,
        moodTag:
          typeof item.moodTag === "string" && item.moodTag.trim()
            ? item.moodTag.trim().slice(0, 48)
            : null,
      }))
      .filter(
        (item) =>
          Number.isFinite(item.movielensId) &&
          Number.isFinite(item.rating) &&
          item.rating >= 1 &&
          item.rating <= 5
      );

    if (validItems.length === 0 && !replaceExisting) {
      res.status(400).json({ error: "No valid ratings provided." });
      return;
    }

    const checkMovie = db.prepare("SELECT movielens_id FROM movies WHERE movielens_id = ?");
    const upsert = db.prepare(
      `INSERT INTO ratings (user_id, movielens_id, rating, note, mood_tag)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, movielens_id) DO UPDATE SET
         rating = excluded.rating,
         note = COALESCE(excluded.note, ratings.note),
         mood_tag = COALESCE(excluded.mood_tag, ratings.mood_tag),
         updated_at = datetime('now')`
    );

    let savedCount = 0;
    db.exec("BEGIN TRANSACTION;");
    try {
      if (replaceExisting) {
        db.prepare("DELETE FROM ratings WHERE user_id = ?").run(user.id);
      }
      for (const item of validItems) {
        if (!checkMovie.get(item.movielensId)) continue;
        upsert.run(user.id, item.movielensId, item.rating, item.note, item.moodTag);
        savedCount++;
      }
      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }

    res.status(201).json({ status: "saved", count: savedCount });
  });

  app.put("/api/ratings/:movielensId", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const mlId = Number(req.params.movielensId);
    const val = Number(req.body?.rating);
    const cleanNote =
      req.body?.note === undefined
        ? undefined
        : typeof req.body.note === "string" && req.body.note.trim()
        ? req.body.note.trim().slice(0, 200)
        : null;
    const cleanMood =
      req.body?.moodTag === undefined
        ? undefined
        : typeof req.body.moodTag === "string" && req.body.moodTag.trim()
        ? req.body.moodTag.trim().slice(0, 48)
        : null;

    if (!Number.isFinite(mlId) || !Number.isFinite(val) || val < 1 || val > 5) {
      res.status(400).json({ error: "Valid rating (1-5) is required." });
      return;
    }
    const existing = db
      .prepare("SELECT note, mood_tag FROM ratings WHERE user_id = ? AND movielens_id = ?")
      .get(user.id, mlId) as { note: string | null; mood_tag: string | null } | undefined;
    if (!existing) {
      res.status(404).json({ error: "Rating not found." });
      return;
    }
    const nextNote = cleanNote === undefined ? existing.note : cleanNote;
    const nextMood = cleanMood === undefined ? existing.mood_tag : cleanMood;

    db.prepare(
      "UPDATE ratings SET rating = ?, note = ?, mood_tag = ?, updated_at = datetime('now') WHERE user_id = ? AND movielens_id = ?"
    ).run(val, nextNote, nextMood, user.id, mlId);

    res.json({
      status: "updated",
      movielensId: mlId,
      rating: val,
      note: nextNote,
      moodTag: nextMood,
    });
  });

  app.delete("/api/ratings", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    db.prepare("DELETE FROM ratings WHERE user_id = ?").run(user.id);
    res.json({ status: "cleared" });
  });

  app.delete("/api/ratings/:movielensId", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const mlId = Number(req.params.movielensId);
    db.prepare("DELETE FROM ratings WHERE user_id = ? AND movielens_id = ?").run(
      user.id,
      mlId
    );
    res.json({ status: "deleted", movielensId: mlId });
  });

  // ---------- WATCHLIST ----------
  app.get("/api/watchlist", requireAuth, async (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const rows = db
      .prepare(
        "SELECT movielens_id, created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC"
      )
      .all(user.id) as Array<{ movielens_id: number; created_at: string }>;
    const movies = await enrichMoviesBatch(rows.map((r) => r.movielens_id));
    res.json({ movies });
  });

  app.post("/api/watchlist", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const mlId = Number(req.body?.movielensId);
    if (!Number.isFinite(mlId)) {
      res.status(400).json({ error: "movielensId is required." });
      return;
    }
    db.prepare(
      "INSERT OR IGNORE INTO watchlist (user_id, movielens_id) VALUES (?, ?)"
    ).run(user.id, mlId);
    res.status(201).json({ status: "added", movielensId: mlId });
  });

  app.delete("/api/watchlist/:movielensId", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const mlId = Number(req.params.movielensId);
    db.prepare("DELETE FROM watchlist WHERE user_id = ? AND movielens_id = ?").run(
      user.id,
      mlId
    );
    res.json({ status: "removed", movielensId: mlId });
  });

  // ---------- RECOMMENDATIONS ----------
  app.post("/api/recommendations/generate", async (req, res) => {
    try {
      const user = getRequestUser(req);
      const algoRaw = String(req.body?.algorithm || "multvae").toLowerCase();
      const algorithm: "multvae" | "mf" | "popularity" =
        algoRaw === "mf"
          ? "mf"
          : algoRaw === "popularity"
          ? "popularity"
          : "multvae";

      const discoveryMode: DiscoveryMode =
        req.body?.discoveryMode === "hidden_gems" ? "hidden_gems" : "top_ranked";

      let userRatingRows: Array<{
        movielens_id: number;
        rating: number;
        item_idx: number;
        title: string;
        genres: string;
      }> = [];

      if (user) {
        userRatingRows = db
          .prepare(
            `SELECT r.movielens_id, r.rating, m.item_idx, m.title, m.genres
             FROM ratings r
             JOIN movies m ON r.movielens_id = m.movielens_id
             WHERE r.user_id = ?`
          )
          .all(user.id) as typeof userRatingRows;
      } else if (Array.isArray(req.body?.guestRatings)) {
        const guestInput = req.body.guestRatings as Array<{
          movielensId: number;
          rating: number;
        }>;
        const validPairs = guestInput
          .map((g) => ({
            movielensId: Number(g.movielensId),
            rating: Number(g.rating),
          }))
          .filter(
            (g) =>
              Number.isFinite(g.movielensId) &&
              Number.isFinite(g.rating) &&
              g.rating >= 1 &&
              g.rating <= 5
          );
        if (validPairs.length > 0) {
          const placeholders = validPairs.map(() => "?").join(",");
          const movieRows = db
            .prepare(
              `SELECT movielens_id, item_idx, title, genres FROM movies WHERE movielens_id IN (${placeholders})`
            )
            .all(...validPairs.map((p) => p.movielensId)) as Array<{
            movielens_id: number;
            item_idx: number;
            title: string;
            genres: string;
          }>;
          const ratingById = new Map(
            validPairs.map((p) => [p.movielensId, p.rating])
          );
          userRatingRows = movieRows.map((m) => ({
            ...m,
            rating: ratingById.get(m.movielens_id) ?? 4,
          }));
        }
      }

      if (algorithm !== "popularity" && userRatingRows.length === 0) {
        res.status(400).json({
          error:
            "Rate at least 1 movie on the Rate Movies page (or choose a Starter Pack / Demo Taste Profile) so Mult-VAE / Matrix Factorization can build your preference vector.",
        });
        return;
      }

      const ranked = generateUserRecommendations(
        algorithm,
        userRatingRows.map((r) => ({
          movielensId: r.movielens_id,
          itemIdx: r.item_idx,
          rating: r.rating,
          title: r.title,
        })),
        20,
        discoveryMode
      );

      const enrichedMovies = await enrichMoviesBatch(
        ranked.map((r) => r.movielensId)
      );
      const movieMap = new Map(enrichedMovies.map((m) => [m.movielens_id, m]));

      const batchId = crypto.randomUUID();
      const insertHist = user
        ? db.prepare(`
            INSERT INTO recommendation_history (
              user_id, batch_id, algorithm, movielens_id, rank, score, explanation,
              anchor_movie_title, anchor_movie_rating, anchor_similarity, discovery_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
        : null;

      const recommendations = ranked.map((item, idx) => {
        const movie = movieMap.get(item.movielensId);
        let explanation = "";
        if (algorithm === "multvae") {
          explanation = item.anchorMovieTitle
            ? `Decoded from your latent preference profile; strong decoder-embedding alignment with ${item.anchorMovieTitle}.`
            : "High multinomial probability reconstructed by Mult-VAE from your rated movies.";
        } else if (algorithm === "mf") {
          explanation = item.anchorMovieTitle
            ? `High dot-product affinity between your folded-in user vector and movie factors near ${item.anchorMovieTitle}.`
            : "Predicted strong explicit rating via regularized Matrix Factorization latent dot product.";
        } else {
          explanation =
            discoveryMode === "hidden_gems"
              ? `Higher-coverage pick ranked #${idx + 1} among lower-exposure films (25–600 ratings) by Bayesian-weighted MovieLens score.`
              : `Ranked #${idx + 1} by Bayesian-weighted MovieLens 1M positive interaction volume (non-personalized baseline).`;
        }

        let historyId = -(idx + 1);
        if (user && insertHist) {
          const histRes = insertHist.run(
            user.id,
            batchId,
            algorithm,
            item.movielensId,
            idx + 1,
            item.score,
            explanation,
            item.anchorMovieTitle,
            item.anchorMovieRating,
            item.anchorSimilarity,
            discoveryMode
          );
          historyId = Number(histRes.lastInsertRowid);
        }

        return {
          historyId,
          rank: idx + 1,
          score: item.score,
          normalizedScore: item.normalizedScore,
          similarToTitle: item.similarToTitle,
          anchorMovieTitle: item.anchorMovieTitle,
          anchorMovieRating: item.anchorMovieRating,
          anchorSimilarity: item.anchorSimilarity,
          itemRatingCount: item.itemRatingCount,
          discoveryMode,
          explanation,
          feedback: null as "like" | "dislike" | null,
          movie,
        };
      });

      res.json({
        batchId,
        algorithm,
        discoveryMode,
        ratedMoviesCount: userRatingRows.length,
        recommendations,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Recommendation generation failed";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/recommendations/sections", async (req, res) => {
    try {
      const user = getRequestUser(req);
      const prefs = user ? (getUserPreferences(user.id) as unknown as UserPrefRecord) : null;
      const todayDate = new Date().toISOString().slice(0, 10);
      const todayMood = user ? getUserDailyMood(user.id, todayDate) : null;
      const requestedMood =
        typeof req.body?.moodKey === "string" && req.body.moodKey.trim()
          ? req.body.moodKey.trim()
          : todayMood?.moodKey ?? null;

      const excludeIds = Array.isArray(req.body?.excludeIds)
        ? (req.body.excludeIds as unknown[]).map(Number).filter(Number.isFinite)
        : [];

      const result = await buildHybridDiscoverySections(db, {
        userId: user?.id ?? null,
        preferences: prefs,
        moodKey: requestedMood,
        guestRatings: Array.isArray(req.body?.guestRatings)
          ? req.body.guestRatings
          : undefined,
        refresh: Boolean(req.body?.refresh),
        surpriseMe: Boolean(req.body?.surpriseMe),
        excludeIds,
      });

      res.json({
        ...result,
        refreshedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to compute discovery sections";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/recommendations/history", requireAuth, async (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const algoRaw = req.query.algorithm ? String(req.query.algorithm) : null;
    const algo = algoRaw === "mult_vae" ? "multvae" : algoRaw;
    const discoveryModeParam = req.query.discoveryMode
      ? String(req.query.discoveryMode)
      : null;

    const latestBatchRow = algo
      ? ((discoveryModeParam
          ? db
              .prepare(
                "SELECT batch_id, algorithm, discovery_mode, created_at FROM recommendation_history WHERE user_id = ? AND algorithm = ? AND COALESCE(discovery_mode, 'top_ranked') = ? ORDER BY id DESC LIMIT 1"
              )
              .get(user.id, algo, discoveryModeParam)
          : db
              .prepare(
                "SELECT batch_id, algorithm, discovery_mode, created_at FROM recommendation_history WHERE user_id = ? AND algorithm = ? ORDER BY id DESC LIMIT 1"
              )
              .get(user.id, algo)) as
          | {
              batch_id: string;
              algorithm: string;
              discovery_mode: string | null;
              created_at: string;
            }
          | undefined)
      : (db
          .prepare(
            "SELECT batch_id, algorithm, discovery_mode, created_at FROM recommendation_history WHERE user_id = ? ORDER BY id DESC LIMIT 1"
          )
          .get(user.id) as
          | {
              batch_id: string;
              algorithm: string;
              discovery_mode: string | null;
              created_at: string;
            }
          | undefined);

    if (!latestBatchRow) {
      res.json({ batchId: null, recommendations: [] });
      return;
    }

    const rows = db
      .prepare(
        "SELECT * FROM recommendation_history WHERE user_id = ? AND batch_id = ? ORDER BY rank ASC"
      )
      .all(user.id, latestBatchRow.batch_id) as Array<{
      id: number;
      movielens_id: number;
      rank: number;
      score: number;
      feedback: "like" | "dislike" | null;
      explanation: string;
      anchor_movie_title: string | null;
      anchor_movie_rating: number | null;
      anchor_similarity: number | null;
      discovery_mode: string | null;
    }>;

    const movies = await enrichMoviesBatch(rows.map((r) => r.movielens_id));
    const movieMap = new Map(movies.map((m) => [m.movielens_id, m]));

    const maxS = Math.max(...rows.map((r) => r.score), 1e-6);
    const minS = Math.min(...rows.map((r) => r.score), 0);
    const span = Math.max(1e-8, maxS - minS);

    res.json({
      batchId: latestBatchRow.batch_id,
      algorithm: latestBatchRow.algorithm,
      discoveryMode:
        (latestBatchRow.discovery_mode as DiscoveryMode) || "top_ranked",
      createdAt: latestBatchRow.created_at,
      recommendations: rows.map((r) => {
        const mv = movieMap.get(r.movielens_id) ?? null;
        return {
          historyId: r.id,
          rank: r.rank,
          score: r.score,
          normalizedScore: Number(
            (((r.score - minS) / span) * 0.35 + 0.65).toFixed(4)
          ),
          similarToTitle: r.anchor_movie_title,
          anchorMovieTitle: r.anchor_movie_title,
          anchorMovieRating: r.anchor_movie_rating,
          anchorSimilarity: r.anchor_similarity,
          itemRatingCount: mv?.ml_rating_count,
          discoveryMode:
            (r.discovery_mode as DiscoveryMode) || "top_ranked",
          explanation: r.explanation,
          feedback: r.feedback,
          movie: mv,
        };
      }),
    });
  });

  app.post("/api/recommendations/feedback", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const { historyId, feedback } = req.body ?? {};
    const valid = feedback === "like" || feedback === "dislike" ? feedback : null;
    db.prepare(
      "UPDATE recommendation_history SET feedback = ? WHERE id = ? AND user_id = ?"
    ).run(valid, Number(historyId), user.id);
    res.json({ status: "updated", feedback: valid });
  });

  // Optional Gemini explanation strictly grounded in actual VAE/MF output & user ratings
  app.post("/api/recommendations/explain", requireAuth, async (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const { movielensId, algorithm, score } = req.body ?? {};
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: "GEMINI_API_KEY is not configured in Secrets for natural-language explanations.",
      });
      return;
    }

    const movie = db
      .prepare("SELECT title, release_year, genres, overview FROM movies WHERE movielens_id = ?")
      .get(Number(movielensId)) as
      | { title: string; release_year: number | null; genres: string; overview: string | null }
      | undefined;
    if (!movie) {
      res.status(404).json({ error: "Movie not found." });
      return;
    }

    const rated = db
      .prepare(
        `SELECT m.title, m.genres, r.rating
         FROM ratings r JOIN movies m ON r.movielens_id = m.movielens_id
         WHERE r.user_id = ? ORDER BY r.rating DESC, r.updated_at DESC LIMIT 8`
      )
      .all(user.id) as Array<{ title: string; genres: string; rating: number }>;

    try {
      const prompt = `Explain in 2 concise sentences why the ${algorithm} recommender system scored "${movie.title}" (${movie.release_year || ""}, genres: ${movie.genres}, model score: ${score}) for a user whose recent ratings are: ${rated
        .map((r) => `${r.title} (${r.rating}/5)`)
        .join(", ")}. Ground the explanation strictly in these real ratings and movie metadata without inventing facts.`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
      });
      res.json({ explanation: response.text?.trim() || "Explanation unavailable." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gemini explanation failed";
      res.status(500).json({ error: msg });
    }
  });

  // ---------- MACHINE LEARNING TRAINING & EVALUATION ----------
  app.get("/api/ml/status", (_req, res) => {
    const dataset = getDatasetStats();
    const vaeCkptExists = fs.existsSync(
      path.join(ROOT_DIR, "data", "checkpoints", "multvae.json")
    );
    const mfCkptExists = fs.existsSync(
      path.join(ROOT_DIR, "data", "checkpoints", "mf.json")
    );
    const popCkptExists = fs.existsSync(
      path.join(ROOT_DIR, "data", "checkpoints", "popularity.json")
    );

    const vaeMeta = loadMultVAEModel()?.config ?? null;
    const mfMeta = loadMFModel()?.config ?? null;
    const popLoaded = Boolean(loadPopularityModel());

    const runs = db
      .prepare("SELECT * FROM training_runs ORDER BY id DESC LIMIT 15")
      .all() as Array<Record<string, unknown>>;

    const parsedRuns = runs.map((r) => ({
      ...r,
      hyperparameters: JSON.parse(String(r.hyperparameters || "{}")),
      epoch_history: JSON.parse(String(r.epoch_history || "[]")),
    }));

    // Latest evaluation result per model
    const evalRows = db
      .prepare(
        `SELECT e.* FROM evaluation_results e
         INNER JOIN (
           SELECT model_type, MAX(id) as max_id
           FROM evaluation_results
           GROUP BY model_type
         ) latest ON e.id = latest.max_id`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      dataset,
      liveTraining: trainingState,
      checkpoints: {
        multvae: { saved: vaeCkptExists, config: vaeMeta },
        mf: { saved: mfCkptExists, config: mfMeta },
        popularity: { saved: popCkptExists, loaded: popLoaded },
      },
      trainingRuns: parsedRuns,
      evaluationResults: evalRows,
    });
  });

  app.post("/api/ml/train/vae", (req, res) => {
    if (trainingState.running) {
      res.status(409).json({
        error: `A ${trainingState.modelType} job is already running.`,
      });
      return;
    }

    const body = req.body ?? {};
    const cfg = {
      hiddenDim: Math.min(320, Math.max(64, Number(body.hiddenDim || 160))),
      latentDim: Math.min(128, Math.max(16, Number(body.latentDim || 48))),
      epochs: Math.min(30, Math.max(3, Number(body.epochs || 10))),
      batchSize: Math.min(512, Math.max(64, Number(body.batchSize || 256))),
      learningRate: Math.min(0.01, Math.max(0.0002, Number(body.learningRate || 0.0025))),
      betaMax: Math.min(1.0, Math.max(0.01, Number(body.betaMax || 0.2))),
    };

    trainingState.running = true;
    trainingState.modelType = "multvae";
    trainingState.currentEpoch = 0;
    trainingState.totalEpochs = cfg.epochs;
    trainingState.message = "Initializing Mult-VAE training on MovieLens 1M...";
    trainingState.epochHistory = [];
    trainingState.error = null;

    void (async () => {
      try {
        const result = await trainMultVAE(cfg, (m) => {
          trainingState.currentEpoch = m.epoch;
          trainingState.epochHistory.push(m);
          trainingState.message = `Epoch ${m.epoch}/${cfg.epochs} · ELBO ${m.trainLoss} · Val Recall@20 ${m.valRecall20}`;
        });
        trainingState.runId = result.runId;
        trainingState.message = "Mult-VAE training complete. Checkpoint saved.";
      } catch (err) {
        trainingState.error = err instanceof Error ? err.message : String(err);
        trainingState.message = "Mult-VAE training failed.";
      } finally {
        trainingState.running = false;
      }
    })();

    res.status(202).json({ status: "started", config: cfg });
  });

  app.post("/api/ml/train/mf", (req, res) => {
    if (trainingState.running) {
      res.status(409).json({
        error: `A ${trainingState.modelType} job is already running.`,
      });
      return;
    }

    const body = req.body ?? {};
    const cfg = {
      latentDim: Math.min(96, Math.max(8, Number(body.latentDim || 32))),
      epochs: Math.min(30, Math.max(3, Number(body.epochs || 10))),
      learningRate: Math.min(0.05, Math.max(0.001, Number(body.learningRate || 0.012))),
      reg: Math.min(0.5, Math.max(0.001, Number(body.reg || 0.05))),
    };

    trainingState.running = true;
    trainingState.modelType = "mf";
    trainingState.currentEpoch = 0;
    trainingState.totalEpochs = cfg.epochs;
    trainingState.message = "Training Matrix Factorization (SGD)...";
    trainingState.epochHistory = [];
    trainingState.error = null;

    void (async () => {
      try {
        const result = await trainMatrixFactorization(cfg, (m) => {
          trainingState.currentEpoch = m.epoch;
          trainingState.epochHistory.push(m);
          trainingState.message = `Epoch ${m.epoch}/${cfg.epochs} · Train RMSE ${m.trainLoss} · Val Recall@20 ${m.valRecall20}`;
        });
        trainingState.runId = result.runId;
        trainingState.message = "Matrix Factorization training complete.";
      } catch (err) {
        trainingState.error = err instanceof Error ? err.message : String(err);
        trainingState.message = "Matrix Factorization training failed.";
      } finally {
        trainingState.running = false;
      }
    })();

    res.status(202).json({ status: "started", config: cfg });
  });

  app.post("/api/ml/train/popularity", (_req, res) => {
    if (trainingState.running) {
      res.status(409).json({ error: "Another training job is currently running." });
      return;
    }
    const ckpt = trainPopularity();
    res.json({ status: "completed", globalMean: ckpt.globalMean, numItems: ckpt.numItems });
  });

  app.post("/api/ml/evaluate", async (_req, res) => {
    if (trainingState.running) {
      res.status(409).json({ error: "Wait for current training job to finish." });
      return;
    }
    trainingState.running = true;
    trainingState.modelType = "evaluation";
    trainingState.currentEpoch = 0;
    trainingState.totalEpochs = 3;
    trainingState.message = "Evaluating Popularity, Matrix Factorization, and Mult-VAE on held-out test interactions...";
    trainingState.error = null;

    try {
      const metrics = await evaluateAllModels();
      trainingState.message = "All three models evaluated on identical held-out test cohort.";
      res.json({ status: "completed", metrics });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      trainingState.error = msg;
      res.status(400).json({ error: msg });
    } finally {
      trainingState.running = false;
    }
  });

  // ---------- USER INSIGHTS ----------
  app.get("/api/insights/user", requireAuth, (req, res) => {
    const user = (req as express.Request & { user: AuthUser }).user;
    const ratings = db
      .prepare(
        `SELECT r.movielens_id, r.rating, r.note, r.mood_tag, r.updated_at, m.title, m.genres, m.release_year
         FROM ratings r JOIN movies m ON r.movielens_id = m.movielens_id
         WHERE r.user_id = ?
         ORDER BY r.updated_at DESC`
      )
      .all(user.id) as Array<{
      movielens_id: number;
      rating: number;
      note: string | null;
      mood_tag: string | null;
      updated_at: string;
      title: string;
      genres: string;
      release_year: number | null;
    }>;

    const totalRated = ratings.length;
    const avgRating =
      totalRated > 0
        ? Number(
            (ratings.reduce((a, b) => a + b.rating, 0) / totalRated).toFixed(2)
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

    for (const r of ratings) {
      const star = Math.round(r.rating);
      distMap.set(star, (distMap.get(star) ?? 0) + 1);
      if (r.mood_tag) {
        const curMood = moodAgg.get(r.mood_tag) ?? { count: 0, sum: 0 };
        curMood.count += 1;
        curMood.sum += r.rating;
        moodAgg.set(r.mood_tag, curMood);
      }
      try {
        const gs = JSON.parse(r.genres) as string[];
        for (const g of gs) {
          const cur = genreAgg.get(g) ?? { count: 0, sum: 0 };
          cur.count += 1;
          cur.sum += r.rating;
          genreAgg.set(g, cur);
        }
      } catch {
        // ignore
      }
    }

    const ratingDistribution = Array.from(distMap.entries()).map(([stars, count]) => ({
      stars: `${stars} ★`,
      starValue: stars,
      count,
    }));

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

    const mostPreferredGenre = genreAnalytics[0]?.genre ?? null;
    const highestRatedGenres = [...genreAnalytics]
      .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count)
      .slice(0, 3);

    const recStats = db
      .prepare(
        `SELECT algorithm, COUNT(*) as generatedCount,
         SUM(CASE WHEN feedback = 'like' THEN 1 ELSE 0 END) as likes,
         SUM(CASE WHEN feedback = 'dislike' THEN 1 ELSE 0 END) as dislikes
         FROM recommendation_history WHERE user_id = ? GROUP BY algorithm`
      )
      .all(user.id);

    const recentRecommendations = db
      .prepare(
        `SELECT rh.algorithm, rh.rank, rh.score, rh.feedback, rh.created_at, m.title, m.release_year
         FROM recommendation_history rh
         JOIN movies m ON rh.movielens_id = m.movielens_id
         WHERE rh.user_id = ?
         ORDER BY rh.id DESC LIMIT 12`
      )
      .all(user.id);

    const ratedNotes = ratings
      .filter((r) => Boolean(r.note) || Boolean(r.mood_tag))
      .slice(0, 12)
      .map((r) => ({
        movielens_id: r.movielens_id,
        title: r.title,
        release_year: r.release_year,
        rating: r.rating,
        note: r.note,
        mood_tag: r.mood_tag,
        updated_at: r.updated_at,
      }));

    const viewedRows = db
      .prepare(
        `SELECT ui.movielens_id, MAX(ui.created_at) as viewed_at, m.title, m.release_year, m.genres
         FROM user_interactions ui
         JOIN movies m ON ui.movielens_id = m.movielens_id
         WHERE ui.user_id = ? AND ui.interaction_type = 'view'
         GROUP BY ui.movielens_id
         ORDER BY MAX(ui.id) DESC
         LIMIT 12`
      )
      .all(user.id) as Array<{
      movielens_id: number;
      viewed_at: string;
      title: string;
      release_year: number | null;
      genres: string;
    }>;

    const viewedMovies = viewedRows.map((v) => ({
      movielens_id: v.movielens_id,
      title: v.title,
      release_year: v.release_year,
      genres: parseJsonArray<string>(v.genres),
      viewed_at: v.viewed_at,
    }));

    res.json({
      totalRated,
      avgRating,
      mostPreferredGenre,
      highestRatedGenres,
      ratingDistribution,
      genreAnalytics,
      moodTagSummary,
      ratedNotes,
      viewedMovies,
      recStats,
      recentRecommendations,
    });
  });

  app.use(
    "/api",
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("[Marrow] Unhandled API error:", err);
      const message = err instanceof Error ? err.message : "Internal server error";
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  );

  // ---------- VITE / STATIC SERVING ----------
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Marrow] Full-stack server running at http://localhost:${PORT}`);
  });

  const shutdown = () => {
    closeDb();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
