# 🎬 PickMyFlick – VAE-Based Personalized Movie Recommendation System

PickMyFlick is an end-to-end machine learning web application that provides personalized movie recommendations using **Multinomial Variational Autoencoders (Mult-VAE)**. It uses collaborative filtering on the **MovieLens 1M dataset** and compares its performance against Matrix Factorization and a Popularity-Based Recommendation model.

The project combines deep learning, recommendation algorithms, backend development, and an interactive web interface to deliver personalized movie discovery.

## 🚀 Key Features

- **Personalized Recommendations:** Recommends movies based on users' historical preferences.
- **Mult-VAE Model:** Implements a Multinomial Variational Autoencoder for collaborative filtering.
- **Matrix Factorization:** Provides an alternative recommendation model using latent factors.
- **Popularity Baseline:** Generates recommendations based on movie popularity.
- **New User Inference:** Supports recommendations for new users without retraining the complete model.
- **Model Benchmarking:** Compares recommendation performance using standard evaluation metrics.
- **Interactive Web Application:** Provides a frontend for interacting with the recommendation system.
- **MovieLens Integration:** Uses MovieLens 1M ratings linked with TMDB/IMDb identifiers.

## 🧠 Machine Learning Models

### 1. Multinomial Variational Autoencoder (Mult-VAE)
- Uses implicit positive preferences based on ratings ≥ 4.0.
- Applies L2 normalization and stochastic input dropout.
- Uses an encoder-decoder architecture with latent representations.
- Implements reparameterization during training.
- Optimizes the Multinomial Evidence Lower Bound (ELBO).
- Uses KL annealing to balance reconstruction and regularization.

### 2. Matrix Factorization
- Uses user and item latent factors.
- Implements regularized Stochastic Gradient Descent (SGD).
- Supports new-user inference through ridge regression fold-in.

### 3. Popularity-Based Baseline
- Ranks movies using positive-interaction counts.
- Applies Bayesian rating damping.
- Provides a non-personalized benchmark for comparison.

## 📊 Dataset

**MovieLens 1M Dataset**

| Dataset Information | Value |
|---|---:|
| Users | 6,040 |
| Movies | 3,883 |
| Rated Items | 3,706 |
| Ratings | 1,000,209 |
| Training Interactions | 800,309 |

The dataset is divided using a deterministic per-user temporal split:

- 80% – Training data
- 10% – Validation data
- 10% – Testing data

Seen movies are masked during evaluation to prevent recommending items that users have already rated.

## 📈 Evaluation Metrics

The recommendation models are evaluated using:

- **Recall@20:** Measures how many relevant movies appear in the top 20 recommendations.
- **NDCG@100:** Measures the quality of ranking based on the positions of relevant recommendations.
- **Catalog Coverage:** Measures the percentage of available movies recommended across users.

All models are evaluated using identical held-out users.

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| Programming Language | Python, TypeScript, JavaScript |
| Machine Learning | PyTorch, NumPy |
| Backend | Node.js, Express.js |
| Frontend | React, TypeScript, Vite |
| Database | SQLite |
| Dataset | MovieLens 1M |
| Recommendation Algorithms | Mult-VAE, Matrix Factorization, Popularity Baseline |

## ⚙️ Setup and Execution

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd PickMyFlick
```

### 2. Prepare the Dataset

Download the MovieLens 1M dataset and run:

```bash
python3 scripts/prepare_movielens.py
```

### 3. Install Dependencies

Install the Python, backend, and frontend dependencies using the respective dependency files included in the repository.

### 4. Train the Models

Run the model training scripts provided in the project to train Mult-VAE and Matrix Factorization and generate the required model artifacts.

### 5. Start the Application

Start the backend and frontend using the commands specified in their respective project directories.

Refer to the project configuration and scripts for the exact execution commands.

## 🏗️ System Architecture

```text
              MovieLens 1M Dataset
                       |
                       v
              Dataset Preparation
                       |
                       v
             Temporal Data Splitting
                       |
          +------------+------------+
          |            |            |
          v            v            v
       Mult-VAE    Matrix Factor.  Popularity
          |            |            |
          +------------+------------+
                       |
                       v
              Recommendation Engine
                       |
                       v
                Node.js Backend
                       |
                       v
                React Frontend
                       |
                       v
             Personalized Movie Picks
```

## 🎯 Project Objective

The main objective of PickMyFlick is to explore deep learning-based collaborative filtering and develop a personalized movie recommendation system. By benchmarking Mult-VAE against traditional recommendation approaches, the project investigates how latent representations can improve personalized movie discovery.

## 🔮 Future Enhancements

- Integration of TMDB movie posters and additional movie information.
- Improved recommendation explanations.
- User profiles and personalized watchlists.
- Real-time recommendation updates.
- Cloud deployment and scalable model serving.
- Additional recommendation algorithms and hybrid filtering.

## 👩‍💻 Author

**Deepthi SD**

B.Tech – Computer Science and Technology (AIML)

GitHub: [deepthisd-05](https://github.com/deepthisd-05)

---

⭐ If you find this project interesting, consider giving the repository a star!
