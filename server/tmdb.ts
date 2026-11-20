import {
  PRIORITY_FEMALE_ACTORS,
  PRIORITY_MALE_ACTORS,
} from "./data/multilingualCatalog.ts";
import { getDb } from "./db.ts";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_W500 = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_W1280 = "https://image.tmdb.org/t/p/w1280";

export interface MovieDTO {
  movielens_id: number | null;
  item_idx: number;
  tmdb_id: number | null;
  imdb_id: string | null;
  title: string;
  original_title: string | null;
  language_code: string;
  is_dubbed: boolean;
  available_dubs: string[];
  runtime: number | null;
  cast: string[];
  director: string | null;
  mood_tags: string[];
  story_tags: string[];
  catalog_origin: string;
  release_year: number | null;
  genres: string[];
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  vote_average: number | null;
  vote_count: number | null;
  ml_rating_count: number;
  ml_avg_rating: number;
  metadata_source: string;
}

const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Children's",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Musical",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

export function hasTmdbCredentials(): boolean {
  return Boolean(
    process.env.TMDB_API_KEY?.trim() ||
      process.env.TMDB_READ_ACCESS_TOKEN?.trim()
  );
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  const bearer = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!apiKey && !bearer) return null;

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  if (apiKey && !bearer) {
    url.searchParams.set("api_key", apiKey);
  }
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  try {
    const resp = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

function parseJsonArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  try {
    const parsed = JSON.parse(String(val));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function rowToMovieDTO(row: Record<string, unknown>): MovieDTO {
  return {
    movielens_id: Number(row.movielens_id),
    item_idx: Number(row.item_idx ?? -1),
    tmdb_id: row.tmdb_id ? Number(row.tmdb_id) : null,
    imdb_id: row.imdb_id ? String(row.imdb_id) : null,
    title: String(row.title),
    original_title: row.original_title ? String(row.original_title) : null,
    language_code: String(row.language_code || "en"),
    is_dubbed: Boolean(row.is_dubbed),
    available_dubs: parseJsonArray(row.available_dubs),
    runtime: row.runtime ? Number(row.runtime) : null,
    cast: parseJsonArray(row.cast_list),
    director: row.director ? String(row.director) : null,
    mood_tags: parseJsonArray(row.mood_tags),
    story_tags: parseJsonArray(row.story_tags),
    catalog_origin: String(row.catalog_origin || "movielens_1m"),
    release_year: row.release_year ? Number(row.release_year) : null,
    genres: parseJsonArray(row.genres),
    overview: row.overview ? String(row.overview) : null,
    poster_url: row.poster_url ? String(row.poster_url) : null,
    backdrop_url: row.backdrop_url ? String(row.backdrop_url) : null,
    vote_average:
      row.tmdb_vote_average != null
        ? Number(row.tmdb_vote_average)
        : row.ml_avg_rating
        ? Number((Number(row.ml_avg_rating) * 2).toFixed(1))
        : null,
    vote_count:
      row.tmdb_vote_count != null
        ? Number(row.tmdb_vote_count)
        : Number(row.ml_rating_count || 0),
    ml_rating_count: Number(row.ml_rating_count || 0),
    ml_avg_rating: Number(row.ml_avg_rating || 0),
    metadata_source: String(row.metadata_source || "movielens"),
  };
}

const LANG_NAME_MAP: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
};

const WIKI_USER_AGENT =
  "MarrowMovieRecommender/1.0 (https://localhost; contact@marrow.local)";

function cleanWikimediaUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("http")) return null;
  // Strip Wikimedia tracking query params which are unnecessary and sometimes fail caching
  if (trimmed.includes("wikimedia.org")) {
    return trimmed.split("?")[0];
  }
  return trimmed;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface WikiSearchPage {
  pageid?: number;
  index?: number;
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  original?: { source?: string };
}

