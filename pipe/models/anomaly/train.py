"""Train Model 3 (IsolationForest fit on normal sequences only)."""
from pathlib import Path
import joblib
from sklearn.ensemble import IsolationForest

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    X_normal = splits["X_train"][splits["y_train"] == 0]
    model = IsolationForest(
        n_estimators=200, contamination=0.10, max_samples=256, random_state=42,
    )
    model.fit(X_normal)
    joblib.dump(model, ARTIFACTS / "model.joblib")
    print(f"trained on {len(X_normal)} normal sequences (n_estimators=200, contamination=0.10)")


if __name__ == "__main__":
    main()
