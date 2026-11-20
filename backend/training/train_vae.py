import json
import os
import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from backend.models.multvae import MultVAE, multvae_elbo_loss

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPLITS_PATH = os.path.join(ROOT_DIR, "data", "processed", "splits.json")
SAVED_DIR = os.path.join(ROOT_DIR, "backend", "saved_models")


def train_multvae_pytorch(
    hidden_dim: int = 200,
    latent_dim: int = 64,
    epochs: int = 20,
    batch_size: int = 256,
    lr: float = 1e-3,
    beta_max: float = 0.2,
    dropout: float = 0.5,
):
    os.makedirs(SAVED_DIR, exist_ok=True)
    with open(SPLITS_PATH, "r", encoding="utf-8") as f:
        splits = json.load(f)

    num_users = splits["num_users"]
    num_items = splits["num_items"]

    x_train = np.zeros((num_users, num_items), dtype=np.float32)
    for u, pairs in enumerate(splits["train"]):
        for item_idx, rating in pairs:
            if rating >= 4.0:
                x_train[u, int(item_idx)] = 1.0

    x_val = np.zeros((num_users, num_items), dtype=np.float32)
    for u, pairs in enumerate(splits["val"]):
        for item_idx, rating in pairs:
            if rating >= 4.0:
                x_val[u, int(item_idx)] = 1.0

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MultVAE(num_items, hidden_dim=hidden_dim, latent_dim=latent_dim, dropout=dropout).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)

    loader = DataLoader(TensorDataset(torch.from_numpy(x_train)), batch_size=batch_size, shuffle=True)
    anneal_epochs = max(1, int(epochs * 0.7))
    best_val_loss = float("inf")
    ckpt_path = os.path.join(SAVED_DIR, "multvae_pytorch.pt")

    for epoch in range(1, epochs + 1):
        model.train()
        beta = beta_max * min(1.0, epoch / anneal_epochs)
        total_loss = 0.0
        for (batch_x,) in loader:
            batch_x = batch_x.to(device)
            optimizer.zero_grad()
            logits, mu, logvar = model(batch_x)
            loss, _, _ = multvae_elbo_loss(logits, batch_x, mu, logvar, beta)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * batch_x.size(0)

        model.eval()
        with torch.no_grad():
            vx_tr = torch.from_numpy(x_train[:500]).to(device)
            vx_va = torch.from_numpy(x_val[:500]).to(device)
            logits, mu, logvar = model(vx_tr)
            val_loss, _, _ = multvae_elbo_loss(logits, vx_va, mu, logvar, beta)

        if val_loss.item() < best_val_loss:
            best_val_loss = val_loss.item()
            torch.save({"state_dict": model.state_dict(), "num_items": num_items, "hidden_dim": hidden_dim, "latent_dim": latent_dim}, ckpt_path)

        print(f"Epoch {epoch:02d}/{epochs} | Train ELBO: {total_loss / num_users:.4f} | Val ELBO: {val_loss.item():.4f} | beta: {beta:.3f}")

    return ckpt_path


if __name__ == "__main__":
    train_multvae_pytorch()
