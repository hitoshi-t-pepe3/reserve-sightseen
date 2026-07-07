#!/bin/bash
# ================================================================
# ReserveSightseen - Cloud Run デプロイスクリプト
# ================================================================
# 事前準備:
# 1. gcloud auth login && gcloud config set project YOUR_PROJECT_ID
# 2. API キーを Secret Manager に登録
# 3. Artifact Registry リポジトリ作成
# ================================================================

set -euo pipefail

# 設定（環境変数で上書き可能）
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-northeast1}"
REPO_NAME="reserve-sightseen"
BACKEND_SERVICE="reserve-backend"
FRONTEND_SERVICE="reserve-frontend"

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# 必須チェック
[[ -z "$PROJECT_ID" ]] && error "PROJECT_ID が設定されていません。export PROJECT_ID=your-project-id してください。"

log "Project: $PROJECT_ID"
log "Region:  $REGION"

# 1. Artifact Registry リポジトリ作成（初回のみ）
log "Artifact Registry リポジトリ確認..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" &>/dev/null; then
  log "リポジトリ作成: $REPO_NAME"
  gcloud artifacts repositories create "$REPO_NAME" \
    --location="$REGION" --repository-format=docker || error "リポジトリ作成失敗"
else
  log "リポジトリは既に存在します"
fi

# 2. Secret Manager に API キー登録（初回のみ、未登録なら）
log "Secret Manager 確認..."
for secret in RAKUTEN_APPLICATION_ID RAKUTEN_AFFILIATE_ID RAKUTEN_ACCESS_KEY GOOGLE_PLACES_API_KEY ANTHROPIC_API_KEY; do
  if ! gcloud secrets describe "$secret" &>/dev/null; then
    warn "Secret '$secret' が存在しません。手動で作成してください:"
    echo "  printf 'YOUR_VALUE' | gcloud secrets create $secret --data-file=-"
  else
    log "Secret '$secret' 已存在"
  fi
done

# 3. Backend ビルド & Push
log "=== Backend Build & Push ==="
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/backend:latest"
docker buildx build --platform linux/amd64 -t "$BACKEND_IMAGE" ./backend --load
    docker push "$BACKEND_IMAGE"


# 4. Frontend Build & Push
log "=== Frontend Build & Push ==="
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/frontend:latest"
docker buildx build --platform linux/amd64 -t "$FRONTEND_IMAGE" ./frontend --load
    docker push "$FRONTEND_IMAGE"


# 5. Backend Deploy
log "=== Backend Deploy to Cloud Run ==="
gcloud run deploy "$BACKEND_SERVICE" \
  --image="$BACKEND_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="CORS_ORIGINS=["https://${FRONTEND_SERVICE}-${REGION}-${PROJECT_ID}.a.run.app"]" \
  --update-secrets=RAKUTEN_APPLICATION_ID=RAKUTEN_APPLICATION_ID:latest,RAKUTEN_AFFILIATE_ID=RAKUTEN_AFFILIATE_ID:latest,RAKUTEN_ACCESS_KEY=RAKUTEN_ACCESS_KEY:latest,GOOGLE_PLACES_API_KEY=GOOGLE_PLACES_API_KEY:latest \
  --project="$PROJECT_ID"

# Backend URL 取得
BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" --region="$REGION" --format='value(status.url)' --project="$PROJECT_ID")
log "Backend URL: $BACKEND_URL"

# 6. Frontend Deploy
log "=== Frontend Deploy to Cloud Run ==="
gcloud run deploy "$FRONTEND_SERVICE" \
  --image="$FRONTEND_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="NEXT_PUBLIC_API_BASE=$BACKEND_URL" \
  --project="$PROJECT_ID"

# Frontend URL 取得
FRONTEND_URL=$(gcloud run services describe "$FRONTEND_SERVICE" --region="$REGION" --format='value(status.url)' --project="$PROJECT_ID")
log "Frontend URL: $FRONTEND_URL"

# 7. Backend CORS 更新（Frontend URL を許可）
log "=== Backend CORS 更新 ==="
gcloud run services update "$BACKEND_SERVICE" \
  --region="$REGION" \
  --update-env-vars="CORS_ORIGINS=$FRONTEND_URL" \
  --project="$PROJECT_ID"

# 完了
log "=== デプロイ完了 ==="
echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo ""
echo "動作確認:"
echo "  curl $BACKEND_URL/health"
echo "  open $FRONTEND_URL"