async function queryWikipediaSearchWithPoster(
  searchQuery: string,
  year: number | null,
  languageCode: string
): Promise<{ overview: string | null; poster_url: string | null; rateLimited?: boolean }> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=5` +
      `&prop=pageimages|extracts&pilicense=any&piprop=thumbnail|original&pithumbsize=500` +
      `&exintro=1&explaintext=1&exsentences=3&format=json&origin=*`;

    const resp = await fetch(url, {
      headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (resp.status === 429) {
      return { overview: null, poster_url: null, rateLimited: true };
    }
    const text = await resp.text();
    if (!resp.ok || text.startsWith("You are making")) {
      return { overview: null, poster_url: null, rateLimited: true };
    }

    const data = JSON.parse(text) as {
      query?: { pages?: Record<string, WikiSearchPage> };
    };
    const pages = Object.values(data.query?.pages ?? {});
    if (pages.length === 0) {
      return { overview: null, poster_url: null };
    }

    const langName = (LANG_NAME_MAP[languageCode] ?? "").toLowerCase();
    const yearStr = year ? String(year) : "";

    // Rank search hits so we match the film article (preferring exact year/language + poster)
    const scored = pages
      .map((p) => {
        const titleLower = (p.title ?? "").toLowerCase();
        const extLower = (p.extract ?? "").toLowerCase();
        const combined = `${titleLower} ${extLower}`;
        let score = 10 - (p.index ?? 5);
        if (combined.includes("film") || combined.includes("directed by")) score += 8;
        if (yearStr && combined.includes(yearStr)) score += 7;
        if (langName && combined.includes(langName)) score += 5;
        if (combined.includes("soundtrack") || combined.includes("disambiguation")) {
          score -= 12;
        }
        if (p.thumbnail?.source || p.original?.source) score += 6;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);

    const bestWithPoster = scored.find(
      ({ p, score }) => score >= 8 && (p.thumbnail?.source || p.original?.source)
    )?.p;
    const best = bestWithPoster ?? scored[0]?.p;
    if (!best) return { overview: null, poster_url: null };

    const poster = cleanWikimediaUrl(best.thumbnail?.source || best.original?.source);
    const overview = best.extract?.trim() || null;
    return { overview, poster_url: poster };
  } catch {
    return { overview: null, poster_url: null };
  }
}

export async function fetchWikipediaFilmInfo(
  title: string,
  year: number | null,
  languageCode = "en"
): Promise<{ overview: string | null; poster_url: string | null; rateLimited?: boolean }> {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const langName = LANG_NAME_MAP[languageCode];

  // Primary: Wikipedia Search API with pilicense=any (finds KGF, 12 Monkeys, Sapta Saagaradaache Ello, etc.)
  const searchQueries: string[] = [];
  if (year && langName && languageCode !== "en") {
    searchQueries.push(`${cleanTitle} ${year} ${langName} film`);
  }
  if (year) {
    searchQueries.push(`${cleanTitle} ${year} film`);
  } else {
    searchQueries.push(`${cleanTitle} film`);
  }

  for (const q of searchQueries) {
    const res = await queryWikipediaSearchWithPoster(q, year, languageCode);
    if (res.rateLimited) return res;
    if (res.poster_url) return res;
    await sleep(120);
  }

  // Secondary: REST Summary direct slug check if search missed a poster
  const candidates: string[] = [];
  const slugBase = cleanTitle.replace(/\s+/g, "_");
  if (year && langName && languageCode !== "en") {
    candidates.push(`${slugBase}_(${year}_${langName}_film)`);
  }
  if (year) candidates.push(`${slugBase}_(${year}_film)`);
  if (langName && languageCode !== "en") candidates.push(`${slugBase}_(${langName}_film)`);
  candidates.push(`${slugBase}_(film)`, slugBase);

  for (const slug of candidates) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": WIKI_USER_AGENT },
        signal: AbortSignal.timeout(4000),
      });
      if (resp.status === 429) {
        return { overview: null, poster_url: null, rateLimited: true };
      }
      if (!resp.ok) continue;
      const data = (await resp.json()) as {
        type?: string;
        description?: string;
        extract?: string;
        thumbnail?: { source?: string };
        originalimage?: { source?: string };
      };
      if (data.type === "disambiguation") continue;
      const textBlob = `${data.description || ""} ${data.extract || ""}`.toLowerCase();
      const looksLikeFilm =
        textBlob.includes("film") ||
        textBlob.includes("movie") ||
        textBlob.includes("directed by") ||
        textBlob.includes("starring") ||
        textBlob.includes("animated");
      if (!looksLikeFilm && slug === slugBase) continue;

      const poster = cleanWikimediaUrl(data.thumbnail?.source || data.originalimage?.source);
      const overview = data.extract?.trim() || null;
      if (overview || poster) {
        return { overview, poster_url: poster };
      }
    } catch {
      // Try next candidate
    }
  }
  return { overview: null, poster_url: null };
}

export async function enrichMoviesBatch(
  movielensIds: number[],
  concurrency?: number
): Promise<MovieDTO[]> {
  if (movielensIds.length === 0) return [];
  const db = getDb();
  const placeholders = movielensIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM movies WHERE movielens_id IN (${placeholders})`)
    .all(...movielensIds) as Record<string, unknown>[];

  const byId = new Map<number, MovieDTO>();
  for (const r of rows) {
    byId.set(Number(r.movielens_id), rowToMovieDTO(r));
  }

  // Enrich items missing poster_url or overview (unless already checked without TMDB)
  const useTmdb = hasTmdbCredentials();
  const effectiveConcurrency = useTmdb
    ? concurrency ?? 6
    : Math.min(concurrency ?? 2, 2);
  const needsEnrich = movielensIds
    .map((id) => byId.get(id))
    .filter((m): m is MovieDTO => {
      if (!m) return false;
      if (m.poster_url && m.overview) return false;
      if (!useTmdb && m.metadata_source.endsWith("_checked")) return false;
      return true;
    })
    .slice(0, useTmdb ? 24 : 10);

  const updateStmt = db.prepare(
    `UPDATE movies SET
      tmdb_id = COALESCE(?, tmdb_id),
      overview = COALESCE(?, overview),
      poster_url = COALESCE(?, poster_url),
      backdrop_url = COALESCE(?, backdrop_url),
      tmdb_vote_average = COALESCE(?, tmdb_vote_average),
      tmdb_vote_count = COALESCE(?, tmdb_vote_count),
      metadata_source = ?,
      updated_at = datetime('now')
    WHERE movielens_id = ?`
  );

  let stopWikiOnRateLimit = false;

  for (let i = 0; i < needsEnrich.length; i += effectiveConcurrency) {
    if (!useTmdb && stopWikiOnRateLimit) break;
    const chunk = needsEnrich.slice(i, i + effectiveConcurrency);
    const pendingUpdates: Array<{
      movie: MovieDTO;
      updatedTmdbId: number | null;
      updatedOverview: string | null;
      updatedPoster: string | null;
      updatedBackdrop: string | null;
      updatedVoteAvg: number | null;
      updatedVoteCnt: number | null;
      source: string;
    }> = [];

    await Promise.all(
      chunk.map(async (movie) => {
        if (!movie.movielens_id) return;
        let updatedOverview = movie.overview;
        let updatedPoster = movie.poster_url;
        let updatedBackdrop = movie.backdrop_url;
        let updatedTmdbId = movie.tmdb_id;
        let updatedVoteAvg: number | null = null;
        let updatedVoteCnt: number | null = null;
        let source = movie.metadata_source;

        if (useTmdb) {
          interface TmdbMovieDetail {
            id?: number;
            overview?: string;
            poster_path?: string | null;
            backdrop_path?: string | null;
            vote_average?: number;
            vote_count?: number;
          }
          let tmdbData: TmdbMovieDetail | null = null;

          if (updatedTmdbId) {
            tmdbData = await tmdbFetch<TmdbMovieDetail>(`/movie/${updatedTmdbId}`);
          } else {
            const searchRes = await tmdbFetch<{
              results?: TmdbMovieDetail[];
            }>("/search/movie", {
              query: movie.title,
              ...(movie.release_year
                ? { primary_release_year: String(movie.release_year) }
                : {}),
            });
            if (searchRes?.results?.[0]) {
              tmdbData = searchRes.results[0];
              updatedTmdbId = tmdbData.id ?? null;
            }
          }

          if (tmdbData) {
            updatedOverview = tmdbData.overview || updatedOverview;
            updatedPoster = tmdbData.poster_path
              ? `${TMDB_IMG_W500}${tmdbData.poster_path}`
              : updatedPoster;
            updatedBackdrop = tmdbData.backdrop_path
              ? `${TMDB_IMG_W1280}${tmdbData.backdrop_path}`
              : updatedBackdrop;
            updatedVoteAvg = tmdbData.vote_average ?? null;
            updatedVoteCnt = tmdbData.vote_count ?? null;
            source = "tmdb";
          }
        }

        if ((!updatedPoster || !updatedOverview) && !useTmdb && !stopWikiOnRateLimit) {
          const wiki = await fetchWikipediaFilmInfo(
            movie.title,
            movie.release_year,
            movie.language_code
          );
          if (wiki.rateLimited) {
            stopWikiOnRateLimit = true;
            return;
          }
          if (wiki.overview && !updatedOverview) updatedOverview = wiki.overview;
          if (wiki.poster_url && !updatedPoster) updatedPoster = wiki.poster_url;
          if (wiki.poster_url) {
            source =
              movie.language_code !== "en"
                ? "wikipedia+verified_multilingual"
                : "wikipedia+movielens";
          } else {
            source =
              movie.language_code !== "en"
                ? "verified_multilingual_checked"
                : "movielens_checked";
          }
        }

        if (
          updatedOverview !== movie.overview ||
          updatedPoster !== movie.poster_url ||
          updatedBackdrop !== movie.backdrop_url ||
          source !== movie.metadata_source
        ) {
          pendingUpdates.push({
            movie,
            updatedTmdbId,
            updatedOverview,
            updatedPoster,
            updatedBackdrop,
            updatedVoteAvg,
            updatedVoteCnt,
            source,
          });
        }
      })
    );

    if (pendingUpdates.length > 0) {
      db.exec("BEGIN TRANSACTION;");
      try {
        for (const item of pendingUpdates) {
          updateStmt.run(
            item.updatedTmdbId,
            item.updatedOverview,
            item.updatedPoster,
            item.updatedBackdrop,
            item.updatedVoteAvg,
            item.updatedVoteCnt,
            item.source,
            item.movie.movielens_id!
          );

          item.movie.tmdb_id = item.updatedTmdbId;
          item.movie.overview = item.updatedOverview;
          item.movie.poster_url = item.updatedPoster;
          item.movie.backdrop_url = item.updatedBackdrop;
          if (item.updatedVoteAvg != null) item.movie.vote_average = item.updatedVoteAvg;
          if (item.updatedVoteCnt != null) item.movie.vote_count = item.updatedVoteCnt;
          item.movie.metadata_source = item.source;
        }
        db.exec("COMMIT;");
      } catch (err) {
        db.exec("ROLLBACK;");
        throw err;
      }
    }
  }

  return movielensIds
    .map((id) => byId.get(id))
    .filter((m): m is MovieDTO => Boolean(m));
}

