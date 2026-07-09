---
name: deploy
description: Cloud Run へのデプロイと動作確認（deploy.sh を実行し、smoke test 成功まで見届ける）
---

# Deploy — ReserveSightseen を Cloud Run へデプロイ

## 手順
1. 未コミットの変更内容を確認する（`git status` / `git diff`）。
2. `./deploy.sh` を実行する（Backend build → deploy → Frontend build → deploy → CORS 更新 → smoke test の順で自動実行される）。
3. 失敗したら該当ステップのエラーを読む:
   - ビルド失敗 → docker のエラー出力
   - デプロイ失敗 → `gcloud run logs read reserve-backend --region asia-northeast1 --project $PROJECT_ID`
   - smoke test 失敗 → 失敗した curl を手で叩いてレスポンスの中身を確認
4. 修正して再実行。**smoke test 全件成功までがデプロイ完了。**
5. 成功したら Backend / Frontend の URL を報告し、変更をコミットする。

## 検証のみ実行したいとき
```bash
./deploy.sh --smoke-only
```
デプロイ済み環境に対して /health・ホテル検索（hotelName の中身まで）・Frontend HTTP 200 を確認する。

## 注意
- `NEXT_PUBLIC_API_BASE` はビルド時焼き込み。フロントの API 向き先変更は必ず deploy.sh 経由で再ビルドする。
- 詳細な構成・環境変数は CLAUDE.md を参照。
