"""Deterministic lifecycle classifier — source of truth.

Auditable, exact, zero training. Pair with the ML classifier in this directory:
- This rule is the registry's view of an endpoint (what the metadata says).
- The ML model is the telemetry's view (what behavior suggests).
- When they disagree, the endpoint goes to a human review queue. That
  disagreement is the "discovery" signal: the rule catches what the registry
  knows; the model catches what the registry got wrong.
"""
from dataclasses import dataclass


@dataclass
class LifecycleVerdict:
    state: str
    reason: str
    is_zombie: bool
    is_shadow: bool


def classify(row):
    in_registry = int(row["in_registry"])
    owner = int(row["owner_present"])
    dep = int(row["deprecated_flag"])
    calls = int(row["call_count_7d"])

    if in_registry == 0:
        return LifecycleVerdict(
            state="orphaned",
            reason="not in API registry (shadow endpoint)",
            is_zombie=False,
            is_shadow=True,
        )

    if owner == 0:
        is_zombie = calls >= 3000
        reason = (f"no owner team + high traffic ({calls:,} calls/7d) — zombie endpoint"
                  if is_zombie else "no owner team")
        return LifecycleVerdict(
            state="orphaned", reason=reason, is_zombie=is_zombie, is_shadow=False,
        )

    if dep == 1:
        return LifecycleVerdict(
            state="deprecated", reason="deprecated flag set in registry",
            is_zombie=False, is_shadow=False,
        )

    return LifecycleVerdict(
        state="active", reason="registered, owned, not deprecated",
        is_zombie=False, is_shadow=False,
    )


def classify_batch(df):
    import pandas as pd
    verdicts = [classify(r) for _, r in df.iterrows()]
    return pd.DataFrame({
        "rule_state": [v.state for v in verdicts],
        "rule_is_zombie": [int(v.is_zombie) for v in verdicts],
        "rule_is_shadow": [int(v.is_shadow) for v in verdicts],
        "rule_reason": [v.reason for v in verdicts],
    })


def main():
    from pathlib import Path
    import pandas as pd
    DATA = Path(__file__).resolve().parent.parent.parent / "data" / "generated"
    df = pd.read_csv(DATA / "lifecycle_training.csv")
    verdicts = classify_batch(df)

    agreement = (df["lifecycle_state"].values == verdicts["rule_state"].values).mean()
    print(f"rule applied to {len(df)} rows")
    print(f"rule vs label agreement: {agreement:.4f}")
    print()
    print("rule_state distribution:")
    print(verdicts["rule_state"].value_counts().to_string())
    print()
    print(f"flags: is_zombie={int(verdicts['rule_is_zombie'].sum())}  "
          f"is_shadow={int(verdicts['rule_is_shadow'].sum())}")
    print()
    disagree_mask = df["lifecycle_state"].values != verdicts["rule_state"].values
    print(f"disagreements (rule vs stored label): {int(disagree_mask.sum())}")
    if disagree_mask.sum() > 0:
        sample = pd.concat([df[disagree_mask][["endpoint_id", "endpoint", "lifecycle_state"]].reset_index(drop=True),
                            verdicts[disagree_mask][["rule_state", "rule_reason"]].reset_index(drop=True)], axis=1)
        print("\nsample disagreements (these are the boundary-noise rows):")
        print(sample.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
