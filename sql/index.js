/*
TODO:
For PG, is it worth using a trigger too?
json objects?
*/

const { EventEmitter } = require('events');
const { randomBytes } = require('crypto');
const { Database } = require('sqlite3');
const { Client } = require('pg');
const { queue, series } = require('async');
const iferr = require('iferr');

class PubKeyStoreSQL extends EventEmitter {
    constructor(options, cb) {
        super();

        this._options = Object.assign({
            driver: 'sqlite',
            busy_wait: 1000,
            check_interval: 1000
        }, options);

        // We need to queue queries on a db connection:
        // https://github.com/mapbox/node-sqlite3/issues/304
        // Alternative would be to create a separate connection
        // for each query. The calling application can still do
        // this if required (to achieve more parallelism) by
        // creating many Atributo objects.
        this._queue = queue((task, cb) => task(cb));

        series([
            cb => {
                switch (this._options.driver) {
                case 'sqlite':
                    this._db = new Database(this._options.sqlite_filename,
                                            this._options.sqlite_mode);
                    this._db.on('open', cb);
                    this._true = 1;
                    this._false = 0;
                    this._busy_code = 'SQLITE_BUSY';
                    break;

                case 'pg':
                    this._db = new Client(this._options.pg);
                    this._db.connect(cb);
                    this._true = true;
                    this._false = false;
                    this._busy_code = '40001';
                    break;

                default:
                    cb(new Error(`invalid database type: ${this._options.driver}`));
                    break;
                }
            },

            cb => {
                if (this._options.no_changes) {
                    return cb();
                }

                this._get(
                    'SELECT id FROM pub_keys ORDER BY id DESC LIMIT 1',
                    [],
                    iferr(cb, r => {
                        if (r !== undefined) {
                            this._last_id = r.id;
                        }
                        this._db.on('error', () => this.emit('error', err));
                        this._check();
                        cb();
                    }));
            }
        ], iferr(cb, () => cb(null, this)));
    }

    _check() {
        this._check_timeout = setTimeout(() => {
            this._queue.push(cb => {
                let sql = 'SELECT id, uri, deleted FROM pub_keys';
                let args = [];
                if (this._last_id !== undefined) {
                    sql += ' WHERE id > $1';
                    args.push(this._last_id);
                }
                sql += ' ORDER BY id';
                this._all(
                    sql,
                    args,
                    iferr(cb, r => {
                        for (let [id, uri, deleted] of r) {
                            this.emit('change', uri, id.toString(), deleted);
                            this._last_id = id;
                        }
                        this._check();
                        cb();
                    }));
            }, this._busy(cb, () => this._check()));
        }, this._options.check_interval);
    }

    close(cb) {
        this._queue.push(cb => {
            clearTimeout(this._check_timeout);

            switch (this._options.driver) {
            case 'sqlite':
                this._db.close(cb2);
                break;

            case 'pg':
                this._db.end(cb2);
                break;
            }
        }, cb);
    }

    get_pub_key_by_uri(uri, cb) {
        this._queue.push(cb => {
            this._get(
                'SELECT pub_key, issuer_id, id FROM pub_keys WHERE uri = $1;',
                [uri],
                iferr(cb, r => {
                    if (r === undefined) {
                        return cb(null, null);
                    }
                    cb(null, r.pub_key, r.issuer_id, r.id.toString());
                }));
        }, this._busy(cb, () => this.get_pub_key_by_uri(uri, cb)));
    }

    get_pub_key_by_issuer_id(issuer_id, cb) {
        this._queue.push(cb => {
            this._get(
                'SELECT pub_key, uri, id FROM pub_keys WHERE issuer_id = $1;',
                [issuer_id],
                iferr(cb, r => {
                    if (r === undefined) {
                        return cb(null, null);
                    }
                    cb(null, r.pub_key, r.uri, r.id.toString());
                }));
        }, this._busy(cb, () => this.get_pub_key_by_issuer_id(issuer_id, cb)));
    }

    get_issuer_id(uri, cb) {
        this._queue.push(cb => {
            this._get(
                'SELECT issuer_id FROM pub_keys WHERE uri = $1;',
                [uri],
                iferr(cb, r => {
                    if (r === undefined) {
                        return cb(null, null);
                    }
                    cb(null, r.issuer_id);
                }));
        }, this._busy(cb, () => this.get_issuer_id(uri, cb)));
    }

    get_uris(cb) {
        this._queue.push(cb => {
            this._all(
                'SELECT uri FROM pub_keys;',
                [],
                iferr(cb, r => {
                    cb(null, r.map(row => row.uri));
                }));
        }, this._busy(cb, () => this.get_uris(cb)));
    }

