#!/usr/bin/env bash
set -euo pipefail

HTTP_PORT="${PORT:-9200}"

exec /usr/local/bin/docker-entrypoint.sh eswrapper \
  -Ehttp.port="${HTTP_PORT}" \
  -Enetwork.host=0.0.0.0 \
  -Ediscovery.type=single-node \
  -Expack.security.enabled=false \
  -Expack.security.http.ssl.enabled=false
