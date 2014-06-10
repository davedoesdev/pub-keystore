#!/bin/bash
exec node "$(dirname "$0")"/get_pub_key.js --db_name cli-keys "$@"
