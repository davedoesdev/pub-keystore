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
        var proto = Object.getPrototypeOf(ks), f, orig_on, server;

        /*jslint forin: true */
        for (f in proto)
        {
            ks[f] = ks[f].bind(ks);
        }
        /*jslint forin: false */

        orig_on = ks.on;

        ks.on = function (event, cb, done)
        {
            if (event !== 'error')
            {
                return orig_on.call(ks, event, cb);
            }

            orig_on.call(ks, event, function (err)
            {
                cb.call(this,
                {
                    message: err.message,
                    feed_error: err.feed_error
                });
            });

            done();
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

