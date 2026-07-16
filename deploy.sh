#!/bin/bash
# ================================================================
# ReserveSightseen - Cloud Run デプロイスクリプト
# ================================================================
# 使い方:
#   ./deploy.sh                # ビルド → デプロイ → smoke test まで一括
#   ./deploy.sh --backend-only  # Backend だけビルド・デプロイ（Frontendは既存のまま）
#   ./deploy.sh --frontend-only # Frontend だけビルド・デプロイ（既存の Backend URL 焼き込み）
#   ./deploy.sh --smoke-only   # デプロイ済み環境の動作確認のみ
#
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

service_url() {
  gcloud run services describe "$1" --region="$REGION" \
    --format='value(status.url)' --project="$PROJECT_ID"
}

# ================================================================
# Smoke Test: デプロイ後の動作確認
# 「デプロイ成功 = 完了」ではなく、実際の応答内容まで検証する
# ================================================================
smoke_test() {
  local backend_url="$1" frontend_url="$2"
  log "=== Smoke Test ==="

  # 1. Backend health
  local health
  health=$(curl -fsS --max-time 15 "$backend_url/health") \
    || error "Smoke test 失敗: $backend_url/health に到達できません"
  [[ "$health" == *'"ok"'* ]] || error "Smoke test 失敗: /health 応答が不正: $health"
  log "OK: /health"

  # 2. ホテル検索: 件数 > 0 かつ 1件目に hotelName が入っていること
  #    (area=京都 を URL エンコード済み)
  curl -fsS --max-time 30 \
    "$backend_url/api/hotels/search-area?area=%E4%BA%AC%E9%83%BD&hits=3" \
    | python3 -c '
import json, sys
d = json.load(sys.stdin)
hotels = d.get("hotels", [])
assert d.get("count", 0) > 0 and hotels, "検索結果が0件"
name = (hotels[0].get("hotelBasicInfo") or {}).get("hotelName")
assert name, f"hotelName が空: 1件目の keys={list(hotels[0].keys())}"
print(f"OK: search-area(京都) {d['\''count'\'']}件 / 1件目: {name}")
' || error "Smoke test 失敗: /api/hotels/search-area の応答が不正です"

  # 3. Frontend が HTTP 200 を返すこと
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$frontend_url") || code="000"
  [[ "$code" == "200" ]] || error "Smoke test 失敗: Frontend が HTTP $code ($frontend_url)"
  log "OK: Frontend HTTP 200"

  log "=== Smoke Test 全件成功 ==="
}

# ================================================================
# Backend / Frontend のビルド・デプロイ（--backend-only / --frontend-only と
# 通常の一括デプロイの両方から呼ばれる共通処理）
# ================================================================
build_and_deploy_backend() {
  log "=== Backend Build & Push ==="
  local backend_image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/backend:latest"
  docker buildx build --platform linux/amd64 -t "$backend_image" ./backend --load
  docker push "$backend_image"

  # CORS_ORIGINS はここでは仮値。--set-env-vars は全環境変数を置き換えるため、
  # 呼び出し側は必ず update_backend_cors で実際の Frontend URL に上書きすること
  # （--backend-only 単体で忘れると本番の CORS が壊れる。過去に実際に発生した事故）
  log "=== Backend Deploy to Cloud Run ==="
  gcloud run deploy "$BACKEND_SERVICE" \
    --image="$backend_image" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8000 \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --set-env-vars="^##^CORS_ORIGINS=http://localhost:3000##GCP_PROJECT_ID=${PROJECT_ID}##GCP_LOCATION=us-central1" \
    --update-secrets=RAKUTEN_APPLICATION_ID=RAKUTEN_APPLICATION_ID:latest,RAKUTEN_AFFILIATE_ID=RAKUTEN_AFFILIATE_ID:latest,RAKUTEN_ACCESS_KEY=RAKUTEN_ACCESS_KEY:latest,GOOGLE_PLACES_API_KEY=GOOGLE_PLACES_API_KEY:latest \
    --project="$PROJECT_ID"

  BACKEND_URL=$(service_url "$BACKEND_SERVICE")
  log "Backend URL: $BACKEND_URL"
}

