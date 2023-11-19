/*global child_process: false,
         path: false,
         dnode: false,
         async: false,
         it: false,
         expect: false,
         keystore: false,
         temp_store_dir: false,
         couchdb_admin_username: false,
         couchdb_admin_password: false,
         fs: false,
         beforeEach: false,
         afterEach: false,
         describe: false,
         db_name: false,
         before: false,
         after: false,
         crypto: false,
         config: false */
/*jslint node: true, nomen: true */
"use strict";

/*const { EventEmitter } = require('events');
const orig_emit = EventEmitter.prototype.emit;
EventEmitter.prototype.emit = function (name) {
    if (name == 'error') {
        console.log("ERROR EVENT", name, this, arguments);
        console.trace();
    }
    return orig_emit.apply(this, arguments);
};*/

var crypto = require('crypto'),
    argv = require('yargs').argv,
    num_keys = 10,
    uri = 'mailto:dave@davedoesdev.com',
    mp_port,
    mp_port_start = 5000,
    long_timeout = 10 * 60 * 1000;

function reset_mp_port()
{
    mp_port = mp_port_start;
}

function make_key()
{
    return '-----BEGIN RSA PUBLIC KEY-----\n' +
           crypto.randomBytes(1024).toString('base64') + '\n' +
           '-----END RSA PUBLIC KEY-----\n';
}

function expr(v) { return v; }

function mp_keystore(config, cb)
{
    var port = mp_port,
        child = child_process.fork(path.join(__dirname, 'fixtures', 'child.js'),
                                   [String(port), JSON.stringify(config)],
                                   {env: {...process.env, NODE_V8_COVERAGE: ''}}),
        cb_called = false,
        ks = null,
        client = null;

    mp_port += 1;

    function handle_error(err)
    {
        if (cb_called)
        {
            if (ks)
            {
                ks.emit('error', err);
            }
            else
            {
                console.error(err);
            }
            return;
        }

        cb_called = true;
        cb(err);
    }

    child.on('message', function (msg)
    {
        if (msg.type === 'keystore')
        {
            if (!msg.has_ks) { return cb(msg.err); }

            client = dnode.connect(port);

            /*client.on('error', function (err)
            {
                console.error(err);
                expect(err.message).to.equal('read ECONNRESET');
            });*/

            client.on('remote', function (remote)
            {
                var orig_close = remote.close;

                remote.close = function (cb)
                {
                    orig_close.call(remote, function (err)
                    {
                        child.once('exit', function ()
                        {
                            cb(err);
                        });

                        child.send({type: 'exit'});
                    });
                };

                ks = remote;
                cb_called = true;
                cb(msg.err, ks);
            });
        }
    });

    child.on('error', function (err)
    {
        if (client)
        {
            client.end();
            client = null;
        }

        handle_error(err);
    });

    child.on('exit', function (code, sig)
    {
        if (client)
        {
            client.end();
            client = null;
        }

        var err = code || sig;

        if (err)
        {
            handle_error(new Error('exited: ' + err));
        }
    });
}

function query_checks(states, concurrent)
{
    it('should get the list of added uris', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            ks.get_uris(function (err, uris)
            {
                if (err) { return cb(err); }
                expect(uris.sort()).to.eql(states.map(function (state)
                {
                    return state.uri;
                }).sort());
                cb();
            });
        }, cb);
    });

    it('should retrieve an existing public key by uri', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_pub_key_by_uri(state.uri, function (err, pub_key, issuer_id, rev)
                {
                    if (err) { return cb(err); }

                    if (concurrent)
                    {
                        expect(state.keys).to.contain(pub_key);
                        expect(state.issuer_ids).to.contain(issuer_id);
                        expect(state.revs).to.contain(rev);
                    }
                    else
                    {
                        expect(pub_key).to.equal(state.key);
                        expect(issuer_id).to.equal(state.issuer_id);
                        expect(rev).to.equal(state.rev);
                    }

                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should retrieve an existing public key by issuer id', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_pub_key_by_issuer_id(state.issuer_id, function (err, pub_key, uri, rev)
                {
                    if (err) { return cb(err); }

                    if (!concurrent)
                    {
                        expect(pub_key).to.equal(state.key);
                        expect(uri).to.equal(state.uri);
                        expect(rev).to.equal(state.rev);
                    }

                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should not retrieve an existing public key by null uri', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_pub_key_by_uri(undefined, function (err, pub_key)
                {
                    if (err) { return cb(err); }
                    expect(pub_key).to.equal(null);
                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should not retrieve an existing public key by undefined uri', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_pub_key_by_uri(undefined, function (err, pub_key)
                {
                    if (err) { return cb(err); }
                    expect(pub_key).to.equal(null);
                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should not retrieve an existing public key by null issuer id', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_pub_key_by_issuer_id(null, function (err, pub_key)
                {
                    if (err) { return cb(err); }
                    expect(pub_key).to.equal(null);
                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should not retrieve an existing public key by undefined issuer id', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_pub_key_by_issuer_id(undefined, function (err, pub_key)
                {
                    if (err) { return cb(err); }
                    expect(pub_key).to.equal(null);
                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should get the issuer id for a uri', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_issuer_id(state.uri, function (err, issuer_id, rev)
                {
                    if (err) { return cb(err); }

                    if (concurrent)
                    {
                        expect(state.issuer_ids).to.contain(issuer_id);
                        expect(state.revs).to.contain(rev);

                        ks.get_pub_key_by_issuer_id(issuer_id,
                        function (err, pub_key, uri, rev)
                        {
                            if (err) { return cb(err); }

                            expect(state.keys).to.contain(pub_key);
                            expect(uri).to.equal(state.uri);
                            expect(state.revs).to.contain(rev);

                            cb();
                        });
                    }
                    else
                    {
                        expect(issuer_id).to.equal(state.issuer_id);
                        expect(rev).to.equal(state.rev);
                        cb();
                    }
                });
            }, cb);
        }, cb);
    });

    it('should not get the issuer id for null uri', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_issuer_id(null, function (err, issuer_id)
                {
                    if (err) { return cb(err); }
                    expect(issuer_id).to.equal(null);
                    cb();
                });
            }, cb);
        }, cb);
    });

    it('should not get the issuer id for undefined uri', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.each(states, function (state, cb)
            {
                ks.get_issuer_id(undefined, function (err, issuer_id)
                {
                    if (err) { return cb(err); }
                    expect(issuer_id).to.equal(null);
                    cb();
                });
            }, cb);
        }, cb);
    });
}

