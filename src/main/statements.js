"use strict";
const connections = new WeakMap();
const maximumStatements = 96;

function prepareStatement(db, sql) {
    let cache = connections.get(db);
    if (!cache) {
        cache = new Map();
        connections.set(db, cache);
    }
    let statement = cache.get(sql);
    if (!statement) {
        statement = db.prepare(sql);
        cache.set(sql, statement);
        if (cache.size > maximumStatements)
            cache.delete(cache.keys().next().value);
    }
    return statement;
}
exports.prepareStatement = prepareStatement;
