#!/usr/bin/env python3
"""scripts/niche_research.py の集計ロジックを合成データで検証する。

楽天APIキーが無い環境でも実行できる。ネットワークには一切アクセスしない。

    python3 scripts/test_niche_research.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from niche_research import (  # noqa: E402
    GENRES,
    analyze_keyword,
    classify,
    render_markdown,
    summarize_genre,
)

failures: list[str] = []


def check(label: str, actual, expected) -> None:
    if actual == expected:
        print(f"  ✓ {label}: {actual}")
    else:
        print(f"  ✗ {label}: 期待 {expected} / 実際 {actual}")
        failures.append(label)


def item(name: str, price: int, reviews: int = 0) -> dict:
    return {"itemName": name, "itemPrice": price, "reviewCount": reviews}


print("=== classify: 商品名からの純正/互換判別 ===")
check("純正表記", classify("ジレット フュージョン 替刃 純正品 8個入"), "genuine")
check("互換表記", classify("ジレット フュージョン 互換 替刃 16個"), "compatible")
check("汎用表記", classify("シェーバー 替刃 汎用 5個セット"), "compatible")
check("非純正表記", classify("空気清浄機 フィルター 非純正"), "compatible")
check("判別不能", classify("ジレット 替刃 8個入"), "unknown")
# 「純正互換」は互換品側。互換を先に判定する実装が効いているか
check("純正互換は互換扱い", classify("純正互換 カートリッジ 3個"), "compatible")
check("正規品は純正扱い", classify("ブラウン オーラルB 正規品 替えブラシ"), "genuine")

print("\n=== analyze_keyword: 1キーワード分の集計 ===")
razor = next(g for g in GENRES if g.key == "razor")
items = [
    item("ジレット フュージョン 替刃 純正品 4個", 2000, 120),
    item("ジレット フュージョン 替刃 純正品 8個", 4000, 80),
    item("ジレット フュージョン 互換 替刃 8個", 1000, 300),
    item("ジレット フュージョン 互換 替刃 16個", 1500, 200),
    item("カミソリ 替刃 セット", 900, 10),
    item("壊れたデータ", 0, 5),  # price<=0 は除外されるはず
]
result = analyze_keyword(items, razor)
check("価格が有効な件数", result["items_counted"], 5)
check("純正の件数", result["genuine_count"], 2)
check("互換の件数", result["compatible_count"], 2)
check("純正の中央値", result["genuine_median"], 3000)
check("互換の中央値", result["compatible_median"], 1250)
check("価格差(純正/互換)", result["price_ratio_genuine_over_compatible"], 2.4)
check("レビュー総数", result["review_total"], 710)
check("最安値", result["price_min"], 900)
check("最高値", result["price_max"], 4000)
# 「ジレット」は global_brands に含まれるので5件すべてヒットしない（"カミソリ 替刃 セット" は非該当）
check("グローバルブランドヒット", result["global_brand_hits"], 4)

print("\n=== summarize_genre: ジャンル単位の判定 ===")
# 4KW中3KWが価格差1.5倍以上 → 合格率75% → PASS
passing = {
    "kw1": analyze_keyword(
        [item("純正 替刃", 3000), item("互換 替刃", 1000)], razor
    ),
    "kw2": analyze_keyword(
        [item("純正 替刃", 2000), item("互換 替刃", 1000)], razor
    ),
    "kw3": analyze_keyword(
        [item("純正 替刃", 4000), item("互換 替刃", 1000)], razor
    ),
    "kw4": analyze_keyword(
        [item("純正 替刃", 1100), item("互換 替刃", 1000)], razor
    ),
}
summary = summarize_genre(passing)
check("計測KW数", summary["keywords_measured"], 4)
check("純正/互換 両在KW", summary["keywords_with_both_genuine_and_compatible"], 4)
check("価格差1.5倍以上のKW", summary["keywords_meeting_price_gap"], 3)
check("合格率", summary["price_gap_pass_rate"], 0.75)
check("判定", summary["verdict_price_gap"], "PASS")

# 1KWのみ合格 → 合格率25% → FAIL
failing = {"kw1": passing["kw1"], "kw2": passing["kw4"], "kw3": passing["kw4"], "kw4": passing["kw4"]}
check("不合格ジャンルの判定", summarize_genre(failing)["verdict_price_gap"], "FAIL")

print("\n=== 境界値: 純正のみ / 互換のみ / 空 ===")
only_genuine = analyze_keyword([item("純正 替刃", 3000)], razor)
check("互換不在なら価格差はNone", only_genuine["price_ratio_genuine_over_compatible"], None)
check("互換不在でも純正中央値は出る", only_genuine["genuine_median"], 3000)
empty = analyze_keyword([], razor)
check("空入力の件数", empty["items_counted"], 0)
check("空入力の中央値", empty["price_median"], None)
empty_summary = summarize_genre({})
check("空ジャンルでもゼロ除算しない", empty_summary["price_gap_pass_rate"], 0.0)
check("空ジャンルの判定", empty_summary["verdict_price_gap"], "FAIL")

print("\n=== render_markdown: 表が組み立てられるか ===")
md = render_markdown(
    {
        "measured_at": "2026-08-02 00:00:00",
        "endpoint": "https://example.invalid/api",
        "genres": {"razor": {"label": "カミソリ替刃", "summary": summary}},
    }
)
check("表ヘッダを含む", "| ジャンル |" in md, True)
check("ジャンル名を含む", "カミソリ替刃" in md, True)
check("判定を含む", "**PASS**" in md, True)

print("\n" + "=" * 50)
if failures:
    print(f"FAILED: {len(failures)} 件 → {', '.join(failures)}")
    sys.exit(1)
print("全テスト通過")