function make_stores_for_update(multiprocess, num, db_type, db_name, states)
{
    return function (cb)
    {
        let latest;
        if (states[0].stores_for_update)
        {
            latest = states[0].stores_for_update[0];
        }

        /*jslint unparam: true */
        (db_type === 'in-mem' ? async.timesSeries : async.times)(
        db_type === 'pouchdb' ? 1 : num,
        function (n, cb)
        {
            (multiprocess ? mp_keystore : keystore)(
            {
                db_type: db_type,
                db_dir: num > 1 ? temp_store_dir : undefined,
                db_name: num === 1 ? db_name : undefined,
                db_for_update: true,
                no_changes: true,
                username: couchdb_admin_username,
                password: couchdb_admin_password,
                db_filename: path.join(__dirname, 'pub-keystore.sqlite3'),
                db: config.db,
                share_keys_with: latest // for in-mem
            }, function (err, store)
            {
                // Sometimes we get 500 conflict if database was deleted
                // then created immediately before this create request
                if (err && (err.reason !== 'conflict'))
                {
                    console.error(err);
                    return cb(err);
                }
                expect(store.db_type).to.equal(db_type);
                latest = store;
                cb(null, store);
            });
        }, function (err, stores)
        {
            if (err) { return cb(err); }
            states[0].stores_for_update = stores;
            cb();
        });
        /*jslint unparam: false */
    };
}

function make_stores_for_query(multiprocess, num, db_type, db_name, changes, states)
{
    return function (cb)
    {
        async.times(num, function (n, cb)
        {
            function check_error(err)
            {
                if (!err) { return false; }

                if (err.feed_error)
                {
                    expect(err.message).to.equal('not_found');
                    states[0].feed_failed = true;
                    return false;
                }

                return true;
            }

            (multiprocess ? mp_keystore : keystore)(
            {
                db_type: db_type,
                db_dir: num > 1 ? temp_store_dir : undefined,
                db_name: num === 1 ? db_name : undefined,
                deploy_name: db_type === 'pouchdb' ? n : undefined,
                no_changes: !changes,
                username: couchdb_admin_username,
                password: couchdb_admin_password,
                keep_master_open: !multiprocess,
                no_initial_replicate: multiprocess,
                db_already_created: true,
                db_filename: path.join(__dirname, 'pub-keystore.sqlite3'),
                db: config.db,
                share_keys_with: db_type === 'in-mem' ? states[0].stores_for_update[0] : undefined
            }, function (err, store)
            {
                if (check_error(err))
                {
                    return cb(err);
                }

                expect(store.db_type).to.equal(db_type);

                function after_register_error()
                {
                    states[0].changes = [];

                    store.on('change', function (id, rev, deleted)
                    {
                        states[0].changes.push(
                        {
                            id: id,
                            rev: rev,
                            deleted: deleted
                        });

                        if (states[0].notify_change)
                        {
                            states[0].notify_change();
                        }
                    }, multiprocess ? function ()
                    {
                        cb(null, store);
                    } : undefined);

                    if (!multiprocess)
                    {
                        cb(null, store);
                    }
                }

                if (changes)
                {
                    if (multiprocess)
                    {
                        store.on('error', check_error, after_register_error);
                    }
                    else
                    {
                        store.on('error', check_error);
                        after_register_error();
                    }
                }
                else
                {
                    cb(null, store);
                }
            });
        }, function (err, stores)
        {
            if (err) { return cb(err); }
            states[0].stores_for_query = stores;
            cb();
        });
    };
}

