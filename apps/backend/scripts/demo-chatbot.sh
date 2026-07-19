#!/usr/bin/env bash
# Simulates a real LINE webhook call to the HR chatbot — same shape and same
# HMAC-SHA256 signature scheme LINE itself uses (NFR-3) — so it exercises the
# full pipeline (LineSignatureGuard -> WebhookController -> ChatbotOrchestrator
# -> ChatbotService -> LineMessagingService) without needing a real LINE OA or
# a public ngrok tunnel. Requires the backend running locally (npm run dev:backend)
# and the DB seeded (npm run --workspace=apps/backend prisma:seed).
#
# Usage: ./scripts/demo-chatbot.sh <tenantId> ["question text"]
# tenantId is printed by the seed script.

set -euo pipefail

TENANT_ID="${1:?Usage: demo-chatbot.sh <tenantId> [\"question text\"]}"
QUESTION="${2:-ลาป่วยเหลือกี่วันคะ}"

# Must match apps/backend/prisma/seed.ts's fake lineChannelSecretEnc for the
# "testco" tenant — local dev only, never a real LINE channel secret.
SECRET="fake-local-dev-channel-secret-not-real"
LINE_USER_ID="Udemo0000000000000000000000001" # matches seed.ts's employee1
API_URL="${API_URL:-http://localhost:3001}"

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

# Written to a file and sent with --data-binary so the bytes LINE's HMAC
# covers are byte-identical to what curl actually puts on the wire — `curl
# -d`/`--data` silently strips embedded newlines and can otherwise disagree
# with a hash computed over a shell variable.
printf '%s' "{\"events\":[{\"type\":\"message\",\"message\":{\"type\":\"text\",\"text\":\"${QUESTION}\"},\"source\":{\"type\":\"user\",\"userId\":\"${LINE_USER_ID}\"}}]}" > "$BODY_FILE"

SIGNATURE=$(openssl dgst -sha256 -hmac "$SECRET" -binary < "$BODY_FILE" | base64)

echo "POST ${API_URL}/v1/webhook/line/${TENANT_ID}"
echo "Question: ${QUESTION}"
echo

curl -s -X POST "${API_URL}/v1/webhook/line/${TENANT_ID}" \
  -H "Content-Type: application/json" \
  -H "x-line-signature: ${SIGNATURE}" \
  --data-binary "@${BODY_FILE}"

echo
echo
echo "Webhook accepted the request — the actual chatbot answer is logged by the"
echo "backend process (ChatbotOrchestratorService), since there's no real LINE"
echo "channel access token seeded to push the reply back through LINE itself."
echo "Check the terminal running 'npm run dev:backend' for the 'Chatbot answer' log line."
