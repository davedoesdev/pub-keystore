#!/bin/bash
exec node "$(dirname "$0")"/list_uris.js --db_name cli-keys "$@"
