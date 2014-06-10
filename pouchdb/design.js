/*global emit: false */
/*jslint node: true, nomen: true */
"use strict";

exports.by_issuer_id = function (doc)
{
    emit(doc.issuer_id,
         { pub_key: doc.pub_key, rev: doc._rev });
};

