# B8 — VAE-Based Personalized Movie Recommendation System (CineVAE)

End-to-end academic machine learning web application implementing **Multinomial Variational Autoencoder (Mult-VAE)** collaborative filtering on **MovieLens 1M**, benchmarked against **Matrix Factorization** and a **Popularity Baseline**.

## Architecture & Algorithms

1. **Multinomial Variational Autoencoder (`Mult-VAE`)**
   - **Input**: L2-normalized implicit positive preference vector ($\text{rating} \ge 4.0$) with stochastic input dropout ($p = 0.5$) during training.
   - **Encoder**: $\tanh(\mathbf{W}_1 \tilde{\mathbf{x}}_u + \mathbf{b}_1) \rightarrow \boldsymbol{\mu}_u, \log\boldsymbol{\sigma}_u^2$.
   - **Reparameterization**: $\mathbf{z}_u = \boldsymbol{\mu}_u + \boldsymbol{\epsilon} \odot \exp(0.5 \log\boldsymbol{\sigma}_u^2)$ during training; deterministic $\mathbf{z}_u = \boldsymbol{\mu}_u$ at inference.
   - **Decoder & Objective**: $\log\pi_u = \log\text{softmax}(\mathbf{W}_3 \tanh(\mathbf{W}_2 \mathbf{z}_u + \mathbf{b}_2) + \mathbf{b}_3)$, trained with Multinomial ELBO and linear KL annealing ($\beta \in [0, \beta_{\max}]$).
   - **Cold-start / Live Inference**: New user rating vectors pass directly through the trained encoder-decoder without retraining the full model.

2. **Matrix Factorization (`R ≈ μ + b_u + b_i + P·Qᵀ`)**
   - Regularized SGD over 800,309 training interactions.
   - New-user inference via closed-form ridge regression fold-in on trained item latent factors $\mathbf{Q}$.

3. **Popularity Baseline**
   - Non-personalized ranking using training positive-interaction counts and Bayesian rating damping ($m = 25$, minimum threshold $20$).

## Dataset & Evaluation Protocol

- **Dataset**: MovieLens 1M (`6,040` users, `3,883` movies, `3,706` rated items, `1,000,209` ratings) linked to TMDB/IMDb IDs.
- **Split**: Deterministic per-user temporal split (`80%` earliest train / `10%` validation / `10%` latest held-out test) to prevent temporal leakage.
- **Metrics**: `Recall@20`, `NDCG@100`, and `Catalog Coverage (%)` evaluated across identical held-out users and masked seen items.

## Setup & Execution

### 1. Prepare MovieLens 1M Dataset
```bash
python3 scripts/prepare_movielens.py
```

### 2. Run Integrated Full-Stack Server (Node.js + Express + SQLite + Vite)
```bash
npm install
npx tsx scripts/run_initial_training.ts
npm run dev
```
Open `http://localhost:3000`.

### 3. Optional Standalone Python FastAPI + PyTorch Backend
In environments with PyTorch and FastAPI installed:
```bash
pip install -r requirements.txt
python3 -m backend.training.train_vae
python3 -m backend.training.train_mf
python3 -m backend.training.evaluate
uvicorn backend.main:app --reload --port 8000
```

### 4. Environment Variables (`.env`)
- `TMDB_API_KEY` (optional): Enables live TMDB trending/popular/top-rated/upcoming feeds and w500/w1280 posters & backdrops. When omitted, the server enriches MovieLens 1M records via Wikipedia film metadata with local fallback artwork.
- `GEMINI_API_KEY` (optional): Enables grounded natural-language explanations on recommended movies.
- `SESSION_SECRET`: Cookie signing key.

## Attribution
This product uses the TMDB API but is not endorsed or certified by TMDB. Dataset provided by GroupLens Research (MovieLens 1M).
