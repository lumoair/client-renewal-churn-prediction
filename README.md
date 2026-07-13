# Client Renewal and Churn Prediction Starter

This project is a starter workflow for predicting:

- `churn_risk`: probability a client will not renew or will cancel
- `renewal_potential`: probability a client is likely to renew successfully

It also produces a client action plan so commercial and customer-success teams can prioritize interventions.

## What this model should answer

1. Which clients are most likely to churn in the next renewal window?
2. Which clients have strong renewal potential and may be ready for expansion?
3. What factors are driving risk?
4. Which retention actions should be taken for each risk segment?

## Recommended input data

Put your modeling dataset at:

`data/client_renewal_data.csv`

Each row should represent one client at one observation point before renewal. A suggested schema template is in:

`data/client_renewal_schema.csv`

## Core targets

- `churned`: `1` if the client churned / failed to renew in the target window, else `0`
- `renewed`: `1` if the client renewed in the target window, else `0`

In many businesses, `renewed = 1 - churned`. If that is true for your case, you can keep both fields for clarity or derive one from the other.

## Suggested feature families

- Contract: tenure, contract value, remaining days to renewal, plan type
- Usage: active users, login frequency, feature adoption, usage trend
- Support: ticket count, escalation count, CSAT, unresolved issues
- Finance: invoice delays, payment failures, discount level
- Relationship: CSM touchpoints, exec sponsor presence, QBR completion
- Product health: integration status, onboarding completion, time to value

## Run

Install dependencies:

```bash
venv/bin/python -m pip install -r requirements.txt
```

Train and evaluate:

```bash
venv/bin/python src/generate_sample_data.py --output data/client_renewal_data.csv --rows 500
venv/bin/python src/train.py --input data/client_renewal_data.csv --output-dir outputs
```

If you are working outside the bundled venv, use that environment's Python instead of the system `python3`.

```bash
python3 src/generate_sample_data.py --output data/client_renewal_data.csv --rows 500
python3 src/train.py --input data/client_renewal_data.csv --output-dir outputs
```

This generates:

- `outputs/churn_model_metrics.json`
- `outputs/renewal_model_metrics.json`
- `outputs/client_risk_scores.csv`
- `outputs/strategy_recommendations.csv`

## Modeling approach

This starter uses logistic regression with preprocessing for numeric and categorical features. It is a strong baseline because it is:

- explainable
- fast to train
- suitable for probability scoring

Once you have data quality and baseline performance, you can test tree-based models like XGBoost, LightGBM, or Random Forest.

## Strategy framework

The output recommendation logic groups clients into:

- `critical_risk`
- `high_risk`
- `watchlist`
- `healthy`
- `expansion_ready`

See `docs/retention_strategy.md` for the operating model behind those segments.

## What you should do next

1. Export historical client data with the columns closest to the schema template.
2. Define the exact prediction window, for example: "predict churn 90 days before renewal".
3. Train the baseline.
4. Review feature importance and calibration with business stakeholders.
5. Operationalize the risk segments in CRM / CS tooling.

## UI

Open the dashboard with:

```bash
venv/bin/python src/serve_dashboard.py
```

Then visit `http://127.0.0.1:8000/dashboard/`.

The UI uses a black-and-blue minimalist layout and will load the latest CSV outputs from `outputs/client_risk_scores.csv` when served over HTTP. You can also upload a CSV manually inside the dashboard.
