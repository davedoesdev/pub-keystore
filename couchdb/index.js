/*jslint node: true, nomen: true, forin: true */
"use strict";

var events = require('events'),
    util = require('util'),
    crypto = require('crypto'),
    nano = require('nano'),
    axios = require('axios'),
    design = require('./design'),
    status_not_found = 404,
    status_conflict = 409,
    status_db_exists = 412;

function PubKeyStoreCouchDB(config, cb)
{
    events.EventEmitter.call(this);

    var ths = this,
        called_back = false;

    this._config = config;

    this.db_host = config.db_host || 'http://127.0.0.1';
    this.db_port = config.db_port || 5984;

    const requestDefaults = {
        auth: config.username ? {
            username: config.username,
            password: config.password
        } : undefined,
        strictSSL: true,
        ca: config.ca,
        pool: {
            maxSockets: config.maxSockets || Infinity
        }
    };

    this._nano = nano(
    {
        url: this.db_host + ':' + this.db_port,
        requestDefaults
    });

    this.db_name = config.db_name || 'pub-keys';
    this._db = this._nano.use(this.db_name);

    if (config.no_changes)
    {
        return this._db.info(function (err)
        {
            if (err && (err.statusCode === status_not_found))
            {
                return cb(new Error('not_found'), ths);
            }

            return cb(err, ths);
        });
    }

    const relax = this._db.changesReader.request;

    this._db.changesReader.request = async function (opts)
    {
        const promise = relax(opts);
        process.nextTick(() => ths._feed.emit('confirm'));
        return await promise;
    };

    this._feed = this._db.changesReader.start(
    {
        since: 'now'
    });

    this._feed.on('change', function (change)
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

    this._feed.on('error', function (err)
    {
        if (!this._feed)
        {
            return;
        }

        err.feed_error = true;

        if ((err.statusCode === status_not_found) ||
            (err.message && (err.message.indexOf('missing_target') >= 0)))
        {
            err.message = 'not_found';
        }

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

    this._feed.once('confirm', function ()
    {
        if (!called_back)
        {
            called_back = true;
            cb(null, ths);
        }
    });
}

util.inherits(PubKeyStoreCouchDB, events.EventEmitter);

PubKeyStoreCouchDB.prototype.get_pub_key_by_issuer_id = function (issuer_id, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    if ((issuer_id === null) || (issuer_id === undefined))
    {
        return cb(null, null);
    }

    this._db.view('pub_keys', 'by_issuer_id',
    {
        key: issuer_id
    }, function (err, res)
    {
        if (err) { return cb(err); }
        if (res.rows.length === 0) { return cb(null, null); }
        var res0 = res.rows[0];
        cb(null, res0.value.pub_key, res0.id, res0.value.rev);
    });
};

PubKeyStoreCouchDB.prototype.get_uris = function (cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    this._db.list(function (err, res)
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

PubKeyStoreCouchDB.prototype.get_issuer_id = function (uri, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    if ((uri === null) || (uri === undefined))
    {
        return cb(null, null);
    }

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.statusCode === status_not_found ? null : err, null); }
        cb(null, doc.issuer_id, doc._rev);
    });
};

PubKeyStoreCouchDB.prototype.get_pub_key_by_uri = function (uri, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    if ((uri === null) || (uri === undefined))
    {
        return cb(null, null);
    }

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.statusCode === status_not_found ? null : err, null); }
        cb(null, doc.pub_key, doc.issuer_id, doc._rev);
    });
};

PubKeyStoreCouchDB.prototype.add_pub_key = function (uri, pub_key, options, cb)
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
        doc = { issuer_id: issuer_id, pub_key: pub_key };

    if (this._config.no_updates && !options.allow_update)
    {
        return this._db.insert(doc, uri, function (err, res)
        {
            if (err) { return cb(err); }
            cb(null, issuer_id, res.rev);
        });
    }    

    // Find existing revision first otherwise revision may start from 1
    // (if doc has been deleted), meaning subsequent deletions will have
    // revision 2. When replicating, if the replica has a doc with a higher
    // revision, the deletion is lost.

    this._db.fetch({ keys: [ uri ] }, function (err, res)
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
        
        ths._db.insert(doc, uri, function (err, res)
        {
            // if conflict then try again

            if (err)
            {
                if (err.statusCode === status_conflict)
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

PubKeyStoreCouchDB.prototype.remove_pub_key = function (uri, cb)
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
        if (err) { return cb(err.statusCode === status_not_found ? null : err); }
        if (!ths._db) { return cb(new Error('not_open')); }
        ths._db.destroy(uri, doc._rev, cb);
    });
};

PubKeyStoreCouchDB.prototype._stop = function (cb)
{
    if (this._feed && this._db.changesReader.started)
    {
        this._feed.once('end', cb);
        this._feed = null;
        return this._db.changesReader.stop();
    }

    cb();
};

PubKeyStoreCouchDB.prototype._close_nano = function (cb)
{
    if (!this._nano) { return cb(new Error('not_open')); }

    this._nano = null;
    this._db = null;

    cb();
};

PubKeyStoreCouchDB.prototype.close = function (cb)
{
    cb = cb || function () { return undefined; };

    var ths = this;

    this._stop(function ()
    {
        ths._close_nano(cb);
    });
};

PubKeyStoreCouchDB.prototype.create = function (cb)
{
    cb = cb || function () { return undefined; };

    if (!this._db) { return cb(new Error('not_open')); }

    var ths = this;

    this._nano.db.create(this.db_name, function (err)
    {
        if (err && (err.statusCode !== status_db_exists)) { return cb(err); }
        if (!ths._db) { return cb(new Error('not_open')); }

        /*jslint unparam: true */
        ths._db.insert(
        {
            views: {},
            validate_doc_update: design.validate.toString().replace('DB_NAME', ths.db_name)
        }, '_design/_auth', function (err)
        {
            if (err && (err.statusCode !== status_conflict)) { return cb(err); }
            if (!ths._db) { return cb(new Error('not_open')); }

            ths._db.insert(
            {
                views: {
                    by_issuer_id: {
                        map: design.by_issuer_id
                    }
                }
            }, '_design/pub_keys', function (err)
            {
                if (err && (err.statusCode !== status_conflict)) { return cb(err); }
                if (!ths._db) { return cb(new Error('not_open')); }
                cb();
            });
        });
        /*jslint unparam: false */
    });
};

PubKeyStoreCouchDB.prototype.destroy = function (cb)
{
    cb = cb || function () { return undefined; };

    var ths = this;

    this._stop(function ()
    {
        if (!ths._db) { return cb(new Error('not_open')); }

        ths._nano.db.destroy(ths.db_name, function (err)
        {
            if (err && (err.statusCode != status_not_found))
            {
                return cb(err);
            }
            ths._close_nano(cb);
        });
    });
};

PubKeyStoreCouchDB.prototype.deploy = function (cb)
{
    if (cb) { cb(); }
};

PubKeyStoreCouchDB.prototype.replicate = function (opts, cb)
{
    if (typeof opts === 'function')
    {
        cb = opts;
    }

    cb = cb || (() => {});

    if (!this._db)
    {
        return cb(new Error('not_open'));
    }

    this.emit('replicated', function (cb)
    {
        cb();
    });

    cb();
};

module.exports = function (config, cb)
{
    return new PubKeyStoreCouchDB(config, cb);
};

