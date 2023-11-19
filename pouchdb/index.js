/*jslint node: true, nomen: true, bitwise: true */
"use strict";

var events = require('events'),
    constants = require('constants'),
    util = require('util'),
    path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    async = require('async'),
    PouchDB = require('pouchdb'),
    touch = require('touch'),
    design = require('./design');

function PubKeyStorePouchDB(config, db_name, db_path, deploy_path, deploy_file, db, cb)
{
    events.EventEmitter.call(this);

    this._config = config;
    this.db_name = db_name;
    this._from_db_path = db_path;
    this.db_path = deploy_path;
    this._deploy_file = deploy_file;
    this._db = db;
    this._replicate_queue = async.queue(function (f, cb) { f(cb); }, 1);
    this._stopping = false;
    
    var ths = this,
        called_back = false;

    function do_changes(cb)
    {
        if (config.no_changes) { return cb(null, ths); }

        db.info(function (err, info)
        {
            if (err) { return cb(err); }

            ths._feed = db.changes(
            {
                since: info.update_seq,
                live: true
            });

            ths._feed.on('change', function (change)
            {
                if (change.id.lastIndexOf('_design/', 0) === 0)
                {
                    return;
                }

                if (config.verbose)
                {
                    console.log('database change', change);
                }

                var rev, changes = change.changes, i, chng, crev;

                for (i = 0; i < changes.length; i += 1)
                {
                    chng = changes[i];
                    crev = chng.rev;

                    if (crev !== undefined)
                    {
                        rev = crev;
                    }
                }

                ths.emit('change', change.id, rev, !!change.deleted);
            });

            ths._feed.on('error', function (err)
            {
                if (!ths._feed) { return; } // aborted

                err.feed_error = true;

                if (called_back)
                {
                    ths.emit('error', err);
                }
                else
                {
                    called_back = true;
                    cb(err, ths);
                }
            });

            if (!called_back)
            {
                called_back = true;
                cb(null, ths);
            }
        });
    }

    function after_replicate()
    {
        do_changes(function (err)
        {
            if (err) { return cb(err); }

            try
            {
                ths._watch = fs.watch(ths._deploy_file,
                                      { persistent: !!config.persistent_watch },
                                      function () { ths.replicate(); });
            }
            catch (ex)
            {
                return cb(ex);
            }

            var sig = config.replicate_signal;

            if (sig)
            {
                ths._sig = sig;
                ths._sig_handler = function ()
                {
                    ths.replicate();
                };
                process.on(sig, ths._sig_handler);
            }

            cb(null, ths);
        });
    }

    if (config.db_for_update)
    {
        return do_changes(cb);
    }

    if (config.no_initial_replicate)
    {
        return after_replicate();
    }

    ths.replicate(after_replicate);
}

util.inherits(PubKeyStorePouchDB, events.EventEmitter);

PubKeyStorePouchDB.prototype.replicate = function (opts, cb)
{
    var ths = this;

    if (typeof opts === 'function')
    {
        cb = opts;
        opts = {};
    }
    else
    {
        opts = opts || {};
        cb = cb || function (err)
        {
            if (err && ths._config.verbose)
            {
                console.error(err);
            }
        };
    }

    if (this._stopping)
    {
        return cb(new Error('stopping'));
    }

    this._replicate_queue.push(function (cb)
    {
        ths._replicate(opts, cb);
    }, cb);
};

PubKeyStorePouchDB.prototype._replicate = function (opts, cb)
{
    var ths = this,
        from_db = new PouchDB(this._from_db_path);

    function done(err)
    {
        if (err)
        {
            return ths._replicate_try_again(err, opts, cb);
        }

        if (ths._config.verbose)
        {
            console.log('replicated from', ths._from_db_path);
        }

        ths.emit('replicated', function (cb)
        {
            if (ths._config.keep_master_open)
            {
                return from_db.close(cb);
            }

            cb();
        });

        cb();
    }

    function done2(err)
    {
        if (!ths._config.keep_master_open)
        {
            return from_db.close(function (err2)
            {
                done(err || err2);
            });
        }

        done(err);
    }

    ths._db.replicate.from(from_db)
        .on('error', done2)
        .on('complete', function () { done2(); });
};