interface TmdbListItem {
  id: number;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
}

export async function getDiscoverCategory(
  category: "trending" | "popular" | "top_rated" | "upcoming"
): Promise<{ movies: MovieDTO[]; source: string }> {
  const db = getDb();

  if (hasTmdbCredentials()) {
    const cacheKey = `tmdb_${category}`;
    const cached = db
      .prepare(
        "SELECT payload, fetched_at FROM tmdb_discover_cache WHERE cache_key = ? AND datetime(fetched_at) > datetime('now', '-6 hours')"
      )
      .get(cacheKey) as { payload: string } | undefined;

    if (cached) {
      return { movies: JSON.parse(cached.payload), source: "tmdb" };
    }

    const endpointMap: Record<string, string> = {
      trending: "/trending/movie/week",
      popular: "/movie/popular",
      top_rated: "/movie/top_rated",
      upcoming: "/movie/upcoming",
    };

    const res = await tmdbFetch<{ results?: TmdbListItem[] }>(
      endpointMap[category]
    );
    if (res?.results && res.results.length > 0) {
      const mapped: MovieDTO[] = res.results.slice(0, 18).map((item) => {
        const year = item.release_date
          ? parseInt(item.release_date.slice(0, 4), 10) || null
          : null;
        const mlMatch = db
          .prepare("SELECT movielens_id, item_idx, ml_rating_count, ml_avg_rating FROM movies WHERE tmdb_id = ? LIMIT 1")
          .get(item.id) as
          | {
              movielens_id: number;
              item_idx: number;
              ml_rating_count: number;
              ml_avg_rating: number;
            }
          | undefined;

        return {
          movielens_id: mlMatch?.movielens_id ?? null,
          item_idx: mlMatch?.item_idx ?? -1,
          tmdb_id: item.id,
          imdb_id: null,
          title: item.title || "Untitled",
          original_title: null,
          language_code: "en",
          is_dubbed: false,
          available_dubs: [],
          runtime: null,
          cast: [],
          director: null,
          mood_tags: [],
          story_tags: [],
          catalog_origin: "tmdb",
          release_year: year,
          genres: (item.genre_ids || [])
            .map((gid) => TMDB_GENRE_MAP[gid])
            .filter(Boolean),
          overview: item.overview || null,
          poster_url: item.poster_path
            ? `${TMDB_IMG_W500}${item.poster_path}`
            : null,
          backdrop_url: item.backdrop_path
            ? `${TMDB_IMG_W1280}${item.backdrop_path}`
            : null,
          vote_average: item.vote_average ?? null,
          vote_count: item.vote_count ?? null,
          ml_rating_count: mlMatch?.ml_rating_count ?? 0,
          ml_avg_rating: mlMatch?.ml_avg_rating ?? 0,
          metadata_source: "tmdb",
        };
      });

      db.prepare(
        "INSERT OR REPLACE INTO tmdb_discover_cache (cache_key, payload, fetched_at) VALUES (?, ?, datetime('now'))"
      ).run(cacheKey, JSON.stringify(mapped));

      return { movies: mapped, source: "tmdb" };
    }
  }

  // Fallback to real MovieLens 1M catalog slices sorted authentically by popularity / quality / recency
  let orderClause = "ml_rating_count DESC";
  let whereClause = "language_code = 'en' AND ml_rating_count >= 50";
  if (category === "trending") {
    orderClause = "(ml_rating_count * ml_avg_rating) DESC";
    whereClause = "language_code = 'en' AND ml_rating_count >= 250 AND release_year >= 1995";
  } else if (category === "popular") {
    orderClause = "ml_rating_count DESC";
    whereClause = "language_code = 'en' AND ml_rating_count >= 200";
  } else if (category === "top_rated") {
    orderClause = "ml_avg_rating DESC, ml_rating_count DESC";
    whereClause = "language_code = 'en' AND ml_rating_count >= 300";
  } else if (category === "upcoming") {
    orderClause = "ml_avg_rating DESC, ml_rating_count DESC";
    whereClause = "language_code = 'en' AND release_year >= 1998 AND ml_rating_count >= 30";
  }

  const rows = db
    .prepare(
      `SELECT movielens_id FROM movies WHERE ${whereClause} ORDER BY ${orderClause} LIMIT 12`
    )
    .all() as Array<{ movielens_id: number }>;

  const movies = await enrichMoviesBatch(rows.map((r) => r.movielens_id));
  return { movies, source: "movielens+wikipedia" };
}

