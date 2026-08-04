"""
GA4 週次アクセスレポート。

認証は Application Default Credentials (ADC) を使う。
- ローカル実行: `gcloud auth application-default login` 済みであること
- GitHub Actions: google-github-actions/auth (Workload Identity Federation) が
  ワークフロー内で ADC をセットアップする

使い方:
  GA4_PROPERTY_ID=546165875 python report.py
"""

import os
import sys

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    OrderBy,
    RunReportRequest,
)

PROPERTY_ID = os.environ.get("GA4_PROPERTY_ID", "546165875")


def _property():
    return f"properties/{PROPERTY_ID}"


def fetch_totals(client: BetaAnalyticsDataClient) -> str:
    request = RunReportRequest(
        property=_property(),
        date_ranges=[
            DateRange(start_date="7daysAgo", end_date="today", name="this_week"),
            DateRange(start_date="14daysAgo", end_date="8daysAgo", name="last_week"),
        ],
        metrics=[
            Metric(name="activeUsers"),
            Metric(name="sessions"),
            Metric(name="screenPageViews"),
        ],
    )
    response = client.run_report(request)

    values = {}
    for row in response.rows:
        period = row.dimension_values[0].value
        values[period] = [mv.value for mv in row.metric_values]

    this_week = values.get("this_week", ["0", "0", "0"])
    last_week = values.get("last_week", ["0", "0", "0"])

    def diff(cur: str, prev: str) -> str:
        c, p = int(cur), int(prev)
        if p == 0:
            return "(比較対象なし)"
        pct = (c - p) / p * 100
        sign = "+" if pct >= 0 else ""
        return f"({sign}{pct:.0f}% vs 前週)"

    lines = [
        "## 全体サマリ(直近7日間)",
        f"- アクティブユーザー数: {this_week[0]} {diff(this_week[0], last_week[0])}",
        f"- セッション数: {this_week[1]} {diff(this_week[1], last_week[1])}",
        f"- ページビュー数: {this_week[2]} {diff(this_week[2], last_week[2])}",
    ]
    return "\n".join(lines)


def fetch_channels(client: BetaAnalyticsDataClient) -> str:
    request = RunReportRequest(
        property=_property(),
        date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        dimensions=[Dimension(name="sessionDefaultChannelGroup")],
        metrics=[Metric(name="sessions")],
        order_bys=[
            OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)
        ],
        limit=5,
    )
    response = client.run_report(request)

    if not response.rows:
        return "## 流入経路(直近7日間)\n- データなし"

    lines = ["## 流入経路(直近7日間、上位5件)"]
    for row in response.rows:
        channel = row.dimension_values[0].value or "(未設定)"
        sessions = row.metric_values[0].value
        lines.append(f"- {channel}: {sessions}")
    return "\n".join(lines)


def fetch_top_pages(client: BetaAnalyticsDataClient) -> str:
    request = RunReportRequest(
        property=_property(),
        date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        dimensions=[Dimension(name="pagePath")],
        metrics=[Metric(name="screenPageViews")],
        order_bys=[
            OrderBy(
                metric=OrderBy.MetricOrderBy(metric_name="screenPageViews"),
                desc=True,
            )
        ],
        limit=5,
    )
    response = client.run_report(request)

    if not response.rows:
        return "## よく見られたページ(直近7日間)\n- データなし"

    lines = ["## よく見られたページ(直近7日間、上位5件)"]
    for row in response.rows:
        path = row.dimension_values[0].value
        pv = row.metric_values[0].value
        lines.append(f"- {path}: {pv} PV")
    return "\n".join(lines)


def fetch_affiliate_clicks(client: BetaAnalyticsDataClient) -> str:
    request = RunReportRequest(
        property=_property(),
        date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        dimensions=[Dimension(name="eventName")],
        metrics=[Metric(name="eventCount")],
        dimension_filter={
            "filter": {
                "field_name": "eventName",
                "string_filter": {"value": "affiliate_click"},
            }
        },
    )
    response = client.run_report(request)

    count = "0"
    if response.rows:
        count = response.rows[0].metric_values[0].value

    return (
        "## アフィリエイトクリック(直近7日間)\n"
        f"- affiliate_click イベント数: {count}\n"
        "  (どのアフィリエイト先かの内訳を見るには GA4 でカスタムディメンション"
        " `affiliate` の登録が必要)"
    )


def main() -> None:
    client = BetaAnalyticsDataClient()

    sections = [
        fetch_totals(client),
        fetch_channels(client),
        fetch_top_pages(client),
        fetch_affiliate_clicks(client),
    ]

    print(f"# ReserveSightseen 週次アクセスレポート\n")
    print("\n\n".join(sections))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"GA4レポート取得に失敗しました: {exc}", file=sys.stderr)
        sys.exit(1)
