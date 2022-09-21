# pub-keystore&nbsp;&nbsp;&nbsp;[![Build Status](https://github.com/davedoesdev/pub-keystore/actions/workflows/ci.yml/badge.svg)](https://github.com/davedoesdev/pub-keystore/actions/workflows/ci.yml) [![Coverage Status](https://coveralls.io/repos/davedoesdev/pub-keystore/badge.png?branch=master)](https://coveralls.io/r/davedoesdev/pub-keystore?branch=master) [![NPM version](https://badge.fury.io/js/pub-keystore.png)](http://badge.fury.io/js/pub-keystore)

A simple store for public keys in Node.js.

- Index keys by URI and issuer IDs.
- Listen to key updates.
- Backed by [PouchDB](http://pouchdb.com/), [CouchDB 2](http://couchdb.apache.org/), [SQLite](https://www.sqlite.org), [PostgreSQL](https://www.postgresql.org) or memory.
- Keys can be in any format (or even not keys!).
- Supports access from multiple processes.
- Full set of unit tests.

Example:

```javascript
var pub_keystore = require('pub-keystore');
var assert = require('assert');
var uri = 'mailto:dave@davedoesdev.com';
var pub_key = 'some key data';
pub_keystore({ db_type: 'pouchdb', db_for_update: true, no_changes: true }, function (err, ks1)
{
    pub_keystore({ db_type: 'pouchdb', keep_master_open: true }, function (err, ks2)
    {
        var the_issuer_id, the_rev;

        ks2.on('change', function (id, rev)
        {
            assert.equal(id, uri);
            assert.equal(rev, the_rev);

            ks2.get_pub_key_by_issuer_id(the_issuer_id, function (err, pub_key2, uri2, rev2)
            {
                assert.equal(pub_key2, pub_key);
                assert.equal(uri2, uri);
                assert.equal(rev2, the_rev);
                console.log("done");
            });
        });

        ks1.add_pub_key(uri, pub_key, function (err, issuer_id, rev)
        {
            the_issuer_id = issuer_id;
            the_rev = rev;
            ks1.deploy();
        });
    });
});
```

The API is described [here](#tableofcontents).

## Installation

```shell
npm install pub-keystore
```

## Licence

[MIT](LICENCE)

## Test

```shell
grunt test
```

## Code Coverage

```shell
grunt coverage
```

[c8](https://github.com/bcoe/c8) results are available [here](http://rawgit.davedoesdev.com/davedoesdev/pub-keystore/master/coverage/lcov-report/index.html).

Coveralls page is [here](https://coveralls.io/r/davedoesdev/pub-keystore).

## Lint

```shell
grunt lint
```

## CLI

In the `cli` directory are some command line utilities which call into the API.  They do simple things like creating stores and adding and removing public keys. I hope you find them useful but at the very least they should prove good examples of how to call the API.

# API

_Source: [docs.js](/docs.js)_

<a name="tableofcontents"></a>


## Opening a key store
- <a name="toc_moduleexportsconfig-cb"></a><a name="toc_module"></a>[module.exports](#moduleexportsconfig-cb)

## PubKeyStore
### Adding and removing keys
- <a name="toc_pubkeystoreprototypeadd_pub_keyuri-pub_key-options-cb"></a><a name="toc_pubkeystoreprototype"></a><a name="toc_pubkeystore"></a>[PubKeyStore.prototype.add_pub_key](#pubkeystoreprototypeadd_pub_keyuri-pub_key-options-cb)
- <a name="toc_pubkeystoreprototyperemove_pub_keyuri-cb"></a>[PubKeyStore.prototype.remove_pub_key](#pubkeystoreprototyperemove_pub_keyuri-cb)

### Retrieving keys
- <a name="toc_pubkeystoreprototypeget_pub_key_by_uriuri-cb"></a>[PubKeyStore.prototype.get_pub_key_by_uri](#pubkeystoreprototypeget_pub_key_by_uriuri-cb)
- <a name="toc_pubkeystoreprototypeget_pub_key_by_issuer_idissuer_id-cb"></a>[PubKeyStore.prototype.get_pub_key_by_issuer_id](#pubkeystoreprototypeget_pub_key_by_issuer_idissuer_id-cb)
- <a name="toc_pubkeystoreprototypeget_issuer_iduri-cb"></a>[PubKeyStore.prototype.get_issuer_id](#pubkeystoreprototypeget_issuer_iduri-cb)
- <a name="toc_pubkeystoreprototypeget_uriscb"></a>[PubKeyStore.prototype.get_uris](#pubkeystoreprototypeget_uriscb)

### Lifecycle
- <a name="toc_pubkeystoreprototypeclosecb"></a>[PubKeyStore.prototype.close](#pubkeystoreprototypeclosecb)
- <a name="toc_pubkeystoreprototypecreatecb"></a>[PubKeyStore.prototype.create](#pubkeystoreprototypecreatecb)
- <a name="toc_pubkeystoreprototypedestroycb"></a>[PubKeyStore.prototype.destroy](#pubkeystoreprototypedestroycb)

### Replication (PouchDB only)
- <a name="toc_pubkeystoreprototypedeploycb"></a>[PubKeyStore.prototype.deploy](#pubkeystoreprototypedeploycb)
- <a name="toc_pubkeystoreprototypereplicateopts-cb"></a>[PubKeyStore.prototype.replicate](#pubkeystoreprototypereplicateopts-cb)

### Events
- <a name="toc_pubkeystoreeventschangeuri-rev-deleted"></a><a name="toc_pubkeystoreevents"></a>[PubKeyStore.events.change](#pubkeystoreeventschangeuri-rev-deleted)
- <a name="toc_pubkeystoreeventserrorerr"></a>[PubKeyStore.events.error](#pubkeystoreeventserrorerr)
- <a name="toc_pubkeystoreeventsreplicatedclose_master"></a>[PubKeyStore.events.replicated](#pubkeystoreeventsreplicatedclose_master)
- <a name="toc_pubkeystoreeventsreplicate_errorerr"></a>[PubKeyStore.events.replicate_error](#pubkeystoreeventsreplicate_errorerr)

<a name="module"></a>

## module.exports(config, cb)

> Opens a public keystore.

**Parameters:**

- `{Object} config` Configures the keystore. Valid properties:
  - `{String} db_type` The type of database to use for backing the store. You must supply `pouchdb`, `couchdb`, `sqlite`, `pg` or `in-mem`.

  - `{String} [db_name]` (`db_type='pouchdb'` or `db_type='couchdb'`) Name of database to use for storing keys. Defaults to `pub-keys`.

  - `{Boolean} [db_already_created]` (`db_type='pouchdb'` or `db_type='couchdb'`) If falsey then the database will be created. This is an idempotent operation so it doesn't matter if the database has already been created. However, if you know the database already exists then you can pass `true`. Defaults to `false`. If the database doesn't exist and you don't have permission to create it then `cb` will receive an error. You must create SQLite and PostgreSQL databases beforehand. For SQLite, use a _copy_ of [`sql/pub-keystore.empty.sqlite3`](sql/pub-keystore.empty.sqlite3).

  - `{Boolean} [no_changes]` Don't emit `change` events when a key is changed. Defaults to `false` (i.e. do emit `change` events).

  - `{Boolean} [verbose]` Write key changes, warnings and errors to `console`. Defaults to `false`.

  - `{Boolean} [no_updates]` Don't allow [`add_pub_key`](#pubkeystoreprototypeadd_pub_keyuri-pub_key-cb) to add a key if one already exists for a URI. That is, each URI can only be associated with a public key once and the association cannot be updated. Defaults to `false`.

  - `{Boolean} [db_for_update]` (`db_type='pouchdb'`) PouchDB can only write to a database from one process at a time. If you want to run multiple processes against the same keystore, `pub-keystore` can work around this by writing to a master database and then replicating it to multiple reader databases (one for each process). When you're updating keys, pass `db_for_update=true` to write to the master database. Make sure you [`deploy`](#pubkeystoreprototypedeploycb) and close the master database after updating it so that your reader processes can open it for replication. Defaults to `false`.

  - `{String} [deploy_name]` (`db_type='pouchdb'`) Name of the replica database to use for the current process (when `db_for_update=false`). Make sure you specify a different `deploy_name` for each process running against the same keystore. Defaults to `default`.

  - `{String} [db_dir]` (`db_type='pouchdb'`) Where to write the PouchDB database files. Defaults to a directory named `pouchdb/store/<db_name>` in the `pub_keystore` module directory.

  - `{Boolean} [no_initial_replicate]` (`db_type='pouchdb'`) Whether to skip initial replication from the master database. Defaults to `false`. Note that replication will still occur whenever the master database is updated and [`deploy`](#pubkeystoreprototypedeploycb)ed.

  - `{Boolean} [keep_master_open]` (`db_type='pouchdb'`) Normally the master database is closed after replicating from it so that it can be updated or replicated from other processes. However, if you want to use master and replica databases from a single process then you'll need to specify `keep_master_open=true` to stop PouchDB getting confused. Defaults to `false`. Normally if only a single process is accessing the keystore then you can just open one instance with `db_for_update=true`.

  - `{Boolean} [persistent_watch]` (`db_type='pouchdb'`) Reader processes monitor a shared file to know when [`deploy`](#pubkeystoreprototypedeploycb) has been called on the master database, using [`fs.watch`](http://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener). By default, the watch isn't persistent so it won't keep your process open if nothing else is going on. Pass `persistent_watch=true` to make it persistent.

  - `{String} [replicate_signal]` (`db_type='pouchdb'`) Name of a Unix signal (e.g. `SIGUSR2`) which can be sent to a reader process to force a replication from the master database. Defaults to `undefined` (no signal will be listened to). Replication normally happens when [`deploy`](#pubkeystoreprototypedeploycb) is called from the writing process or [`replicate`](#pubkeystoreprototypereplicateopts-cb) is called from the reading process.

  - `{String} [db_host]` (`db_type='couchdb'`) URL of the CouchDB server. Defaults to `http://127.0.0.1`.

  - `{Integer} [db_port]` (`db_type='couchdb'`) Port number of the CouchDB server. Defaults to `5984`.

  - `{String} [ca]` (`db_type='couchdb'`) When connecting using HTTPS, an authority certificate or array of authority certificates to check the remote host against. Defaults to `undefined` (no checking will be performed).

  - `{String} [username]` (`db_type='couchdb'`) If you need to authenticate to your CouchDB server (e.g. to gain database update rights) then specify the name of the user here. Defaults to `undefined` (anonymous access). Note that users updating the CouchDB database must have the `db_name-updater` role, where `db_name` is the name of the database (see above, the default role required is `pub-keys-updater`).

  - `{String} [password]` (`db_type='couchdb'`) If you need to authenticate to your CouchDB server (e.g. to gain database update rights) then specify the user's password here. Defaults to `undefined` (anonymous access).

  - `{Integer} [maxSockets]` (`db_type='couchdb'`) Maximum number of concurrent sockets that can be opened to the CouchDB server. Defaults to `Infinity`.

  - `{Integer} [busy_wait]` (`db_type='sqlite'` or `db_type='pg'`) Number of milliseconds to wait for retrying if another keystore has the database file locked or is performing a transaction. Defaults to 1000.

  - `{Integer} [check_interval]` (`db_type='sqlite'` or `db_type='pg'`) Number of milliseconds between checking the database for changes. Defaults to 1000.

  - `{String} db_filename` (`db_type='sqlite'`) Filename in which to store public keys. You should use a _copy_ of [`sqlite/pub-keystore.empty.sqlite3`](sqlite/pub-keystore.empty.sqlite3).

  - `{Integer} [db_mode]` (`db_type='sqlite'`) Mode to open the file in. See the [sqlite3](https://github.com/mapbox/node-sqlite3/wiki/API#new-sqlite3databasefilename-mode-callback) documentation.

  - `{Object} db` (`db_type='pg'`) [`node-postgres` configuration](https://node-postgres.com/api/client).

- `{Function} cb` Function called with the result of opening the keystore. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`. Note that for PouchDB-backed stores, if the database is already open by another process for update or replication, you will receive an error. It's up to you to retry as appropriate for your application.

  - `{PubKeyStore} ks` The [`PubKeyStore`](#pubkeystore) object. Note that in the case of an error occuring _after_ the store has been open but before a successful changes feed has been established, you may receive `err` _and_ `ks`.

<sub>Go: [TOC](#tableofcontents) | [module](#toc_module)</sub>

<a name="pubkeystoreprototype"></a>

<a name="pubkeystore"></a>

## PubKeyStore.prototype.add_pub_key(uri, pub_key, [options], [cb])

> Add a public key to the keystore.

**Parameters:**

- `{String} uri` A known, permanent identifier for the public key's owner. You can use anything but a [URI](http://en.wikipedia.org/wiki/Uniform_resource_identifier) seems ideal. For example if you know the owner's email address then you could you a `mailto` URI (e.g. `mailto:dave@davedoesdev.com`).
- `{String | Object} pub_key` The public key itself. This can be in any format (e.g. [PEM](http://www.faqs.org/qa/qa-14736.html)).
- `{Object} [options]` Additional options. Valid properties:
  - `{Boolean} [allow_update]` If you passed `no_updates=true` when [opening the keystore](#moduleexportsconfig-cb), you can override it here by passing `true`, which allows this call to update an existing public key.

- `{Function} [cb]` Function to call once the key has been added. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

  - `{String} issuer_id` A unique, hex-encoded, random string which you can use as an alternative when retrieving the public key. This is useful if you want to give out an identifier for the key without revealing its owner. Note that every time you add a key, a new `issuer_id` will be generated. If a key already exists for the `uri` then it will be overwritten.

  - `{String} rev` A revision string for the key. Like the `issuer_id`, this will change every time a key is added. Unlike the `issuer_id`, it is sent with [`change`](#pubkeystoreeventschangeuri-rev-deleted) events so you if you're caching keys then you can tell whether the cached version is up-to-date.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.remove_pub_key(uri, [cb])

> Remove a public key from the keystore.

**Parameters:**

- `{String} uri` The permanent identifier you gave to the key when adding it using [`add_pub_key`](#pubkeystoreprototypeadd_pub_keyuri-pub_key-cb).
- `{Function} [cb]` Function to call once the key has been removed. It will receive the following argument:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`. A non-existent key is _not_ treated as an error.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.get_pub_key_by_uri(uri, cb)

> Retrieve a public key using its permanent identifier (URI).

**Parameters:**

- `{String} uri` The permanent identifier you gave to the key when adding it using [`add_pub_key`](#pubkeystoreprototypeadd_pub_keyuri-pub_key-cb).
- `{Function} cb` Function to call with the result. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`. A non-existent key is _not_ treated as an error.

  - `{String|Object} pub_key` The public key for the `uri`, or `null` if it wasn't found.

  - `{String} issuer_id` The current unique, random string you can use to retrieve the key using [`get_pub_key_by_issuer_id`](#pubkeystoreprototypeget_pub_key_by_issuer_idissuer_id-cb).

  - `{String} rev` The current revision string for the public key.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.get_pub_key_by_issuer_id(issuer_id, cb)

> Retrieve a public key using its unique, random identifier.

**Parameters:**

- `{String} issuer_id` The unique identifier for the key.
- `{Function} cb` Function to call with the result. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`. A non-existent key is _not_ treated as an error.

  - `{String|Object} pub_key` The public key for the `issuer_id`, or `null` if it wasn't found.

  - `{String} uri` The permanent identifier you gave to the key when adding it using [`add_pub_key`](#pubkeystoreprototypeadd_pub_keyuri-pub_key-cb).

  - `{String} rev` The current revision string for the public key.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.get_issuer_id(uri, cb)

> Get a unique, random identifier for a public key.

**Parameters:**

- `{String} uri` The permanent identifier you gave to the key when adding it using [`add_pub_key`](#pubkeystoreprototypeadd_pub_keyuri-pub_key-cb).
- `{Function} cb` Function to call with the result. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`. A non-existent key is _not_ treated as an error.

  - `{String} issuer_id` The current unique, random string you can use to retrieve the key using [`get_pub_key_by_issuer_id`](#pubkeystoreprototypeget_pub_key_by_issuer_idissuer_id-cb), or `null` if it wasn't found.

  - `{String} rev` The current revision string for the public key.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.get_uris(cb)

> Get a list of all of the public key URIs in the store.

**Parameters:**

- `{Function} cb` Function to call with the result. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

  - `{Array} uris` URIs of all the public keys in the store.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.close([cb])

> Close the store and its backing database.

**Parameters:**

- `{Function} [cb]` Function to call once the database has been closed. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.create([cb])

> Create the store's backing database.

Unless you pass `db_already_created=true` when [opening the keystore](#moduleexportsconfig-cb), this method is automatically called for you when the store is opened. It is an idempotent operation so it doesn't matter if you call it twice.

For SQLite- and PostgreSQL-backed databases, this is a no-op: you must create the database beforehand. For in-memory databases, this is also a no-op.

**Parameters:**

- `{Function} [cb]` Function to call once the database has been created. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.destroy([cb])

> Close the store and destroy its backing database. This will delete all public keys!

For SQLite- and PostgreSQL-backed databases, this deletes the keys but doesn't destroy the database.

**Parameters:**

- `{Function} [cb]` Function to call once the database has been destroyed. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.deploy([cb])

> (PouchDB) Notify reader processes to replicate from the master database. You should call this when you've [opened the keystore](#moduleexportsconfig-cb) with `db_for_update=true`, performed some updates and want other processes reading from the store to receive the updates. Internally it uses [`touch`](https://github.com/isaacs/node-touch) and [`fs.watch`](http://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener) on a shared file.

For CouchDB-, SQLite-, PostgreSQL- and memory-backed keystores, this is a no-op.

**Parameters:**

- `{Function} [cb]` Function to call once the shared file has been `touch`ed. Note this will be before reader processes finish replicating. It will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

## PubKeyStore.prototype.replicate(opts, [cb])

> (PouchDB) Force replication from the master database. Usually you shouldn't need to call this because reader processes (where the keystore is [opened](#moduleexportsconfig-cb) _without_ `db_for_update=true`) will replicate when the keystore is opened and when they detect that a writer process has called [`deploy`](#pubkeystoreprototypedeploycb).

For CouchDB-, SQLite-, PostgreSQL- and memory-backed keystores, this is a no-op.

**Parameters:**

- `{Object} opts` Replication options. Valid properties:
  - `{Boolean} no_retry` If replication fails (typically because the master database is open in another process also trying to replicate) then it is automatically retried after a random delay of between 1 and 2 seconds. Set `no_retry` to `true` to disable this behaviour. Defaults to `false`.

- `{Functon} [cb]` Function to call once replication has completed successfully (or failed if you set `opts.no_retry=true` and an error occurred). Alternatively you can listen for the [`replicated`](#pubkeystoreeventsreplicatedclose_master) event which is emitted on successful replication (for consistency, CouchDB-backed stores will raise this too, after the no-op). `cb` will receive the following arguments:
  - `{Object} err` If an error occurred then details of the error, otherwise `null`.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.prototype](#toc_pubkeystoreprototype)</sub>

<a name="pubkeystoreevents"></a>

## PubKeyStore.events.change(uri, rev, deleted)

> `change` event

Emitted when a public key is updated or removed from the keystore.

**Parameters:**

- `{String} uri` The permanent identifier for the key.
- `{String} rev` The new revision string for the key.
- `{Boolean} deleted` Whether the key has been removed from the store.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.events](#toc_pubkeystoreevents)</sub>

## PubKeyStore.events.error(err)

> `error` event

Emmited when an error occurs in the changes feed from the database. This may mean you receive no more [`change`](#pubkeystoreeventschangeuri-rev-deleted) events.

**Parameters:**

- `{Object} err` Details of the error.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.events](#toc_pubkeystoreevents)</sub>

## PubKeyStore.events.replicated(close_master)

> `replicated` event

Emitted when a successful replication from the master database completes (PouchDB-backed keystores). CouchDB-, SQLite-, PostgreSQL- and memory-backed stores emit this too for consistency, after [`replicate`](#pubkeystoreprototypereplicateopts-cb) is called.

**Parameters:**

- `{Function} close_master` Function you can call to close the master database if you set `config.keep_master_open=true` when [opening the keystore](#moduleexportsconfig-cb). This lets you control when to close the master database yourself. If you didn't set `config.keep_master_open=true` then `close_master` is a no-op. `close_master` takes the following parameters:
  - `{Function} cb(err)` This will be called after the master database is closed (or after the no-op).

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.events](#toc_pubkeystoreevents)</sub>

## PubKeyStore.events.replicate_error(err)

> `replicate_error` event

Emitted when replication from the master database fails (PouchDB-backed keystores only). This is emitted even when replication retry is enabled (i.e. if you didn't set `no_retry=true` when [opening the store](#moduleexportsconfig-cb)).

**Parameters:**

- `{Object} err` Details of the error.

<sub>Go: [TOC](#tableofcontents) | [PubKeyStore.events](#toc_pubkeystoreevents)</sub>

_&mdash;generated by [apidox](https://github.com/codeactual/apidox)&mdash;_
