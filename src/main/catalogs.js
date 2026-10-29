"use strict";
const { prepareStatement } = require("./statements");
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCatalog = getCatalog;
exports.saveCatalog = saveCatalog;
exports.deleteCatalogRow = deleteCatalogRow;
function getCatalog(db, name) {
    if (name === 'expenseItems')
        return { rows: prepareStatement(db, `SELECT id,name FROM expense_items ORDER BY id`).all(), options: {} };
    if (name === 'subscribers')
        return {
            rows: prepareStatement(db, `SELECT id,subscriber_number subscriberNumber,name,address,phone,notes,box_id boxId,breaker_id breakerId,active FROM subscribers ORDER BY id`).all(),
            options: {
                boxes: prepareStatement(db, `SELECT b.id,b.name,b.region_id regionId,r.name regionName FROM boxes b JOIN regions r ON r.id=b.region_id ORDER BY r.display_order,r.id,b.display_order,b.id`).all(),
                breakers: prepareStatement(db, `SELECT id,type name FROM breakers ORDER BY id`).all(),
            },
        };
    if (name === 'counters')
        return {
            rows: prepareStatement(db, `SELECT id,counter_number counterNumber,subscriber_id subscriberId,ampere_plan_id amperePlanId,insurance_fee_lbp insuranceFee,counter_price_lbp counterPrice,active FROM counters ORDER BY id`).all(),
            options: {
                subscribers: prepareStatement(db, `SELECT s.id,s.subscriber_number subscriberNumber,s.name,
                  EXISTS(SELECT 1 FROM counters c WHERE c.subscriber_id=s.id) assigned
                  FROM subscribers s WHERE s.active=1 ORDER BY s.name`).all(),
                amperePlans: prepareStatement(db, `SELECT id,amperes name FROM ampere_plans ORDER BY id`).all(),
            },
        };
    if (name === 'breakers')
        return {
            rows: prepareStatement(db, `SELECT id,type,price_lbp price,price_usd priceUsd FROM breakers ORDER BY id`).all(),
            options: { prices: prepareStatement(db, `SELECT rbp.id,rbp.breaker_id breakerId,r.name region,rbp.price_lbp price FROM region_breaker_prices rbp JOIN regions r ON r.id=rbp.region_id ORDER BY rbp.breaker_id,r.display_order`).all() },
        };
    if (name === 'regions')
        return {
            rows: prepareStatement(db, `SELECT id,name,kilo_price_lbp kiloPrice,kilo_price_usd kiloPriceUsd,pricing_date pricingDate,display_order displayOrder FROM regions ORDER BY display_order,id`).all(),
            options: {},
        };
    if (name === 'boxes')
        return {
            rows: prepareStatement(db, `SELECT b.id,b.name,b.region_id regionId,b.display_order displayOrder FROM boxes b JOIN regions r ON r.id=b.region_id ORDER BY r.display_order,r.id,b.display_order,b.id`).all(),
            options: { regions: prepareStatement(db, `SELECT id,name FROM regions ORDER BY display_order,id`).all() },
        };
    return {
        rows: prepareStatement(db, `SELECT id,amperes,subscription_fee_lbp feeLbp,subscription_fee_usd feeUsd FROM ampere_plans ORDER BY id`).all(),
        options: {},
    };
}
function saveCatalog(db, name, rows) {
    const run = db.transaction(() => {
        for (const row of rows) {
            const id = Number(row.id) || undefined;
            if (name === 'expenseItems') {
                const value = String(row.name ?? '').trim();
                if (!value)
                    throw new Error('اسم الصنف مطلوب.');
                if (id)
                    prepareStatement(db, `UPDATE expense_items SET name=? WHERE id=?`).run(value, id);
                else
                    prepareStatement(db, `INSERT INTO expense_items(name) VALUES(?)`).run(value);
            }
            else if (name === 'subscribers') {
                const values = [Number(row.subscriberNumber) || null, String(row.name ?? '').trim(), String(row.address ?? ''), String(row.phone ?? ''), String(row.notes ?? ''), Number(row.boxId), Number(row.breakerId) || null, row.active ? 1 : 0];
                if (!values[1] || !values[5])
                    throw new Error('اسم المشترك والعلبة مطلوبان.');
                const originalName = id ? String(prepareStatement(db, `SELECT name FROM subscribers WHERE id=?`).get(id)?.name ?? '').trim() : undefined;
                if (!id || originalName.toLocaleLowerCase() !== values[1].toLocaleLowerCase()) {
                    const duplicateName = prepareStatement(db, `SELECT id FROM subscribers WHERE name=? COLLATE NOCASE AND id<>? LIMIT 1`).get(values[1], id ?? -1);
                    if (duplicateName)
                        throw new Error('يوجد مشترك آخر بالاسم نفسه. يجب أن يكون اسم كل مشترك فريداً.');
                }
                if (id)
                    prepareStatement(db, `UPDATE subscribers SET subscriber_number=?,name=?,address=?,phone=?,notes=?,box_id=?,breaker_id=?,active=? WHERE id=?`).run(...values, id);
                else
                    prepareStatement(db, `INSERT INTO subscribers(subscriber_number,name,address,phone,notes,box_id,breaker_id,active) VALUES(?,?,?,?,?,?,?,?)`).run(...values);
            }
            else if (name === 'counters') {
                const values = [String(row.counterNumber ?? '').trim(), Number(row.subscriberId), Number(row.amperePlanId) || null, Number(row.insuranceFee) || 0, Number(row.counterPrice) || 0, row.active ? 1 : 0];
                if (!values[0] || !values[1])
                    throw new Error('رقم العداد واسم المشترك مطلوبان.');
                const originalSubscriberId = id ? Number(prepareStatement(db, `SELECT subscriber_id subscriberId FROM counters WHERE id=?`).get(id)?.subscriberId) : undefined;
                if (!id || originalSubscriberId !== values[1]) {
                    const duplicate = prepareStatement(db, `SELECT id FROM counters WHERE subscriber_id=? AND id<>? LIMIT 1`).get(values[1], id ?? -1);
                    if (duplicate)
                        throw new Error('هذا المشترك مرتبط بعداد مسبقاً ولا يمكن إضافته مرتين.');
                }
                if (id)
                    prepareStatement(db, `UPDATE counters SET counter_number=?,subscriber_id=?,ampere_plan_id=?,insurance_fee_lbp=?,counter_price_lbp=?,active=? WHERE id=?`).run(...values, id);
                else
                    prepareStatement(db, `INSERT INTO counters(counter_number,subscriber_id,ampere_plan_id,insurance_fee_lbp,counter_price_lbp,active) VALUES(?,?,?,?,?,?)`).run(...values);
            }
            else if (name === 'breakers') {
                const values = [String(row.type ?? '').trim(), Number(row.price) || 0];
                if (!values[0])
                    throw new Error('نوع الديجنتر مطلوب.');
                values.push(Number(row.priceUsd) || 0);
                if (id)
                    prepareStatement(db, `UPDATE breakers SET type=?,price_lbp=?,price_usd=? WHERE id=?`).run(...values, id);
                else
                    prepareStatement(db, `INSERT INTO breakers(type,price_lbp,price_usd) VALUES(?,?,?)`).run(...values);
            }
            else if (name === 'amperePlans') {
                const values = [String(row.amperes ?? '').trim(), Number(row.feeLbp) || 0, Number(row.feeUsd) || 0];
                if (!values[0])
                    throw new Error('قيمة الأمبير مطلوبة.');
                if (id)
                    prepareStatement(db, `UPDATE ampere_plans SET amperes=?,subscription_fee_lbp=?,subscription_fee_usd=? WHERE id=?`).run(...values, id);
                else
                    prepareStatement(db, `INSERT INTO ampere_plans(amperes,subscription_fee_lbp,subscription_fee_usd) VALUES(?,?,?)`).run(...values);
            }
            else if (name === 'regions') {
                const requestedOrder = Number(row.displayOrder) || 0;
                const nextOrder = requestedOrder ? 0 : Number(prepareStatement(db, `SELECT COALESCE(MAX(display_order),0)+1 nextOrder FROM regions`).get().nextOrder);
                const values = [String(row.name ?? '').trim(), Number(row.kiloPrice) || 0, Number(row.kiloPriceUsd) || 0, String(row.pricingDate ?? '').trim(), requestedOrder || nextOrder];
                if (!values[0] || !values[3])
                    throw new Error('اسم الحي وتاريخ السعر مطلوبان.');
                if (id)
                    prepareStatement(db, `UPDATE regions SET name=?,kilo_price_lbp=?,kilo_price_usd=?,pricing_date=?,display_order=? WHERE id=?`).run(...values, id);
                else
                    prepareStatement(db, `INSERT INTO regions(name,subscription_fee_lbp,kilo_price_lbp,pricing_date,display_order,kilo_price_usd) VALUES(?,0,?,?,?,?)`).run(values[0], values[1], values[3], values[4], values[2]);
            }
            else {
                const regionId = Number(row.regionId);
                const requestedOrder = Number(row.displayOrder) || 0;
                const nextOrder = !requestedOrder && regionId ? Number(prepareStatement(db, `SELECT COALESCE(MAX(display_order),0)+1 nextOrder FROM boxes WHERE region_id=?`).get(regionId).nextOrder) : 0;
                const values = [String(row.name ?? '').trim(), regionId, requestedOrder || nextOrder];
                if (!values[0] || !values[1])
                    throw new Error('اسم العلبة والحي مطلوبان.');
                if (id)
                    prepareStatement(db, `UPDATE boxes SET name=?,region_id=?,display_order=? WHERE id=?`).run(...values, id);
                else
                    prepareStatement(db, `INSERT INTO boxes(name,region_id,display_order) VALUES(?,?,?)`).run(...values);
            }
        }
    });
    run();
}
const catalogTables = {
    subscribers: 'subscribers', counters: 'counters', breakers: 'breakers',
    amperePlans: 'ampere_plans', regions: 'regions', boxes: 'boxes', expenseItems: 'expense_items',
};
function deleteCatalogRow(db, name, id) {
    if (!Number.isInteger(id) || id <= 0)
        throw new Error('السطر المطلوب غير صالح.');
    prepareStatement(db, `DELETE FROM ${catalogTables[name]} WHERE id = ?`).run(id);
}
