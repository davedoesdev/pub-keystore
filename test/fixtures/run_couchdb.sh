#!/bin/bash
cd "$(dirname "$0")"
couchdb="$HOME/couchdb/rel/couchdb"
PATH="$couchdb/bin:$PATH"
export LD_LIBRARY_PATH="$couchdb/lib:$LD_LIBRARY_PATH"
cat > "$couchdb/etc/local.d/pub-keystore.ini" <<EOF
[couchdb]
database_dir = $PWD/store
view_index_dir = $PWD/store
max_dbs_open = 15000

[couch_httpd_auth]
secret = b2c53d005bdca52e39d793d790e04d2e

[admins]
admin = -pbkdf2-8798bf08892975746d76ce44569ccfd626225ce4,08965543e818881c514bd0de5aed787a,10

[cluster]
n = 1
q = 1

[log]
level = debug

[fabric]
request_timeout = 300000

[chttpd]
bind_address = 127.0.0.1
EOF

trap 'kill $(jobs -p); wait' INT TERM
couchdb &

while ! nc -zv -w 5 127.0.0.1 5984; do sleep 1; done

curl -X PUT http://admin:admin@127.0.0.1:5984/_users

curl -X PUT http://admin:admin@127.0.0.1:5984/_users/org.couchdb.user:admin \
     -H "Accept: application/json" \
     -H "Content-Type: application/json" \
     -d '{"name": "admin", "password": "admin", "roles": ["pub-keys-updater", "test-updater"], "type": "user"}'

wait