function close_stores_for_update(db_type, states)
{
    return function (cb)
    {
        console.log('closing stores for update');

        if (!states[0].stores_for_update) { return cb(); }

        async.each(states[0].stores_for_update, function (ks, cb)
        {
            ks.close(function (err)
            {
                if (err && (err.message !== 'not_open')) { return cb(err); }
                cb();
            });
        }, function (err)
        {
            console.log(`closed ${states[0].stores_for_update.length} stores for query`);
            if (db_type !== 'in-mem')
            {
                delete states[0].stores_for_update;
            }
            cb(err);
        });
    };
}

function close_stores_for_query(states)
{
    return function (cb)
    {
        console.log('closing stores for query');

        if (!states[0].stores_for_query) { return cb(); }

        async.each(states[0].stores_for_query, function (ks, cb)
        {
            ks.close(function (err)
            {
                if (err && (err.message !== 'not_open')) { return cb(err); }
                cb();
            });
        }, function (err)
        {
            console.log(`closed ${states[0].stores_for_query.length} stores for query`);
            delete states[0].stores_for_query;
            cb(err);
        });
    };
}

function tests(states, multiprocess, one_for_each, changes, make_query_stores, close_query_stores, close_update_stores)
{
    function deploy(cb, closed)
    {
        function done(close)
        {
            console.log('deploy:done');
            cb(null, close);
        }

        var uks = states[0].stores_for_update[0],
            after_deploy,
            qks,
            n,
            deployed,
            close;

        function do_deploy()
        {
            uks.deploy(function (err)
            {
                if (err) { return cb(err); }

                console.log('deploy:deployed');

                if (one_for_each && multiprocess)
                {
                    return close_update_stores(function (err)
                    {
                        if (err) { return cb(err); }
                        console.log('deploy:closed update stores');
                        after_deploy();
                    });
                }

                after_deploy();
            });
        }

        if ((uks.db_type === 'pouchdb') || (uks.db_type === 'in-mem'))
        {
            qks = states[0].stores_for_query;
            n = qks.length;

            after_deploy = function ()
            {
                console.log('deploy:after_deploy', n);

                deployed = true;

                if (n === 0)
                {
                    done(close);
                }
            };

            async.each(qks, function (ks, cb)
            {
                ks.once('replicated', function (close_fn)
                {
                    n -= 1;
                    console.log('deploy:replicated', n);
                    close = close_fn;
                    if ((n === 0) && deployed)
                    {
                        done(close);
                    }
                }, multiprocess ? cb : undefined);

                if (!multiprocess)
                {
                    cb();
                }
            }, do_deploy);
        }
        else
        {
            let deployed = false;
            let replicated = false;

            after_deploy = () => {
                deployed = true;
                if (replicated) {
                    done();
                }
            };

            if (closed)
            {
                uks.replicate(err => {
                    expr(expect(err).to.exist);
                    expect(err.message).to.equal('not_open');
                    replicated = true;
                    do_deploy();
                });
            }
            else
            {
                uks.once('replicated', function (close)
                {
                    close(() => {
                        replicated = true;
                        if (deployed) {
                            done();
                        }
                    });
                }, multiprocess ? () => uks.replicate(do_deploy) : undefined);

                if (!multiprocess)
                {
                    uks.replicate(do_deploy);
                }
            }
        }
    }

    var cur_changes = [];

    function check_changes(expected, concurrent, cb)
    {
        if (!changes) { return cb(); }

        var revs = {},
            rev,
            i,
            all_expected = [],
            revmap = {},
            change;

        for (i = 0; i < states[0].stores_for_query.length; i += 1)
        {
            all_expected = all_expected.concat(expected);
        }

        cur_changes = cur_changes.concat(all_expected);

        states[0].notify_change = function ()
        {
            var check = one_for_each ? all_expected : cur_changes;

            if (states[0].changes.length !== check.length)
            {
                return;
            }

            states[0].notify_change = null;

            // couch/pouch make no guarantees as to replication order
            expect(states[0].changes.map(function (change)
            {
                return change.id;
            }).sort()).to.eql(check.sort());

            for (i = 0; i < states[0].changes.length; i += 1)
            {
                change = states[0].changes[i];
                rev = change.rev;
                revs[rev] = (revs[rev] || 0) + 1;
                expect(revs[rev]).be.at.most(states[0].stores_for_query.length);
                revmap[change.id] = change.deleted ? false : rev;
            }

            states.forEach(function (state)
            {
                var rev2 = revmap[state.uri];
                if (rev2 === undefined) { return; }
                    
                if (concurrent)
                {
                    expect(state.revs).to.include(rev2);
                }
                else
                {
                    expect(state.rev).to.equal(rev2);
                }
            });

            cb();
        };

        states[0].notify_change();
    }
   
    if (one_for_each)
    {
        it('should not error when trying to destroy a non-existent store', function (cb)
        {
            async.each(states[0].stores_for_update, function (ks, cb)
            {
                if (multiprocess)
                {
                    ks.save_db_nano();
                }
                else
                {
                    ks._db_save = ks._db;
                    ks._nano_save = ks._nano;
                }
                ks.destroy(cb);
            }, function (err)
            {
                // work around https://github.com/apache/couchdb/issues/1106
                if ((states[0].stores_for_update[0].driver === 'couchdb') &&
                    err &&
                    (err.statusCode === 500) &&
                    (err.message === 'badarg'))
                {
                    err = null;
                }

                if (err)
                {
                    return cb(err);
                }

                async.each(states[0].stores_for_update, function (ks, cb)
                {
                    if (multiprocess)
                    {
                        ks.restore_db_nano();
                    }
                    else
                    {
                        ks._db = ks._db_save;
                        ks._nano = ks._nano_save;
                    }
                    ks.destroy(err => {
                        // work around https://github.com/apache/couchdb/issues/1106
                        if ((ks.driver === 'couchdb') &&
                            err &&
                            (err.statusCode === 500) &&
                            (err.message === 'badarg'))
                        {
                            err = null;
                        }

                        if ((ks.driver === 'sql') || (ks.driver === 'in-mem'))
                        {
                            expect(err.message).to.equal('not_open');
                            return cb();
                        }

                        cb(err);
                    });
                }, function (err)
                {
                    if (err) { return cb(err); }
                    close_update_stores(cb);
                });
            });
        });
    }

    it('should create the store', function (cb)
    {
        async.series(
        [
            function (cb)
            {
                async.each(states[0].stores_for_update, function (ks, cb)
                {
                    ks.create(cb);
                }, cb);
            },
            deploy,
            function (cb)
            {
                if (states[0].feed_failed && !one_for_each)
                {
                    return close_query_stores(function (err)
                    {
                        if (err) { return cb(err); }
                        make_query_stores(cb);
                    });
                }
                cb();
            }
        ], cb);
    });

    it('should create the store again without unexpected errors', function (cb)
    {
        async.each(states[0].stores_for_update, function (ks, cb)
        {
            ks.create(function (err)
            {
                if (err) { return cb(err); }
                cb();
            });
        }, cb);
    });

    it('should create the stores on disk', function (cb)
    {
        async.each(states[0].stores_for_update.concat(states[0].stores_for_query), function (ks, cb)
        {
            if (ks.db_path)
            {
                fs.stat(ks.db_path, cb);
            }
            else
            {
                cb();
            }
        }, cb);
    });

    it('should create an empty store', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            ks.get_uris(function (err, uris)
            {
                if (err) { return cb(err); }
                expect(uris.length).to.equal(0);
                cb();
            });
        }, cb);
    });

    it('should fail to get data', function (cb)
    {
        async.each(states[0].stores_for_query, function (ks, cb)
        {
            async.parallel([
                function (cb)
                {
                    ks.get_pub_key_by_issuer_id('foo', function (err, v)
                    {
                        expr(expect(err).not.to.exist);
                        expr(expect(v).not.to.exist);
                        expect(arguments.length).to.equal(2);
                        cb();
                    });
                },
                function (cb)
                {
                    ks.get_pub_key_by_uri('foo', function (err, v)
                    {
                        expr(expect(err).not.to.exist);
                        expr(expect(v).not.to.exist);
                        expect(arguments.length).to.equal(2);
                        cb();
                    });
                },
                function (cb)
                {
                    ks.get_issuer_id('foo', function (err, v)
                    {
                        expr(expect(err).not.to.exist);
                        expr(expect(v).not.to.exist);
                        expect(arguments.length).to.equal(2);
                        cb();
                    });
                }
            ], cb);
        }, cb);
    });

    it('should add a public key', function (cb)
    {
        states[0].key = make_key();

        check_changes([], false, function ()
        {
            states[0].stores_for_update[0].add_pub_key(states[0].uri, states[0].key,
            function (err, issuer_id, rev)
            {
                if (err) { return cb(err); }
                expr(expect(issuer_id).to.exist);
                expr(expect(rev).to.exist);
                states[0].issuer_id = issuer_id;
                states[0].rev = rev;
                deploy(function (err)
                {
                    if (err) { return cb(err); }
                    check_changes([uri], false, cb);
                });
            });
        });
    });

    query_checks(states);

    it('should not add public with null uri', function (cb)
    {
        states[0].stores_for_update[0].add_pub_key(null, states[0].key,
        function (err)
        {
            expect(err.message).to.equal('invalid_uri');
            cb();
        });
    });

    it('should not add public with undefined uri', function (cb)
    {
        states[0].stores_for_update[0].add_pub_key(undefined, states[0].key,
        function (err)
        {
            expect(err.message).to.equal('invalid_uri');
            cb();
        });
    });

    it('should replace public key', function (cb)
    {
        var new_key = make_key();

        expect(new_key).not.to.equal(states[0].key);
        states[0].key = new_key;

        states[0].stores_for_update[0].add_pub_key(states[0].uri, new_key,
        function (err, issuer_id, rev)
        {
            if (err) { return cb(err); }
            expr(expect(issuer_id).to.exist);
            expr(expect(rev).to.exist);
            expect(issuer_id).not.to.equal(states[0].issuer_id);
            expect(rev).not.to.equal(states[0].rev);
            states[0].issuer_id = issuer_id;
            states[0].rev = rev;
            deploy(function (err)
            {
                if (err) { return cb(err); }
                check_changes([uri], false, cb);
            });
        });
    });

    query_checks(states);

    it('should support adding multiple public keys', function (cb)
    {
        this.timeout(long_timeout);

        async.times(num_keys, function (n, cb)
        {
            var key = make_key(),
                uri = states[0].uri + crypto.createHash('sha256')
                                          .update(key, 'utf8')
                                          .digest('hex'),
                stores = states[0].stores_for_update;

            stores[n % stores.length].add_pub_key(uri, key, function (err, issuer_id, rev)
            {
                if (err) { return cb(err); }

                expr(expect(issuer_id).to.exist);
                expr(expect(rev).to.exist);

                cb(null,
                {
                    uri: uri,
                    key: key,
                    issuer_id: issuer_id,
                    rev: rev
                });
            });
        }, function (err, the_states)
        {
            if (err) { return cb(err); }

            deploy(function (err)
            {
                if (err) { return cb(err); }
                states.push.apply(states, the_states);
                expect(states.length).to.equal(num_keys + 1);

                check_changes(the_states.map(function (state)
                {
                    return state.uri;
                }), false, cb);
            });
        });
    });

    query_checks(states);

    it('should generate different issuer ids for keys', function (cb)
    {
        var uris = {}, keys = {}, issuer_ids = {};

        states.forEach(function (state)
        {
            expect(uris).not.to.contain.keys(state.uri);
            expect(keys).not.to.contain.keys(state.key);
            expect(issuer_ids).not.to.contain.keys(state.issuer_id);
            uris[state.uri] = true;
            keys[state.key] = true;
            issuer_ids[state.issuer_id] = true;
        });

        cb();
    });

    it('should support updating multiple keys', function (cb)
    {
        this.timeout(long_timeout);

        async.times(states.length, function (n, cb)
        {
            var state = states[n],
                new_key = make_key(),
                stores = states[0].stores_for_update;

            expect(new_key).not.to.equal(state.key);
            state.key = new_key;

            stores[n % stores.length].add_pub_key(state.uri, new_key, 
            function (err, issuer_id, rev)
            {
                if (err) { return cb(err); }
                expr(expect(issuer_id).to.exist);
                expr(expect(rev).to.exist);
                expect(issuer_id).not.to.equal(state.issuer_id);
                expect(rev).not.to.equal(state.rev);
                state.issuer_id = issuer_id;
                state.rev = rev;
                cb();
            });
        }, function (err)
        {
            if (err) { return cb(err); }

            deploy(function (err)
            {
                if (err) { return cb(err); }

                check_changes(states.map(function (state)
                {
                    return state.uri;
                }), false, cb);
            });
        });
    });

    query_checks(states);

    it('should update multiple public keys concurrently', function (cb)
    {
        this.timeout(long_timeout);

        async.each(states, function (state, cb)
        {
            state.keys = [];
            state.issuer_ids = [];
            state.revs = [];

            async.each(states[0].stores_for_update, function (ks, cb)
            {
                var new_key = make_key();

                state.keys.push(new_key);

                ks.add_pub_key(state.uri, new_key, function (err, issuer_id, rev)
                {
                    if (err) { return cb(err); }
                    expr(expect(issuer_id).to.exist);
                    expr(expect(rev).to.exist);
                    expect(state.issuer_ids).not.to.contain(issuer_id);
                    expect(state.revs).not.to.contain(rev);
                    state.issuer_ids.push(issuer_id);
                    state.revs.push(rev);
                    cb();
                });
            }, cb);
        }, function (err)
        {
            if (err) { return cb(err); }

            var uris = [];

            states.forEach(function (state)
            {
                states[0].stores_for_update.forEach(function ()
                {
                    uris.push(state.uri);
                });
            });

            deploy(function (err)
            {
                if (err) { return cb(err); }
                check_changes(uris, true, cb);
            });
        });
    });

    query_checks(states, true);

    it('should not remove public key with null uri', function (cb)
    {
        states[0].stores_for_update[0].remove_pub_key(null, function (err)
        {
            expect(err.message).to.equal('invalid_uri');
            cb();
        });
    });

    it('should not remove public key with undefined uri', function (cb)
    {
        states[0].stores_for_update[0].remove_pub_key(undefined, function (err)
        {
            expect(err.message).to.equal('invalid_uri');
            cb();
        });
    });

    it('should remove public keys', function (cb)
    {
        // remove all keys
        async.times(states.length, function (n, cb)
        {
            var state = states[n],
                stores = states[0].stores_for_update;
            stores[n % stores.length].remove_pub_key(state.uri, cb);
            state.rev = false;
        }, function (err)
        {
            if (err) { return cb(err); }

            // deploy
            deploy(function (err)
            {
                if (err) { return cb(err); }

                check_changes(states.map(function (state)
                {
                    return state.uri;
                }), false, function ()
                {
                    // check can't get them by uri
                    async.each(states, function (state, cb)
                    {
                        async.each(states[0].stores_for_query, function (ks, cb)
                        {
                            ks.get_pub_key_by_uri(state.uri, function (err, pub_key)
                            {
                                if (err) { return cb(err); }
                                expr(expect(pub_key).not.to.exist);
                                cb();
                            });
                        }, cb);
                    }, function (err)
                    {
                        if (err) { return cb(err); }

                        // check can't get them by issuer id
                        async.each(states, function (state, cb)
                        {
                            async.each(states[0].stores_for_query, function (ks, cb)
                            {
                                ks.get_pub_key_by_issuer_id(state.issuer_id, function (err, pub_key)
                                {
                                    if (err) { return cb(err); }
                                    expr(expect(pub_key).not.to.exist);
                                    cb();
                                });
                            }, cb);
                        }, function (err)
                        {
                            if (err) { return cb(err); }

                            // check list of uris is empty
                            async.each(states[0].stores_for_query, function (ks, cb)
                            {
                                ks.get_uris(function (err, uris)
                                {
                                    if (err) { return cb(err); }
                                    expect(uris).to.eql([]);
                                    cb();
                                });
                            }, cb);
                        });
                    });
                });
            });
        });
    });

    it('should not error when removing public keys again', function (cb)
    {
        async.times(states.length, function (n, cb)
        {
            var state = states[n],
                stores = states[0].stores_for_update;

            stores[n % stores.length].remove_pub_key(state.uri, function (err)
            {
                expr(expect(err).not.to.exist);
                cb();
            });
        }, function ()
        {
            deploy(function (err)
            {
                if (err) { return cb(err); }
                check_changes([], false, cb);
            });
        });
    });

    it('should destroy the stores', function (cb)
    {
        var db_type = states[0].stores_for_update[0].db_type;

        async.each(states[0].stores_for_update, function (ks, cb)
        {
            async.series([
                function (cb)
                {
                    ks.destroy(cb);
                },
                function (cb)
                {
                    ks.get_pub_key_by_issuer_id('foo', function (err, v)
                    {
                        expr(expect(err).to.exist);
                        expr(expect(v).not.to.exist);
                        expect(err.message).to.equal('not_open');
                        cb();
                    });
                },
                function (cb)
                {
                    ks.get_pub_key_by_uri('foo', function (err, v)
                    {
                        expr(expect(err).to.exist);
                        expr(expect(v).not.to.exist);
                        expect(err.message).to.equal('not_open');
                        cb();
                    });
                },
                function (cb)
                {
                    ks.get_issuer_id('foo', function (err, v)
                    {
                        expr(expect(err).to.exist);
                        expr(expect(v).not.to.exist);
                        expect(err.message).to.equal('not_open');
                        cb();
                    });
                }
            ], cb);
        }, function (err)
        {
            // work around https://github.com/apache/couchdb/issues/1106
            if ((states[0].stores_for_update[0].driver === 'couchdb') &&
                err &&
                (err.statusCode === 500) &&
                (err.message === 'badarg'))
            {
                err = null;
            }

            if (err) { return cb(err); }

            console.log('destroyed');

            function after_deploy(err)
            {
                if (err) { return cb(err); }

                console.log('after_deploy');

                check_changes([], false, function ()
                {
                    console.log('got changes');

                    async.each(states[0].stores_for_query, function (ks, cb)
                    {
                        ks.get_uris(function (err, uris)
                        {
                            if (err)
                            {
                                // Note: not_found is usually returned but
                                // CouchDB seems to delete files in the
                                // background after returning response to client
                                // so if this request comes in quickly then
                                // we can get an error that it can't open the
                                // shard file
                                console.log(err);
                                expect(err.error).to.be.oneOf([
                                    'not_found',
                                    'internal_server_error'
                                ]);
                                expect(err.reason).to.be.oneOf([
                                    'Database does not exist.',
                                    'No DB shards could be opened.'
                                ]);
                            }
                            else
                            {
                                expect(uris.length).to.equal(0);
                            }

                            cb();
                        });
                    }, function ()
                    {
                        console.log('queried');

                        if (db_type === 'pouchdb')
                        {
                            console.log('destroying query stores');

                            // need to ensure view data is destroyed
                            return async.each(states[0].stores_for_query,
                            function (ks, cb)
                            {
                                ks.destroy(cb);
                            }, cb);
                        }

                        cb();
                    });
                });
            }

            deploy(function (err, close)
            {
                console.log('deployed');
                if (err) { return cb(err); }
                if (close) { return close(after_deploy); }
                after_deploy();
            }, true);
        });
    });
}

