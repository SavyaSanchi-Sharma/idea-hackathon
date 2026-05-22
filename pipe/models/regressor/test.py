"""Evaluate Model 2 on the held-out test set."""
import json
from pathlib import Path
import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main():
    splits = joblib.load(ARTIFACTS / "splits.joblib")
    model = joblib.load(ARTIFACTS / "model.joblib")

    y_pred = model.predict(splits["X_test"])
    y_true = splits["y_test"]

    r2 = r2_score(y_true, y_pred)
    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    resid = y_true - y_pred

    print(f"R^2:   {r2:.4f}")
    print(f"MAE:   {mae:.4f}")
    print(f"RMSE:  {rmse:.4f}")
    print(f"residuals — mean: {resid.mean():+.4f}  std: {resid.std():.4f}  |max|: {np.abs(resid).max():.4f}")
    print()
    bands = {"low": (0, 40), "medium": (40, 75), "high": (75, 90), "critical": (90, 101)}
    band_mae = {}
    for name, (lo, hi) in bands.items():
        mask = (y_true >= lo) & (y_true < hi)
        if mask.sum() > 0:
            m = float(mean_absolute_error(y_true[mask], y_pred[mask]))
            band_mae[name] = m
            print(f"  {name:<8s} band (n={int(mask.sum()):>4d}): MAE = {m:.4f}")

    metrics = {
        "r2": float(r2), "mae": float(mae), "rmse": rmse,
        "residual_mean": float(resid.mean()),
        "residual_std": float(resid.std()),
        "band_mae": band_mae,
    }
    with open(ARTIFACTS / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)


if __name__ == "__main__":
    main()