PubKeyStorePouchDB.prototype._replicate_try_again = function (err, opts, cb)
{
    if (this._config.verbose)
    {
        console.error(err);
    }

    this.emit('replicate_error', err);

    if (opts.no_retry)
    {
        return cb(err);
    }

    var ths = this;

    setTimeout(function ()
    {
        ths._replicate(opts, cb);
    }, 1000 + Math.random() * 1000);
};

PubKeyStorePouchDB.prototype.get_pub_key_by_issuer_id = function (issuer_id, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    if ((issuer_id === null) || (issuer_id === undefined))
    {
        return cb(null, null);
    }

    this._db.query(
        'by_issuer_id',
        { reduce: false, key: issuer_id },
        function (err, response)
        {
            if (err) { return cb(err); }
            if (response.rows.length === 0) { return cb(null, null); }
            var row = response.rows[0];
            cb(null, row.value.pub_key, row.id, row.value.rev);
        });
};

PubKeyStorePouchDB.prototype.get_pub_key_by_uri = function (uri, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    if ((uri === null) || (uri === undefined))
    {
        return cb(null, null);
    }

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.name === 'not_found' ? null : err, null); }
        cb(null, doc.pub_key, doc.issuer_id, doc._rev);
    });
};

PubKeyStorePouchDB.prototype.get_issuer_id = function (uri, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    if ((uri === null) || (uri === undefined))
    {
        return cb(null, null);
    }

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.name === 'not_found' ? null : err, null); }
        cb(null, doc.issuer_id, doc._rev);
    });
};

PubKeyStorePouchDB.prototype.get_uris = function (cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    this._db.allDocs(function (err, res)
    {
        if (err) { return cb(err); }

        var i, key, uris = [];

        for (i = 0; i < res.rows.length; i += 1)
        {
            key = res.rows[i].key;

            if (key.lastIndexOf('_design/', 0) !== 0)
            {
                uris.push(key);
            }
        }

        cb(null, uris);
    });
};

PubKeyStorePouchDB.prototype.add_pub_key = function (uri, pub_key, options, cb)
{
    if (typeof options === 'function')
    {
        cb = options;
        options = {};
    }
    options = options || {};
    cb = cb || function () { return undefined; };

    if (!this._db) { return cb(new Error('not_open')); }

    if ((uri === null) || (uri === undefined))
    {
        return cb(new Error('invalid_uri'));
    }

    var ths = this,
        issuer_id = crypto.randomBytes(64).toString('hex'),
        doc = { _id: uri, issuer_id: issuer_id, pub_key: pub_key };

    if (this._config.no_updates && !options.allow_update)
    {
        return this._db.put(doc, function (err, res)
        {
            if (err) { return cb(err); }
            cb(null, issuer_id, res.rev);
        });
    }

    // Find existing revision first otherwise revision may start from 1
    // (if doc has been deleted), meaning subsequent deletions will have
    // revision 2. When replicating, if the replica has a doc with a higher
    // revision, the deletion is lost.

    this._db.allDocs({ keys: [ uri ] }, function (err, res)
    {
        if (err) { return cb(err); }

        var row = res.rows[0];

        if (row.error)
        {
            if (row.error !== 'not_found') { return cb(row.error); }
        }
        else
        {
            doc._rev = row.value.rev;
        }

        if (!ths._db) { return cb(new Error('not_open')); }
        
        ths._db.put(doc, function (err, res)
        {
            // if conflict then try again

            if (err)
            {
                if (err.name === 'conflict')
                {
                    return setTimeout(function ()
                    {
                        ths.add_pub_key(uri, pub_key, cb);
                    }, 1000 + Math.random() * 1000);
                }

                return cb(err);
            }

            cb(null, issuer_id, res.rev);
        });
    });
};

