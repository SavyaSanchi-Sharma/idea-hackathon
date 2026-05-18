"""Train Model 1 with default hyperparameters."""
from pathlib import Path
import joblib
from sklearn.ensemble import HistGradientBoostingClassifier

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    model = HistGradientBoostingClassifier(
        max_iter=300, max_depth=6, learning_rate=0.1,
        class_weight="balanced", random_state=42,
    )
    model.fit(splits["X_train"], splits["y_train"])
    joblib.dump(model, ARTIFACTS / "model.joblib")
    print(f"train accuracy: {model.score(splits['X_train'], splits['y_train']):.4f}")
    print(f"test  accuracy: {model.score(splits['X_test'], splits['y_test']):.4f}")


if __name__ == "__main__":
    main()
