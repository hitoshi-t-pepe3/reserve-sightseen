# ReserveSightseen — 旅行プラン・レコメンドチャットアプリ

## 概要
チャットで旅行の相談をすると、楽天トラベル API でホテル検索、Google Places API で観光地検索を行い、おすすめプランを返す Web アプリ。

- **Backend**: FastAPI (Python 3.13) — `backend/`
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS — `frontend/`
- **チャット LLM**: Gemini（Vertex AI 経由、`backend/app/services/gemini_chat.py`）
- **本番環境**: Google Cloud Run（region: `asia-northeast1`、サービス名: `reserve-backend` / `reserve-frontend`）

## ディレクトリ構造（実際のもの）
```
.
├── deploy.sh                    # Cloud Run デプロイ + smoke test（--smoke-only で検証のみ）
├── cloudbuild.yaml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── env-vars.yaml            # ローカル用環境変数（git 管理外・コミット禁止）
│   └── app/
│       ├── main.py              # FastAPI エントリポイント（/health あり）
│       ├── config.py            # pydantic-settings。backend/.env を読む
│       ├── routes/              # chat.py, hotels.py, places.py
│       ├── services/            # gemini_chat.py（Vertex AI）
│       └── tools/               # rakuten_travel.py, google_places.py
└── frontend/
    ├── Dockerfile               # ARG NEXT_PUBLIC_API_BASE を受けてビルド
    └── src/
        ├── app/                 # page.tsx, layout.tsx
        ├── components/          # ChatWindow, HotelCard, HotelSearchPanel など
        └── lib/api.ts           # API クライアント（NEXT_PUBLIC_API_BASE を使用）
```

## ローカル起動
```bash
# Backend（要 backend/.env）
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev   # http://localhost:3000
```

## 主要 API エンドポイント
- `GET  /health`
- `POST /api/chat`, `POST /api/chat/stream`
- `GET  /api/hotels/search | /vacant | /search-area | /search-location | /vacancy/{hotel_no}`
- `GET  /api/places/search | /tourist-spots | /restaurants | /hotels | /details/{place_id}`

## 検証ルール（必須）
**「デプロイ成功」「ビルド成功」だけでは完了と見なさない。実際の応答内容の確認までが完了。**

1. Backend を変更したら:
   ```bash
   curl -s http://127.0.0.1:8000/health
   curl -s "http://127.0.0.1:8000/api/hotels/search-area?area=京都&hits=3"
   ```
   JSON の中身（`hotelName`・`hotelMinCharge` 等が実際に値を持つか）まで確認する。
2. Frontend を変更したら: `cd frontend && npm run build` が通ることを確認する。
3. デプロイ後: `./deploy.sh --smoke-only` を実行し、全件成功を確認する。
4. UI の表示崩れ・undefined 系の報告を受けたら、まず API レスポンスの実データと
   `frontend/src/lib/api.ts` の型・変換処理の突き合わせから始める。

## デプロイ
```bash
./deploy.sh               # ビルド → デプロイ → CORS 更新 → smoke test まで一括
./deploy.sh --smoke-only  # デプロイ済み環境の動作確認のみ（コスト小・まずこれ）
```

### 重要な落とし穴
- **`NEXT_PUBLIC_API_BASE` は Next.js のビルド時に JS へ焼き込まれる。**
  Cloud Run のランタイム環境変数を変えてもクライアントの API 向き先は変わらない。
  向き先を変えるときは必ず `--build-arg NEXT_PUBLIC_API_BASE=...` 付きで再ビルドする
  （deploy.sh はこれを自動で行う。手動 docker build 時は忘れやすいので注意）。
- deploy.sh はフロントエンドを Backend URL 確定後にビルドする。順序を入れ替えないこと。
- CORS エラーが出たら Cloud Run の `reserve-backend` の `CORS_ORIGINS` 環境変数を確認する。

## 環境変数・シークレット
- ローカル（Backend）: `backend/.env`（git 管理外）。キー名: `RAKUTEN_APPLICATION_ID`,
  `RAKUTEN_AFFILIATE_ID`, `RAKUTEN_ACCESS_KEY`, `GOOGLE_PLACES_API_KEY`,
  `GCP_PROJECT_ID`, `GCP_LOCATION`, `CORS_ORIGINS`
- ローカル（Frontend）: `frontend/.env.local`（git 管理外）。キー名:
  `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_GTM_ID`,
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`（散歩モードに必須）
- 本番: Secret Manager（deploy.sh が `--update-secrets` で注入）
- **ルール: API キーの値をチャット・コード・コミットに直接書かない／貼らない。**
  ローカルで値が必要なときは「`backend/.env` を読んで」と指示する形にする。
  値の更新は `.env` と Secret Manager の両方に反映する。

## Git ルール
- コミットユーザー: `hitoshi-t-pepe3` / `hitoshi.t.pepe3@gmail.com`
  （`hitoshi-ordinals-lover` アカウントは使わない）
- 動作確認（上記の検証ルール）が取れた時点でコミットする。明確なメッセージで。
- `backend/.env`, `backend/env-vars.yaml`, 認証情報ファイルはコミットしない。

## Claude Code への指示（自動実行モード）
- deploy.sh やデプロイ設定の編集・実行は確認なしで進めてよい。
- デプロイが失敗したら `gcloud run logs read reserve-backend --region asia-northeast1`
  等でエラーを読み、修正して再実行する。
- 作業完了の報告には、実行した検証コマンドとその結果を含めること。
