"use strict";
const { prepareStatement } = require("./statements");
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConsumptionWorkspace = getConsumptionWorkspace;
exports.saveConsumption = saveConsumption;
exports.deleteConsumption = deleteConsumption;
exports.getMeterReport = getMeterReport;
exports.getRecentConsumptionPeriods = getRecentConsumptionPeriods;
const detailSelect = `SELECT cd.id,cd.subscriber_id subscriberId,s.name subscriberName,b.name boxName,b.region_id regionId,
 cd.counter_id counterId,COALESCE(c.counter_number,'') counterNumber,cd.counter_value counterValue,
 0 previousCounterValue,
 cd.kilo_price_lbp kiloPriceLbp,COALESCE(cd.kilo_price_usd,0) kiloPriceUsd,
 cd.subscription_fee_lbp subscriptionFeeLbp,COALESCE(cd.subscription_fee_usd,0) subscriptionFeeUsd,
 cd.notes,cd.paid,cd.discount_lbp discountLbp,cd.paid_value_lbp paidValueLbp,
 COALESCE(cd.discount_usd,0) discountUsd,COALESCE(cd.paid_value_usd,0) paidValueUsd,cd.collector_id collectorId
 FROM consumption_details cd JOIN subscribers s ON s.id=cd.subscriber_id JOIN boxes b ON b.id=s.box_id
 LEFT JOIN counters c ON c.id=cd.counter_id`;
