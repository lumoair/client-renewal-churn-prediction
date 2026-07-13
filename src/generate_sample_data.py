import argparse
import csv
import random
from datetime import date, timedelta
from pathlib import Path


PLAN_TYPES = ["basic", "pro", "enterprise"]
INDUSTRIES = ["saas", "fintech", "healthcare", "retail", "manufacturing"]
REGIONS = ["north_america", "europe", "middle_east", "apac"]


def clip(value, low, high):
    return max(low, min(high, value))


def build_row(client_number: int):
    today = date.today()
    renewal_offset = random.randint(15, 180)
    renewal_date = today + timedelta(days=renewal_offset)
    tenure = random.randint(3, 60)
    arr = random.randint(5_000, 250_000)
    usage_health = random.randint(20, 100)
    relationship_health = random.randint(20, 100)
    adoption = random.randint(10, 100)
    advanced_adoption = clip(adoption - random.randint(-15, 25), 0, 100)
    payment_delay = random.randint(0, 45)
    escalations = random.randint(0, 5)
    open_critical = random.randint(0, 3)
    csm_touch_days = random.randint(2, 90)
    qbr_completed = int(random.random() > 0.35)
    exec_sponsor = int(random.random() > 0.4)

    churn_signal = (
        0.30 * (1 - usage_health / 100)
        + 0.20 * (1 - relationship_health / 100)
        + 0.15 * min(payment_delay / 45, 1)
        + 0.15 * min(escalations / 5, 1)
        + 0.10 * min(open_critical / 3, 1)
        + 0.10 * min(csm_touch_days / 90, 1)
    )
    churned = int(churn_signal > 0.48)
    renewed = 1 - churned

    return {
        "client_id": f"C{client_number:05d}",
        "as_of_date": today.isoformat(),
        "renewal_date": renewal_date.isoformat(),
        "tenure_months": tenure,
        "annual_recurring_revenue": arr,
        "plan_type": random.choice(PLAN_TYPES),
        "industry": random.choice(INDUSTRIES),
        "region": random.choice(REGIONS),
        "active_users_30d": random.randint(3, 1000),
        "active_users_trend_pct": random.randint(-35, 40),
        "core_feature_adoption_pct": adoption,
        "advanced_feature_adoption_pct": advanced_adoption,
        "logins_per_user_30d": round(random.uniform(1.0, 28.0), 2),
        "onboarding_completed": int(random.random() > 0.2),
        "qbr_completed": qbr_completed,
        "last_csm_touch_days": csm_touch_days,
        "ticket_count_90d": random.randint(0, 30),
        "escalation_count_90d": escalations,
        "csat_score": round(random.uniform(2.0, 5.0), 2),
        "open_critical_issues": open_critical,
        "payment_delay_days_avg": payment_delay,
        "payment_failures_12m": random.randint(0, 4),
        "discount_pct": random.randint(0, 35),
        "nps_score": random.randint(-50, 100),
        "executive_sponsor_present": exec_sponsor,
        "product_integration_live": int(random.random() > 0.25),
        "usage_health_score": usage_health,
        "relationship_health_score": relationship_health,
        "churned": churned,
        "renewed": renewed,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/client_renewal_data.csv")
    parser.add_argument("--rows", type=int, default=500)
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [build_row(index + 1) for index in range(args.rows)]

    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {output_path}")


if __name__ == "__main__":
    main()
