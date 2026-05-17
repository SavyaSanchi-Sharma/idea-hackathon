"""Grid-search hyperparameters for Model 2."""
import json
from pathlib import Path
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GridSearchCV

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"

GRID = {
    "max_iter": [100, 300, 500],
    "max_depth": [None, 4, 8],
    "learning_rate": [0.05, 0.1, 0.2],
}


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    base = HistGradientBoostingRegressor(random_state=42)
    search = GridSearchCV(base, GRID, cv=5, scoring="r2", n_jobs=-1, verbose=1)
    search.fit(splits["X_train"], splits["y_train"])

    print(f"best params: {search.best_params_}")
    print(f"best CV R^2: {search.best_score_:.4f}")
    test_r2 = search.best_estimator_.score(splits["X_test"], splits["y_test"])
    print(f"test R^2 with best params: {test_r2:.4f}")

    joblib.dump(search.best_estimator_, ARTIFACTS / "model.joblib")
    with open(ARTIFACTS / "best_params.json", "w") as f:
        json.dump({
            "best_params": search.best_params_,
            "best_cv_r2": float(search.best_score_),
            "test_r2": float(test_r2),
        }, f, indent=2)


if __name__ == "__main__":
    main()
