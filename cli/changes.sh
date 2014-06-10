#!/bin/bash
exec node "$(dirname "$0")"/changes.js --db_name cli-keys "$@"
