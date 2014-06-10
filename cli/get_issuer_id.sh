#!/bin/bash
exec node "$(dirname "$0")"/get_issuer_id.js --db_name cli-keys "$@"
