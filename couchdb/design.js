/*global emit: false */
/*jslint node: true, nomen: true */
"use strict";

/*jslint unparam: true */
exports.validate = function (newDoc, oldDoc, userCtx)
{
    if (userCtx.roles.indexOf('DB_NAME-updater') < 0)
    {
        throw({ forbidden: 'not allowed to edit the database' });
    }
};
/*jslint unparam: false */

exports.by_issuer_id = function (doc)
{
    emit(doc.issuer_id,
         { pub_key: doc.pub_key, rev: doc._rev });
};