function make_states()
{
    return [{ uri: uri }];
}

function setup(multiprocess, num, db_type)
{
    describe('keystore ' + db_type + ' functionality (separate store for each test, without changes, num=' + num + ', multiprocess=' + multiprocess + ')', function ()
    {
        this.timeout(long_timeout);

        var states = make_states(),
            make_query_stores = make_stores_for_query(multiprocess, num, db_type, db_name, false, states),
            close_query_stores = close_stores_for_query(states),
            close_update_stores = close_stores_for_update(db_type, states);

        beforeEach(reset_mp_port);
        beforeEach(make_stores_for_update(multiprocess, num, db_type, db_name, states));
        beforeEach(make_query_stores);
        
        afterEach(close_update_stores);
        afterEach(close_query_stores);

        tests(states, multiprocess, true, false, make_query_stores, close_query_stores, close_update_stores);
    });

    describe('keystore ' + db_type + ' functionality (one store for all tests, without changes, num=' + num + ', multiprocess=' + multiprocess + ')', function ()
    {
        this.timeout(long_timeout);

        var states = make_states(),
            make_query_stores = make_stores_for_query(multiprocess, num, db_type, db_name, false, states),
            close_query_stores = close_stores_for_query(states),
            close_update_stores = close_stores_for_update(db_type, states),
            bef, aft;

        if (multiprocess)
        {
            bef = beforeEach;
            aft = afterEach;
        }
        else
        {
            bef = before;
            aft = after;
        }

        bef(reset_mp_port);
        bef(make_stores_for_update(multiprocess, num, db_type, db_name, states));
        bef(make_query_stores);
        
        aft(close_update_stores);
        aft(close_query_stores);

        tests(states, multiprocess, multiprocess, false, make_query_stores, close_query_stores, close_update_stores);
    });

    describe('keystore ' + db_type + ' functionality (separate store for each test, with changes, num=' + num + ', multiprocess=' + multiprocess + ')', function ()
    {
        this.timeout(long_timeout);

        var states = make_states(),
            make_query_stores = make_stores_for_query(multiprocess, num, db_type, db_name, true, states),
            close_query_stores = close_stores_for_query(states),
            close_update_stores = close_stores_for_update(db_type, states);

        beforeEach(reset_mp_port);
        beforeEach(make_stores_for_update(multiprocess, num, db_type, db_name, states));
        beforeEach(make_query_stores);
        
        afterEach(close_update_stores);
        afterEach(close_query_stores);

        tests(states, multiprocess, true, true, make_query_stores, close_query_stores, close_update_stores);
    });

    describe('keystore ' + db_type + ' functionality (one store for all tests, with changes, num=' + num + ', multiprocess=' + multiprocess + ')', function ()
    {
        this.timeout(long_timeout);

        var states = make_states(),
            make_query_stores = make_stores_for_query(multiprocess, num, db_type, db_name, true, states),
            close_query_stores = close_stores_for_query(states),
            close_update_stores = close_stores_for_update(db_type, states),
            bef, aft;

        if (multiprocess)
        {
            bef = beforeEach;
            aft = afterEach;
        }
        else
        {
            bef = before;
            aft = after;
        }

        bef(reset_mp_port);
        bef(make_stores_for_update(multiprocess, num, db_type, db_name, states));
        bef(make_query_stores);
        
        aft(close_update_stores);
        aft(close_query_stores);

        tests(states, multiprocess, multiprocess, true, make_query_stores, close_query_stores, close_update_stores);
    });
}

