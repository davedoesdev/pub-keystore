/*jslint node: true, nomen: true */
"use strict";

var https = require('https'),
    dnode = require('@davedoesdev/dnode'),
    keystore = require('../..'),    
    port = parseInt(process.argv[2], 10),
    config = JSON.parse(process.argv[3]),
    orig_stringify = JSON.stringify;

JSON.stringify = function (v, f)
{
    let db;
    if (v && v.arguments && v.arguments[0] && v.arguments[0]._db)
    {
        db = v.arguments[0]._db;
        delete v.arguments[0]._db;
    }
    const r = orig_stringify.call(JSON, v, function (k, v)
    {
        // Stop dnode trying to serialize TLS sessions
        if (v instanceof https.Agent)
        {
            return undefined;
        }

        return (typeof f === 'function') ? f.call(this, k, v) : v;
    });
    if (db)
    {
        v.arguments[0]._db = db;
    }
    return r;
};

process.on('message', function (msg)
{
    if (msg.type === 'exit')
    {
        process.exit();
    }
});

keystore(config, function (err, ks)
{
    function send(err)
    {
        if (err)
        {
            console.log(err);
            err = { message: err.message, feed_error: err.feed_error };
            console.log(err, config);
        }

        process.send({ type: 'keystore', err: err, has_ks: !!ks });
    }

    if (ks)
    {
        var proto = Object.getPrototypeOf(ks),
            f, orig_on, orig_once, server, expect_done = true;

        /*jslint forin: true */
        for (f of ['emit', ...Object.getOwnPropertyNames(proto)])
        {
            if (typeof ks[f] === 'function')
            {
                ks[f] = ks[f].bind(ks);
            }
        }
        /*jslint forin: false */

        orig_on = ks.on;

        ks.on = function (event, cb, done)
        {
            if (event === 'error')
            {
                orig_on.call(ks, event, function (err)
                {
                    cb.call(this,
                    {
                        message: err.message,
                        feed_error: err.feed_error
                    });
                });
            }
            else
            {
                orig_on.call(ks, event, cb);
            }

            if (expect_done)
            {
                done();
            }
        };

        orig_once = ks.once;

        ks.once = function (event, cb, done)
        {
            expect_done = false;
            orig_once.call(ks, event, cb);
            expect_done = true;
            if (done)
            {
                done();
            }
        };

        ks.save_db_nano = function ()
        {
            ks._db_save = ks._db;
            ks._nano_save = ks._nano;
        };

        ks.restore_db_nano = function ()
        {
            ks._db = ks._db_save;
            ks._nano = ks._nano_save;
        };

        server = dnode(ks);

        server.on('error', function (err2)
        {
            if (err)
            {
                console.error(err2);
                send(err);
            }
            else
            {
                send(err2);
            }
        });

        return server.listen(port, send);
    }

    send(err);
});

