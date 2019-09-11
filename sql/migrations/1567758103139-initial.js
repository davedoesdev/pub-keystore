'use strict';

const { Database } = require('sqlite3');
const async = require('async');
const db_filename = 'pub-keystore.empty.sqlite3';

function with_db(f, cb) {
    let db = new Database(db_filename);
    db.on('error', cb);
    db.on('open', f);
}

exports.description = 'initial version';

exports.up = function (next) {
    with_db(function () {
        async.series([
            cb => {
                this.run('CREATE TABLE pub_keys (' +
                         '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
                         '  uri TEXT NOT NULL,' + 
                         '  issuer_id TEXT UNIQUE,' +
                         '  pub_key TEXT,' +
                         '  deleted BOOLEAN NOT NULL);',
                         cb);
            },
            cb => {
                this.run('CREATE INDEX by_uri ON pub_keys (uri);',
                         cb);
            },
            cb => {
                this.run('CREATE INDEX by_issuer_id ON pub_keys (issuer_id);',
                         cb);
            }
        ], next);
    }, next);
};

exports.down = function (next) {
    with_db(function () {
        async.series([
            cb => {
                this.run('DROP TABLE pub_keys;',
                         cb);
            }
        ], next);
    }, next);
};
