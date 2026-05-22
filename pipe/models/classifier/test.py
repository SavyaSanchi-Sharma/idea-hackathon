"""Evaluate Model 1 on the held-out test set."""
import json
from pathlib import Path
import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    model = joblib.load(ARTIFACTS / "model.joblib")
    inv = {v: k for k, v in splits["label_map"].items()}
    labels = [inv[i] for i in sorted(inv)]

    y_pred = model.predict(splits["X_test"])
    y_true = splits["y_test"]

    acc = accuracy_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred, average="macro")
    cm = confusion_matrix(y_true, y_pred)
    report = classification_report(y_true, y_pred, target_names=labels, output_dict=True)

    print(f"accuracy:  {acc:.4f}")
    print(f"macro F1:  {f1:.4f}")
    print()
    print(classification_report(y_true, y_pred, target_names=labels))
    print("confusion matrix (rows=true, cols=pred):")
    header = "      " + "  ".join(f"{l:>10s}" for l in labels)
    print(header)
    for i, row in enumerate(cm):
        print(f"{labels[i]:>10s}  " + "  ".join(f"{v:>10d}" for v in row))

    metrics = {
        "accuracy": float(acc),
        "macro_f1": float(f1),
        "confusion_matrix": cm.tolist(),
        "per_class": {k: v for k, v in report.items() if isinstance(v, dict)},
    }
    with open(ARTIFACTS / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)


if __name__ == "__main__":
    main()
