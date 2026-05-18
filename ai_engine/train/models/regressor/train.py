"""Train Model 2 with default hyperparameters."""
from pathlib import Path
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    model = HistGradientBoostingRegressor(
        max_iter=300, max_depth=6, learning_rate=0.1, random_state=42,
    )
    model.fit(splits["X_train"], splits["y_train"])
    joblib.dump(model, ARTIFACTS / "model.joblib")
    print(f"train R^2: {model.score(splits['X_train'], splits['y_train']):.4f}")
    print(f"test  R^2: {model.score(splits['X_test'], splits['y_test']):.4f}")


if __name__ == "__main__":
    main()
