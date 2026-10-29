"use strict";

function createMeterCache(db, loaders, limit = 6) {
    const workspaces = new Map();
    const reports = new Map();
    let observedVersion = db.pragma('data_version', { simple: true });
    const invalidate = () => { workspaces.clear(); reports.clear(); };
    const synchronize = () => {
        const version = db.pragma('data_version', { simple: true });
        if (version !== observedVersion) {
            invalidate();
            observedVersion = version;
        }
    };
    const read = (cache, id, loader) => {
        synchronize();
        if (!id)
            return loader(db, id);
        if (cache.has(id)) {
            const result = cache.get(id);
            cache.delete(id);
            cache.set(id, result);
            return result;
        }
        const result = loader(db, id);
        cache.set(id, result);
        if (cache.size > limit)
            cache.delete(cache.keys().next().value);
        return result;
    };
    const getWorkspace = id => read(workspaces, id, loaders.getConsumptionWorkspace);
    const getReport = id => read(reports, id, loaders.getMeterReport);
    return {
        getWorkspace,
        getReport,
        invalidate,
        warmRecent() {
            for (const period of loaders.getRecentConsumptionPeriods(db)) {
                getWorkspace(period.id);
                getReport(period.id);
            }
        },
    };
}
exports.createMeterCache = createMeterCache;
