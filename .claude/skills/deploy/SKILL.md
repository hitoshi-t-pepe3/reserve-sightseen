---
name: deploy
description: ReserveSightseen を Cloud Run へデプロイし、smoke test 成功まで見届ける。デプロイ・本番反映・動作確認の依頼で使う。
---

# Deploy — ReserveSightseen を Cloud Run へデプロイ

このスキルは判断の余地を減らすため、コマンド・期待出力・失敗時の対処を逐語で書いてある。
**手順を飛ばさない・順番を変えない・ここにないコマンドで代用しない。**

## 完了条件（これを満たすまで「完了」と報告しない）

1. `./deploy.sh` がエラーなく最後まで実行された
2. 出力に `=== Smoke Test 全件成功 ===` が含まれている
3. Backend / Frontend の URL をユーザーに報告した

「ビルドが通った」「gcloud がエラーを出さなかった」だけでは完了ではない。

## 手順

### Step 1: 事前確認

```bash
git status --short
gcloud config get-value project
```

- 期待: プロジェクト ID が表示される（空なら Step 4 の表を見る）
- 未コミットの変更があっても中断しない。何をデプロイするか把握するだけでよい。

### Step 2: デプロイ実行

```bash
./deploy.sh
```

- 所要時間の目安: 5〜15分（docker build を含む）。途中で止めない。
- スクリプトが自動でやること: Backend build/push/deploy → Frontend build/push/deploy
  （`--build-arg NEXT_PUBLIC_API_BASE=<Backend URL>` 付き）→ CORS 更新 → smoke test

### Step 3: 結果確認

成功時の出力末尾はこの形（URL は環境により異なる）:

```
[INFO] === Smoke Test 全件成功 ===
[INFO] === デプロイ完了 ===
Backend:  https://reserve-backend-xxxx-an.a.run.app
Frontend: https://reserve-frontend-xxxx-an.a.run.app
```

これが出たら Step 5 へ。出なかったら Step 4 へ。

### Step 4: 失敗したら（症状 → 対処の対応表）

エラーメッセージに一致する行を探し、その対処だけを行い、`./deploy.sh` を再実行する。
表にない失敗は、勝手に構成を変えず、エラー全文をユーザーに見せて指示を仰ぐ。

| 症状（エラー出力に含まれる文字列） | 対処 |
|---|---|
| `PROJECT_ID が設定されていません` | `gcloud config set project <ID>` を実行（ID はユーザーに確認） |
| `docker: command not found` / `Cannot connect to the Docker daemon` | Docker Desktop の起動をユーザーに依頼。自分で `rm` や再インストールをしない |
| `Unauthenticated request` + `artifactregistry` | `gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet` |
| `Secret ... was not found` | 不足シークレット名を特定し `printf '<値>' \| gcloud secrets create <名前> --data-file=-` の実行をユーザーに依頼（値は聞かない・チャットに貼らせない） |
| `Smoke test 失敗: /health` | `gcloud run logs read reserve-backend --region asia-northeast1 --limit 50` でログを読み、Python の例外行を特定して報告 |
| `Smoke test 失敗: /api/hotels/search-area` | 失敗した curl を単体で実行し、レスポンス JSON をそのまま貼って報告。楽天 API キー切れの可能性が高い |
| `Smoke test 失敗: Frontend が HTTP` | `gcloud run logs read reserve-frontend --region asia-northeast1 --limit 50` を確認 |
| `certificate has expired` / ネットワーク系 | 60秒待って再実行。2回失敗したらユーザーに報告 |

同じ対処で2回失敗したら、それ以上繰り返さずエラー全文を報告して止まる。

### Step 5: 成功したら

1. Backend / Frontend の URL と smoke test 結果を報告する
2. デプロイした変更をコミットする（コミットユーザーは `hitoshi-t-pepe3`）。
   コミットメッセージには何をデプロイしたかを書く

## 検証だけしたいとき（デプロイ不要のとき）

「動いてるか確認して」系の依頼はフルデプロイせず、これだけ実行する:

```bash
./deploy.sh --smoke-only
```

30秒以内に終わる。`=== Smoke Test 全件成功 ===` が出れば正常。

## 禁止事項

- シークレットの**値**を表示・出力・チャットに書くこと（名前は可）
- `REGION`・サービス名・`deploy.sh` の env 区切り記法（`^##^`）を変更すること
- フロントの API 向き先を直すために Cloud Run の環境変数だけ変えること
  （`NEXT_PUBLIC_API_BASE` はビルド時焼き込み。必ず `./deploy.sh` で再ビルドする）
- smoke test をスキップ・削除して「デプロイ完了」と報告すること
- 表にない対処を2回以上試行錯誤すること（エラー全文を報告して指示を待つ）

構成・環境変数・ローカル起動は CLAUDE.md を参照。
