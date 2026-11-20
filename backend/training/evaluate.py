import json
import os
import numpy as np
import torch

from backend.models.matrix_factorization import MatrixFactorization
from backend.models.multvae import MultVAE
from backend.models.popularity import PopularityBaseline

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPLITS_PATH = os.path.join(ROOT_DIR, "data", "processed", "splits.json")
SAVED_DIR = os.path.join(ROOT_DIR, "backend", "saved_models")


def recall_at_k(ranked_items: np.ndarray, relevant: set[int], k: int = 20) -> float:
    if not relevant:
        return 0.0
    hits = sum(1 for item in ranked_items[:k] if int(item) in relevant)
    return hits / min(k, len(relevant))


def ndcg_at_k(ranked_items: np.ndarray, relevant: set[int], k: int = 100) -> float:
    if not relevant:
        return 0.0
    dcg = sum(1.0 / np.log2(r + 2) for r, item in enumerate(ranked_items[:k]) if int(item) in relevant)
    idcg = sum(1.0 / np.log2(r + 2) for r in range(min(k, len(relevant))))
    return dcg / idcg if idcg > 0 else 0.0


def evaluate_all_pytorch(max_eval_users: int = 1000):
    with open(SPLITS_PATH, "r", encoding="utf-8") as f:
        splits = json.load(f)

    num_items = splits["num_items"]
    pop = PopularityBaseline(num_items)
    pop.fit(splits["train"])
    pop_scores = pop.predict()

    vae_ckpt = torch.load(os.path.join(SAVED_DIR, "multvae_pytorch.pt"), map_location="cpu")
    vae = MultVAE(vae_ckpt["num_items"], vae_ckpt["hidden_dim"], vae_ckpt["latent_dim"])
    vae.load_state_dict(vae_ckpt["state_dict"])
    vae.eval()

    mf_ckpt = torch.load(os.path.join(SAVED_DIR, "mf_pytorch.pt"), map_location="cpu")
    mf = MatrixFactorization(mf_ckpt["num_users"], mf_ckpt["num_items"], mf_ckpt["latent_dim"], mf_ckpt["global_mean"])
    mf.load_state_dict(mf_ckpt["state_dict"])
    mf.eval()

    eval_users = []
    for u in range(splits["num_users"]):
        rel_test = {int(it) for it, r in splits["test"][u] if r >= 4.0}
        pos_train = [int(it) for it, r in splits["train"][u] if r >= 4.0]
        if rel_test and pos_train:
            seen = {int(it) for it, _ in splits["train"][u]} | {int(it) for it, _ in splits["val"][u]}
            eval_users.append((u, pos_train, seen, rel_test))
        if len(eval_users) >= max_eval_users:
            break

    metrics = {}
    for name in ("popularity", "mf", "multvae"):
        recalls, ndcgs = [], []
        covered = set()
        for u, pos_train, seen, rel_test in eval_users:
            if name == "popularity":
                scores = pop_scores.copy()
            elif name == "mf":
                with torch.no_grad():
                    u_t = torch.full((num_items,), u, dtype=torch.long)
                    i_t = torch.arange(num_items, dtype=torch.long)
                    scores = mf(u_t, i_t).numpy()
            else:
                x = torch.zeros((1, num_items), dtype=torch.float32)
                x[0, pos_train] = 1.0
                with torch.no_grad():
                    logits, _, _ = vae(x)
                    scores = logits[0].numpy()

            for s in seen:
                scores[s] = -1e9
            ranked = np.argsort(-scores)[:100]
            covered.update(int(i) for i in ranked[:20])
            recalls.append(recall_at_k(ranked, rel_test, 20))
            ndcgs.append(ndcg_at_k(ranked, rel_test, 100))

        metrics[name] = {
            "recall_at_20": round(float(np.mean(recalls)), 4),
            "ndcg_at_100": round(float(np.mean(ndcgs)), 4),
            "catalog_coverage": round(len(covered) / num_items * 100.0, 2),
        }

    print(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    evaluate_all_pytorch()
