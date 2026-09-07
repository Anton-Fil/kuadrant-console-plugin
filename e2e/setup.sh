#!/usr/bin/env bash
set -euo pipefail

# e2e environment: shared cluster setup + test fixtures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../scripts/lib.sh
source "${REPO_DIR}/scripts/lib.sh"

# --- shared cluster setup ---

"${REPO_DIR}/scripts/cluster-setup.sh"

# --- test RBAC + fixtures ---

log "applying RBAC roles..."
kubectl apply -f "${REPO_DIR}/config/rbac/api-management/api-owner-clusterrole.yaml"

log "creating test namespace and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-rbac.yaml"

log "creating test resources..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-resources.yaml"

log "creating APIProduct test fixtures..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"

log "creating MCP test resources..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-mcp-resources.yaml"

log "creating APIKey consumer fixtures (controller will create APIKeyRequests)..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apikey-fixtures.yaml"

log "waiting for controller to create all 9 APIKeyRequests in kuadrant-test..."
# Portable wait loop (45 * 2s = 90s). Avoids GNU `timeout`, which isn't present on
# macOS by default (it's coreutils' `gtimeout` there), so local dev on darwin works
# without extra tooling.
apikeyrequest_count() {
  # Bound each poll (--request-timeout) so a stalled API server can't hang a single
  # kubectl call indefinitely and blow past the 90s budget.
  kubectl get apikeyrequests -n kuadrant-test --request-timeout=10s --no-headers 2>/dev/null | wc -l | tr -d ' '
}
for _ in $(seq 1 45); do
  [ "$(apikeyrequest_count)" -ge 9 ] && break
  sleep 2
done
if [ "$(apikeyrequest_count)" -lt 9 ]; then
  echo "ERROR: APIKeyRequests not all created after 90s (found $(apikeyrequest_count))"
  exit 1
fi

log "e2e setup complete"
