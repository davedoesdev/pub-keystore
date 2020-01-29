/*jslint node: true, nomen: true */
"use strict";

var path = require('path'),
    keystore = require(path.join(__dirname, '..')),
    argv = require('yargs')
        .usage("usage: $0 --db_type <database-type>")
        .demand('db_type')
        .argv;

argv.persistent_watch = true;

require(path.join(__dirname, '_common.js'))(argv, function ()
{
    keystore(argv, function (err, ks)
    {
        if (err) { return console.error(err.toString()); }
        ks.on('change', console.log);
    });
});
