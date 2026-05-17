"""Compare ML classifier vs deterministic rule on the test split.

Outputs:
- per-cell counts (both right, rule wins, ML wins, both wrong, agree, disagree)
- the disagreement table — these are the endpoints that need human review
- artifacts/rule_vs_ml.csv with the full comparison
"""
from pathlib import Path
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split

from rule import classify_batch

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
DATA = Path(__file__).resolve().parent.parent.parent / "data" / "generated"


def main():
    df = pd.read_csv(DATA / "lifecycle_training.csv")
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    model = joblib.load(ARTIFACTS / "model.joblib")

    _, test_idx = train_test_split(
        df.index, test_size=0.2, random_state=42, stratify=df["lifecycle_state"]
    )
    test_df = df.loc[test_idx].reset_index(drop=True)

    inv = {v: k for k, v in splits["label_map"].items()}
    y_true = test_df["lifecycle_state"].values
    y_pred_ml = pd.Series(model.predict(splits["X_test"])).map(inv).values
    rule_verdicts = classify_batch(test_df)
    y_pred_rule = rule_verdicts["rule_state"].values

    out = pd.DataFrame({
        "endpoint_id": test_df["endpoint_id"].values,
        "endpoint": test_df["endpoint"].values,
        "method": test_df["method"].values,
        "true_label": y_true,
        "rule_predict": y_pred_rule,
        "ml_predict": y_pred_ml,
        "rule_reason": rule_verdicts["rule_reason"].values,
    })

    rule_correct = out["true_label"] == out["rule_predict"]
    ml_correct = out["true_label"] == out["ml_predict"]
    agree = out["rule_predict"] == out["ml_predict"]

    print(f"test set size:           {len(out)}")
    print(f"both correct:            {int((rule_correct & ml_correct).sum())}")
    print(f"rule right, ML wrong:    {int((rule_correct & ~ml_correct).sum())}")
    print(f"ML right, rule wrong:    {int((~rule_correct & ml_correct).sum())}")
    print(f"both wrong:              {int((~rule_correct & ~ml_correct).sum())}")
    print()
    print(f"rule ↔ ML agreement:     {int(agree.sum())} / {len(out)} ({agree.mean():.1%})")
    print(f"rule ↔ ML disagreement:  {int((~agree).sum())} — these endpoints go to review queue")

    out.to_csv(ARTIFACTS / "rule_vs_ml.csv", index=False)
    disagreements = out[~agree]
    if len(disagreements) > 0:
        print("\nDISAGREEMENTS (review-queue candidates):")
        print(disagreements[["endpoint_id", "endpoint", "true_label",
                             "rule_predict", "ml_predict", "rule_reason"]].head(15).to_string(index=False))

    print(f"\nfull comparison: {ARTIFACTS / 'rule_vs_ml.csv'}")


if __name__ == "__main__":
    main()
