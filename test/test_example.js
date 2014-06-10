/*global describe: false,
         expect: false,
         it: false, 
         keystore: false */
/*jslint node: true */
"use strict";

function expr(v) { return v; }

describe('example', function ()
{
    it('should pass', function (cb)
    {
        var uri = 'mailto:dave@davedoesdev.com',
            pub_key = 'some key data';
        keystore({ db_type: 'pouchdb', db_for_update: true, no_changes: true }, function (err, ks1)
        {
            expr(expect(err).not.to.exist);
            keystore({ db_type: 'pouchdb', keep_master_open: true }, function (err, ks2)
            {
                expr(expect(err).not.to.exist);
                var the_issuer_id, the_rev;

                ks2.on('change', function (id, rev)
                {
                    expect(id).to.equal(uri);
                    expect(rev).to.equal(the_rev);

                    ks2.get_pub_key_by_issuer_id(the_issuer_id, function (err, pub_key2, uri2, rev2)
                    {
                        expr(expect(err).not.to.exist);
                        expect(pub_key2).to.equal(pub_key);
                        expect(uri2).to.equal(uri);
                        expect(rev2).to.equal(the_rev);
                        ks1.close(function (err)
                        {
                            expr(expect(err).not.to.exist);
                            ks2.close(function (err)
                            {
                                expr(expect(err).not.to.exist);
                                cb();
                            });
                        });
                    });
                });

                ks1.add_pub_key(uri, pub_key, function (err, issuer_id, rev)
                {
                    expr(expect(err).not.to.exist);
                    the_issuer_id = issuer_id;
                    the_rev = rev;
                    ks1.deploy();
                });
            });
        });
    });

    it('should fail when not kept open', function (cb)
    {
        var uri = 'mailto:dave@davedoesdev.com',
            pub_key = 'some key data';
        keystore({ db_type: 'pouchdb', db_for_update: true, no_changes: true }, function (err, ks1)
        {
            expr(expect(err).not.to.exist);
            keystore({ db_type: 'pouchdb' }, function (err, ks2)
            {
                expr(expect(err).not.to.exist);

                ks1.add_pub_key(uri, pub_key, function (err)
                {
                    expect(err.message).to.equal('database is closed');
                    ks1.close(function (err)
                    {
                        expr(expect(err).not.to.exist);
                        ks2.close(function (err)
                        {
                            expr(expect(err).not.to.exist);
                            cb();
                        });
                    });
                });
            });
        });
    });
});
