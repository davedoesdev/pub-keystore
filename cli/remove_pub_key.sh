#!/bin/bash
d="$(dirname "$0")"
exec node "$d/remove_pub_key.js"                \
          --db_name cli-keys         		\
          --db_host https://localhost           \
          --db_port 6984                        \
          --ca_file "$d/../couchdb/keys/ca.crt" \
          --prompt                              \
          "$@"
