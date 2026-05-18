"""Evaluate Model 3 on the held-out test set."""
import json
from pathlib import Path
import joblib
from sklearn.metrics import (classification_report, confusion_matrix,
                             f1_score, precision_score, recall_score, roc_auc_score)

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    model = joblib.load(ARTIFACTS / "model.joblib")

    raw = model.predict(splits["X_test"])
    y_pred = (raw == -1).astype(int)
    y_true = splits["y_test"]
    scores = -model.score_samples(splits["X_test"])

    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    auc = roc_auc_score(y_true, scores) if y_true.sum() > 0 else float("nan")
    cm = confusion_matrix(y_true, y_pred)

    print(f"precision:  {precision:.4f}")
    print(f"recall:     {recall:.4f}")
    print(f"F1:         {f1:.4f}")
    print(f"ROC-AUC:    {auc:.4f}")
    print()
    print(classification_report(y_true, y_pred, target_names=["normal", "anomaly"], zero_division=0))
    print("confusion matrix (rows=true, cols=pred):")
    print(f"            normal   anomaly")
    print(f"normal   {cm[0,0]:>8d}  {cm[0,1]:>8d}")
    print(f"anomaly  {cm[1,0]:>8d}  {cm[1,1]:>8d}")

    metrics = {
        "precision": float(precision), "recall": float(recall),
        "f1": float(f1), "roc_auc": float(auc),
        "confusion_matrix": cm.tolist(),
    }
    with open(ARTIFACTS / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)


if __name__ == "__main__":
    main()
