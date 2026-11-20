import numpy as np
import torch
import torch.nn as nn


class MatrixFactorization(nn.Module):
    """
    Regularized Biased Matrix Factorization: R ≈ mu + b_u + b_i + P @ Q^T
    Supports closed-form ridge fold-in for cold-start / live user rating vectors.
    """

    def __init__(self, num_users: int, num_items: int, latent_dim: int = 32, global_mean: float = 3.5):
        super().__init__()
        self.num_users = num_users
        self.num_items = num_items
        self.latent_dim = latent_dim
        self.register_buffer("global_mean", torch.tensor(float(global_mean)))

        self.user_factors = nn.Embedding(num_users, latent_dim)
        self.item_factors = nn.Embedding(num_items, latent_dim)
        self.user_biases = nn.Embedding(num_users, 1)
        self.item_biases = nn.Embedding(num_items, 1)

        nn.init.normal_(self.user_factors.weight, std=0.1 / np.sqrt(latent_dim))
        nn.init.normal_(self.item_factors.weight, std=0.1 / np.sqrt(latent_dim))
        nn.init.zeros_(self.user_biases.weight)
        nn.init.zeros_(self.item_biases.weight)

    def forward(self, user_ids: torch.Tensor, item_ids: torch.Tensor):
        p_u = self.user_factors(user_ids)
        q_i = self.item_factors(item_ids)
        b_u = self.user_biases(user_ids).squeeze(-1)
        b_i = self.item_biases(item_ids).squeeze(-1)
        dot = (p_u * q_i).sum(dim=-1)
        return self.global_mean + b_u + b_i + dot

    @torch.no_grad()
    def fold_in_predict(self, rated_items: list[int], ratings: list[float], reg: float = 1.5) -> np.ndarray:
        Q = self.item_factors.weight.cpu().numpy()
        bi = self.item_biases.weight.squeeze(-1).cpu().numpy()
        mu = float(self.global_mean.item())
        if not rated_items:
            return mu + bi

        idx = np.array(rated_items, dtype=np.int64)
        Q_u = Q[idx]
        target = np.array(ratings, dtype=np.float64) - mu - bi[idx]
        A = Q_u.T @ Q_u + reg * np.eye(self.latent_dim)
        p_u = np.linalg.solve(A, Q_u.T @ target)
        return mu + bi + Q @ p_u