function normalize(row) { return { ...row, paid: Boolean(row.paid) }; }
function previousMonthlyReference(reference) {
    const match = /^(\d{4})(\d{2})$/.exec(String(reference ?? '').trim());
    if (!match)
        return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12)
        return undefined;
    const previousYear = month === 1 ? year - 1 : year;
    const previousMonth = month === 1 ? 12 : month - 1;
    return `${previousYear}${String(previousMonth).padStart(2, '0')}`;
}
function previousMonthDateRange(consumptionDate) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(consumptionDate ?? '').slice(0, 10));
    if (!match)
        return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12)
        return undefined;
    const previousYear = month === 1 ? year - 1 : year;
    const previousMonth = month === 1 ? 12 : month - 1;
    const start = `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-01`;
    return { start, end };
}
function getPreviousReadings(db, reference, consumptionDate) {
    const previousReference = previousMonthlyReference(reference);
    let previousPeriod = previousReference
        ? prepareStatement(db, `SELECT id FROM consumption_periods WHERE reference=? ORDER BY consumption_date DESC,id DESC LIMIT 1`).get(previousReference)
        : undefined;
    if (!previousPeriod) {
        const range = previousMonthDateRange(consumptionDate);
        if (range)
            previousPeriod = prepareStatement(db, `SELECT id FROM consumption_periods WHERE consumption_date>=? AND consumption_date<? ORDER BY consumption_date DESC,id DESC LIMIT 1`).get(range.start, range.end);
    }
    if (!previousPeriod)
        return { exact: new Map(), subscriber: new Map() };
    const rows = prepareStatement(db, `SELECT subscriber_id subscriberId,counter_id counterId,counter_value counterValue FROM consumption_details WHERE consumption_id=? ORDER BY id DESC`).all(previousPeriod.id);
    const exact = new Map();
    const subscriber = new Map();
    for (const row of rows) {
        const value = Number(row.counterValue) || 0;
        const key = `${row.subscriberId}:${row.counterId ?? ''}`;
        if (!exact.has(key))
            exact.set(key, value);
        if (!subscriber.has(row.subscriberId))
            subscriber.set(row.subscriberId, value);
    }
    return { exact, subscriber };
}
function applyPreviousReadings(rows, readings) {
    return rows.map(row => ({
        ...row,
        previousCounterValue: readings.exact.get(`${row.subscriberId}:${row.counterId ?? ''}`)
            ?? readings.subscriber.get(row.subscriberId)
            ?? 0,
    }));
}
function getConsumptionWorkspace(db, id) {
    const periods = prepareStatement(db, `SELECT id,reference,consumption_date consumptionDate,COALESCE(notes,'') notes,dollar_rate dollarRate FROM consumption_periods ORDER BY consumption_date DESC,id DESC`).all();
    const regions = prepareStatement(db, `SELECT id,name,kilo_price_lbp kiloPriceLbp,kilo_price_usd kiloPriceUsd FROM regions ORDER BY display_order,id`).all();
    const collector = prepareStatement(db, `SELECT id FROM collectors WHERE active=1 ORDER BY id LIMIT 1`).get()?.id ?? prepareStatement(db, `SELECT id FROM collectors ORDER BY id LIMIT 1`).get()?.id ?? 0;
    const header = id ? periods.find(period => period.id === Number(id)) : undefined;
    // Existing periods already load previous-month readings in one batch below.
    const previousValue = id ? '0' : `COALESCE((SELECT current.counter_value
      FROM consumption_details current
      WHERE current.subscriber_id=s.id AND current.counter_id=c.id AND current.consumption_id=?
      ORDER BY current.id LIMIT 1), (SELECT old.counter_value
      FROM consumption_details old JOIN consumption_periods old_period
      ON old_period.id=old.consumption_id
      WHERE old.subscriber_id=s.id AND old.counter_id=c.id
      ORDER BY old_period.consumption_date DESC,old_period.id DESC LIMIT 1),0)`;
    let candidates = prepareStatement(db, `SELECT s.id subscriberId,s.name subscriberName,b.name boxName,b.region_id regionId,c.id counterId,
    COALESCE(c.counter_number,'') counterNumber,0 counterValue,r.kilo_price_lbp kiloPriceLbp,r.kilo_price_usd kiloPriceUsd,
    ${previousValue} previousCounterValue,
    COALESCE(ap.subscription_fee_lbp,0) subscriptionFeeLbp,COALESCE(ap.subscription_fee_usd,0) subscriptionFeeUsd,
    '' notes,0 paid,0 discountLbp,0 paidValueLbp,0 discountUsd,0 paidValueUsd,? collectorId
    FROM subscribers s JOIN boxes b ON b.id=s.box_id JOIN regions r ON r.id=b.region_id
    JOIN counters c ON c.subscriber_id=s.id AND c.active=1 LEFT JOIN ampere_plans ap ON ap.id=c.ampere_plan_id
    WHERE s.active=1 ORDER BY r.display_order,b.display_order,s.name`).all(...(id ? [collector] : [periods[0]?.id ?? 0, collector])).map(normalize);
    if (!id)
        return { details: [], periods, regions, candidates };
    const previousReadings = getPreviousReadings(db, header.reference, header.consumptionDate);
    candidates = applyPreviousReadings(candidates, previousReadings);
    const details = applyPreviousReadings(prepareStatement(db, `${detailSelect} WHERE cd.consumption_id=? ORDER BY cd.id`).all(id).map(normalize), previousReadings);
    return { header, details, periods, regions, candidates };
}
function getRecentConsumptionPeriods(db) {
    return prepareStatement(db, `SELECT id FROM consumption_periods ORDER BY consumption_date DESC,id DESC LIMIT 2`).all();
}
function saveConsumption(db, header, details) {
    if (!header.reference.trim() || !header.consumptionDate || !Number(header.dollarRate))
        throw new Error('مرجع تسجيل العدادات والتاريخ وقيمة الدولار مطلوبة.');
    return db.transaction(() => {
        let id = header.id;
        if (id)
            prepareStatement(db, `UPDATE consumption_periods SET reference=?,consumption_date=?,notes=?,dollar_rate=? WHERE id=?`).run(header.reference.trim(), header.consumptionDate, header.notes ?? '', header.dollarRate, id);
        else
            id = Number(prepareStatement(db, `INSERT INTO consumption_periods(reference,consumption_date,notes,dollar_rate) VALUES(?,?,?,?)`).run(header.reference.trim(), header.consumptionDate, header.notes ?? '', header.dollarRate).lastInsertRowid);
        prepareStatement(db, `DELETE FROM consumption_details WHERE consumption_id=?`).run(id);
        const insert = prepareStatement(db, `INSERT INTO consumption_details(consumption_id,subscriber_id,counter_value,kilo_price_lbp,kilo_price_usd,subscription_fee_lbp,subscription_fee_usd,notes,paid,discount_lbp,paid_value_lbp,counter_id,collector_id,discount_usd,paid_value_usd) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const d of details)
            insert.run(id, d.subscriberId, Number(d.counterValue) || 0, Number(d.kiloPriceLbp) || 0, Number(d.kiloPriceUsd) || 0, Number(d.subscriptionFeeLbp) || 0, Number(d.subscriptionFeeUsd) || 0, d.notes ?? '', d.paid ? 1 : 0, Number(d.discountLbp) || 0, Number(d.paidValueLbp) || 0, d.counterId, d.collectorId, Number(d.discountUsd) || 0, Number(d.paidValueUsd) || 0);
        return id;
    })();
}
function deleteConsumption(db, id) { db.transaction(() => { prepareStatement(db, `DELETE FROM consumption_details WHERE consumption_id=?`).run(id); prepareStatement(db, `DELETE FROM consumption_periods WHERE id=?`).run(id); })(); }
function getMeterReport(db, id) {
    const periods = prepareStatement(db, `SELECT id,reference,consumption_date consumptionDate,COALESCE(notes,'') notes,dollar_rate dollarRate FROM consumption_periods ORDER BY consumption_date DESC,id DESC`).all();
    if (!id)
        return { periods, rows: [] };
    const header = periods.find(p => p.id === id);
    const rows = prepareStatement(db, `SELECT cd.id,cd.subscriber_id subscriberId,s.name subscriberName,COALESCE(s.phone,'') phone,b.name boxName,b.region_id regionId,r.name regionName,
    cd.counter_id counterId,COALESCE(c.counter_number,'') counterNumber,cd.counter_value counterValue,
    0 previousCounterValue,
    cd.kilo_price_lbp kiloPriceLbp,COALESCE(cd.kilo_price_usd,0) kiloPriceUsd,cd.subscription_fee_lbp subscriptionFeeLbp,
    COALESCE(cd.subscription_fee_usd,0) subscriptionFeeUsd,cd.notes,cd.paid,cd.discount_lbp discountLbp,
    cd.paid_value_lbp paidValueLbp,COALESCE(cd.discount_usd,0) discountUsd,COALESCE(cd.paid_value_usd,0) paidValueUsd,
    cd.collector_id collectorId,COALESCE(ap.amperes,'') amperes
    FROM consumption_details cd JOIN subscribers s ON s.id=cd.subscriber_id
    JOIN boxes b ON b.id=s.box_id JOIN regions r ON r.id=b.region_id LEFT JOIN counters c ON c.id=cd.counter_id
    LEFT JOIN ampere_plans ap ON ap.id=c.ampere_plan_id WHERE cd.consumption_id=? ORDER BY s.name`).all(id);
    const previousReadings = getPreviousReadings(db, header?.reference, header?.consumptionDate);
    const normalizedRows = rows.map(row => ({ ...row, paid: Boolean(row.paid) }));
    return { header, periods, rows: applyPreviousReadings(normalizedRows, previousReadings) };
}
