/*jslint node: true, nomen: true */
"use strict";

var path = require('path');

module.exports = function (config, cb)
{
    var f;
    
    try
    {
        f = require(path.join(__dirname, config.db_type));
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

