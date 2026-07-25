# GitHub Actions によるCloud Runへの自動デプロイ

このプロジェクトは GitHub Actions を使用して、push をトリガーに自動的に Google Cloud Run にデプロイします。

## 設定手順

### 1. Workload Identity Federation (WIF) のセットアップ

GitHub Actions から Google Cloud に認証するため、Workload Identity Federation を設定します。

#### Google Cloud 側の設定:

```bash
# プロジェクト ID
export PROJECT_ID="project-0b8e0ea7-1637-468c-b16"
export REGION="asia-northeast1"

# Workload Identity Pool を作成
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Workload Identity Provider を作成
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.aud=assertion.aud,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# サービスアカウントを作成（またはスキップして既存を使用）
gcloud iam service-accounts create "github-actions" \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Actions Deployer"

# サービスアカウントに Cloud Run デプロイ権限を付与
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# WIF を GitHub リポジトリに紐付け
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_ID}/locations/global/workloadIdentityPools/github-pool/attribute.repository/hitoshi-t-pepe3/reserve-sightseen"

# WIF Provider URI を取得
gcloud iam workload-identity-pools describe "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --format='value(name)'
```

### 2. GitHub Secrets の設定

リポジトリの Settings → Secrets and Variables → Actions で以下を追加:

| Secret 名 | 値 |
|---------|-----|
| `GCP_PROJECT_ID` | `project-0b8e0ea7-1637-468c-b16` |
| `GTM_ID` | `GTM-N6Z6JS76` |
| `WIF_PROVIDER` | ステップ1で取得した WIF Provider URI |
| `WIF_SERVICE_ACCOUNT` | `github-actions@project-0b8e0ea7-1637-468c-b16.iam.gserviceaccount.com` |

### 3. デプロイのトリガー

以下のタイミングで自動デプロイが実行されます:

- **Push**: `main` または `master` ブランチへの push
- **手動実行**: GitHub Actions タブから「Run workflow」で手動トリガー

## デプロイログの確認

GitHub リポジトリ → Actions タブで、デプロイの進行状況とログを確認できます。

## トラブルシューティング

### デプロイが失敗する場合

1. **GitHub Secrets の確認**
   - WIF_PROVIDER、WIF_SERVICE_ACCOUNT が正しく設定されているか
   - GCP_PROJECT_ID が正しいか

2. **権限の確認**
   ```bash
   gcloud iam service-accounts get-iam-policy \
     "github-actions@${PROJECT_ID}.iam.gserviceaccount.com"
   ```

3. **Cloud Run サービスの確認**
   ```bash
   gcloud run services list --region=${REGION}
   ```

## 環境変数

### 固定値
- `REGION`: `asia-northeast1`

### Secrets から取得
- `PROJECT_ID`: GitHub Secrets の `GCP_PROJECT_ID`
- `GTM_ID`: GitHub Secrets の `GTM_ID`

## 参考資料

- [Google Cloud - Workload Identity Federation for GitHub Actions](https://cloud.google.com/docs/authentication/workload-identity-federation)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