export async function getMoviesByLanguage(
  languageCode: string,
  limit = 14
): Promise<MovieDTO[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT movielens_id FROM movies
       WHERE language_code = ?
       ORDER BY (ml_rating_count * ml_avg_rating) DESC, release_year DESC
       LIMIT ?`
    )
    .all(languageCode, limit) as Array<{ movielens_id: number }>;
  return enrichMoviesBatch(rows.map((r) => r.movielens_id), 6);
}

function expandGenreAliases(genre: string): string[] {
  const g = genre.trim();
  const out = new Set<string>([g]);
  if (g === "Science Fiction") out.add("Sci-Fi");
  if (g === "Sci-Fi") out.add("Science Fiction");
  if (g === "Family") out.add("Children's");
  if (g === "Children's") out.add("Family");
  if (g === "Historical") out.add("History");
  if (g === "History") out.add("Historical");
  return Array.from(out);
}

export async function searchCatalogAndTmdb(
  query: string,
  genre?: string,
  limit = 24,
  offset = 0,
  language = "all",
  audioMode = "all"
): Promise<{ movies: MovieDTO[]; total: number }> {
  const db = getDb();
  const q = query.trim();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    conditions.push(
      "(title LIKE ? OR raw_title LIKE ? OR COALESCE(original_title, '') LIKE ? OR cast_list LIKE ? OR COALESCE(director, '') LIKE ?)"
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (genre && genre !== "All") {
    const aliases = expandGenreAliases(genre);
    if (aliases.length === 1) {
      conditions.push("genres LIKE ?");
      params.push(`%"${aliases[0]}"%`);
    } else {
      conditions.push(`(${aliases.map(() => "genres LIKE ?").join(" OR ")})`);
      for (const a of aliases) params.push(`%"${a}"%`);
    }
  }

  const lang = language.trim().toLowerCase();
  const audio = audioMode.trim().toLowerCase();

  if (lang && lang !== "all") {
    if (audio === "original") {
      conditions.push("language_code = ? AND is_dubbed = 0");
      params.push(lang);
    } else if (audio === "dubbed") {
      conditions.push("(available_dubs LIKE ? OR (language_code = ? AND is_dubbed = 1))");
      params.push(`%"${lang}"%`, lang);
    } else {
      conditions.push("(language_code = ? OR available_dubs LIKE ?)");
      params.push(lang, `%"${lang}"%`);
    }
  } else if (audio === "original") {
    conditions.push("is_dubbed = 0");
  } else if (audio === "dubbed") {
    conditions.push("(is_dubbed = 1 OR available_dubs != '[]')");
  }

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "1 = 1";
  const totalRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM movies WHERE ${whereSql}`)
    .get(...params) as { cnt: number };

  let rows: Array<{ movielens_id: number }> = [];
  if (!q && (!lang || lang === "all")) {
    const needPerBucket = Math.ceil((offset + limit) / 2) + 6;
    const regionalWhere =
      conditions.length > 0 ? `${whereSql} AND language_code != 'en'` : "language_code != 'en'";
    const englishWhere =
      conditions.length > 0 ? `${whereSql} AND language_code = 'en'` : "language_code = 'en'";

    const regionalRows = db
      .prepare(
        `SELECT movielens_id, language_code FROM movies WHERE ${regionalWhere} ORDER BY CASE WHEN release_year >= 2015 THEN 1 ELSE 0 END DESC, (ml_rating_count * ml_avg_rating) DESC LIMIT ?`
      )
      .all(...params, needPerBucket * 6) as Array<{
      movielens_id: number;
      language_code: string;
    }>;

    // Diversify regional picks across Kannada, Hindi, Telugu, Tamil & Malayalam
    const regionalByLang = new Map<string, Array<{ movielens_id: number }>>();
    for (const r of regionalRows) {
      const bucket = regionalByLang.get(r.language_code) ?? [];
      bucket.push({ movielens_id: r.movielens_id });
      regionalByLang.set(r.language_code, bucket);
    }
    const regionalOrdered: Array<{ movielens_id: number }> = [];
    const regionalLangOrder = ["kn", "hi", "te", "ta", "ml"];
    let added = true;
    while (added && regionalOrdered.length < needPerBucket) {
      added = false;
      for (const code of regionalLangOrder) {
        const list = regionalByLang.get(code);
        if (list && list.length > 0) {
          regionalOrdered.push(list.shift()!);
          added = true;
          if (regionalOrdered.length >= needPerBucket) break;
        }
      }
      for (const [code, list] of regionalByLang.entries()) {
        if (regionalLangOrder.includes(code) || list.length === 0) continue;
        regionalOrdered.push(list.shift()!);
        added = true;
        if (regionalOrdered.length >= needPerBucket) break;
      }
    }

    const englishRows = db
      .prepare(
        `SELECT movielens_id FROM movies WHERE ${englishWhere} ORDER BY ml_rating_count DESC, ml_avg_rating DESC LIMIT ?`
      )
      .all(...params, needPerBucket) as Array<{ movielens_id: number }>;

    const interleaved: Array<{ movielens_id: number }> = [];
    const maxLen = Math.max(regionalOrdered.length, englishRows.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < regionalOrdered.length) interleaved.push(regionalOrdered[i]);
      if (i < englishRows.length) interleaved.push(englishRows[i]);
    }
    rows = interleaved.slice(offset, offset + limit);
  } else {
    rows = db
      .prepare(
        `SELECT movielens_id FROM movies WHERE ${whereSql} ORDER BY CASE WHEN language_code != 'en' AND release_year >= 2010 THEN 1 ELSE 0 END DESC, ml_rating_count DESC, ml_avg_rating DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<{ movielens_id: number }>;
  }

  const movies = await enrichMoviesBatch(rows.map((r) => r.movielens_id));
  return { movies, total: totalRow.cnt };
}

export function getFeaturedActorDirectory(query = ""): {
  maleActors: string[];
  femaleActors: string[];
} {
  const db = getDb();
  const rows = db
    .prepare("SELECT cast_list FROM movies WHERE cast_list != '[]'")
    .all() as Array<{ cast_list: string }>;

  const allCastSet = new Set<string>();
  for (const r of rows) {
    for (const actor of parseJsonArray(r.cast_list)) {
      allCastSet.add(actor);
    }
  }

  const femaleSet = new Set(PRIORITY_FEMALE_ACTORS);
  const maleSet = new Set(PRIORITY_MALE_ACTORS);

  // Merge any extra cast from regional DB films not already classified
  const extraActors = Array.from(allCastSet).filter(
    (name) => !maleSet.has(name) && !femaleSet.has(name)
  );

  const q = query.trim().toLowerCase();
  const filterFn = (list: string[]) =>
    q ? list.filter((a) => a.toLowerCase().includes(q)) : list;

  return {
    maleActors: filterFn([...PRIORITY_MALE_ACTORS, ...extraActors]),
    femaleActors: filterFn([...PRIORITY_FEMALE_ACTORS, ...extraActors]),
  };
}

