#!/bin/bash
set -e
( while true; do echo keep alive!; sleep 60; done ) &
if ! npm run travis-test >& build.log; then
  tail -n 1000 build.log
  exit 1
fi
tail -n 100 build.log
