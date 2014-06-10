/*jslint node: true */
"use strict";

var fs = require('fs'),
    prompt = require('prompt'),
    tty = require('tty');

function read_cafile(options, cb)
{
    if (!options.ca_file)
    {
        return cb();
    }
    
    fs.readFile(options.ca_file, 'utf8', function (err, ca)
    {
        if (err) { throw err; }
        options.ca = ca;
        cb();
    });
}

module.exports = function (options, cb)
{
    if (options.db_type !== 'couchdb')
    {
        return cb();
    }

    if (!options.prompt)
    {
        return read_cafile(options, cb);
    }

    fs.open('/dev/tty', 'r', function (err, s)
    {
        if (err) { throw err; }

        var rs = tty.ReadStream(s);

        prompt.message = '';
        prompt.delimiter = '';
        prompt.start({ stdin: rs });

        prompt.addProperties(options, [
        {
            message: 'CouchDB Username:',
            name: 'username'
        },
        {
            message: 'CouchDB Password:',
            name: 'password',
            hidden: true
        }], function (err)
        {
            if (err) { throw err; }
            rs.end();
            read_cafile(options, cb);
        });
    });
};
