# Zombie API Discovery — Model Training

Three independent lightweight models. Each lives in its own directory and can be run separately.

| Model | Task | Input file | Algorithm | Output |
|---|---|---|---|---|
| **classifier/** | 3-class lifecycle | `data/generated/lifecycle_training.csv` | `HistGradientBoostingClassifier` (sklearn) | `active` / `deprecated` / `orphaned` |
| **regressor/**  | risk score (0-100) | `data/generated/lifecycle_training.csv` (max_cvss held out) | `HistGradientBoostingRegressor` (sklearn) | float |
| **anomaly/**    | behavior change | `data/generated/lifecycle_sequences.csv` (aggregated per endpoint) | `IsolationForest` (sklearn) | binary |

All models are pure sklearn, serialized as `joblib`. No PyTorch dependency. Each model directory has the same 4-script layout.

## Run any model independently

```bash
cd models/classifier        # or regressor / anomaly
python preprocess.py        # → artifacts/{preprocessor,splits}.joblib
python train.py             # → artifacts/model.joblib  (default hyperparameters)
python test.py              # → artifacts/metrics.json
python tune.py              # → overwrites model.joblib with grid-search best + best_params.json
```

Order: `preprocess.py` must run before `train.py` / `test.py` / `tune.py`. `tune.py` replaces `train.py` if you want hyperparameter search instead of fixed defaults.

## What each script does

- **preprocess.py** — loads the source CSV, builds feature matrix, fits scaler + one-hot encoder, splits train/test (stratified for classifier and anomaly), saves splits + preprocessor.
- **train.py** — fits the model with hand-picked defaults, saves to `artifacts/model.joblib`, prints train/test score.
- **test.py** — loads model + test split, prints full metrics (accuracy / R² / precision / recall / F1 / confusion matrix as appropriate), saves `artifacts/metrics.json`.
- **tune.py** — `GridSearchCV` (or manual grid for anomaly) over a small hyperparameter grid, refits with best, saves `artifacts/best_params.json`.

## Dependencies

`scikit-learn >= 1.8`, `joblib`, `pandas`, `numpy`. Use the `zombie` conda env:

```bash
/home/guy_who_likes_to_code/miniconda3/envs/zombie/bin/python preprocess.py
```

(or activate the env: `conda activate zombie`)
