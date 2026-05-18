"""Preprocess lifecycle_training.csv for Model 2 (risk score regressor).

Holds out max_cvss from inputs to reduce label leakage (risk_score is partly
a deterministic function of max_cvss in the synthetic generator).
"""
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "generated"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

NUMERIC = ["schema_count", "deprecated_flag", "in_registry", "last_seen_days",
           "call_count_7d", "auth_fail_rate_7d", "p95_latency_ms",
           "last_deploy_days", "owner_present"]
CATEGORICAL = ["auth_scheme", "runtime", "version_path"]
TARGET = "risk_score"


def main():
    df = pd.read_csv(DATA_DIR / "lifecycle_training.csv")
    df["version_path"] = df["version_path"].astype(str)

    X = df[NUMERIC + CATEGORICAL]
    y = df[TARGET].values.astype(float)

    pre = ColumnTransformer([
        ("num", StandardScaler(), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
    ])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    X_train_t = pre.fit_transform(X_train)
    X_test_t = pre.transform(X_test)

    joblib.dump(pre, ARTIFACTS / "preprocessor.joblib")
    joblib.dump({
        "X_train": X_train_t, "X_test": X_test_t,
        "y_train": y_train, "y_test": y_test,
        "feature_names": pre.get_feature_names_out().tolist(),
    }, ARTIFACTS / "splits.joblib")

    print(f"train: {X_train_t.shape}  test: {X_test_t.shape}")
    print(f"y_train range: {y_train.min():.2f} - {y_train.max():.2f}  mean: {y_train.mean():.2f}")
    print("NOTE: max_cvss excluded from features to reduce label leakage")


if __name__ == "__main__":
    main()
