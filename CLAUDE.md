# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

旅行プランのレコメンド・エージェント。ユーザーの行き先検索から、パーソナライズされた旅行プランの提案、予約手配までを一貫してサポートする AI エージェント。

## Tech Stack

- **Backend**: Python (FastAPI)
- **Frontend**: Next.js (TypeScript)
- **Agent Framework**: Claude API (tool use)
- **対象**: 国内旅行

## External APIs

### 宿泊施設検索・予約

| API | 運営 | 特徴 | 審査 | 優先度 |
|-----|------|------|------|--------|
| 楽天トラベル施設検索API | 楽天 | 国内最大級の在庫、無料、アフィリエイト収益可 | 中程度 | ★★★ |
| じゃらんWebサービス | リクルート | 温泉宿に強み、豊富な検索条件、個人でも通りやすい | 比較的易 | ★★★ |
| Agoda Affiliate API | Agoda | アジア・グローバル対応、個人申請可 | 易 | ★☆☆ (国内メインなら不要) |

どちらもアフィリエイト型で決済はAPI提供側が処理するため、予約実行はAPI提供元のページへの遷移になる。
**両方併用推奨**（在庫の補完と料金比較のため）。

### 観光スポット・飲食店検索

- **Google Places API (New)** — 観光スポット、レストラン、口コミ情報の検索。Pythonクライアントあり。従量課金。

### 航空券

- JAL/ANA ともに個人開発者向けの公開APIはなし。航空券は**スキップ**もしくは旅行比較サイトへのアフィリエイトリンクで対応。

## Architecture

エージェントはツール呼び出し型のアーキテクチャをとり、以下のツール群を持つ:

- **SearchTools** — 目的地・観光スポット（Google Places）・宿泊施設（楽天/じゃらん）の検索
- **PlanTools** — 旅程の生成・編集・最適化（LLM によるプラン生成）
- **BookingTools** — 空室確認・価格比較・予約ページへの誘導（アフィリエイトリンク）

### ディレクトリ構成（予定）

```
backend/          # Python FastAPI
  app/
    tools/        # エージェントツール（search, plan, booking）
    routes/       # API エンドポイント
    models/       # Pydantic モデル
frontend/         # Next.js
  app/            # App Router
  components/     # UI コンポーネント
```

## Key Design Decisions

- エージェントはユーザーとの対話を通じて嗜好を学習し、プランを段階的に絞り込む
- 予約操作は確認フェーズを必須とし、ユーザーの明示的な承認なしに実行しない
- 外部 API 呼び出しはレート制限とエラーハンドリングを考慮した設計にする
- 宿泊APIは楽天トラベルとじゃらんの両方を統合し、料金比較を可能にする