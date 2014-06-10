/*jslint node: true, nomen: true */
"use strict";

var fs = require('fs'),
    path = require('path'),
    keystore = require(path.join(__dirname, '..')),
    argv = require('yargs')
        .usage('usage: $0 --db_type <database-type> <uri> (base64-encoded public key on stdin)\n\nMake sure you verify the user owns the uri!')
        .demand(1)
        .demand('db_type')
        .argv,
    buf = new Buffer(1024*16);

argv.silent = true;
argv.db_for_update = true;
argv.no_changes = true;

require(path.join(__dirname, '_common.js'))(argv, function ()
{
    fs.read(process.stdin.fd, buf, 0, buf.length, null, function (err, n)
    {
        if (err) { return console.error(err.toString()); }

        var pub_key = buf.toString('utf8', 0, n);
                         /*.replace("-----BEGIN PUBLIC KEY-----", "")
                         .replace("-----END PUBLIC KEY-----", "")
                         .replace(/[ \n]/g, "");*/

        keystore(argv, function (err, ks)
        {
            if (err) { return console.error(err.toString()); }

            ks.add_pub_key(argv._[0], pub_key, function (err, issuer_id)
            {
                if (err) { return console.error(err.toString()); }
                
                ks.close(function (err)
                {
                    if (err) { return console.error(err.toString()); }
                    console.info(issuer_id);
                });
            });
        });
    });
});

