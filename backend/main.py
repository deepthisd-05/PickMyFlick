import os
import uuid
import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.database import get_connection
from backend.models.matrix_factorization import MatrixFactorization
from backend.models.multvae import MultVAE
from backend.models.popularity import PopularityBaseline
from backend.training.evaluate import evaluate_all_pytorch
from backend.training.train_mf import train_mf_pytorch
from backend.training.train_vae import train_multvae_pytorch

app = FastAPI(title="CineVAE Recommender API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVED_DIR = os.path.join(ROOT_DIR, "backend", "saved_models")


class RatingPayload(BaseModel):
    user_id: int
    movielens_id: int
    rating: float = Field(..., ge=1.0, le=5.0)


class RecommendPayload(BaseModel):
    user_id: int
    algorithm: str = "multvae"
    top_k: int = 20


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "fastapi+pytorch"}


@app.get("/api/movies/search")
def search_movies(q: str = "", genre: str = "All", limit: int = 24):
    conn = get_connection()
    sql = "SELECT * FROM movies WHERE item_idx >= 0"
    params = []
    if q.strip():
        sql += " AND title LIKE ?"
        params.append(f"%{q.strip()}%")
    if genre != "All":
        sql += " AND genres LIKE ?"
        params.append(f'%"{genre}"%')
    sql += " ORDER BY ml_rating_count DESC LIMIT ?"
    params.append(limit)
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"movies": rows}


@app.post("/api/ratings")
def save_rating(payload: RatingPayload):
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO ratings (user_id, movielens_id, rating)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, movielens_id) DO UPDATE SET
          rating = excluded.rating,
          updated_at = datetime('now')
        """,
        (payload.user_id, payload.movielens_id, payload.rating),
    )
    conn.commit()
    return {"status": "saved"}


@app.post("/api/recommendations/generate")
def generate_recommendations(payload: RecommendPayload):
    conn = get_connection()
    user_ratings = conn.execute(
        """
        SELECT r.movielens_id, r.rating, m.item_idx
        FROM ratings r JOIN movies m ON r.movielens_id = m.movielens_id
        WHERE r.user_id = ?
        """,
        (payload.user_id,),
    ).fetchall()

    rated_idx = {int(r["item_idx"]) for r in user_ratings if int(r["item_idx"]) >= 0}
    algo = payload.algorithm.lower()

    if algo == "multvae":
        ckpt_path = os.path.join(SAVED_DIR, "multvae_pytorch.pt")
        if not os.path.exists(ckpt_path):
            raise HTTPException(status_code=400, detail="Train Mult-VAE first.")
        ckpt = torch.load(ckpt_path, map_location="cpu")
        model = MultVAE(ckpt["num_items"], ckpt["hidden_dim"], ckpt["latent_dim"])
        model.load_state_dict(ckpt["state_dict"])
        model.eval()
        x = torch.zeros((1, ckpt["num_items"]), dtype=torch.float32)
        for r in user_ratings:
            if int(r["item_idx"]) >= 0 and float(r["rating"]) >= 3.5:
                x[0, int(r["item_idx"])] = 1.0 if float(r["rating"]) >= 4.5 else 0.8
        with torch.no_grad():
            logits, _, _ = model(x)
            scores = torch.softmax(logits[0], dim=0).numpy()
    elif algo == "mf":
        ckpt_path = os.path.join(SAVED_DIR, "mf_pytorch.pt")
        if not os.path.exists(ckpt_path):
            raise HTTPException(status_code=400, detail="Train Matrix Factorization first.")
        ckpt = torch.load(ckpt_path, map_location="cpu")
        model = MatrixFactorization(ckpt["num_users"], ckpt["num_items"], ckpt["latent_dim"], ckpt["global_mean"])
        model.load_state_dict(ckpt["state_dict"])
        scores = model.fold_in_predict(
            [int(r["item_idx"]) for r in user_ratings if int(r["item_idx"]) >= 0],
            [float(r["rating"]) for r in user_ratings if int(r["item_idx"]) >= 0],
        )
    else:
        pop_path = os.path.join(SAVED_DIR, "popularity_pytorch.json")
        if not os.path.exists(pop_path):
            raise HTTPException(status_code=400, detail="Build Popularity baseline first.")
        scores = PopularityBaseline.load(pop_path).predict()

    for idx in rated_idx:
        scores[idx] = -1e9
    top_indices = np.argsort(-scores)[: payload.top_k]

    placeholders = ",".join("?" for _ in top_indices)
    rows = conn.execute(
        f"SELECT * FROM movies WHERE item_idx IN ({placeholders})", [int(i) for i in top_indices]
    ).fetchall()
    by_idx = {int(r["item_idx"]): dict(r) for r in rows}

    recs = []
    batch_id = str(uuid.uuid4())
    for rank, idx in enumerate(top_indices, start=1):
        m = by_idx.get(int(idx))
        if m:
            recs.append({**m, "rank": rank, "score": float(scores[idx])})
    return {"batch_id": batch_id, "algorithm": algo, "recommendations": recs}


@app.post("/api/ml/train/vae")
def api_train_vae(epochs: int = Query(15, ge=1, le=50)):
    ckpt = train_multvae_pytorch(epochs=epochs)
    return {"status": "completed", "checkpoint": ckpt}


@app.post("/api/ml/train/mf")
def api_train_mf(epochs: int = Query(12, ge=1, le=50)):
    ckpt = train_mf_pytorch(epochs=epochs)
    return {"status": "completed", "checkpoint": ckpt}


@app.post("/api/ml/evaluate")
def api_evaluate():
    return {"metrics": evaluate_all_pytorch()}
