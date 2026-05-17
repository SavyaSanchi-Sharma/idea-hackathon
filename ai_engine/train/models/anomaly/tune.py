"""Tune Model 3 hyperparameters by grid sweep using train-set F1."""
import json
from pathlib import Path
from itertools import product
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"

GRID = {
    "n_estimators": [100, 200, 400],
    "contamination": [0.05, 0.10, 0.15],
    "max_samples": ["auto", 256, 512],
}


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    X_train = splits["X_train"]
    y_train = splits["y_train"]
    X_normal = X_train[y_train == 0]

    best = {"f1": -1.0, "params": None, "model": None}
    keys = list(GRID.keys())
    for combo in product(*[GRID[k] for k in keys]):
        params = dict(zip(keys, combo))
        m = IsolationForest(random_state=42, **params)
        m.fit(X_normal)
        y_pred = (m.predict(X_train) == -1).astype(int)
        f1 = f1_score(y_train, y_pred, zero_division=0)
        if f1 > best["f1"]:
            best = {"f1": f1, "params": params, "model": m}

    print(f"best params: {best['params']}")
    print(f"best train F1: {best['f1']:.4f}")

    y_test_pred = (best["model"].predict(splits["X_test"]) == -1).astype(int)
    test_f1 = f1_score(splits["y_test"], y_test_pred, zero_division=0)
    print(f"test F1 with best params: {test_f1:.4f}")

    joblib.dump(best["model"], ARTIFACTS / "model.joblib")
    with open(ARTIFACTS / "best_params.json", "w") as f:
        json.dump({
            "best_params": best["params"],
            "train_f1": float(best["f1"]),
            "test_f1": float(test_f1),
        }, f, indent=2)


if __name__ == "__main__":
    main()
