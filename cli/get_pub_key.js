/*jslint node: true, nomen: true */
"use strict";

var path = require('path'),
    keystore = require(path.join(__dirname, '..')),
    argv = require('yargs')
        .usage('usage: $0 --db_type <database-type> --uri <uri>|--issuer_id <issuer-id>')
        .demand('db_type')
        .check(function (argv)
        {
            if (!(argv.uri || argv.issuer_id))
            {
                throw 'you must specify a URI or Issuer ID';
            }

            return true;
        })
        .argv;

argv.no_changes = true;

require(path.join(__dirname, '_common.js'))(argv, function ()
{
    keystore(argv, function (err, ks)
    {
        if (err) { return console.error(err.toString()); }

        function done(err, pub_key)
        {
            if (err) { return console.error(err.toString()); }

            ks.close(function (err)
            {
                if (err) { return console.error(err.toString()); }
                console.info(pub_key);
            });
        }

        if (argv.uri)
        {
            ks.get_pub_key_by_uri(argv.uri, done);
        }
        else
        {
            ks.get_pub_key_by_issuer_id(argv.issuer_id, done);
        }
    });
});
