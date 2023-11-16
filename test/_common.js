/*global path: false,
         db_name: false,
         fs: false,
         before: false,
         os: false,
         async: false,
         rimraf: false,
         temp_store_dir: false,
         child_process: false,
         after: false,
         couchdb_process: false */
/*jslint node: true, nomen: true */
"use strict";

global.path = require('path');
global.fs = require('fs');
global.os = require('os');
global.rimraf = require('util').callbackify(require('rimraf').rimraf);
global.child_process = require('child_process');
global.expect = require('chai').expect;
global.async = require('async');
global.dnode = require('@davedoesdev/dnode');
global.keystore = require('..');

global.config = require('config');

global.db_name = 'test';
global.couchdb_admin_username = 'admin';
global.couchdb_admin_password = 'admin';

before(function (cb)
{
    global.temp_store_dir = path.join(os.tmpdir(), 'pub-keystore-stores');

    async.series([
        function (cb)
        {
            rimraf(temp_store_dir, cb);
        },
        function (cb)
        {
            fs.mkdir(temp_store_dir, cb);
        }
    ], cb);
});

// keystore.destroy is tested as part of the main test run
before(function (cb)
{
    rimraf(path.join(__dirname, '..', 'pouchdb', 'store', db_name), cb);
});
before(function (cb)
{
    rimraf(path.join(__dirname, '..', 'pouchdb', 'store', 'foobar'), cb);
});

// run couchdb with local config so we can add SSL support with a known cert
before(function (cb)
{
    this.timeout(10000);

    global.couchdb_process = child_process.spawn(
            path.join(__dirname, 'fixtures', 'run_couchdb.sh'),
            [],
            { stdio: 'inherit' });

    function check()
    {
        var nv = child_process.spawn('nc',
                ['-zv', '-w', '5', '127.0.0.1', '5984'],
                { stdio: 'inherit' });

        nv.on('exit', function (code)
        {
            if (code === 0)
            {
                return cb();
            }

            setTimeout(check, 1000);
        });
    }

    check();
});

// keystore.destroy is tested as part of the main test run
before(function (cb)
{
    async.each(['pub-keys', 'foobar', db_name], function (name, cb)
    {
        require('nano')(
        {
            url: 'http://127.0.0.1:5984',
            requestDefaults: {
                auth: {
                    username: global.couchdb_admin_username,
                    password: global.couchdb_admin_password
                }
            }
        }).db.destroy(name, function (err)
        {
            if (err && (err.statusCode !== 404))
            {
                return cb(err);
            }
            cb();
        });
    }, cb);
});

before(function (cb) {
    fs.copyFile(path.join(__dirname, '..', 'sql', 'pub-keystore.empty.sqlite3'),
                path.join(__dirname, 'pub-keystore.sqlite3'),
                cb);
});

const iferr = require('iferr');

before(function (cb) {
    const { Client } = require('pg');
    const db = new Client(global.config.db);
    db.connect(iferr(cb, () => {
        db.query('DELETE FROM pub_keys', iferr(cb, () => {
            db.end(cb);
        }));
    }));
});

after(function ()
{
    couchdb_process.kill();
});

