import argparse
import json
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


IDENTIFIER_COLUMNS = {"client_id", "as_of_date", "renewal_date"}
TARGET_COLUMNS = {"churned", "renewed"}


def build_preprocessor(features: pd.DataFrame) -> ColumnTransformer:
    numeric_columns = features.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_columns = [col for col in features.columns if col not in numeric_columns]

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_columns),
            ("cat", categorical_pipeline, categorical_columns),
        ]
    )


def build_model(features: pd.DataFrame) -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocess", build_preprocessor(features)),
            ("model", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )


def evaluate_binary_model(model: Pipeline, x_test: pd.DataFrame, y_test: pd.Series) -> dict:
    probabilities = model.predict_proba(x_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    return {
        "roc_auc": roc_auc_score(y_test, probabilities),
        "average_precision": average_precision_score(y_test, probabilities),
        "classification_report": classification_report(y_test, predictions, output_dict=True),
    }


def train_target_model(data: pd.DataFrame, target: str):
    feature_columns = [col for col in data.columns if col not in IDENTIFIER_COLUMNS | TARGET_COLUMNS]
    x = data[feature_columns].copy()
    y = data[target].copy()

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.25,
        random_state=42,
        stratify=y,
    )

    model = build_model(x_train)
    model.fit(x_train, y_train)
    metrics = evaluate_binary_model(model, x_test, y_test)

    full_probabilities = model.predict_proba(x)[:, 1]
    return model, metrics, full_probabilities


def derive_risk_segment(churn_probability: float, renewal_probability: float) -> str:
    if churn_probability >= 0.8:
        return "critical_risk"
    if churn_probability >= 0.6:
        return "high_risk"
    if churn_probability >= 0.35:
        return "watchlist"
    if renewal_probability >= 0.8 and churn_probability < 0.2:
        return "expansion_ready"
    return "healthy"


def recommend_action(segment: str) -> str:
    recommendations = {
        "critical_risk": "Launch executive rescue plan, fix blockers, and assign weekly renewal recovery review.",
        "high_risk": "Run value review, sponsor mapping, and targeted adoption intervention within 2 weeks.",
        "watchlist": "Increase monitoring cadence and resolve adoption, support, or billing friction early.",
        "healthy": "Maintain standard success motion and confirm renewal timeline.",
        "expansion_ready": "Pursue early renewal and expansion conversation.",
    }
    return recommendations[segment]


def save_json(path: Path, payload: dict) -> None:
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to the client renewal dataset CSV")
    parser.add_argument("--output-dir", default="outputs", help="Directory for metrics and scored outputs")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    data = pd.read_csv(input_path)

    required_targets = {"churned", "renewed"}
    missing_targets = required_targets - set(data.columns)
    if missing_targets:
        raise ValueError(f"Missing required target columns: {sorted(missing_targets)}")

    churn_model, churn_metrics, churn_scores = train_target_model(data, "churned")
    renewal_model, renewal_metrics, renewal_scores = train_target_model(data, "renewed")

    save_json(output_dir / "churn_model_metrics.json", churn_metrics)
    save_json(output_dir / "renewal_model_metrics.json", renewal_metrics)

    scored = data[[col for col in data.columns if col in IDENTIFIER_COLUMNS]].copy()
    scored["churn_probability"] = churn_scores
    scored["renewal_probability"] = renewal_scores
    scored["risk_segment"] = scored.apply(
        lambda row: derive_risk_segment(row["churn_probability"], row["renewal_probability"]),
        axis=1,
    )
    scored["recommended_action"] = scored["risk_segment"].map(recommend_action)

    scored.to_csv(output_dir / "client_risk_scores.csv", index=False)
    scored[["client_id", "risk_segment", "recommended_action"]].to_csv(
        output_dir / "strategy_recommendations.csv",
        index=False,
    )

    print(f"Saved outputs to {output_dir.resolve()}")


if __name__ == "__main__":
    main()
