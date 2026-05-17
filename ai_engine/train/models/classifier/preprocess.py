"""Preprocess lifecycle_training.csv for Model 1 (3-class lifecycle classifier).

Drops in_registry, owner_present, deprecated_flag from the input feature set —
these three binary signals together near-perfectly determine the class label by
construction, so leaving them in produces trivially-separable data and 100% test
accuracy. They are the *outputs* the classifier should help infer, not inputs.
The model is forced to predict from softer telemetry: traffic, latency, deploy
age, auth-fail rate, schema depth, CVE severity, and categorical context.
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

NUMERIC = ["schema_count", "last_seen_days", "call_count_7d",
           "auth_fail_rate_7d", "p95_latency_ms", "last_deploy_days", "max_cvss"]
CATEGORICAL = ["auth_scheme", "runtime", "version_path"]
TARGET = "lifecycle_state"
LABEL_MAP = {"active": 0, "deprecated": 1, "orphaned": 2}


def main():
    df = pd.read_csv(DATA_DIR / "lifecycle_training.csv")
    df["version_path"] = df["version_path"].astype(str)

    X = df[NUMERIC + CATEGORICAL]
    y = df[TARGET].map(LABEL_MAP).astype(int).values

    pre = ColumnTransformer([
        ("num", StandardScaler(), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
    ])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    X_train_t = pre.fit_transform(X_train)
    X_test_t = pre.transform(X_test)

    joblib.dump(pre, ARTIFACTS / "preprocessor.joblib")
    joblib.dump({
        "X_train": X_train_t, "X_test": X_test_t,
        "y_train": y_train, "y_test": y_test,
        "label_map": LABEL_MAP,
        "feature_names": pre.get_feature_names_out().tolist(),
    }, ARTIFACTS / "splits.joblib")

    print(f"train: {X_train_t.shape}  test: {X_test_t.shape}")
    print(f"numeric features ({len(NUMERIC)}): {NUMERIC}")
    print(f"categorical features ({len(CATEGORICAL)}): {CATEGORICAL}")
    print(f"DROPPED (leakage): in_registry, owner_present, deprecated_flag")
    print(f"class balance (train): {dict(zip(*np.unique(y_train, return_counts=True)))}")
    print(f"class balance (test):  {dict(zip(*np.unique(y_test, return_counts=True)))}")


if __name__ == "__main__":
    main()
