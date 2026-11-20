import json
import numpy as np


class PopularityBaseline:
    """
    Non-personalized Bayesian-weighted popularity baseline computed strictly from training split.
    """

    def __init__(self, num_items: int, min_ratings_threshold: int = 20, damping_m: float = 25.0):
        self.num_items = num_items
        self.min_ratings_threshold = min_ratings_threshold
        self.damping_m = damping_m
        self.scores = np.zeros(num_items, dtype=np.float32)
        self.global_mean = 3.5

    def fit(self, train_interactions: list[list[list[float]]]):
        counts = np.zeros(self.num_items, dtype=np.int64)
        pos_counts = np.zeros(self.num_items, dtype=np.int64)
        sums = np.zeros(self.num_items, dtype=np.float64)

        total_sum = 0.0
        total_cnt = 0
        for u_items in train_interactions:
            for item_idx, rating in u_items:
                item_idx = int(item_idx)
                counts[item_idx] += 1
                sums[item_idx] += rating
                total_sum += rating
                total_cnt += 1
                if rating >= 4.0:
                    pos_counts[item_idx] += 1

        self.global_mean = float(total_sum / max(1, total_cnt))
        b_avg = (sums + self.damping_m * self.global_mean) / (counts + self.damping_m)
        mask = counts >= self.min_ratings_threshold
        self.scores = np.where(mask, pos_counts + 0.01 * b_avg, pos_counts * 0.1).astype(np.float32)

    def predict(self) -> np.ndarray:
        return self.scores

    def save(self, path: str):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "num_items": self.num_items,
                    "global_mean": self.global_mean,
                    "min_ratings_threshold": self.min_ratings_threshold,
                    "scores": self.scores.tolist(),
                },
                f,
            )

    @classmethod
    def load(cls, path: str) -> "PopularityBaseline":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        obj = cls(data["num_items"], data["min_ratings_threshold"])
        obj.global_mean = data["global_mean"]
        obj.scores = np.array(data["scores"], dtype=np.float32)
        return obj
