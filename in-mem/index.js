/*jslint node: true */

const { EventEmitter } = require('events');
const { randomBytes } = require('crypto');

class KeyState extends EventEmitter {
    constructor() {
        super();
        this.keys_by_uri = new Map()
        this.keys_by_issuer_id = new Map();
    }
}

class PubKeyStoreMemory extends EventEmitter {
    constructor(options, cb) {
        super();
        if (options.share_keys_with) {
            this._state = options.share_keys_with._state;
        } else {
            this._state = new KeyState();
        }
        this._changes = !options.no_changes;
        if (this._changes) {
            this._change_listener = (uri, rev, deleted) => {
                this.emit('change', uri, rev, deleted);
            };
            this._state.on('change', this._change_listener);
        }
        this._deploy_listener = store => {
            if (store !== this) {
                this.replicate();
            }
        };
        this._state.on('deploy', this._deploy_listener);
        this._no_updates = options.no_updates;
        this._open = true;
        cb(null, this);
    }

    close(cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        if (this._changes) {
            this._state.removeListener('change', this._change_listener);
        }
        this._state.removeListener('deploy', this._deploy_listener);
        this._open = false;
        cb();
    }

    get_pub_key_by_uri(uri, cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        const entry = this._state.keys_by_uri.get(uri);
        if (!entry) {
            return cb(null, null);
        }
        cb(null, entry.pub_key, entry.issuer_id, entry.rev);
    }

    get_pub_key_by_issuer_id(issuer_id, cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        const entry = this._state.keys_by_issuer_id.get(issuer_id);
        if (!entry) {
            return cb(null, null);
        }
        cb(null, entry.pub_key, entry.uri, entry.rev);
    }

    get_issuer_id(uri, cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        const entry = this._state.keys_by_uri.get(uri);
        if (!entry) {
            return cb(null, null);
        }
        cb(null, entry.issuer_id, entry.rev);
    }

    get_uris(cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        cb(null, Array.from(this._state.keys_by_uri.keys()));
    }

    add_pub_key(uri, pub_key, options, cb) {
        if (typeof options == 'function') {
            cb = options;
            options = {};
        }
        options = options || {};
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        if ((uri === null) || (uri === undefined)) {
            return cb(new Error('invalid_uri'));
        }
        const issuer_id = randomBytes(64).toString('hex');
        const rev = randomBytes(64).toString('hex');
        const entry = this._state.keys_by_uri.get(uri);
        if (entry) {
            if (this._no_updates && !options.allow_update) {
                const err = new Error('already exists');
                err.statusCode = 409;
                err.error = 'conflict';
                return cb(err);
            }
            this._state.keys_by_issuer_id.delete(entry.issuer_id);
            entry.issuer_id = issuer_id;
            entry.pub_key = pub_key;
            entry.rev = rev;
            this._state.keys_by_issuer_id.set(issuer_id, entry);
            this._state.emit('change', uri, rev, false);
            return cb(null, issuer_id, entry.rev);
        }
        const new_entry = { uri, issuer_id, pub_key, rev };
        this._state.keys_by_uri.set(uri, new_entry);
        this._state.keys_by_issuer_id.set(issuer_id, new_entry);
        this._state.emit('change', uri, rev, false);
        cb(null, issuer_id, rev);
    }            

    remove_pub_key(uri, cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        if ((uri === null) || (uri === undefined)) {
            return cb(new Error('invalid_uri'));
        }
        const entry = this._state.keys_by_uri.get(uri);
        if (entry) {
            this._state.keys_by_uri.delete(uri);
            this._state.keys_by_issuer_id.delete(entry.issuer_id);
            this._state.emit('change', uri, randomBytes(64).toString('hex'), true);
        }
        cb();
    }

    create(cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        cb();
    }

    destroy(cb) {
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        this._state.keys_by_uri.clear();
        this._state.keys_by_issuer_id.clear();
        this.close(cb);
    }

    replicate(opts, cb) {
        (typeof opts !== 'function') || (cb = opts);
        cb = cb || (() => {});
        if (!this._open) {
            return cb(new Error('not_open'));
        }
        this.emit('replicated', cb => cb());
        cb();
    }

    deploy(cb) {
        this._state.emit('deploy', this);
        !cb || cb();
    }
}

module.exports = function (config, cb) {
    new PubKeyStoreMemory(config, cb);
};
