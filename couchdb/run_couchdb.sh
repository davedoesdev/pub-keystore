#!/bin/bash
cd "$(dirname "$0")"
PATH="$HOME/build-couchdb/build:$PATH"
. env.sh
exec couchdb -a couchdb.ini