PubKeyStorePouchDB.prototype.remove_pub_key = function (uri, cb)
{
    cb = cb || function () { return undefined; };

    if (!this._db) { return cb(new Error('not_open')); }

    if ((uri === null) || (uri === undefined))
    {
        return cb(new Error('invalid_uri'));
    }

    var ths = this;

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.name === 'not_found' ? null : err); }
        if (!ths._db) { return cb(new Error('not_open')); }
        ths._db.remove(doc, cb);
    });
};

PubKeyStorePouchDB.prototype._stop = function (cb)
{
    var ths = this;

    this._stopping = true;

    this._replicate_queue.push(function (cb)
    {
        if (ths._watch)
        {
            ths._watch.close();
            ths._watch = null;
        }

        if (ths._sig && ths._sig_handler)
        {
            process.removeListener(ths._sig, ths._sig_handler);
            ths._sig = null;
            ths._sig_handler = null;
        }
            
        if (ths._feed)
        {
            let feed = ths._feed;
            ths._feed = null;
            feed.cancel();
        }

        cb();
    }, cb);
};

PubKeyStorePouchDB.prototype.close = function (cb)
{
    cb = cb || function () { return undefined; };

    var ths = this;

    this._stop(function ()
    {
        if (!ths._db) { return cb(new Error('not_open')); }

        ths._db.close(function (err)
        {
            if (err &&
                (err.error !== 'precondition_failed') &&
                (err.name !== 'precondition_failed') &&
                (err.message !== 'database is destroyed'))
            {
                return cb(err);
            }
            ths._db = null;
            cb();
        });
    });
};

PubKeyStorePouchDB.prototype.create = function (cb)
{
    cb = cb || function () { return undefined; };

    if (!this._db) { return cb(new Error('not_open')); }

    var by_issuer_id = {
        _id: '_design/by_issuer_id',
        views: {
            by_issuer_id: {
                map: design.by_issuer_id.toString()
            }
        }
    };

    this._db.put(by_issuer_id, function (err)
    {
        if (err && (err.name !== 'conflict')) { return cb(err); }
        cb();
    });
};

PubKeyStorePouchDB.prototype.destroy = function (cb)
{
    cb = cb || function () { return undefined; };

    var ths = this;

    this._stop(function ()
    {
        if (!ths._db) { return cb(new Error('not_open')); }

        ths._db.destroy(function (err)
        {
            if (err &&
                (err.error !== 'precondition_failed') &&
                (err.name !== 'precondition_failed') &&
                (err.message !== 'database is destroyed'))
            {
                return cb(err);
            }
            ths._db = null;
            cb();
        });
    });
};

PubKeyStorePouchDB.prototype.deploy = function (cb)
{
    cb = cb || function () { return undefined; };
    touch(this._deploy_file, cb);
};

module.exports = function (config, cb)
{
    var db_name = config.db_name || 'pub-keys',
        db_dir = config.db_dir || path.join(__dirname, 'store', db_name),
        db_path = path.join(db_dir, db_name),
        deploy_file = path.join(db_dir, 'deploy'),
        deploy_path = config.db_for_update ?
                            db_path :
                            db_path + '-deploy-' + (config.deploy_name || 'default');

    fs.mkdir(db_dir, function (err)
    {
        if (err && (err.code !== 'EEXIST')) { return cb(err); }

        // create file if it doesn't exist but don't touch it because that
        // would cause readers immediately to replicate
        fs.writeFile(deploy_file, '',
                     { flag: constants.O_CREAT |
                             constants.O_EXCL |
                             constants.O_WRONLY },
        function (err)
        {
            if (err && (err.code !== 'EEXIST')) { return cb(err); }

            new PubKeyStorePouchDB(config,
                                   db_name, db_path,
                                   deploy_path, deploy_file,
                                   new PouchDB(deploy_path),
                                   cb);
        });
    });
};

