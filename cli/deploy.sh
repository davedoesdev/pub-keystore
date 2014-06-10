#!/bin/bash
d="$(dirname "$0")"
exec node "$d/deploy.js"                	\
          --db_name cli-keys         		\
          --db_host https://localhost           \
          --db_port 6984                        \
          --ca_file "$d/../couchdb/keys/ca.crt" \
          --prompt                              \
          "$@"
