/*jslint node: true, nomen: true */
"use strict";

var path = require('path'),
    keystore = require(path.join(__dirname, '..')),
    argv = require('yargs')
        .usage('usage: $0 --db_type <database-type> <uri>')
        .demand(1)
        .demand('db_type')
        .argv;

argv.no_changes = true;

require(path.join(__dirname, '_common.js'))(argv, function ()
{
    keystore(argv, function (err, ks)
    {
        if (err) { return console.error(err.toString()); }

        ks.get_issuer_id(argv._[0], function (err, issuer_id)
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
