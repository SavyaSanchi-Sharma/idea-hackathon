"""Preprocess lifecycle_sequences.csv into per-endpoint features for Model 3."""
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "generated"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def build_features(seq):
    seq = seq.sort_values("day")
    calls = seq["call_count"].values.astype(float)
    af = seq["auth_fail_rate"].values
    lat = seq["p95_latency_ms"].values
    half = len(calls) // 2
    return {
        "calls_mean": float(calls.mean()),
        "calls_std": float(calls.std()),
        "calls_max_min_ratio": float((calls.max() + 1) / (calls.min() + 1)),
        "calls_slope": float(calls[-1] - calls[0]),
        "calls_first_half_mean": float(calls[:half].mean()),
        "calls_second_half_mean": float(calls[half:].mean()),
        "calls_half_ratio": float((calls[half:].mean() + 1) / (calls[:half].mean() + 1)),
        "calls_p95_minus_p5": float(np.percentile(calls, 95) - np.percentile(calls, 5)),
        "auth_fail_mean": float(af.mean()),
        "auth_fail_std": float(af.std()),
        "auth_fail_max": float(af.max()),
        "latency_mean": float(lat.mean()),
        "latency_std": float(lat.std()),
        "latency_max": float(lat.max()),
    }


def main():
    seq = pd.read_csv(DATA_DIR / "lifecycle_sequences.csv")

    rows = []
    for ep_id, group in seq.groupby("endpoint_id"):
        feats = build_features(group)
        feats["endpoint_id"] = int(ep_id)
        feats["anomaly"] = int(group["anomaly"].iloc[0])
        rows.append(feats)

    df = pd.DataFrame(rows)
    feat_cols = [c for c in df.columns if c not in ("endpoint_id", "anomaly")]
    X = df[feat_cols].values
    y = df["anomaly"].values
    ids = df["endpoint_id"].values

    X_train, X_test, y_train, y_test, ids_train, ids_test = train_test_split(
        X, y, ids, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    joblib.dump(scaler, ARTIFACTS / "scaler.joblib")
    joblib.dump({
        "X_train": X_train_s, "X_test": X_test_s,
        "y_train": y_train, "y_test": y_test,
        "ids_train": ids_train, "ids_test": ids_test,
        "feature_names": feat_cols,
    }, ARTIFACTS / "splits.joblib")

    print(f"train: {X_train_s.shape}  test: {X_test_s.shape}")
    print(f"anomaly rate train: {y_train.mean():.3f}  test: {y_test.mean():.3f}")
    print(f"features ({len(feat_cols)}): {feat_cols}")


if __name__ == "__main__":
    main()