describe('index', function ()
{
    it('should callback with error when unknown db_type is passed', function (cb)
    {
        keystore({ db_type: 'foobar' }, function (err)
        {
            expr(expect(err).to.exist);
            cb();
        });
    });

    it("should callback with error if database doesn't exist and can't create", function (cb)
    {
        keystore(
        {
            db_type: 'couchdb',
            db_name: 'foobar',
            db_for_update: true,
            no_changes: true
        }, function (err)
        {
            expr(expect(err).to.exist);
            cb();
        });
    });
});

describe('close', function ()
{
['in-mem', 'pouchdb', 'couchdb', 'sqlite', 'pg'].forEach(function (db_type)
{
    it('should not perform operations after close', function (cb)
    {
        keystore(
        {
            db_type: db_type,
            db_name: 'foobar',
            no_changes: true,
            username: couchdb_admin_username,
            password: couchdb_admin_password,
            db_filename: path.join(__dirname, 'pub-keystore.sqlite3'),
            db: config.db
        }, function (err, ks)
        {
            if (err) { return cb(err); }
            ks.close(function (err)
            {
                if (err) { return cb(err); }
                ks.get_pub_key_by_issuer_id('foo', function (err)
                {
                    expr(expect(err).to.exist);
                    expect(err.message).to.equal('not_open');
                    cb();
                });
            });
        });
    });
});
});

