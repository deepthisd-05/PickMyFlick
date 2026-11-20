#!/usr/bin/env python3
"""
Download, validate, and preprocess MovieLens 1M + TMDB/IMDb link mappings.
Produces deterministic temporal train / validation / test splits with zero data leakage.
"""

import csv
import json
import os
import re
import urllib.request
import zipfile
from collections import defaultdict

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT_DIR, "data", "raw")
PROC_DIR = os.path.join(ROOT_DIR, "data", "processed")

ML1M_URL = "https://files.grouplens.org/datasets/movielens/ml-1m.zip"
ML_SMALL_URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"


def ensure_dirs():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(PROC_DIR, exist_ok=True)


def download_if_missing(url: str, dest_path: str):
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000:
        print(f"Found existing archive: {dest_path}")
        return
    print(f"Downloading {url} -> {dest_path} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "CineVAE-ML-Setup/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest_path, "wb") as f:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            f.write(chunk)
    print(f"Downloaded {os.path.getsize(dest_path):,} bytes")


def extract_zip(zip_path: str, extract_to: str, marker_file: str):
    if os.path.exists(os.path.join(extract_to, marker_file)):
        print(f"Already extracted: {os.path.join(extract_to, marker_file)}")
        return
    print(f"Extracting {zip_path} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_to)


def normalize_title(raw_title: str):
    m = re.match(r"^(.*)\((\d{4})\)\s*$", raw_title.strip())
    if m:
        title_part = m.group(1).strip()
        year = int(m.group(2))
    else:
        title_part = raw_title.strip()
        year = None

    # Handle ", The", ", A", ", An" suffix from MovieLens formatting
    clean = title_part
    for article in (", The", ", A", ", An"):
        if clean.endswith(article):
            art = article[2:]
            clean = f"{art} {clean[:-len(article)]}".strip()
            break

    # Remove parenthetical alternate titles for matching
    match_key = re.sub(r"\([^)]*\)", "", clean)
    match_key = re.sub(r"[^a-z0-9]+", " ", match_key.lower()).strip()
    return clean, year, match_key


def main():
    ensure_dirs()
    ml1m_zip = os.path.join(RAW_DIR, "ml-1m.zip")
    ml_small_zip = os.path.join(RAW_DIR, "ml-latest-small.zip")

    download_if_missing(ML1M_URL, ml1m_zip)
    download_if_missing(ML_SMALL_URL, ml_small_zip)

    extract_zip(ml1m_zip, RAW_DIR, os.path.join("ml-1m", "ratings.dat"))
    extract_zip(ml_small_zip, RAW_DIR, os.path.join("ml-latest-small", "links.csv"))

    # Load links from ml-latest-small to map (normalized title, year) -> (imdbId, tmdbId)
    small_movies_path = os.path.join(RAW_DIR, "ml-latest-small", "movies.csv")
    small_links_path = os.path.join(RAW_DIR, "ml-latest-small", "links.csv")

    small_id_to_links = {}
    with open(small_links_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mid = int(row["movieId"])
            imdb_id = row["imdbId"].strip() or None
            tmdb_id = int(row["tmdbId"]) if row["tmdbId"].strip() else None
            small_id_to_links[mid] = (imdb_id, tmdb_id)

    title_year_to_links = {}
    title_only_to_links = {}
    with open(small_movies_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mid = int(row["movieId"])
            _, year, key = normalize_title(row["title"])
            links = small_id_to_links.get(mid)
            if links and links[1]:
                if year:
                    title_year_to_links[(key, year)] = links
                if key not in title_only_to_links:
                    title_only_to_links[key] = links

    # Parse ml-1m/movies.dat
    ml1m_movies_path = os.path.join(RAW_DIR, "ml-1m", "movies.dat")
    ml1m_links_out = os.path.join(RAW_DIR, "ml-1m", "links.dat")
    movies_by_ml_id = {}
    matched_tmdb = 0

    with open(ml1m_movies_path, "r", encoding="latin-1") as f, open(
        ml1m_links_out, "w", encoding="utf-8"
    ) as lf:
        for line in f:
            parts = line.rstrip("\n").split("::")
            if len(parts) < 3:
                continue
            ml_id = int(parts[0])
            raw_title = parts[1].strip()
            genres = [g for g in parts[2].strip().split("|") if g]
            clean_title, year, match_key = normalize_title(raw_title)

            links = None
            if year and (match_key, year) in title_year_to_links:
                links = title_year_to_links[(match_key, year)]
            elif match_key in title_only_to_links:
                links = title_only_to_links[match_key]

            imdb_id = links[0] if links else None
            tmdb_id = links[1] if links else None
            if tmdb_id:
                matched_tmdb += 1
            lf.write(f"{ml_id}::{imdb_id or ''}::{tmdb_id or ''}\n")

            movies_by_ml_id[ml_id] = {
                "movielens_id": ml_id,
                "raw_title": raw_title,
                "title": clean_title,
                "release_year": year,
                "genres": genres,
                "imdb_id": imdb_id,
                "tmdb_id": tmdb_id,
            }

    # Parse ml-1m/ratings.dat with duplicate & missing value checks
    ml1m_ratings_path = os.path.join(RAW_DIR, "ml-1m", "ratings.dat")
    user_ratings_map = defaultdict(dict)
    duplicate_count = 0
    invalid_count = 0
    raw_rating_count = 0

    with open(ml1m_ratings_path, "r", encoding="latin-1") as f:
        for line in f:
            parts = line.rstrip("\n").split("::")
            if len(parts) < 4:
                invalid_count += 1
                continue
            try:
                uid = int(parts[0])
                mid = int(parts[1])
                rating = float(parts[2])
                ts = int(parts[3])
            except ValueError:
                invalid_count += 1
                continue
            if mid not in movies_by_ml_id or rating < 1.0 or rating > 5.0:
                invalid_count += 1
                continue
            raw_rating_count += 1
            if mid in user_ratings_map[uid]:
                duplicate_count += 1
                if ts > user_ratings_map[uid][mid][1]:
                    user_ratings_map[uid][mid] = (rating, ts)
            else:
                user_ratings_map[uid][mid] = (rating, ts)

    # Filter to rated items & build dense contiguous item indices (0 .. num_items - 1)
    item_rating_counts = defaultdict(int)
    item_rating_sums = defaultdict(float)
    for uid, m_dict in user_ratings_map.items():
        for mid, (r, _) in m_dict.items():
            item_rating_counts[mid] += 1
            item_rating_sums[mid] += r

    rated_ml_ids = sorted(item_rating_counts.keys())
    ml_id_to_idx = {mid: idx for idx, mid in enumerate(rated_ml_ids)}

    catalog = []
    for ml_id in sorted(movies_by_ml_id.keys()):
        m = movies_by_ml_id[ml_id]
        cnt = item_rating_counts.get(ml_id, 0)
        avg = round(item_rating_sums[ml_id] / cnt, 4) if cnt > 0 else 0.0
        catalog.append(
            {
                **m,
                "item_idx": ml_id_to_idx.get(ml_id, -1),
                "ml_rating_count": cnt,
                "ml_avg_rating": avg,
            }
        )

    # Temporal per-user split: 80% train, 10% validation, 10% test (ordered by timestamp)
    # Prevents data leakage: future ratings are strictly held out from training.
    sorted_uids = sorted(user_ratings_map.keys())
    train_users = []
    val_users = []
    test_users = []

    total_train = 0
    total_val = 0
    total_test = 0
    total_pos_train = 0
    total_pos_val = 0
    total_pos_test = 0

    for u_idx, uid in enumerate(sorted_uids):
        items = [
            (ml_id_to_idx[mid], r, ts)
            for mid, (r, ts) in user_ratings_map[uid].items()
        ]
        items.sort(key=lambda x: (x[2], x[0]))
        n = len(items)
        n_test = max(1, int(round(n * 0.10)))
        n_val = max(1, int(round(n * 0.10)))
        n_train = max(1, n - n_test - n_val)

        tr = items[:n_train]
        va = items[n_train : n_train + n_val]
        te = items[n_train + n_val :]

        train_pairs = [[idx, r] for idx, r, _ in tr]
        val_pairs = [[idx, r] for idx, r, _ in va]
        test_pairs = [[idx, r] for idx, r, _ in te]

        train_users.append(train_pairs)
        val_users.append(val_pairs)
        test_users.append(test_pairs)

        total_train += len(tr)
        total_val += len(va)
        total_test += len(te)
        total_pos_train += sum(1 for _, r, _ in tr if r >= 4.0)
        total_pos_val += sum(1 for _, r, _ in va if r >= 4.0)
        total_pos_test += sum(1 for _, r, _ in te if r >= 4.0)

    stats = {
        "dataset_name": "MovieLens 1M",
        "num_total_movies": len(catalog),
        "num_rated_items": len(rated_ml_ids),
        "num_users": len(sorted_uids),
        "total_ratings": raw_rating_count,
        "duplicates_removed": duplicate_count,
        "invalid_rows_skipped": invalid_count,
        "matched_tmdb_ids": matched_tmdb,
        "split_protocol": "User-level temporal split (80% earliest train / 10% validation / 10% latest held-out test)",
        "relevance_threshold": 4.0,
        "train_interactions": total_train,
        "val_interactions": total_val,
        "test_interactions": total_test,
        "positive_train": total_pos_train,
        "positive_val": total_pos_val,
        "positive_test": total_pos_test,
    }

    with open(os.path.join(PROC_DIR, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f)

    with open(os.path.join(PROC_DIR, "splits.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "num_users": len(sorted_uids),
                "num_items": len(rated_ml_ids),
                "rated_ml_ids": rated_ml_ids,
                "train": train_users,
                "val": val_users,
                "test": test_users,
            },
            f,
        )

    with open(os.path.join(PROC_DIR, "dataset_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    print("Preprocessing complete:")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
