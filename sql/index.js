/*jslint node: true */

const { EventEmitter } = require('events');
const { randomBytes } = require('crypto');
const { Database } = require('sqlite3');
const { Client } = require('pg');
const { queue, waterfall } = require('async');
const iferr = require('iferr');

class PubKeyStoreSQL extends EventEmitter {
    constructor(options, cb) {
        super();

        this._options = Object.assign({
            db_type: 'sqlite',
            busy_wait: 1000,
            check_interval: 1000
        }, options);

        this._open = false;

        // We need to queue queries on a db connection:
        // https://github.com/mapbox/node-sqlite3/issues/304
        // Alternative would be to create a separate connection
        // for each query. The calling application can still do
        // this if required (to achieve more parallelism) by
        // creating many keystores.
        this._queue = queue((task, cb) => {
            if (!this._open) {
                return cb(new Error('not_open'));
            }
            task(cb);
        });

        waterfall([
            cb => {
                let db;
                switch (this._options.db_type) {
                case 'sqlite':
                    db = new Database(this._options.db_filename,
                                      this._options.db_mode);
                    db.on('open', err => cb(err, db));
                    this._true = 1;
                    this._false = 0;
                    this._busy_code = 'SQLITE_BUSY';
                    break;

                case 'pg':
                    db = new Client(this._options.db);
                    db.connect(err => cb(err, db));
                    this._true = true;
                    this._false = false;
                    this._busy_code = '40001';
                    break;

                default:
                    cb(new Error(`invalid database type: ${this._options.db_type}`));
                    break;
                }
            },

            (db, cb) => {
                this._open = true;
                this._db = db;

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
                        db.on('error', this.emit.bind(this, 'error'));
                        this._check();
                        cb();
                    }));
            }
        ], iferr(err => this.close(() => cb(err)), () => cb(null, this)));
    }

    _ifopen(cb) {
        return (...args) => !this._open || cb.call(this, ...args);
    }

    _check() {
        this._check_timeout = setTimeout(this._ifopen(() => {
            this._queue.push(this._ifopen(cb => {
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
                        /* jshint expr: true */
                        this._options.verbose && console.log('database change', r);
                        for (let { id, uri, deleted } of r) {
                            this.emit('change', uri, id.toString(), deleted === this._true);
                            this._last_id = id;
                        }
                        cb();
                    }));
            }), this._busy(iferr(this.emit.bind(this, 'error'),
                                 this._ifopen(this._check)),
                           this._ifopen(this._check)));
        }), this._options.check_interval);
    }

    close(cb) {
        this._queue.push(cb => {
            waterfall([
                cb => {
                    clearTimeout(this._check_timeout);
                    cb();
                },
                cb => {
                    switch (this._options.db_type) {
                    case 'sqlite':
                        this._db.close(cb);
                        break;

                    case 'pg':
                        this._db.end(cb);
                        break;
                    }
                },
                cb => {
                    this._open = false;
                    cb();
                }
            ], cb);
        }, cb);
    }

    get_pub_key_by_uri(uri, cb) {
        this._queue.push(cb => {
            this._get(
                'SELECT pub_key, issuer_id, id, deleted FROM pub_keys WHERE uri = $1 ORDER BY id DESC LIMIT 1;',
                [uri],
                iferr(cb, r => {
                    if ((r === undefined) || r.deleted) {
                        return cb(null, null);
                    }
                    cb(null, JSON.parse(r.pub_key), r.issuer_id, r.id.toString());
                }));
        }, this._busy(cb, this.get_pub_key_by_uri.bind(this, uri, cb)));
    }

    get_pub_key_by_issuer_id(issuer_id, cb) {
        const b = this._busy(cb, this.get_pub_key_by_issuer_id.bind(this, issuer_id, cb));
        this._in_transaction(b, cb => {
            this._queue.unshift(cb => {
                this._get(
                    'SELECT uri FROM pub_keys WHERE issuer_id = $1;',
                    [issuer_id],
                    iferr(cb, r => {
                        if (r === undefined) {
                            return cb(null, null);
                        }
                        this._get(
                            'SELECT pub_key, issuer_id, id, deleted FROM pub_keys WHERE uri = $1 ORDER BY id DESC LIMIT 1;',
                            [r.uri],
                            iferr(cb, r2 => {
                                if (r2.deleted || (r2.issuer_id !== issuer_id)) {
                                    return cb(null, null);
                                }
                                cb(null, JSON.parse(r2.pub_key), r.uri, r2.id.toString());
                            }));
                    }));
            }, cb);
        });
    }

    get_issuer_id(uri, cb) {
        this._queue.push(cb => {
            this._get(
                'SELECT issuer_id, id, deleted FROM pub_keys WHERE uri = $1 ORDER BY id DESC LIMIT 1;',
                [uri],
                iferr(cb, r => {
                    if ((r === undefined) || r.deleted) {
                        return cb(null, null);
                    }
                    cb(null, r.issuer_id, r.id.toString());
                }));
        }, this._busy(cb, this.get_issuer_id.bind(this, uri, cb)));
    }

    get_uris(cb) {
        this._queue.push(cb => {
            this._all(
                'SELECT uri FROM (SELECT uri, deleted, row_number() OVER(PARTITION BY uri ORDER BY id DESC) AS rn FROM pub_keys) sub WHERE rn = 1 AND NOT deleted;',
                [],
                iferr(cb, r => {
                    cb(null, r.map(row => row.uri));
                }));
        }, this._busy(cb, this.get_uris.bind(this, cb)));
    }

    add_pub_key(uri, pub_key, options, cb) {
        if (typeof options === 'function')
        {
            cb = options;
            options = {};
        }
        options = options || {};
        cb = cb || function () { return undefined; };
        if ((uri === null) || (uri === undefined)) {
            return cb(new Error('invalid_uri'));
        }
        const issuer_id = randomBytes(64).toString('hex');
        const b = this._busy(cb, this.add_pub_key.bind(this, uri, pub_key, cb));
        this._in_transaction(b, cb => {
            this._queue.unshift(cb => {
                this._get(
                    'SELECT deleted FROM pub_keys WHERE uri = $1 ORDER BY id DESC LIMIT 1;',
                    [uri],
                    iferr(cb, r => {
                        if (this._options.no_updates &&
                            !options.allow_update &&
                            (r !== undefined) &&
                            !r.deleted) {
                            const err = new Error('already exists');
                            err.statusCode = 409;
                            err.error = 'conflict';
                            return cb(err);
                        }
                        this._run(
                            'INSERT INTO pub_keys (uri, issuer_id, pub_key, deleted) VALUES ($1, $2, $3, $4)',
                            [uri, issuer_id, JSON.stringify(pub_key), this._false],
                            iferr(cb, () => {
                                this._get(
                                    'SELECT id FROM pub_keys WHERE issuer_id = $1;',
                                    [issuer_id],
                                    iferr(cb, r => {
                                        cb(null, issuer_id, r.id.toString());
                                    }));
                            }));
                    }));
            }, cb);
        });
    }

    remove_pub_key(uri, cb) {
        if ((uri === null) || (uri === undefined)) {
            return cb(new Error('invalid_uri'));
        }
        const b = this._busy(cb, this.remove_pub_key.bind(this, uri, cb));
        this._in_transaction(b, cb => {
            this._queue.unshift(cb => {
                this._get(
                    'SELECT deleted FROM pub_keys WHERE uri = $1 ORDER BY id DESC LIMIT 1;',
                    [uri],
                    iferr(cb, r => {
                        if ((r === undefined) || r.deleted) {
                            return cb();
                        }
                        this._run(
                            'INSERT INTO pub_keys (uri, deleted) VALUES ($1, $2)',
                            [uri, this._true],
                            cb);
                    }));
            }, cb);
        });
    }

    create(cb) {
        /* jshint expr: true */
        !cb || cb();
    }

    destroy(cb) {
        this._queue.push(cb => {
            this._run('DELETE FROM pub_keys', [], cb);
        }, this._busy(iferr(cb, this.close.bind(this, cb)),
                      this.destroy.bind(this, cb)));
    }

    replicate(opts, cb) {
        /* jshint expr: true */
        (typeof opts !== 'function') || (cb = opts);
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        this.emit('replicated', cb => cb());
        cb();
    }

    deploy(cb) {
        /* jshint expr: true */
        !cb || cb();
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
                              f.bind(this, err, ...args),
                              true));
            }

            const cb2 = err => cb(err, ...args);

            this._queue.unshift(cb => {
                this._run('END TRANSACTION',
                          [],
                          cb);
            }, this._options.db_type === 'sqlite' ?
                this._busy(cb2,
                           f.bind(this, err, ...args),
                           true) :
                cb2);
        };

        return f;
    }

    _in_transaction(cb, f) {
        let isolation_level;

        switch (this._options.db_type) {
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
        switch (this._options.db_type) {
        case 'sqlite':
            this._db.run(sql, ...values, cb);
            break;

        case 'pg':
            this._db.query(sql, values, iferr(cb, () => cb()));
            break;
        }
    }

    _all(sql, values, cb) {
        switch (this._options.db_type) {
        case 'sqlite':
            this._db.all(sql, ...values, cb);
            break;

        case 'pg':
            this._db.query(sql, values, iferr(cb, r => cb(null, r.rows)));
            break;
        }
    }

    _get(sql, values, cb) {
        switch (this._options.db_type) {
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
