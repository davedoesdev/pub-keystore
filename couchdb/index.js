/*jslint node: true, nomen: true, forin: true */
"use strict";

var events = require('events'),
    util = require('util'),
    crypto = require('crypto'),
    cradle = require('cradle'),
    design = require('./design');

// https://github.com/flatiron/cradle/pull/246
cradle.Connection.prototype.close = function ()
{
    var addr;

    function end(socket)
    {
        socket.end();
    }

    for (addr in this.agent.sockets)
    {
        this.agent.sockets[addr].forEach(end);
    }    
};

function PubKeyStoreCouchDB(config, cb)
{
    events.EventEmitter.call(this);

    var ths = this,
        auth,
        orig_request,
        called_back = false;

    if (config.username)
    {
        auth = { username: config.username, password: config.password };
    }

    this.db_host = config.db_host || 'http://localhost';
    this.db_port = config.db_port || 5984;
    this._conn = new (cradle.Connection)(this.db_host, this.db_port,
                                         { cache: false, auth: auth });

    orig_request = this._conn.request;

    if (config.ca)
    {
        this._conn.request = function (options, callback)
        {
            options.strictSSL = true;
            this.agent.options.ca = config.ca;
            return orig_request.call(this, options, callback);
        };
    }

    this.db_name = config.db_name || 'pub-keys';
    this._db = this._conn.database(this.db_name);

    if (config.no_changes)
    {
        return this._db.exists(function (err, exists)
        {
            if (err) { return cb(err, ths); }
            if (!exists) { return cb(new Error('not_found'), ths); }
            cb(null, ths);
        });
    }
    
    this._feed = this._db.changes(
    {
        since: 'now',
        request: { strictSSL: true, ca: config.ca }
    });
    
    this._feed.on('change', function (change)
    {
        if (change.id.lastIndexOf('_design/', 0) === 0)
        {
            return;
        }

        if (!config.silent)
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

    this._feed.on('query', function (req)
    {
        ths._query = req;
    });

    this._feed.on('error', function (err)
    {
        if (!ths._feed) { return; } // aborted

        err.feed_error = true;

        if (err.message)
        {
            if (err.message.lastIndexOf(
                    'Bad DB response: {"error":"not_found"') === 0)
            {
                err.message = 'not_found';
            }
            else if (err.message.lastIndexOf(
                    'Database deleted after change:', 0) === 0)
            {
                err.message = 'deleted';
            }
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

    this._feed.on('confirm', function ()
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

    this._db.view('pub_keys/by_issuer_id',
    {
        key: issuer_id
    }, function (err, res)
    {
        if (err) { return cb(err); }
        if (res.length === 0) { return cb(null, null); }
        var res0 = res[0];
        cb(null, res0.value.pub_key, res0.id, res0.value.rev);
    });
};

PubKeyStoreCouchDB.prototype.get_uris = function (cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    this._db.all(function (err, res)
    {
        if (err) { return cb(err); }

        var i, key, uris = [];

        for (i = 0; i < res.length; i += 1)
        {
            key = res[i].key;

            if (key.indexOf('_design/') !== 0)
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

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.error === 'not_found' ? null : err, null); }
        cb(null, doc.issuer_id, doc._rev);
    });
};

PubKeyStoreCouchDB.prototype.get_pub_key_by_uri = function (uri, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.error === 'not_found' ? null : err, null); }
        cb(null, doc.pub_key, doc.issuer_id, doc._rev);
    });
};

PubKeyStoreCouchDB.prototype.add_pub_key = function (uri, pub_key, cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    var ths = this,
        issuer_id = crypto.randomBytes(64).toString('hex'),
        doc = { issuer_id: issuer_id, pub_key: pub_key };

    // Find existing revision first otherwise revision may start from 1
    // (if doc has been deleted), meaning subsequent deletions will have
    // revision 2. When replicating, if the replica has a doc with a higher
    // revision, the deletion is lost.

    this._db.all({ keys: [ uri ] }, function (err, res)
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
        
        ths._db.save(uri, doc, function (err, res)
        {
            // if conflict then try again

            if (err)
            {
                if (err.error === 'conflict')
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
    if (!this._db) { return cb(new Error('not_open')); }

    var ths = this;

    this._db.get(uri, function (err, doc)
    {
        if (err) { return cb(err.error === 'not_found' ? null : err); }
        if (!ths._db) { return cb(new Error('not_open')); }
        ths._db.remove(uri, doc._rev, cb);
    });
};

PubKeyStoreCouchDB.prototype._stop = function (cb)
{
    if (this._feed)
    {
        var feed = this._feed;
        this._feed = null;
        feed.stop();
    }

    if (this._query && this._query.abort)
    {
        this._query.abort();
        if (!this._query.req.socket)
        {
            this._query.req.socket = { emit: function () { return undefined; } };
        }
        this._query.emit('response', { body: 'aborted' });
        this._query = null;
    }

    cb();
};

PubKeyStoreCouchDB.prototype._close_conn = function (cb)
{
    if (!this._conn) { return cb(new Error('not_open')); }

    this._conn.close();
    this._conn = null;
    this._db = null;

    cb();
};

PubKeyStoreCouchDB.prototype.close = function (cb)
{
    cb = cb || function () { return undefined; };

    var ths = this;

    this._stop(function ()
    {
        ths._close_conn(cb);
    });
};

PubKeyStoreCouchDB.prototype.create = function (cb)
{
    if (!this._db) { return cb(new Error('not_open')); }

    var ths = this;

    this._db.create(function (err)
    {
        if (err && (err.error !== 'file_exists')) { return cb(err); }
        if (!ths._db) { return cb(new Error('not_open')); }

        /*jslint unparam: true */
        ths._db.save('_design/_auth', 
        {
            views: {},
            validate_doc_update: design.validate.toString().replace('DB_NAME', ths._db.name)
        }, function (err)
        {
            if (err && (err.error !== 'conflict')) { return cb(err); }
            if (!ths._db) { return cb(new Error('not_open')); }

            ths._db.save('_design/pub_keys',
            {
                views: {
                    by_issuer_id: {
                        map: design.by_issuer_id
                    }
                }
            }, function (err)
            {
                if (err && (err.error !== 'conflict')) { return cb(err); }
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

        ths._db.destroy(function (err)
        {
            if (err &&
                ((err.error !== 'not_found') ||
                 ((err.reason !== 'no_db_file') &&
                  (err.reason !== 'missing'))))
            {
                return cb(err);
            }
            ths._close_conn(cb);
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

