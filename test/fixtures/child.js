/*jslint node: true */
"use strict";

var dnode = require('dnode'),
    keystore = require('../..'),    
    port = parseInt(process.argv[2], 10),
    config = JSON.parse(process.argv[3]);

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
        for (f in proto)
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
            done();
        };

        // Stop dnode trying to serialize TLS sessions
        ks._conn.agent._sessionCache = { map: {}, list: [] };

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

