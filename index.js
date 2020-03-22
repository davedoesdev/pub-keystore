/*jslint node: true, nomen: true */
"use strict";

var path = require('path');

module.exports = function (config, cb)
{
    let driver;
    switch (config.db_type)
    {
        case 'pouchdb':
        case 'couchdb':
        case 'in-mem':
            driver = config.db_type;
            break;

        case 'sqlite':
        case 'pg':
            driver = 'sql';
            break;

        default:
            return cb(new Error(`invalid database type: ${config.db_type}`));
    }

    var f;
    
    try
    {
        f = require(path.join(__dirname, driver));
    }
    catch (ex)
    {
        return cb(ex);
    }
    
    f(config, function (err, ks)
    {
        if (ks)
        {
            ks.db_type = config.db_type;
            ks.driver = driver;

            if (!config.db_already_created)
            {
                return ks.create(function (err2)
                {
                    if (err && (err.message === 'not_found'))
                    {
                        cb(err2, ks);
                    }
                    else
                    {
                        cb(err, ks);
                    }
                });
            }
        }

        cb(err, ks);
    });
};