    add_pub_key(uri, pub_key, cb) {
        const issuer_id = randomBytes(64).toString('hex');
        const b = this._busy(cb, () => this.add_pub_key(uri, cb));
        this._in_transaction(b, cb => {
            this._queue.unshift(cb => {
                this._run(
                    'DELETE FROM pub_keys WHERE uri = $1;',
                    [uri],
                    iferr(cb, () => {
                        this._run(
                            'INSERT INTO pub_keys (uri, issuer_id, pub_key, deleted) VALUES ($1, $2, $3, $4)',
                            [uri, issuer_id, pub_key, this._false],
                            iferr(cb, () => {
                                this._get(
                                    'SELECT id FROM pub_keys WHERE uri = $1;',
                                    [uri],
                                    iferr(cb, r => {
                                        cb(null, issuer_id, r.id.toString());
                                    }));
                            }));
                    }));
            });
        });
    }

    remove_pub_key(uri, cb) {
        const b = this._busy(cb, () => this.remove_pub_key(uri, cb));
        this._in_transaction(b, cb => {
            this._queue.unshift(cb => {
                this._get(
                    'SELECT id FROM pub_keys WHERE uri = $1;',
                    [uri],
                    iferr(cb, r => {
                        if (r === undefined) {
                            return cb(null);
                        }
                        this._run(
                            'DELETE FROM pub_keys WHERE id = $1;',
                            [r.id],
                            iferr(cb, () => {
                                this._run(
                                    'INSERT INTO pub_keys (uri, deleted) VALUES ($1, $2)',
                                    [uri, this._true],
                                    cb);
                            }));
                    }));
            });
        });
    }

    create(cb) {
        if (cb) { cb(); }
    }

    destroy(cb) {
        this._run('DELETE FROM pub_keys', [], iferr(cb, () => this.close(cb)));
    }

    replicate(opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
        }

        this.emit('replicated', cb => cb());

        if (cb) { cb(); }
    }

    deploy(cb) {
        if (cb) { cb(); }
    }

    _busy(f, retry, block) {
        return (err, ...args) => {
            if (err && (err.code === this._busy_code)) {
                if (block) {
                    return this._queue.unshift(cb => setTimeout(cb, this._options.busy_wait),
                                               retry);
                }

                return setTimeout(retry, this._options.busy_wait);
            }

            f(err, ...args);
        };
    }

    _end_transaction(cb) {
        let f = (err, ...args) => {
            if (err) {
                return this._queue.unshift(cb => {
                    this._run('ROLLBACK',
                              [],
                              cb);
                }, this._busy(err2 => cb(err2 || err, ...args),
                              () => f(err, ...args),
                              true));
            }

            const cb2 = err => cb(err, ...args);

            this._queue.unshift(cb => {
                this._run('END TRANSACTION',
                          [],
                          cb);
            }, this._options.driver === 'sqlite' ?
                this._busy(cb2,
                           () => f(err, ...args),
                           true) :
                cb2);
        };

        return f;
    }

    _in_transaction(cb, f) {
        let isolation_level;

        switch (this._options.driver) {
        case 'sqlite':
            isolation_level = ''; // SQLite transactions are serializable
            break;

        case 'pg':
            isolation_level = 'ISOLATION LEVEL SERIALIZABLE';
            break;
        }

        this._queue.push(cb2 =>
            this._run(`BEGIN TRANSACTION ${isolation_level}`, [], cb2),
            iferr(cb, () => f(this._end_transaction(cb))));
    }

    // Note: $1, $2 placeholders in SQL statements are PostgreSQL syntax.
    // However, as long as they appear _in order_ (i.e. never $2 before $1)
    // then they work in SQLite too. This is because when $ is used, SQLite
    // binds first parameter in array to first $whatever in the statement,
    // second parameter to second $something etc.

    _run(sql, values, cb) {
        switch (this._options.driver) {
        case 'sqlite':
            this._db.run(sql, ...values, cb);
            break;

        case 'pg':
            this._db.query(sql, values, iferr(cb, () => cb()));
            break;
        }
    }

    _all(sql, values, cb) {
        switch (this._options.driver) {
        case 'sqlite':
            this._db.all(sql, ...values, cb);
            break;

        case 'pg':
            this._db.query(sql, values, iferr(cb, r => cb(null, r.rows)));
            break;
        }
    }

    _get(sql, values, cb) {
        switch (this._options.driver) {
        case 'sqlite':
            this._db.get(sql, ...values, cb);
            break;

        case 'pg':
            this._db.query(sql, values, iferr(cb, r => cb(null, r.rows[0])));
            break;
        }
    }
}

module.exports = function (config, cb) {
    new PubKeyStoreSQL(config, cb);
};
