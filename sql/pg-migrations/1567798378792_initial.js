'use strict';

exports.up = pgm => {
    pgm.createTable('pub_keys', {
        id: {
            type: 'bigserial',
            primaryKey: true
        },
        uri: {
            type: 'text',
            notNull: true
        },
        issuer_id: {
            type: 'text',
            unique: true
        },
        pub_key: {
            type: 'text'
        },
        deleted: {
            type: 'boolean',
            notNull: true
        }
    });

    pgm.createIndex('pub_keys', 'uri', {
        name: 'by_uri'
    });

    pgm.createIndex('pub_keys', 'issuer_id', {
        name: 'by_issuer_id'
    });
};

exports.down = pgm => {
    pgm.dropTable('pub_keys');
};
