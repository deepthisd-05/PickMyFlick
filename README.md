# 🎬 PickMyFlick — VAE-Based Personalized Movie Recommendation System

An end-to-end machine learning web application for personalized movie recommendations, implementing **Multinomial Variational Autoencoders (Mult-VAE)** for collaborative filtering on **MovieLens 1M**, benchmarked against **Matrix Factorization** and a **Popularity Baseline**.

---

## 🧠 Architecture & Algorithms

### 1. Multinomial Variational Autoencoder (`Mult-VAE`)
* **Input:** $L_2$-normalized implicit positive preference vector ($\text{rating} \ge 4.0$) with stochastic input dropout ($p = 0.5$) during training.
* **Encoder:** $\tanh(\mathbf{W}_1 \tilde{\mathbf{x}}_u + \mathbf{b}_1) \rightarrow \boldsymbol{\mu}_u, \log\boldsymbol{\sigma}_u^2$.
* **Reparameterization:** $\mathbf{z}_u = \boldsymbol{\mu}_u + \boldsymbol{\epsilon} \odot \exp(0.5 \log\boldsymbol{\sigma}_u^2)$ during training; deterministic $\mathbf{z}_u = \boldsymbol{\mu}_u$ at inference.
* **Decoder & Objective:** $\log\pi_u = \log\text{softmax}(\mathbf{W}_3 \tanh(\mathbf{W}_2 \mathbf{z}_u + \mathbf{b}_2) + \mathbf{b}_3)$, trained with Multinomial ELBO and linear KL annealing ($\beta \in [0, \beta_{\max}]$).
* **Cold-Start / Live Inference:** New user rating vectors pass directly through the trained encoder-decoder without retraining the full model.

### 2. Matrix Factorization (`R ≈ μ + b_u + b_i + P·Qᵀ`)
* Regularized Stochastic Gradient Descent (SGD) trained over `800,309` training interactions.
* New-user inference via closed-form ridge regression fold-in on trained item latent factors $\mathbf{Q}$.

### 3. Popularity Baseline
* Non-personalized ranking using training positive-interaction counts and Bayesian rating damping ($m = 25$, minimum threshold $20$).

---

## 📊 Dataset & Evaluation Protocol

* **Dataset:** MovieLens 1M (`6,040` users, `3,883` movies, `3,706` rated items, `1,000,209` ratings) linked to TMDB/IMDb IDs.
* **Temporal Split:** Deterministic per-user temporal split (`80%` earliest train / `10%` validation / `10%` latest held-out test) to prevent temporal leakage.
* **Evaluation Metrics:** `Recall@20`, `NDCG@100`, and `Catalog Coverage (%)` evaluated across identical held-out users with seen items masked.

---

## 🛠️ Tech Stack

* **Machine Learning:** Python, NumPy / PyTorch (Mult-VAE & Matrix Factorization)
* **Backend & Database:** Node.js, Express, SQLite
* **Frontend:** React / TypeScript, Vite

---

## 🚀 Setup & Execution

### 1. Prepare the MovieLens 1M Dataset
```bash
python3 scripts/prepare_movielens.py
