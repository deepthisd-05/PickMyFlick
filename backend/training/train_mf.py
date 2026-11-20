import json
import os
import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from backend.models.matrix_factorization import MatrixFactorization

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPLITS_PATH = os.path.join(ROOT_DIR, "data", "processed", "splits.json")
SAVED_DIR = os.path.join(ROOT_DIR, "backend", "saved_models")


def train_mf_pytorch(latent_dim: int = 32, epochs: int = 12, batch_size: int = 4096, lr: float = 0.01, reg: float = 0.05):
    os.makedirs(SAVED_DIR, exist_ok=True)
    with open(SPLITS_PATH, "r", encoding="utf-8") as f:
        splits = json.load(f)

    u_list, i_list, r_list = [], [], []
    for u, pairs in enumerate(splits["train"]):
        for item_idx, rating in pairs:
            u_list.append(u)
            i_list.append(int(item_idx))
            r_list.append(float(rating))

    global_mean = float(np.mean(r_list))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MatrixFactorization(splits["num_users"], splits["num_items"], latent_dim=latent_dim, global_mean=global_mean).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=reg)
    criterion = torch.nn.MSELoss()

    ds = TensorDataset(
        torch.tensor(u_list, dtype=torch.long),
        torch.tensor(i_list, dtype=torch.long),
        torch.tensor(r_list, dtype=torch.float32),
    )
    loader = DataLoader(ds, batch_size=batch_size, shuffle=True)

    for epoch in range(1, epochs + 1):
        model.train()
        sq_sum = 0.0
        for bu, bi, br in loader:
            bu, bi, br = bu.to(device), bi.to(device), br.to(device)
            optimizer.zero_grad()
            preds = model(bu, bi)
            loss = criterion(preds, br)
            loss.backward()
            optimizer.step()
            sq_sum += loss.item() * bu.size(0)
        print(f"MF Epoch {epoch:02d}/{epochs} | Train RMSE: {np.sqrt(sq_sum / len(r_list)):.4f}")

    ckpt_path = os.path.join(SAVED_DIR, "mf_pytorch.pt")
    torch.save({"state_dict": model.state_dict(), "num_users": splits["num_users"], "num_items": splits["num_items"], "latent_dim": latent_dim, "global_mean": global_mean}, ckpt_path)
    return ckpt_path


if __name__ == "__main__":
    train_mf_pytorch()
