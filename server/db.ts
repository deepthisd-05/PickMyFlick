import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MULTILINGUAL_MOVIES } from "./data/multilingualCatalog.ts";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "cinevae.db");

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = DELETE;");
  db.exec("PRAGMA synchronous = FULL;");
  db.exec("PRAGMA foreign_keys = ON;");

  try {
    const checkRows = db.prepare("PRAGMA quick_check(10)").all() as Array<{ quick_check: string }>;
    const issues = checkRows.map((r) => r.quick_check).filter((msg) => msg !== "ok");
    if (issues.length > 0 && issues.every((msg) => msg.includes("wrong # of entries in index"))) {
      console.warn("[Marrow] SQLite index mismatch detected on startup; running REINDEX...");
      db.exec("REINDEX;");
    }
  } catch (err) {
    console.warn("[Marrow] Startup PRAGMA quick_check failed:", err);
  }

  initSchema(db);
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (!dbInstance) return;
  try {
    dbInstance.close();
  } catch {
    // ignore close error on shutdown
  } finally {
    dbInstance = null;
  }
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movies (
      movielens_id INTEGER PRIMARY KEY,
      item_idx INTEGER NOT NULL DEFAULT -1,
      title TEXT NOT NULL,
      raw_title TEXT NOT NULL,
      original_title TEXT,
      language_code TEXT NOT NULL DEFAULT 'en',
      is_dubbed INTEGER NOT NULL DEFAULT 0,
      available_dubs TEXT NOT NULL DEFAULT '[]',
      release_year INTEGER,
      runtime INTEGER,
      genres TEXT NOT NULL DEFAULT '[]',
      director TEXT,
      cast_list TEXT NOT NULL DEFAULT '[]',
      mood_tags TEXT NOT NULL DEFAULT '[]',
      story_tags TEXT NOT NULL DEFAULT '[]',
      catalog_origin TEXT NOT NULL DEFAULT 'movielens_1m',
      tmdb_id INTEGER,
      imdb_id TEXT,
      overview TEXT,
      poster_url TEXT,
      backdrop_url TEXT,
      tmdb_vote_average REAL,
      tmdb_vote_count INTEGER,
      ml_rating_count INTEGER NOT NULL DEFAULT 0,
      ml_avg_rating REAL NOT NULL DEFAULT 0,
      metadata_source TEXT NOT NULL DEFAULT 'movielens',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_movies_item_idx ON movies(item_idx);
    CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      movielens_id INTEGER NOT NULL,
      rating REAL NOT NULL CHECK (rating >= 1 AND rating <= 5),
      note TEXT,
      mood_tag TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (movielens_id) REFERENCES movies(movielens_id) ON DELETE CASCADE,
      UNIQUE (user_id, movielens_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      movielens_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (movielens_id) REFERENCES movies(movielens_id) ON DELETE CASCADE,
      UNIQUE (user_id, movielens_id)
    );

    CREATE TABLE IF NOT EXISTS user_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      movielens_id INTEGER NOT NULL,
      interaction_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (movielens_id) REFERENCES movies(movielens_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_interactions_user ON user_interactions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS recommendation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      movielens_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      score REAL NOT NULL,
      feedback TEXT CHECK (feedback IN ('like', 'dislike') OR feedback IS NULL),
      explanation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (movielens_id) REFERENCES movies(movielens_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_rec_history_user_batch ON recommendation_history(user_id, batch_id);

    CREATE TABLE IF NOT EXISTS training_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_type TEXT NOT NULL,
      status TEXT NOT NULL,
      dataset_name TEXT NOT NULL,
      hyperparameters TEXT NOT NULL DEFAULT '{}',
      epochs_planned INTEGER NOT NULL DEFAULT 0,
      epochs_completed INTEGER NOT NULL DEFAULT 0,
      final_train_loss REAL,
      final_val_loss REAL,
      final_recon_loss REAL,
      final_kl_loss REAL,
      epoch_history TEXT NOT NULL DEFAULT '[]',
      checkpoint_path TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS evaluation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      model_type TEXT NOT NULL,
      dataset_name TEXT NOT NULL,
      num_eval_users INTEGER NOT NULL,
      num_catalog_items INTEGER NOT NULL,
      recall_at_20 REAL NOT NULL,
      ndcg_at_100 REAL NOT NULL,
      catalog_coverage REAL NOT NULL,
      evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES training_runs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tmdb_discover_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      preferred_languages TEXT NOT NULL DEFAULT '[]',
      original_languages TEXT NOT NULL DEFAULT '[]',
      dubbed_languages TEXT NOT NULL DEFAULT '[]',
      language_mode TEXT NOT NULL DEFAULT 'both',
      preferred_genres TEXT NOT NULL DEFAULT '[]',
      favorite_actors TEXT NOT NULL DEFAULT '[]',
      favorite_male_actors TEXT NOT NULL DEFAULT '[]',
      favorite_female_actors TEXT NOT NULL DEFAULT '[]',
      character_types TEXT NOT NULL DEFAULT '[]',
      taste_style TEXT,
      taste_movie_ids TEXT NOT NULL DEFAULT '[]',
      story_styles TEXT NOT NULL DEFAULT '[]',
      pacing_preference TEXT NOT NULL DEFAULT 'balanced',
      runtime_preference TEXT NOT NULL DEFAULT 'any',
      era_preference TEXT NOT NULL DEFAULT 'any',
      setup_completed INTEGER NOT NULL DEFAULT 0,
      skipped_steps TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_daily_moods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mood_date TEXT NOT NULL,
      mood_key TEXT NOT NULL,
      mood_label TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, mood_date)
    );

    CREATE INDEX IF NOT EXISTS idx_user_daily_moods_user_date ON user_daily_moods(user_id, mood_date);
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  };

  ensureColumn("users", "is_demo", "INTEGER NOT NULL DEFAULT 0");

  // Multilingual & metadata columns on movies
  ensureColumn("movies", "original_title", "TEXT");
  ensureColumn("movies", "language_code", "TEXT NOT NULL DEFAULT 'en'");
  ensureColumn("movies", "is_dubbed", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("movies", "available_dubs", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("movies", "runtime", "INTEGER");
  ensureColumn("movies", "director", "TEXT");
  ensureColumn("movies", "cast_list", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("movies", "mood_tags", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("movies", "story_tags", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("movies", "catalog_origin", "TEXT NOT NULL DEFAULT 'movielens_1m'");
  db.exec("CREATE INDEX IF NOT EXISTS idx_movies_lang ON movies(language_code);");

  // Expanded preference columns on user_preferences
  ensureColumn("user_preferences", "original_languages", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("user_preferences", "dubbed_languages", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("user_preferences", "language_mode", "TEXT NOT NULL DEFAULT 'both'");
  ensureColumn("user_preferences", "favorite_male_actors", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("user_preferences", "favorite_female_actors", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("user_preferences", "character_types", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("user_preferences", "story_styles", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("user_preferences", "pacing_preference", "TEXT NOT NULL DEFAULT 'balanced'");
  ensureColumn("user_preferences", "runtime_preference", "TEXT NOT NULL DEFAULT 'any'");
  ensureColumn("user_preferences", "era_preference", "TEXT NOT NULL DEFAULT 'any'");

  ensureColumn("ratings", "note", "TEXT");
  ensureColumn("ratings", "mood_tag", "TEXT");
  ensureColumn("recommendation_history", "anchor_movie_title", "TEXT");
  ensureColumn("recommendation_history", "anchor_movie_rating", "REAL");
  ensureColumn("recommendation_history", "anchor_similarity", "REAL");
  ensureColumn("recommendation_history", "discovery_mode", "TEXT DEFAULT 'top_ranked'");
}

export interface CatalogMovieSeed {
  movielens_id: number;
  item_idx: number;
  title: string;
  raw_title: string;
  release_year: number | null;
  genres: string[];
  imdb_id: string | null;
  tmdb_id: number | null;
  ml_rating_count: number;
  ml_avg_rating: number;
}

export function seedCatalogIfNeeded(): number {
  const db = getDb();
  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM movies WHERE item_idx >= 0").get() as { cnt: number };
  if (countRow.cnt > 0) return countRow.cnt;

  const catalogPath = path.join(ROOT_DIR, "data", "processed", "catalog.json");
  if (!fs.existsSync(catalogPath)) {
    return 0;
  }

  const catalog: CatalogMovieSeed[] = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO movies (
      movielens_id, item_idx, title, raw_title, language_code, release_year,
      genres, tmdb_id, imdb_id, ml_rating_count, ml_avg_rating, catalog_origin
    ) VALUES (?, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, 'movielens_1m')
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const m of catalog) {
      insert.run(
        m.movielens_id,
        m.item_idx,
        m.title,
        m.raw_title,
        m.release_year,
        JSON.stringify(m.genres),
        m.tmdb_id,
        m.imdb_id,
        m.ml_rating_count,
        m.ml_avg_rating
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return catalog.length;
}

export function seedMultilingualCatalog(): number {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO movies (
      movielens_id, item_idx, title, raw_title, original_title,
      language_code, is_dubbed, available_dubs, release_year, runtime,
      genres, director, cast_list, mood_tags, story_tags, catalog_origin,
      tmdb_id, overview, poster_url, ml_rating_count, ml_avg_rating, metadata_source, updated_at
    ) VALUES (?, -1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified_multilingual', ?, ?, ?, ?, ?, 'verified_multilingual', datetime('now'))
    ON CONFLICT(movielens_id) DO UPDATE SET
      title = excluded.title,
      raw_title = excluded.raw_title,
      original_title = excluded.original_title,
      language_code = excluded.language_code,
      is_dubbed = excluded.is_dubbed,
      available_dubs = excluded.available_dubs,
      release_year = excluded.release_year,
      runtime = excluded.runtime,
      genres = excluded.genres,
      director = excluded.director,
      cast_list = excluded.cast_list,
      mood_tags = excluded.mood_tags,
      story_tags = excluded.story_tags,
      catalog_origin = 'verified_multilingual',
      tmdb_id = COALESCE(movies.tmdb_id, excluded.tmdb_id),
      overview = COALESCE(movies.overview, excluded.overview),
      poster_url = COALESCE(movies.poster_url, excluded.poster_url),
      ml_rating_count = excluded.ml_rating_count,
      ml_avg_rating = excluded.ml_avg_rating
    WHERE movies.item_idx = -1
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const m of MULTILINGUAL_MOVIES) {
      upsert.run(
        m.movielens_id,
        m.title,
        `${m.title} (${m.release_year})`,
        m.original_title,
        m.language_code,
        m.is_dubbed ? 1 : 0,
        JSON.stringify(m.available_dubs),
        m.release_year,
        m.runtime,
        JSON.stringify(m.genres),
        m.director,
        JSON.stringify(m.cast),
        JSON.stringify(m.mood_tags),
        JSON.stringify(m.story_tags),
        m.tmdb_id,
        m.overview,
        m.poster_url ?? null,
        m.ml_rating_count,
        m.ml_avg_rating
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return MULTILINGUAL_MOVIES.length;
}
