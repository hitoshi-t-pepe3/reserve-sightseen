#!/usr/bin/env python3
"""Phase 0 調査A: アフィリエイトサイトのジャンル選定を楽天商品検索APIの実データで裏取りする。

docs/affiliate-site-strategy.md の Phase 0 に対応。候補ジャンルを横並びで計測し、
「純正と互換の両方が存在し、価格差が大きい」ジャンルを実データで特定する。

使い方:
    python3 scripts/niche_research.py                    # 全ジャンル
    python3 scripts/niche_research.py --genre razor      # 単一ジャンル
    python3 scripts/niche_research.py --out docs/x.json  # 出力先を指定

前提:
    backend/.env に RAKUTEN_APPLICATION_ID が必要（git 管理外）。
    キーの値は一切出力しない。

重要な制約:
    楽天ウェブサービスは 1 applicationId につき 1秒1リクエスト。超過で HTTP 429、
    継続違反で applicationId が利用停止になる。実運用では 1.2 秒以上空けるのが安全。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "backend" / ".env"

# 旧ドメイン app.rakuten.co.jp と旧バージョンは 2026/5/14 に完全停止済みのため新ドメインを使う。
# エンドポイントは環境変数 RAKUTEN_ITEM_SEARCH_URL で上書きできる（バージョン改定への備え）。
DEFAULT_ENDPOINT = "https://openapi.rakuten.co.jp/engine/api/IchibaItem/Search/20260401"

# 1 applicationId あたり 1秒1リクエスト。実測では 1.2 秒未満で 429 が出るとの報告がある。
THROTTLE_SECONDS = 1.3

# 互換品／純正品を商品名から判別するための語彙。
# 楽天の商品名は「互換」「対応」等を必ず入れる傾向があるため、これで概ね分類できる。
COMPATIBLE_PATTERNS = re.compile(r"互換|非純正|汎用|対応品|サードパーティ|generic", re.IGNORECASE)
GENUINE_PATTERNS = re.compile(r"純正|正規品|メーカー純正|国内正規", re.IGNORECASE)


@dataclass
class Genre:
    """調査対象ジャンル。keywords は「本体型番 + 消耗品」を想定した実クエリ。"""

    key: str
    label: str
    keywords: list[str]
    # そのジャンルの主要メーカーのうち、世界共通型番で展開しているもの（§7 の英語展開判定に使う）
    global_brands: list[str] = field(default_factory=list)
    domestic_brands: list[str] = field(default_factory=list)


GENRES: list[Genre] = [
    Genre(
        key="razor",
        label="カミソリ替刃",
        keywords=[
            "ジレット フュージョン 替刃",
            "ジレット プログライド 替刃",
            "ジレット スキンガード 替刃",
            "シック ハイドロ5 替刃",
            "シック クアトロ4 替刃",
            "フェザー エフシステム 替刃",
            "貝印 K-シリーズ 替刃",
            "ジレット マッハ3 替刃",
        ],
        global_brands=["ジレット", "Gillette", "シック", "Schick"],
        domestic_brands=["フェザー", "貝印"],
    ),
    Genre(
        key="toothbrush",
        label="電動歯ブラシ替えブラシ",
        keywords=[
            "ソニッケアー 替えブラシ",
            "オーラルB 替えブラシ",
            "オーラルB iO 替えブラシ",
            "ドルツ 替えブラシ EW0917",
            "オムロン 音波式 替えブラシ",
            "ソニッケアー ダイヤモンドクリーン 替えブラシ",
            "ブラウン オーラルB ベーシック 替えブラシ",
        ],
        global_brands=["フィリップス", "Philips", "ブラウン", "Braun", "オーラルB"],
        domestic_brands=["パナソニック", "ドルツ", "オムロン"],
    ),
    Genre(
        key="air_purifier",
        label="空気清浄機フィルター",
        keywords=[
            "シャープ 空気清浄機 集じんフィルター FZ",
            "シャープ 加湿フィルター FZ-Y80MF",
            "ダイキン 空気清浄機 フィルター KAFP029A4",
            "ダイキン 加湿フィルター KNME043A4",
            "パナソニック 空気清浄機 フィルター F-ZXJP",
            "空気清浄機 フィルター 互換",
        ],
        global_brands=["ダイキン", "DAIKIN", "パナソニック", "Panasonic"],
        domestic_brands=["シャープ", "SHARP"],
    ),
    Genre(
        key="water_filter",
        label="浄水器カートリッジ",
        keywords=[
            "トレビーノ カートリッジ",
            "クリンスイ カートリッジ",
            "ブリタ マクストラ カートリッジ",
            "パナソニック 浄水器 カートリッジ TK",
            "浄水器 カートリッジ 互換",
        ],
        global_brands=["ブリタ", "BRITA"],
        domestic_brands=["トレビーノ", "東レ", "クリンスイ", "三菱ケミカル", "パナソニック"],
    ),
    Genre(
        key="vacuum_bag",
        label="掃除機紙パック",
        keywords=[
            "掃除機 紙パック 各社共通",
            "パナソニック 掃除機 紙パック AMC",
            "日立 掃除機 紙パック GP",
            "三菱 掃除機 紙パック MP",
            "掃除機 紙パック 互換",
        ],
        global_brands=[],
        domestic_brands=["パナソニック", "日立", "三菱", "東芝"],
    ),
]


def load_application_id() -> str:
    """backend/.env から RAKUTEN_APPLICATION_ID を読む。値は絶対に出力しない。"""
    app_id = os.environ.get("RAKUTEN_APPLICATION_ID", "").strip()
    if app_id:
        return app_id

    if not ENV_PATH.exists():
        sys.exit(
            f"RAKUTEN_APPLICATION_ID が見つかりません。\n"
            f"  - {ENV_PATH} が存在しないか、環境変数が未設定です。\n"
            f"  - backend/.env は git 管理外のため、クローン直後のコンテナには存在しません。\n"
            f"  - 環境変数で渡す場合: RAKUTEN_APPLICATION_ID=... python3 scripts/niche_research.py"
        )

    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "RAKUTEN_APPLICATION_ID":
            value = value.strip().strip('"').strip("'")
            if value:
                return value

    sys.exit(f"{ENV_PATH} に RAKUTEN_APPLICATION_ID の値が設定されていません。")


def classify(item_name: str) -> str:
    """商品名から 純正 / 互換 / 不明 を判別する。"""
    # 「純正互換」のような表記があるため互換を先に見る
    if COMPATIBLE_PATTERNS.search(item_name):
        return "compatible"
    if GENUINE_PATTERNS.search(item_name):
        return "genuine"
    return "unknown"


def search_items(
    client: httpx.Client, endpoint: str, app_id: str, keyword: str, hits: int = 30
) -> list[dict[str, Any]]:
    """楽天商品検索API を1回叩く。affiliateId は付けない（計測のみでリンクは作らないため）。"""
    params = {
        "applicationId": app_id,
        "keyword": keyword,
        "hits": hits,
        "format": "json",
        "formatVersion": 2,
        "sort": "standard",
    }
    response = client.get(endpoint, params=params, timeout=30.0)

    if response.status_code == 429:
        raise RuntimeError(
            "HTTP 429 (Too Many Requests)。スロットリングが不足しています。"
            f" THROTTLE_SECONDS={THROTTLE_SECONDS} を増やして再実行してください。"
        )
    if response.status_code == 404:
        raise RuntimeError(
            f"HTTP 404。エンドポイントが正しくない可能性があります: {endpoint}\n"
            "楽天のAPIバージョン改定に追随してください。"
            " RAKUTEN_ITEM_SEARCH_URL 環境変数で上書きできます。"
        )
    response.raise_for_status()

    payload = response.json()
    # formatVersion=2 では Items が辞書のリストで返る
    return payload.get("Items", []) or []


def analyze_keyword(items: Iterable[dict[str, Any]], genre: Genre) -> dict[str, Any]:
    """1キーワード分の計測結果を集計する。"""
    prices: list[int] = []
    reviews = 0
    genuine_prices: list[int] = []
    compatible_prices: list[int] = []
    global_hits = 0
    total = 0

    for item in items:
        name = item.get("itemName") or ""
        price = item.get("itemPrice")
        if not isinstance(price, int) or price <= 0:
            continue

        total += 1
        prices.append(price)
        reviews += item.get("reviewCount") or 0

        kind = classify(name)
        if kind == "genuine":
            genuine_prices.append(price)
        elif kind == "compatible":
            compatible_prices.append(price)

        if any(brand.lower() in name.lower() for brand in genre.global_brands):
            global_hits += 1

    def median(values: list[int]) -> int | None:
        return int(statistics.median(values)) if values else None

    genuine_median = median(genuine_prices)
    compatible_median = median(compatible_prices)
    price_ratio = None
    if genuine_median and compatible_median:
        price_ratio = round(genuine_median / compatible_median, 2)

    return {
        "items_counted": total,
        "price_min": min(prices) if prices else None,
        "price_max": max(prices) if prices else None,
        "price_median": median(prices),
        "review_total": reviews,
        "genuine_count": len(genuine_prices),
        "compatible_count": len(compatible_prices),
        "genuine_median": genuine_median,
        "compatible_median": compatible_median,
        # 純正が互換の何倍か。1.5 以上が計画上の合格ライン。
        "price_ratio_genuine_over_compatible": price_ratio,
        "global_brand_hits": global_hits,
    }


def summarize_genre(keyword_results: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """ジャンル単位で判定基準に照らした集計を出す。"""
    ratios = [
        r["price_ratio_genuine_over_compatible"]
        for r in keyword_results.values()
        if r["price_ratio_genuine_over_compatible"]
    ]
    both_exist = [
        k
        for k, r in keyword_results.items()
        if r["genuine_count"] > 0 and r["compatible_count"] > 0
    ]
    qualifying = [
        k
        for k, r in keyword_results.items()
        if (r["price_ratio_genuine_over_compatible"] or 0) >= 1.5
    ]
    total_items = sum(r["items_counted"] for r in keyword_results.values())
    global_hits = sum(r["global_brand_hits"] for r in keyword_results.values())

    keyword_count = len(keyword_results) or 1
    return {
        "keywords_measured": len(keyword_results),
        "review_total": sum(r["review_total"] for r in keyword_results.values()),
        "keywords_with_both_genuine_and_compatible": len(both_exist),
        # 判定基準②: 純正と互換の両方が存在し価格差1.5倍以上のキーワードが50%以上
        "keywords_meeting_price_gap": len(qualifying),
        "price_gap_pass_rate": round(len(qualifying) / keyword_count, 2),
        "median_price_ratio": round(statistics.median(ratios), 2) if ratios else None,
        # 判定基準④: 同点ならグローバルブランド比率が高い方を選ぶ
        "global_brand_ratio": round(global_hits / total_items, 2) if total_items else None,
        "verdict_price_gap": "PASS" if len(qualifying) / keyword_count >= 0.5 else "FAIL",
    }


def render_markdown(results: dict[str, Any]) -> str:
    """レポートに貼れる Markdown 表を組み立てる。"""
    lines = [
        "### 調査A: 楽天商品検索API 実測結果",
        "",
        "| ジャンル | 計測KW数 | レビュー総数 | 純正/互換 両在KW | 価格差1.5倍以上KW | 合格率 | 価格差中央値 | グローバルbrand比率 | 判定 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for genre_key, data in results["genres"].items():
        s = data["summary"]
        lines.append(
            f"| {data['label']} | {s['keywords_measured']} | {s['review_total']:,} | "
            f"{s['keywords_with_both_genuine_and_compatible']} | {s['keywords_meeting_price_gap']} | "
            f"{s['price_gap_pass_rate']:.0%} | "
            f"{s['median_price_ratio'] if s['median_price_ratio'] else '—'} | "
            f"{s['global_brand_ratio'] if s['global_brand_ratio'] is not None else '—'} | "
            f"**{s['verdict_price_gap']}** |"
        )
    lines.append("")
    lines.append(f"計測日時: {results['measured_at']}  /  エンドポイント: `{results['endpoint']}`")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 0 調査A: 楽天APIでジャンルを実測する")
    parser.add_argument("--genre", help=f"単一ジャンルのみ計測 ({', '.join(g.key for g in GENRES)})")
    parser.add_argument("--hits", type=int, default=30, help="1キーワードあたりの取得件数 (default: 30)")
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "docs" / "niche-research-raw.json"),
        help="生データJSONの出力先",
    )
    args = parser.parse_args()

    targets = GENRES
    if args.genre:
        targets = [g for g in GENRES if g.key == args.genre]
        if not targets:
            sys.exit(f"未知のジャンル: {args.genre}")

    app_id = load_application_id()
    endpoint = os.environ.get("RAKUTEN_ITEM_SEARCH_URL", DEFAULT_ENDPOINT)

    total_requests = sum(len(g.keywords) for g in targets)
    print(f"計測対象: {len(targets)} ジャンル / {total_requests} リクエスト")
    print(f"スロットリング: {THROTTLE_SECONDS}秒 → 所要 約{int(total_requests * THROTTLE_SECONDS)}秒")
    print(f"エンドポイント: {endpoint}\n")

    results: dict[str, Any] = {
        "measured_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "endpoint": endpoint,
        "hits_per_keyword": args.hits,
        "genres": {},
    }

    with httpx.Client() as client:
        for genre in targets:
            print(f"[{genre.label}]")
            keyword_results: dict[str, dict[str, Any]] = {}

            for i, keyword in enumerate(genre.keywords):
                if i > 0 or results["genres"]:
                    time.sleep(THROTTLE_SECONDS)
                try:
                    items = search_items(client, endpoint, app_id, keyword, args.hits)
                except RuntimeError as exc:
                    print(f"  ✗ {keyword}: {exc}")
                    return 1
                except httpx.HTTPError as exc:
                    print(f"  ✗ {keyword}: 通信エラー {exc}")
                    continue

                analysis = analyze_keyword(items, genre)
                keyword_results[keyword] = analysis
                ratio = analysis["price_ratio_genuine_over_compatible"]
                print(
                    f"  ✓ {keyword}: {analysis['items_counted']}件 "
                    f"純正{analysis['genuine_count']}/互換{analysis['compatible_count']} "
                    f"価格差{ratio if ratio else '—'} "
                    f"レビュー{analysis['review_total']:,}"
                )

            summary = summarize_genre(keyword_results)
            results["genres"][genre.key] = {
                "label": genre.label,
                "keywords": keyword_results,
                "summary": summary,
            }
            print(f"  → 判定: {summary['verdict_price_gap']} (合格率 {summary['price_gap_pass_rate']:.0%})\n")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    print(render_markdown(results))
    print(f"\n生データ: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