# NEXT_PUBLIC_API_BASE は Next.js のビルド時に JS へ焼き込まれるため、
# 必ず Backend URL 確定後に --build-arg で渡してビルドする。
# （ランタイム環境変数だけではクライアント側の向き先は変わらない）
build_and_deploy_frontend() {
  local backend_url="$1"
  log "=== Frontend Build & Push (API_BASE=$backend_url) ==="
  local frontend_image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/frontend:latest"
  docker buildx build --platform linux/amd64 \
    --build-arg NEXT_PUBLIC_API_BASE="$backend_url" \
    -t "$frontend_image" ./frontend --load
  docker push "$frontend_image"

  log "=== Frontend Deploy to Cloud Run ==="
  gcloud run deploy "$FRONTEND_SERVICE" \
    --image="$frontend_image" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --port=3000 \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --set-env-vars="NEXT_PUBLIC_API_BASE=$backend_url" \
    --project="$PROJECT_ID"

  FRONTEND_URL=$(service_url "$FRONTEND_SERVICE")
  log "Frontend URL: $FRONTEND_URL"
}

update_backend_cors() {
  local frontend_url="$1"
  log "=== Backend CORS 更新 ==="
  gcloud run services update "$BACKEND_SERVICE" \
    --region="$REGION" \
    --update-env-vars="CORS_ORIGINS=$frontend_url" \
    --project="$PROJECT_ID"
}

check_repo_and_secrets() {
  log "Artifact Registry リポジトリ確認..."
  if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" &>/dev/null; then
    log "リポジトリ作成: $REPO_NAME"
    gcloud artifacts repositories create "$REPO_NAME" \
      --location="$REGION" --repository-format=docker || error "リポジトリ作成失敗"
  else
    log "リポジトリは既に存在します"
  fi

  log "Secret Manager 確認..."
  for secret in RAKUTEN_APPLICATION_ID RAKUTEN_AFFILIATE_ID RAKUTEN_ACCESS_KEY GOOGLE_PLACES_API_KEY; do
    if ! gcloud secrets describe "$secret" &>/dev/null; then
      warn "Secret '$secret' が存在しません。手動で作成してください:"
      echo "  printf 'YOUR_VALUE' | gcloud secrets create $secret --data-file=-"
    else
      log "Secret '$secret' 已存在"
    fi
  done
}

print_summary() {
  log "=== デプロイ完了 ==="
  echo "Backend:  $BACKEND_URL"
  echo "Frontend: $FRONTEND_URL"
  echo ""
  echo "動作確認:"
  echo "  ./deploy.sh --smoke-only"
  echo "  open $FRONTEND_URL"
}

# ================================================================
# モード分岐
# ================================================================
MODE="${1:-}"

if [[ "$MODE" == "--smoke-only" ]]; then
  # デプロイせず動作確認だけ実行
  BACKEND_URL=$(service_url "$BACKEND_SERVICE")
  FRONTEND_URL=$(service_url "$FRONTEND_SERVICE")
  log "Backend:  $BACKEND_URL"
  log "Frontend: $FRONTEND_URL"
  smoke_test "$BACKEND_URL" "$FRONTEND_URL"
  exit 0
fi

log "Project: $PROJECT_ID"
log "Region:  $REGION"

if [[ "$MODE" == "--backend-only" ]]; then
  # Frontend は既存のものをそのまま使う（再ビルドしない）
  check_repo_and_secrets
  build_and_deploy_backend
  FRONTEND_URL=$(service_url "$FRONTEND_SERVICE") \
    || error "Frontend が見つかりません。先に ./deploy.sh（引数なし）で一度フルデプロイしてください。"
  log "Frontend URL（既存）: $FRONTEND_URL"
  # build_and_deploy_backend は --set-env-vars で CORS_ORIGINS を仮値
  # (http://localhost:3000) に戻してしまうため、既存の Frontend URL で必ず上書きする
  update_backend_cors "$FRONTEND_URL"
  smoke_test "$BACKEND_URL" "$FRONTEND_URL"
  print_summary
  exit 0
fi

if [[ "$MODE" == "--frontend-only" ]]; then
  # Backend は既存のものをそのまま使う（再ビルドしない）。
  # NEXT_PUBLIC_API_BASE には既存の Backend URL を焼き込む
  BACKEND_URL=$(service_url "$BACKEND_SERVICE") \
    || error "Backend が見つかりません。先に ./deploy.sh（引数なし）で一度フルデプロイしてください。"
  log "Backend URL（既存）: $BACKEND_URL"
  build_and_deploy_frontend "$BACKEND_URL"
  update_backend_cors "$FRONTEND_URL"
  smoke_test "$BACKEND_URL" "$FRONTEND_URL"
  print_summary
  exit 0
fi

# 引数なし: フルデプロイ（Backend → Frontend → CORS更新 → smoke test）
check_repo_and_secrets
build_and_deploy_backend
build_and_deploy_frontend "$BACKEND_URL"
update_backend_cors "$FRONTEND_URL"
smoke_test "$BACKEND_URL" "$FRONTEND_URL"
print_summary