if (process.env.CI)
{
    setup(false, 2, 'in-mem');
    setup(false, 2, 'couchdb');
    setup(true, 2, 'pouchdb');
    setup(true, 2, 'sqlite');
    setup(false, 2, 'pg');
}
else
{
    [false, true].forEach(function (m)
    {
        (argv.cover? [1, 2] : [1, num_keys/2, num_keys]).forEach(function (n)
        {
            if (!m)
            {
                setup(m, n, 'in-mem');
            }
            setup(m, n, 'couchdb');
            setup(m, n, 'pouchdb');
            setup(m, n, 'sqlite');
            setup(m, n, 'pg');
        });
    });
}

describe('no updates', function ()
{
['in-mem', 'pouchdb', 'couchdb', 'sqlite', 'pg'].forEach(function (db_type)
{
    it('should not update key', function (cb)
    {
        keystore(
        {
            db_type: db_type,
            db_name: db_name,
            db_for_update: true,
            username: couchdb_admin_username,
            password: couchdb_admin_password,
            no_changes: true,
            no_updates: true,
            db_filename: path.join(__dirname, 'pub-keystore.sqlite3'),
            db: config.db
        }, function (err, store)
        {
            store.create(function (err)
            {
                if (err) { return cb(err); }
                store.add_pub_key('update_test', 'update_key', function (err, issuer_id, rev)
                {
                    if (err) { return cb(err); }
                    expr(expect(issuer_id).to.exist);
                    expr(expect(rev).to.exist);
                    store.add_pub_key('update_test', 'update_key', function (err)
                    {
                        expect(db_type === 'pouchdb' ? err.status : err.statusCode).to.equal(409);
                        expect(db_type === 'pouchdb' ? err.name : err.error).to.equal('conflict');
                        store.add_pub_key('update_test', 'update_key', { allow_update: true }, function (err, issuer_id2, rev)
                        {
                            if (err) { return cb(err); }
                            expr(expect(issuer_id2).to.exist);
                            expect(issuer_id2).not.to.equal(issuer_id);
                            expr(expect(rev).to.exist);
                            store.remove_pub_key('update_test', function (err)
                            {
                                if (err) { return cb(err); }
                                store.add_pub_key('update_test', 'update_key', function (err, issuer_id, rev)
                                {
                                    if (err) { return cb(err); }
                                    expr(expect(issuer_id).to.exist);
                                    expr(expect(rev).to.exist);
                                    store.close(cb);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
});

describe('objects as public keys', function ()
{
['in-mem', 'pouchdb', 'couchdb', 'sqlite', 'pg'].forEach(function (db_type)
{
    it('should add object as public key', function (cb)
    {
        keystore(
        {
            db_type: db_type,
            db_name: db_name,
            db_for_update: true,
            username: couchdb_admin_username,
            password: couchdb_admin_password,
            no_changes: true,
            db_filename: path.join(__dirname, 'pub-keystore.sqlite3'),
            db: config.db
        }, function (err, store)
        {
            store.create(function (err)
            {
                if (err) { return cb(err); }
                var pub_key = {
                    pub_key: 'some key',
                    metadata: 'some metadata'
                };
                store.add_pub_key('obj_test', pub_key, function (err, issuer_id, rev)
                {
                    if (err) { return cb(err); }
                    expr(expect(issuer_id).to.exist);
                    expr(expect(rev).to.exist);
                    store.get_pub_key_by_uri('obj_test', function (err, pub_key2, issuer_id2, rev2)
                    {
                        if (err) { return cb(err); }
                        expect(issuer_id2).to.equal(issuer_id);
                        expect(rev2).to.equal(rev);
                        expect(pub_key2).to.eql(pub_key);
                        store.get_pub_key_by_issuer_id(issuer_id, function (err, pub_key3, uri, rev3)
                        {
                            if (err) { return cb(err); }
                            expect(uri).to.equal('obj_test');
                            expect(rev3).to.equal(rev);
                            expect(pub_key3).to.eql(pub_key);
                            store.close(cb);
                        });
                    });
                });
            });
        });
    });
});
});

describe('sql', function ()
{
    it('should callback with error when unknown sql db_type is passed', function (cb) {
        require('../sql')({ db_type: 'foobar' }, function (err)
        {
            expr(expect(err).to.exist);
            cb();
        });
    });

    it('should retry commit', function (cb)
    {
        keystore(
        {
            db_type: 'sqlite',
            db_filename: path.join(__dirname, 'pub-keystore.sqlite3'),
        }, function (err, store)
        {
            const orig_busy = store._busy;
            let called = 0;
            store._busy = function (f, retry, block)
            {
                const b = orig_busy.call(this, f, retry, block);
                return (err, ...args) =>
                {
                    if (block && (++called < 3))
                    {
                        return b.call(this, { code: 'SQLITE_BUSY' }, ...args);
                    }

                    return b.call(this, err, ...args);
                };
            };
            store.add_pub_key('foo', 'bar', function (err)
            {
                expect(err.message).to.equal('SQLITE_ERROR: cannot commit - no transaction is active');
                expect(err.code).to.equal('SQLITE_ERROR');
                store.close(cb);
            });
        });
    });
});
