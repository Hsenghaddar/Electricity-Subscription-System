import './styles.css';
const $ = (selector) => document.querySelector(selector);
const showNoSearchResults = () => { void messageDialog('لم يتم العثور على نتيجة مطابقة.'); };
const authScreen = $('#auth-screen');
const appScreen = $('#app');
const usersWindow = $('#users-window');
let firstRun = false;
let users = [];
let newRowNumber = 0;
let topWindowLayer = 10;
const searchTextCache = new Map();
const arabicCollator = new Intl.Collator('ar');
function normalizedSearch(value) {
    const text = String(value ?? '');
    let normalized = searchTextCache.get(text);
    if (normalized === undefined) {
        normalized = text.toLocaleLowerCase('ar');
        if (searchTextCache.size >= 4096)
            searchTextCache.delete(searchTextCache.keys().next().value);
        searchTextCache.set(text, normalized);
    }
    return normalized;
}
function findSearchMatches(items, query, label = item => item.label) {
    const normalized = normalizedSearch(query);
    return items.filter(item => normalizedSearch(label(item)).includes(normalized));
}
async function selectSearchResult(items, promptText, trimQuery = false) {
    const entered = await searchDialog(promptText, true);
    if (typeof entered !== 'string' || !entered.trim())
        return;
    const matches = findSearchMatches(items, trimQuery ? entered.trim() : entered);
    if (!matches.length) {
        showNoSearchResults();
        return;
    }
    for (const item of matches) {
        if (await searchDialog(`هل "${item.label}" هو المطلوب؟`, false)) {
            item.run();
            return;
        }
    }
}
function buildOptionLabels(options) {
    const counts = new Map();
    for (const option of options) {
        const label = optionLabel(option);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return new Map(options.map(option => {
        const label = optionLabel(option);
        return [String(option.id), counts.get(label) > 1 ? `${label} (#${option.id})` : label];
    }));
}
function closeContextMenu() { document.querySelector('.context-menu')?.remove(); }
function showDeleteMenu(event, onDelete) {
    event.preventDefault();
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    const button = document.createElement('button');
    button.textContent = 'حذف السطر';
    button.addEventListener('click', () => { closeContextMenu(); onDelete(); });
    menu.append(button);
    document.body.append(menu);
    const x = Math.min(event.clientX, innerWidth - menu.offsetWidth - 6), y = Math.min(event.clientY, innerHeight - menu.offsetHeight - 6);
    menu.style.left = `${Math.max(6, x)}px`;
    menu.style.top = `${Math.max(6, y)}px`;
    setTimeout(() => document.addEventListener('pointerdown', closeContextMenu, { once: true }), 0);
}
function searchDialog(message, withInput) {
    return new Promise(resolve => {
        const shade = document.createElement('div');
        shade.className = 'dialog-shade';
        shade.innerHTML = `<section class="search-dialog" role="dialog" aria-modal="true"><header>بحث <button type="button" data-dialog="cancel">×</button></header><div class="search-dialog-body"><p>${escapeHtml(message)}</p>${withInput ? '<input data-dialog-input autocomplete="off" />' : ''}<div class="search-dialog-actions"><button type="button" data-dialog="ok">${withInput ? 'OK' : 'نعم'}</button><button type="button" data-dialog="cancel">${withInput ? 'Cancel' : 'لا'}</button></div></div></section>`;
        document.body.append(shade);
        const input = shade.querySelector('[data-dialog-input]');
        const ok = shade.querySelector('[data-dialog="ok"]');
        const cancelButtons = [...shade.querySelectorAll('[data-dialog="cancel"]')];
        const cancel = cancelButtons.at(-1);
        const choices = [ok, cancel];
        let choiceIndex = 0;
        let finished = false;
        const finish = (value) => { if (finished)
            return; finished = true; shade.remove(); resolve(value); };
        ok.addEventListener('click', () => finish(withInput ? (input?.value ?? '') : true));
        cancelButtons.forEach(button => button.addEventListener('click', () => finish(withInput ? null : false)));
        choices.forEach((button, index) => button.addEventListener('focus', () => { choiceIndex = index; }));
        shade.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(withInput ? null : false);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                if (document.activeElement === input)
                    choiceIndex = event.key === 'ArrowDown' ? 0 : 1;
                else
                    choiceIndex = choiceIndex === 0 ? 1 : 0;
                choices[choiceIndex].focus();
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                if (document.activeElement === input)
                    ok.click();
                else
                    choices[choiceIndex].click();
            }
        });
        requestAnimationFrame(() => { if (input)
            input.focus();
        else
            ok.focus(); });
    });
}
function messageDialog(message, kind = 'error') {
    return new Promise(resolve => { const shade = document.createElement('div'); shade.className = 'dialog-shade'; shade.innerHTML = `<section class="search-dialog message-dialog ${kind === 'error' ? 'no-result-dialog' : 'success-dialog'}" role="alertdialog" aria-modal="true"><header>${kind === 'error' ? 'تنبيه' : 'تم بنجاح'}</header><div class="search-dialog-body"><p>${message}</p><div class="search-dialog-actions"><button type="button" data-message-ok>موافق</button></div></div></section>`; document.body.append(shade); const ok = shade.querySelector('[data-message-ok]'); const finish = () => { shade.remove(); resolve(); }; ok.addEventListener('click', finish); shade.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        finish();
    } }); requestAnimationFrame(() => ok.focus()); });
}
function confirmationDialog(message) { return new Promise(resolve => { const shade = document.createElement('div'); shade.className = 'dialog-shade'; shade.innerHTML = `<section class="search-dialog message-dialog confirm-dialog" role="dialog" aria-modal="true"><header>تأكيد</header><div class="search-dialog-body"><p>${message}</p><div class="search-dialog-actions"><button type="button" data-confirm="ok">موافق</button><button type="button" data-confirm="cancel">إلغاء</button></div></div></section>`; document.body.append(shade); const ok = shade.querySelector('[data-confirm="ok"]'), cancel = shade.querySelector('[data-confirm="cancel"]'); let finished = false; const finish = (value) => { if (finished)
    return; finished = true; shade.remove(); resolve(value); }; ok.addEventListener('click', () => finish(true)); cancel.addEventListener('click', () => finish(false)); shade.addEventListener('keydown', event => { if (event.key === 'Escape') {
    event.preventDefault();
    finish(false);
}
else if (event.key === 'Enter') {
    event.preventDefault();
    finish(document.activeElement !== cancel);
}
else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    (document.activeElement === ok ? cancel : ok).focus();
} }); requestAnimationFrame(() => ok.focus()); }); }
function saveBeforeCloseDialog() {
    return new Promise(resolve => {
        const shade = document.createElement('div');
        shade.className = 'dialog-shade';
        shade.innerHTML = `<section class="search-dialog message-dialog confirm-dialog save-close-dialog" role="dialog" aria-modal="true"><header>تأكيد الإغلاق</header><div class="search-dialog-body"><p>هل تريد حفظ التغييرات قبل الإغلاق؟</p><div class="search-dialog-actions"><button type="button" data-close-choice="save">حفظ ثم إغلاق</button><button type="button" data-close-choice="discard">إغلاق دون حفظ</button><button type="button" data-close-choice="cancel">إلغاء</button></div></div></section>`;
        document.body.append(shade);
        const buttons = [...shade.querySelectorAll('[data-close-choice]')];
        const finish = choice => { shade.remove(); resolve(choice); };
        buttons.forEach(button => button.addEventListener('click', () => finish(button.dataset.closeChoice)));
        shade.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish('cancel');
            }
            else if (event.key === 'Enter') {
                event.preventDefault();
                finish(document.activeElement?.dataset.closeChoice ?? 'save');
            }
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                const index = Math.max(0, buttons.indexOf(document.activeElement));
                const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? 1 : -1;
                buttons[(index + direction + buttons.length) % buttons.length].focus();
            }
        });
        requestAnimationFrame(() => buttons[0].focus());
    });
}
function showApp(user) {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    $('#current-user').textContent = `المستخدم: ${user.displayName}`;
}
async function setupAuth() {
    firstRun = !(await window.desktopApi.hasUsers());
    if (firstRun) {
        $('#auth-title').textContent = 'إنشاء المستخدم الأول';
        $('#auth-subtitle').textContent = 'أنشئ حساب المسؤول لبدء استخدام البرنامج';
        $('#display-name-field').classList.remove('hidden');
    }
}
$('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#auth-error').textContent = '';
    const username = $('#login-username').value;
    const password = $('#login-password').value;
    const result = firstRun
        ? await window.desktopApi.createFirstUser({ displayName: $('#display-name').value, username, password, active: true })
        : await window.desktopApi.login(username, password);
    if (result.ok && result.user)
        showApp(result.user);
    else
        $('#auth-error').textContent = result.message ?? 'تعذّر فتح البرنامج.';
});
function inputCell(value, field, type = 'text', placeholder = '') {
    const cell = document.createElement('td');
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.dataset.field = field;
    input.placeholder = placeholder;
    if (type === 'checkbox')
        input.checked = value === 'true';
    cell.append(input);
    return cell;
}
function appendUserRow(user) {
    const row = document.createElement('tr');
    row.dataset.id = user ? String(user.id) : '';
    row.dataset.new = user ? 'false' : 'true';
    const number = document.createElement('td');
    number.className = 'row-number';
    number.textContent = user ? String(user.id) : `ج${++newRowNumber}`;
    row.append(number);
    row.append(inputCell(user?.displayName ?? '', 'displayName'));
    row.append(inputCell(user?.username ?? '', 'username'));
    row.append(inputCell('', 'password', 'password', user ? 'بدون تغيير' : 'مطلوبة'));
    row.append(inputCell(String(user?.active ?? true), 'active', 'checkbox'));
    row.addEventListener('focusin', () => {
        document.querySelectorAll('#users-body tr').forEach(item => item.classList.remove('selected'));
        row.classList.add('selected');
    });
    row.addEventListener('contextmenu', event => showDeleteMenu(event, () => void (async () => {
        if (!user) {
            row.remove();
            return;
        }
        const result = await window.desktopApi.deleteUser(user.id);
        if (result.ok) {
            row.remove();
            setMessage('تم حذف المستخدم.', 'success');
        }
        else
            setMessage(result.message ?? 'تعذّر الحذف.', 'error');
    })()));
    $('#users-body').append(row);
    if (!user)
        row.querySelector('[data-field="displayName"]')?.focus();
}
async function loadUsers() {
    users = await window.desktopApi.listUsers();
    $('#users-body').replaceChildren();
    newRowNumber = 0;
    users.forEach(user => appendUserRow(user));
    setMessage('');
}
function setMessage(text, type = '') {
    const message = $('#user-message');
    message.textContent = text;
    message.className = `document-status message ${type}`;
}
async function saveRows() {
    const rows = [...document.querySelectorAll('#users-body tr')];
    if (!rows.length)
        return true;
    setMessage('جارٍ الحفظ...');
    for (const row of rows) {
        const get = (field) => row.querySelector(`[data-field="${field}"]`);
        const displayName = get('displayName').value.trim();
        const username = get('username').value.trim();
        if (!displayName && !username && row.dataset.new === 'true')
            continue;
        const result = await window.desktopApi.saveUser({
            id: row.dataset.id ? Number(row.dataset.id) : undefined,
            displayName, username, password: get('password').value || undefined, active: get('active').checked,
        });
        if (!result.ok) {
            row.classList.add('invalid');
            setMessage(`السطر ${row.rowIndex}: ${result.message}`, 'error');
            await messageDialog(`السطر ${row.rowIndex}: ${result.message}`, 'error');
            return false;
        }
    }
    await loadUsers();
    setMessage('تم حفظ جميع التعديلات بنجاح.', 'success');
    await messageDialog('تم حفظ جميع التعديلات بنجاح.', 'success');
    return true;
}
function openUsers() {
    usersWindow.classList.remove('hidden', 'minimized');
    usersWindow.classList.add('maximized');
    usersWindow.style.zIndex = String(++topWindowLayer);
    $('#workspace-hint').classList.add('hidden');
    void loadUsers();
}
function closeUsersImmediately() { usersWindow.classList.add('hidden'); $('#workspace-hint').classList.remove('hidden'); }
async function closeUsers() { const choice = await saveBeforeCloseDialog(); if (choice === 'discard')
    closeUsersImmediately(); else if (choice === 'save' && await saveRows())
    closeUsersImmediately(); }
$('#users-button').addEventListener('click', openUsers);
$('#new-user').addEventListener('click', () => appendUserRow());
$('#add-user-row').addEventListener('click', () => appendUserRow());
$('#save-users').addEventListener('click', () => void saveRows());
$('#refresh-users').addEventListener('click', () => void loadUsers());
$('#close-users').addEventListener('click', closeUsers);
$('#close-users-2').addEventListener('click', closeUsers);
$('#minimize-users').addEventListener('click', () => usersWindow.classList.toggle('minimized'));
$('#maximize-users').addEventListener('click', () => usersWindow.classList.toggle('maximized'));
$('#logout').addEventListener('click', async () => { await window.desktopApi.logout(); location.reload(); });
let dragging = false;
let offsetX = 0;
let offsetY = 0;
let userDragFrame = 0, userDragX = 0, userDragY = 0;
$('#users-window-header').addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || usersWindow.classList.contains('maximized'))
        return;
    dragging = true;
    const rect = usersWindow.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    $('#users-window-header').setPointerCapture(event.pointerId);
});
$('#users-window-header').addEventListener('pointermove', (event) => {
    if (!dragging)
        return;
    userDragX = event.clientX;
    userDragY = event.clientY;
    if (userDragFrame)
        return;
    userDragFrame = requestAnimationFrame(() => { userDragFrame = 0; const workspace = $('#workspace').getBoundingClientRect(); usersWindow.style.left = `${Math.max(0, Math.min(userDragX - workspace.left - offsetX, workspace.width - 220))}px`; usersWindow.style.top = `${Math.max(0, Math.min(userDragY - workspace.top - offsetY, workspace.height - 40))}px`; });
});
$('#users-window-header').addEventListener('pointerup', () => { dragging = false; });
const catalogs = {
    expenseItems: { title: 'الأصناف', columns: [{ key: 'name', label: 'الصنف' }] },
    subscribers: {
        title: 'المشتركون', columns: [
            { key: 'subscriberNumber', label: 'رقم المشترك', type: 'number' }, { key: 'name', label: 'اسم المشترك' }, { key: 'address', label: 'العنوان' },
            { key: 'phone', label: 'التلفون' }, { key: 'notes', label: 'ملاحظات' }, { key: 'boxId', label: 'العلبة', type: 'select', option: 'boxes' },
            { key: 'breakerId', label: 'الديجنتر', type: 'select', option: 'breakers' }, { key: 'active', label: 'فعّال', type: 'checkbox' },
        ]
    },
    counters: {
        title: 'العدادات', columns: [
            { key: 'counterNumber', label: 'رقم العداد' }, { key: 'subscriberId', label: 'اسم المشترك', type: 'select', option: 'subscribers' },
            { key: 'amperePlanId', label: 'الأمبير', type: 'select', option: 'amperePlans' }, { key: 'insuranceFee', label: 'رسم التأمين', type: 'number' },
            { key: 'counterPrice', label: 'سعر العداد', type: 'number' }, { key: 'active', label: 'فعّال', type: 'checkbox' },
        ]
    },
    breakers: { title: 'الديجنتيرات', columns: [{ key: 'type', label: 'الديجنتر' }, { key: 'price', label: 'السعر الأساسي ل.ل.', type: 'number' }, { key: 'priceUsd', label: 'السعر الثابت ($)', type: 'number' }] },
    amperePlans: {
        title: 'رسوم الاشتراك', columns: [
            { key: 'amperes', label: 'الأمبير' }, { key: 'feeLbp', label: 'رسم الاشتراك (ل.ل.)', type: 'number' }, { key: 'feeUsd', label: 'رسم الاشتراك (دولار)', type: 'number' },
        ]
    },
    regions: {
        title: 'الأحياء', columns: [
            { key: 'name', label: 'اسم الحي' }, { key: 'kiloPrice', label: 'السعر (ل.ل.)', type: 'number' },
            { key: 'kiloPriceUsd', label: 'السعر بالدولار', type: 'number' }, { key: 'pricingDate', label: 'تاريخ السعر' },
            { key: 'displayOrder', label: 'ترتيب الأحياء', type: 'number' },
        ]
    },
    boxes: {
        title: 'العلب', columns: [
            { key: 'name', label: 'اسم العلبة' }, { key: 'regionId', label: 'الحي', type: 'select', option: 'regions' },
            { key: 'displayOrder', label: 'ترتيب العلبة', type: 'number' },
        ]
    },
};
function enableDocumentMovement(win) {
    const header = win.querySelector('.document-titlebar');
    let moving = false, dx = 0, dy = 0, frame = 0, lastX = 0, lastY = 0;
    header.addEventListener('pointerdown', e => { if (e.target.closest('button') || win.classList.contains('maximized'))
        return; moving = true; const r = win.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; header.setPointerCapture(e.pointerId); });
    header.addEventListener('pointermove', e => { if (!moving)
        return; lastX = e.clientX; lastY = e.clientY; if (frame)
        return; frame = requestAnimationFrame(() => { frame = 0; const a = $('#workspace').getBoundingClientRect(); win.style.left = `${Math.max(0, Math.min(lastX - a.left - dx, a.width - 220))}px`; win.style.top = `${Math.max(0, Math.min(lastY - a.top - dy, a.height - 40))}px`; }); });
    header.addEventListener('pointerup', () => { moving = false; });
}
function optionLabel(option) {
    return option.subscriberNumber ? `${option.subscriberNumber} - ${option.name}` : String(option.name ?? option.id);
}
async function openCatalog(name) {
    let win = document.querySelector(`[data-catalog="${name}"]`);
    if (win) {
        win.classList.remove('minimized');
        win.classList.add('maximized');
        win.style.zIndex = String(++topWindowLayer);
        return;
    }
    const config = catalogs[name], data = await window.desktopApi.getCatalog(name);
    win = document.createElement('section');
    win.className = 'document-window catalog-window maximized';
    win.dataset.catalog = name;
    const offset = document.querySelectorAll('.catalog-window').length * 24;
    win.style.left = `${35 + offset}px`;
    win.style.top = `${18 + offset}px`;
    win.style.width = name === 'subscribers' ? 'calc(100% - 70px)' : '760px';
    const searchActions = name === 'counters' ? `<button data-search-action="subscriber"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button><button data-search-action="counter"><img class="search-button-icon" src="/icons/meters-tab.png" alt="" />بحث عن رقم عداد</button>` : name === 'subscribers' ? `<button data-search-action="subscriber"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button>` : '';
    const reportAction = name === 'counters' ? `<button data-action="report"><img class="search-button-icon" src="/icons/report-icon.png" alt="" />تقرير</button><button data-action="export-pdf">تصدير PDF</button>` : '';
    win.innerHTML = `<header class="document-titlebar"><h2>${config.title}</h2><div class="window-controls"><button data-action="min">—</button><button data-action="max">□</button><button data-action="close">×</button></div></header><div class="toolbar"><button data-action="new"><img class="search-button-icon" src="/icons/new-icon.png" alt="" />جديد</button><button data-action="save" class="primary"><img class="search-button-icon" src="/icons/save-icon.png" alt="" />حفظ</button>${searchActions}${reportAction}<button data-action="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-action="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div><div class="grid-area"><table class="editable-grid"><thead><tr><th class="row-number">#</th>${config.columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody></tbody><tfoot><tr data-action="new"><td>✱</td><td colspan="${config.columns.length}">انقر هنا لإضافة سطر جديد</td></tr></tfoot></table></div><footer class="document-status message"></footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    $('#workspace-hint').classList.add('hidden');
    enableDocumentMovement(win);
    const body = win.querySelector('tbody'), status = win.querySelector('footer');
    const markDirty = event => {
        const row = event.target.closest('tr[data-dirty]');
        if (row)
            row.dataset.dirty = 'true';
    };
    body.addEventListener('input', markDirty);
    body.addEventListener('change', markDirty);
    body.addEventListener('beforeinput', event => {
        const input = event.target;
        if (input.matches('input.numeric-input') && event.inputType === 'insertText' && event.data && Number(input.value) === 0 && input.selectionStart === input.selectionEnd)
            input.value = '';
    });
    const optionMaps = {};
    const optionRowsById = {};
    for (const [optionName, optionRows] of Object.entries(data.options))
        optionRowsById[optionName] = new Map(optionRows.map(option => [String(option.id), option]));
    const subscriberLabels = buildOptionLabels(data.options.subscribers ?? []);
    const catalogOptionLabel = (optionName, option) => optionName === 'subscribers'
        ? subscriberLabels.get(String(option.id))
        : optionLabel(option);
    for (const [optionName, optionRows] of Object.entries(data.options)) {
        const list = document.createElement('datalist');
        list.id = `options-${name}-${optionName}`;
        const map = new Map();
        for (const option of optionRows) {
            const label = catalogOptionLabel(optionName, option);
            map.set(label, String(option.id));
            if (!(name === 'counters' && optionName === 'subscribers' && option.assigned))
                list.append(new Option(label));
        }
        optionMaps[optionName] = map;
        win.append(list);
    }
    const rowsById = new Map();
    const draftRows = [];
    const sparse = name === 'subscribers';
    const addRow = (row = {}, target = body) => {
        const tr = document.createElement('tr');
        tr.dataset.id = row.id ? String(row.id) : '';
        if (row.id) rowsById.set(String(row.id), tr);
        tr.dataset.dirty = row.id ? 'false' : 'true';
        const number = document.createElement('td');
        number.className = 'row-number';
        number.textContent = row.id ? String(row.id) : 'ج';
        tr.append(number);
        for (const column of config.columns) {
            const td = document.createElement('td');
            const input = document.createElement('input');
            input.dataset.field = column.key;
            if (column.type === 'select') {
                input.setAttribute('list', `options-${name}-${column.option}`);
                input.dataset.option = column.option;
                const selected = optionRowsById[column.option]?.get(String(row[column.key]));
                input.value = selected ? catalogOptionLabel(column.option, selected) : '';
                input.placeholder = 'اكتب للبحث';
            }
            else {
                input.type = column.type === 'number' ? 'text' : column.type ?? 'text';
                if (column.type === 'number') {
                    input.inputMode = 'decimal';
                    input.classList.add('numeric-input');
                }
                if (column.type === 'checkbox')
                    input.checked = row[column.key] == null && !row.id && (name === 'subscribers' || name === 'counters') && column.key === 'active' ? true : Boolean(row[column.key]);
                else
                    input.value = row[column.key] == null ? '' : String(row[column.key]);
            }
            td.append(input);
            tr.append(td);
        }
        tr.addEventListener('contextmenu', event => showDeleteMenu(event, () => void (async () => { if (!tr.dataset.id) {
            const draftIndex = draftRows.indexOf(tr);
            if (draftIndex >= 0) draftRows.splice(draftIndex, 1);
            tr.remove();
            return;
        } const result = await window.desktopApi.deleteCatalogRow(name, Number(tr.dataset.id)); if (result.ok) {
            tr.remove();
            rowsById.delete(tr.dataset.id);
            const deletedIndex = data.rows.findIndex(item => String(item.id) === tr.dataset.id);
            if (deletedIndex >= 0) {
                data.rows.splice(deletedIndex, 1);
                if (!sparse && deletedIndex < rendered) rendered--;
                if (sparse) rebuildBody();
            }
            status.className = 'document-status message success';
            status.textContent = 'تم حذف السطر.';
            await messageDialog('تم حذف السطر بنجاح.', 'success');
        }
        else {
            status.className = 'document-status message error';
            status.textContent = result.message ?? 'تعذّر الحذف.';
            await messageDialog(result.message ?? 'تعذّر الحذف.', 'error');
        } })()));
        target.append(tr);
        if (!row.id) {
            draftRows.push(tr);
            tr.querySelector('[data-field]')?.focus();
        }
    };
    let rendered = 0;
    const grid = win.querySelector('.grid-area');
    const rowHeight = 35;
    const rebuildBody = () => {
        const active = body.contains(document.activeElement) ? document.activeElement : undefined;
        const selection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : undefined;
        const fragment = document.createDocumentFragment();
        let gap = 0;
        const flushGap = () => {
            if (!gap) return;
            const spacer = document.createElement('tr');
            spacer.className = 'catalog-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            const cell = document.createElement('td');
            cell.colSpan = config.columns.length + 1;
            cell.style.cssText = `height:${gap * rowHeight}px;padding:0;border:0`;
            spacer.append(cell);
            fragment.append(spacer);
            gap = 0;
        };
        for (const record of data.rows) {
            const row = rowsById.get(String(record.id));
            if (row) {
                flushGap();
                fragment.append(row);
            } else {
                gap++;
            }
        }
        flushGap();
        for (const row of draftRows) fragment.append(row);
        body.replaceChildren(fragment);
        if (active?.isConnected) {
            active.focus({ preventScroll: true });
            if (selection) active.setSelectionRange(...selection);
        }
    };
    const renderRange = (start, end) => {
        const fragment = document.createDocumentFragment();
        let changed = false;
        for (let index = start; index < end; index++) {
            const record = data.rows[index];
            if (!rowsById.has(String(record.id))) {
                addRow(record, fragment);
                changed = true;
            }
        }
        if (changed) rebuildBody();
    };
    const renderChunk = () => {
        if (sparse) {
            renderRange(0, Math.min(60, data.rows.length));
            return;
        }
        const fragment = document.createDocumentFragment();
        const batchSize = name === 'counters' ? data.rows.length : 60;
        const end = Math.min(rendered + batchSize, data.rows.length);
        for (; rendered < end; rendered++) addRow(data.rows[rendered], fragment);
        body.append(fragment);
    };
    renderChunk();
    let scrollQueued = false;
    grid.addEventListener('scroll', () => {
        if (scrollQueued) return;
        scrollQueued = true;
        requestAnimationFrame(() => {
            scrollQueued = false;
            if (!win.isConnected) return;
            if (sparse) {
                const first = Math.floor(grid.scrollTop / rowHeight);
                const count = Math.ceil(grid.clientHeight / rowHeight);
                renderRange(Math.max(0, first - 12), Math.min(data.rows.length, first + count + 24));
            } else if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 180 && rendered < data.rows.length) {
                renderChunk();
            }
        });
    }, { passive: true });
    const findSequentially = async (kind) => {
        const label = kind === 'counter' ? 'رقم العداد' : 'اسم المشترك';
        const entered = await searchDialog(`أدخل ${label} أو جزءاً منه`, true);
        if (typeof entered !== 'string')
            return;
        const query = entered.trim().toLocaleLowerCase('ar');
        if (!query) {
            status.textContent = 'لم تكتب شيئاً للبحث.';
            status.className = 'document-status message error';
            return;
        }
        const subscriberName = (id) => String(optionRowsById.subscribers?.get(String(id))?.name ?? '');
        const rowSubscriberName = (row) => name === 'subscribers' ? String(row.name ?? '') : subscriberName(row.subscriberId);
        const matches = findSearchMatches(data.rows, query, row => kind === 'counter' ? row.counterNumber : rowSubscriberName(row));
        if (!matches.length) {
            showNoSearchResults();
            return;
        }
        for (const match of matches) {
            const label = kind === 'counter' ? String(match.counterNumber) : rowSubscriberName(match);
            if (await searchDialog(`هل "${label}" هو المطلوب؟`, false)) {
                if (sparse && !rowsById.has(String(match.id))) {
                    const index = data.rows.indexOf(match);
                    renderRange(Math.max(0, index - 15), Math.min(data.rows.length, index + 45));
                }
                let lastYield = performance.now();
                while (!sparse && rendered < data.rows.length && !rowsById.has(String(match.id))) {
                    renderChunk();
                    if (performance.now() - lastYield > 16) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                        if (!win.isConnected) return;
                        lastYield = performance.now();
                    }
                }
                const tr = rowsById.get(String(match.id));
                if (tr) {
                    pinSearchResult(body, tr);
                    tr.querySelector('input')?.focus();
                }
                status.textContent = `تم الانتقال إلى: ${label}`;
                status.className = 'document-status message success';
                return;
            }
        }
        status.textContent = 'انتهت نتائج البحث دون اختيار.';
        status.className = 'document-status message';
    };
    win.querySelectorAll('[data-search-action]').forEach(button => button.addEventListener('click', () => void findSequentially(button.dataset.searchAction)));
    win.querySelector('[data-action="report"]')?.addEventListener('click', () => void showCounterCatalogReport());
    win.querySelector('[data-action="export-pdf"]')?.addEventListener('click', () => void showCounterCatalogReport(true));
    let closeAfterSave = false;
    const closeImmediately = () => { win.remove(); if (!document.querySelector('.document-window:not(.hidden)'))
        $('#workspace-hint').classList.remove('hidden'); };
    const close = async () => { const choice = await saveBeforeCloseDialog(); if (choice === 'discard')
        closeImmediately(); else if (choice === 'save') {
        closeAfterSave = true;
        win.querySelector('[data-action="save"]').click();
    } };
    win.querySelectorAll('[data-action="close"]').forEach(x => x.addEventListener('click', () => void close()));
    win.querySelector('[data-action="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-action="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelectorAll('[data-action="new"]').forEach(x => x.addEventListener('click', () => addRow()));
    win.querySelector('[data-action="refresh"]').addEventListener('click', () => { win.remove(); void openCatalog(name); });
    win.querySelector('[data-action="save"]').addEventListener('click', async () => { const rows = [...body.querySelectorAll('tr')].filter(tr => tr.dataset.dirty === 'true').map(tr => { const row = {}; if (tr.dataset.id)
        row.id = Number(tr.dataset.id); for (const column of config.columns) {
        const el = tr.querySelector(`[data-field="${column.key}"]`);
        if (el.type === 'checkbox')
            row[column.key] = el.checked;
        else if (el.dataset.option)
            row[column.key] = optionMaps[el.dataset.option]?.get(el.value) ?? el.value;
        else
            row[column.key] = el.value;
    } return row; }); status.textContent = 'جارٍ الحفظ...'; const result = await window.desktopApi.saveCatalog(name, rows); status.className = `document-status message ${result.ok ? 'success' : 'error'}`; status.textContent = result.ok ? 'تم الحفظ بنجاح.' : result.message ?? 'تعذّر الحفظ.'; await messageDialog(result.ok ? 'تم الحفظ بنجاح.' : result.message ?? 'تعذّر الحفظ.', result.ok ? 'success' : 'error'); if (result.ok) {
        if (closeAfterSave)
            closeImmediately();
        else {
            win.remove();
            await openCatalog(name);
        }
    }
    else
        closeAfterSave = false; });
}
function todayIso() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function prioritizedMeterPeriods(periods) { const currentYear = new Date().getFullYear(); return periods.map((period, index) => ({ period, index, year: Number(period.reference.match(/^\d{4}/)?.[0] ?? period.consumptionDate?.slice(0, 4)) })).sort((a, b) => { const priority = (item) => item.index < 2 ? item.index : item.year === currentYear ? 2 : 3; return priority(a) - priority(b) || a.index - b.index; }).map(item => item.period); }
function focusOpenWindow(selector) { const existing = document.querySelector(selector); if (!existing)
    return false; existing.classList.remove('minimized'); existing.classList.add('maximized'); existing.style.zIndex = String(++topWindowLayer); return true; }
function pinSearchResult(body, row) {
    if (!row)
        return;
    body.querySelectorAll('.search-hit').forEach(item => item.classList.remove('search-hit'));
    row.classList.add('search-hit');
    const grid = row.closest('.grid-area');
    if (grid) {
        const headerHeight = row.closest('table')?.tHead?.getBoundingClientRect().height ?? 0;
        requestAnimationFrame(() => {
            grid.scrollTop = Math.max(0, row.offsetTop - headerHeight - 1);
        });
    }
    else {
        requestAnimationFrame(() => row.scrollIntoView({ block: 'start' }));
    }
}
function showLoadingOverlay(target, label = 'جارٍ التحميل...') { const host = target ?? $('#workspace'); if (target) {
    target.classList.remove('minimized');
    target.classList.add('maximized');
    target.style.zIndex = String(++topWindowLayer);
} const overlay = document.createElement('div'); overlay.className = 'loading-overlay'; overlay.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span><strong>${label}</strong>`; host.append(overlay); return () => overlay.remove(); }
async function openConsumption(periodId, replace = false) {
    const existing = document.querySelector('[data-operation="consumption"]');
    if (!replace && existing) {
        focusOpenWindow('[data-operation="consumption"]');
        return;
    }
    const stopLoading = showLoadingOverlay(existing, 'جارٍ تحميل مرجع العدادات...');
    let data;
    try {
        data = await window.desktopApi.getConsumption(periodId);
    }
    catch (error) {
        stopLoading();
        await messageDialog(error instanceof Error ? error.message : 'تعذّر تحميل مرجع العدادات.', 'error');
        return;
    }
    existing?.remove();
    stopLoading();
    let currentId = data.header?.id;
    let details = [...data.details];
    const win = document.createElement('section');
    win.className = 'document-window consumption-window maximized';
    win.dataset.operation = 'consumption';
    win.innerHTML = `<header class="document-titlebar"><h2>تسجيل العدادات</h2><div class="window-controls"><button data-cmd="min">—</button><button data-cmd="max">□</button><button data-cmd="close">×</button></div></header>
  <div class="toolbar"><button data-cmd="new"><img class="search-button-icon" src="/icons/new-icon.png" alt="" />جديد</button><button data-cmd="save" class="primary"><img class="search-button-icon" src="/icons/save-icon.png" alt="" />حفظ</button><button data-cmd="find-ref"><img class="search-button-icon" src="/icons/search-reference.png" alt="" />بحث</button><button data-cmd="find-name"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button><button data-cmd="delete"><img class="search-button-icon" src="/icons/delete-icon.png" alt="" />مسح</button><button data-cmd="report"><img class="search-button-icon" src="/icons/report-icon.png" alt="" />تقرير</button><button data-cmd="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-cmd="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div>
  <div class="consumption-header"><label>مرجع تسجيل العدادات <input name="reference" /></label><label>التاريخ <input name="date" type="date" /></label><label>قيمة الدولار <input name="dollar" type="number" /></label><label>السعر ل.ل. <input name="price-lbp" type="number" /></label><label>السعر بالدولار <input name="price-usd" type="text" inputmode="decimal" /></label><button data-cmd="apply-price">تطبيق السعر ↓</button><label>الحي <select name="region"><option value="">اختر الحي</option>${data.regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label><button data-cmd="load-region">تحميل مشتركي الحي ↓</button><button data-cmd="load-all">تحميل تمام المشتركين ↓</button></div>
  <div class="grid-area"><table class="editable-grid consumption-grid"><thead><tr><th>#</th><th>اسم المشترك</th><th>اسم العلبة</th><th>تسجيل قيمة العداد</th><th>قيمة العداد السابقة</th><th>سعر الكيلو</th><th>سعر الكيلو بالدولار</th><th>رسم الاشتراك</th><th>رسم الاشتراك بالدولار</th><th>رقم العداد</th></tr></thead><tbody></tbody><tfoot><tr data-cmd="add-meter-row"><td>✱</td><td colspan="9">انقر هنا لإضافة سطر جديد</td></tr></tfoot></table></div><footer class="document-status message"></footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    $('#workspace-hint').classList.add('hidden');
    enableDocumentMovement(win);
    const getInput = (name) => win.querySelector(`[name="${name}"]`);
    const body = win.querySelector('tbody');
    const status = win.querySelector('footer');
    const message = (text, type = '') => { status.textContent = text; status.className = `document-status message ${type}`; };
    const setHeader = (header) => { getInput('reference').value = header?.reference ?? ''; getInput('date').value = header?.consumptionDate?.slice(0, 10) ?? todayIso(); getInput('dollar').value = String(header?.dollarRate ?? 0); };
    const pricingFields = ['kiloPriceLbp', 'kiloPriceUsd', 'subscriptionFeeLbp', 'subscriptionFeeUsd'];
    const render = () => {
        body.replaceChildren();
        const fragment = document.createDocumentFragment();
        details.forEach((d, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(index);
            tr.innerHTML = `<td class="row-number">${index + 1}</td><td>${d.subscriberName}</td><td>${d.boxName}</td><td><input type="number" step="any" dir="ltr" data-detail="counterValue" value="${d.counterValue}" /></td><td><input type="number" dir="ltr" value="${d.previousCounterValue ?? 0}" readonly tabindex="-1" /></td>${pricingFields.map(key => `<td><input type="number" step="any" dir="ltr" data-detail="${key}" value="${d[key]}" /></td>`).join('')}<td>${d.counterNumber}</td>`;
            tr.querySelector('[data-detail="counterValue"]').addEventListener('keydown', event => {
                if (event.key !== 'Enter')
                    return;
                event.preventDefault();
                sync();
                const nextReading = body.querySelector(`tr[data-index="${index + 1}"] [data-detail="counterValue"]`);
                if (nextReading) {
                    nextReading.focus();
                    if (Number(nextReading.value) === 0)
                        nextReading.value = '';
                    else
                        nextReading.select();
                }
            });
            tr.addEventListener('contextmenu', event => showDeleteMenu(event, () => { sync(); details.splice(index, 1); render(); message('تم حذف المشترك من مرجع تسجيل العدادات الحالي. اضغط حفظ لتثبيت الحذف.', 'success'); }));
            fragment.append(tr);
        });
        body.append(fragment);
    };
    const sync = () => { body.querySelectorAll('tr').forEach(tr => { const d = details[Number(tr.dataset.index)]; tr.querySelectorAll('[data-detail]').forEach(input => { const key = input.dataset.detail; d[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) || 0 : input.value; }); }); };
    const addCandidates = (rows) => { sync(); const existing = new Set(details.map(d => d.counterId)); for (const row of rows)
        if (!existing.has(row.counterId)) {
            details.push({ ...row });
            existing.add(row.counterId);
        } render(); message(`تم تحميل ${rows.length} مشتركاً.`, 'success'); };
    let draftRow;
    const addMeterRow = () => { sync(); if (draftRow?.isConnected) {
        draftRow.querySelector('input')?.focus();
        return;
    } const existingIds = new Set(details.map(detail => detail.counterId)); const available = data.candidates.filter(candidate => !existingIds.has(candidate.counterId)); if (!available.length) {
        void messageDialog('لا يوجد مشترك عداد جديد متاح للإضافة. اضغط تحديث بعد إضافة العداد في تبويب العدادات.');
        return;
    } const list = document.createElement('datalist'); list.id = `meter-entry-options-${Date.now()}`; const choices = new Map(); for (const candidate of available) {
        const label = `${candidate.subscriberName} - ${candidate.counterNumber}`;
        choices.set(label, candidate);
        list.append(new Option(label));
    } win.append(list); const tr = document.createElement('tr'); draftRow = tr; tr.className = 'meter-draft-row'; tr.innerHTML = `<td class="row-number">ج</td><td><input list="${list.id}" placeholder="اكتب اسم المشترك" autocomplete="off" /></td><td data-draft-box></td><td colspan="7">اكتب الاسم ثم اختر المشترك من النتائج</td>`; body.append(tr); const input = tr.querySelector('input'), box = tr.querySelector('[data-draft-box]'); const choose = (candidate) => { details.push({ ...candidate }); draftRow = undefined; list.remove(); render(); const row = body.querySelector(`tr[data-index="${details.length - 1}"]`); row?.scrollIntoView({ block: 'center' }); row?.querySelector('[data-detail="counterValue"]')?.focus(); message('تمت إضافة المشترك. أدخل قيمة العداد ثم اضغط حفظ.', 'success'); }; input.addEventListener('input', () => { const candidate = choices.get(input.value); box.textContent = candidate?.boxName ?? ''; if (candidate)
        choose(candidate); }); input.addEventListener('keydown', event => { if (event.key !== 'Enter')
        return; const query = input.value.trim().toLocaleLowerCase('ar'); const matches = available.filter(candidate => normalizedSearch(candidate.subscriberName).includes(query) || normalizedSearch(candidate.counterNumber).includes(query)); if (matches.length === 1) {
        event.preventDefault();
        choose(matches[0]);
    } }); input.focus(); };
    const findRows = (items, promptText) => selectSearchResult(items, promptText, true);
    setHeader(data.header);
    render();
    let closeAfterSave = false;
    const closeImmediately = () => { win.remove(); if (!document.querySelector('.document-window:not(.hidden)'))
        $('#workspace-hint').classList.remove('hidden'); };
    const close = async () => { const choice = await saveBeforeCloseDialog(); if (choice === 'discard')
        closeImmediately(); else if (choice === 'save') {
        closeAfterSave = true;
        win.querySelector('[data-cmd="save"]').click();
    } };
    win.querySelectorAll('[data-cmd="close"]').forEach(b => b.addEventListener('click', () => void close()));
    win.querySelector('[data-cmd="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-cmd="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelector('[data-cmd="new"]').addEventListener('click', () => {
        addMeterRow();
        requestAnimationFrame(() => { const grid = win.querySelector('.grid-area'); grid.scrollTop = grid.scrollHeight; });
    });
    win.querySelector('[data-cmd="refresh"]').addEventListener('click', () => void openConsumption(currentId, true));
    win.querySelector('[data-cmd="report"]').addEventListener('click', () => message('سيتم تنفيذ التقرير في المرحلة القادمة.'));
    win.querySelector('[data-cmd="load-all"]').addEventListener('click', () => addCandidates(data.candidates));
    win.querySelector('[data-cmd="add-meter-row"]').addEventListener('click', addMeterRow);
    win.querySelector('[data-cmd="load-region"]').addEventListener('click', () => { const id = Number(win.querySelector('[name="region"]').value); if (!id) {
        message('اختر الحي أولاً.', 'error');
        return;
    } addCandidates(data.candidates.filter(d => d.regionId === id)); });
    win.querySelector('[data-cmd="apply-price"]').addEventListener('click', () => { sync(); const lbp = Number(getInput('price-lbp').value) || 0, usd = Number(getInput('price-usd').value) || 0; details.forEach(d => { d.kiloPriceLbp = lbp; d.kiloPriceUsd = usd; }); render(); message('تم تطبيق السعر على الأسماء المحمّلة.', 'success'); });
    win.querySelector('[name="region"]').addEventListener('change', event => { const region = data.regions.find(r => r.id === Number(event.target.value)); if (region) {
        getInput('price-lbp').value = String(region.kiloPriceLbp);
        getInput('price-usd').value = String(region.kiloPriceUsd);
    } });
    win.querySelector('[data-cmd="save"]').addEventListener('click', () => void (async () => {
        sync();
        const header = { id: currentId, reference: getInput('reference').value, consumptionDate: getInput('date').value, notes: data.header?.notes ?? '', dollarRate: Number(getInput('dollar').value) };
        message('جارٍ الحفظ...');
        const result = await window.desktopApi.saveConsumption(header, details);
        if (result.ok) {
            currentId = result.id;
            await messageDialog('تم حفظ تسجيل العدادات بنجاح.', 'success');
            if (closeAfterSave)
                closeImmediately();
            else
                message('تم حفظ تسجيل العدادات بنجاح.', 'success');
        }
        else {
            closeAfterSave = false;
            message(result.message ?? 'تعذّر الحفظ.', 'error');
            await messageDialog(result.message ?? 'تعذّر الحفظ.', 'error');
        }
    })());
    win.querySelector('[data-cmd="find-ref"]').addEventListener('click', () => void findRows(prioritizedMeterPeriods(data.periods).map(p => ({ label: p.reference, run: () => void openConsumption(p.id, true) })), 'أدخل مرجع تسجيل العدادات أو جزءاً منه'));
    win.querySelector('[data-cmd="find-name"]').addEventListener('click', () => void findRows(details.map((d, index) => ({ label: d.subscriberName, run: () => pinSearchResult(body, body.querySelector(`tr[data-index="${index}"]`)) })), 'أدخل اسم المشترك أو جزءاً منه'));
    win.querySelector('[data-cmd="delete"]').addEventListener('click', () => void (async () => { if (!currentId) {
        message('لا يوجد مرجع محفوظ لمسحه.', 'error');
        return;
    } if (!await searchDialog('هل أنت متأكد من مسح مرجع تسجيل العدادات كاملاً؟', false))
        return; const result = await window.desktopApi.deleteConsumption(currentId); if (result.ok)
        void openConsumption(undefined, true);
    else
        message(result.message ?? 'تعذّر المسح.', 'error'); })());
}
async function openBreakerMonth(periodId, replace = false) {
    if (!replace && focusOpenWindow('[data-operation="breaker-month"]'))
        return;
    document.querySelector('[data-operation="breaker-month"]')?.remove();
    const data = await window.desktopApi.getBreakerMonth(periodId);
    let currentId = data.header?.id;
    let details = [...data.details];
    const win = document.createElement('section');
    win.className = 'document-window consumption-window maximized';
    win.dataset.operation = 'breaker-month';
    win.innerHTML = `<header class="document-titlebar"><h2>تسجيل الديجنتيرات</h2><div class="window-controls"><button data-bm="min">—</button><button data-bm="max">□</button><button data-bm="close">×</button></div></header><div class="toolbar"><button data-bm="new"><img class="search-button-icon" src="/icons/new-icon.png" alt="" />جديد</button><button data-bm="save" class="primary"><img class="search-button-icon" src="/icons/save-icon.png" alt="" />حفظ</button><button data-bm="find-ref"><img class="search-button-icon" src="/icons/search-reference.png" alt="" />بحث</button><button data-bm="find-name"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button><button data-bm="delete"><img class="search-button-icon" src="/icons/delete-icon.png" alt="" />مسح</button><button data-bm="report"><img class="search-button-icon" src="/icons/report-icon.png" alt="" />تقرير</button><button data-bm="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-bm="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div><div class="consumption-header breaker-month-header"><label>مرجع تسجيل الديجنتيرات <input name="bm-reference" /></label><label>التاريخ <input name="bm-date" type="date" /></label><label>ملاحظات <input name="bm-notes" /></label><label>الحي <select name="bm-region"><option value="">اختر الحي</option>${data.regions.map(region => `<option value="${region.id}">${escapeHtml(region.name)}</option>`).join('')}</select></label><button data-bm="load-region">تحميل مشتركي الحي ↓</button><button data-bm="load-all">تحميل تمام المشتركين ↓</button></div><div class="grid-area"><table class="editable-grid breaker-month-grid"><thead><tr><th>#</th><th>اسم المشترك</th><th>اسم العلبة</th><th>الديجنتر</th><th>السعر الثابت ($)</th><th>الحسم ($)</th><th>مدفوع</th><th>المبلغ المدفوع ($)</th><th>ملاحظات</th></tr></thead><tbody></tbody></table></div><footer class="document-status message"></footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    enableDocumentMovement(win);
    const body = win.querySelector('tbody');
    const status = win.querySelector('footer');
    const input = (name) => win.querySelector(`[name="${name}"]`);
    const message = (text, type = '') => { status.textContent = text; status.className = `document-status message ${type}`; };
    const render = () => { body.replaceChildren(); details.forEach((d, index) => { const tr = document.createElement('tr'); tr.dataset.index = String(index); tr.innerHTML = `<td class="row-number">${index + 1}</td><td>${escapeHtml(d.subscriberName)}</td><td>${escapeHtml(d.boxName)}</td><td>${escapeHtml(d.breakerName)}</td><td><input type="number" step="0.01" data-bmd="priceUsd" value="${d.priceUsd}" /></td><td><input type="number" step="0.01" data-bmd="discountUsd" value="${d.discountUsd}" /></td><td><input type="checkbox" data-bmd="paid" ${d.paid ? 'checked' : ''} /></td><td><input type="number" step="0.01" data-bmd="paidValueUsd" value="${d.paidValueUsd}" /></td><td><input data-bmd="notes" value="${escapeHtml(d.notes)}" /></td>`; body.append(tr); }); };
    const sync = () => body.querySelectorAll('tr').forEach(tr => { const d = details[Number(tr.dataset.index)]; tr.querySelectorAll('[data-bmd]').forEach(control => { const key = control.dataset.bmd; d[key] = control.type === 'checkbox' ? control.checked : control.type === 'number' ? Number(control.value) || 0 : control.value; }); });
    const add = (candidates) => { sync(); const ids = new Set(details.map(d => d.subscriberId)); candidates.forEach(candidate => { if (!ids.has(candidate.subscriberId)) {
        details.push({ ...candidate });
        ids.add(candidate.subscriberId);
    } }); render(); message(`تم تحميل ${candidates.length} مشتركاً.`, 'success'); };
    const find = (items, promptText) => selectSearchResult(items, promptText);
    input('bm-reference').value = data.header?.reference ?? '';
    input('bm-date').value = data.header?.monthDate?.slice(0, 10) ?? todayIso();
    input('bm-notes').value = data.header?.notes ?? '';
    render();
    let closeAfterSave = false;
    const closeImmediately = () => win.remove();
    const close = async () => { const choice = await saveBeforeCloseDialog(); if (choice === 'discard')
        closeImmediately(); else if (choice === 'save') {
        closeAfterSave = true;
        win.querySelector('[data-bm="save"]').click();
    } };
    win.querySelectorAll('[data-bm="close"]').forEach(button => button.addEventListener('click', () => void close()));
    win.querySelector('[data-bm="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-bm="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelector('[data-bm="new"]').addEventListener('click', () => void openBreakerMonth(undefined, true));
    win.querySelector('[data-bm="refresh"]').addEventListener('click', () => void (async () => { sync(); const latest = await window.desktopApi.getCatalog('breakers'); const prices = new Map(latest.rows.map(row => [Number(row.id), Number(row.priceUsd) || 0])); details.forEach(detail => { if (prices.has(detail.breakerId))
        detail.priceUsd = prices.get(detail.breakerId); }); render(); message('تم تحديث أسعار الديجنتيرات. اضغط حفظ لتثبيت الأسعار الجديدة في هذا المرجع.', 'success'); })());
    win.querySelector('[data-bm="load-all"]').addEventListener('click', () => add(data.candidates));
    win.querySelector('[data-bm="load-region"]').addEventListener('click', () => { const regionId = Number(win.querySelector('[name="bm-region"]').value); if (!regionId) {
        message('اختر الحي أولاً.', 'error');
        return;
    } add(data.candidates.filter(candidate => candidate.regionId === regionId)); });
    win.querySelector('[data-bm="save"]').addEventListener('click', () => void (async () => { sync(); const header = { id: currentId, reference: input('bm-reference').value, monthDate: input('bm-date').value, notes: input('bm-notes').value }; const result = await window.desktopApi.saveBreakerMonth(header, details); if (result.ok) {
        currentId = result.id;
        await messageDialog('تم حفظ تسجيل الديجنتيرات بنجاح.', 'success');
        if (closeAfterSave)
            closeImmediately();
        else
            message('تم حفظ تسجيل الديجنتيرات بنجاح.', 'success');
    }
    else {
        closeAfterSave = false;
        message(result.message ?? 'تعذّر الحفظ.', 'error');
        await messageDialog(result.message ?? 'تعذّر الحفظ.', 'error');
    } })());
    win.querySelector('[data-bm="find-ref"]').addEventListener('click', () => void find(data.periods.map(period => ({ label: period.reference, run: () => void openBreakerMonth(period.id, true) })), 'أدخل مرجع تسجيل الديجنتيرات أو جزءاً منه'));
    win.querySelector('[data-bm="find-name"]').addEventListener('click', () => void find(details.map((detail, index) => ({ label: detail.subscriberName, run: () => pinSearchResult(body, body.querySelector(`tr[data-index="${index}"]`)) })), 'أدخل اسم المشترك أو جزءاً منه'));
    win.querySelector('[data-bm="delete"]').addEventListener('click', () => void (async () => { if (!currentId) {
        message('لا يوجد مرجع محفوظ لمسحه.', 'error');
        return;
    } if (!await searchDialog('هل أنت متأكد من مسح مرجع تسجيل الديجنتيرات كاملاً؟', false))
        return; const result = await window.desktopApi.deleteBreakerMonth(currentId); if (result.ok)
        void openBreakerMonth(undefined, true);
    else
        message(result.message ?? 'تعذّر المسح.', 'error'); })());
    win.querySelector('[data-bm="report"]').addEventListener('click', () => message('سيتم تنفيذ التقرير في المرحلة القادمة.'));
}
const financeConfigs = {
    expenses: { title: 'تسجيل المصاريف المستحقة', referenceLabel: 'المرجع', columns: [{ key: 'itemId', label: 'الصنف', type: 'select', option: 'items' }, { key: 'quantity', label: 'الكمية', type: 'number' }, { key: 'price', label: 'السعر ($)', type: 'number' }] },
    payments: { title: 'تسديد المستحقات', referenceLabel: 'مرجع التسديد', columns: [{ key: 'expenseDetailId', label: 'الصنف', type: 'select', option: 'dues' }, { key: 'paidValue', label: 'قيمة الدفعة ($)', type: 'number' }, { key: 'notes', label: 'ملاحظات' }] },
    repayments: { title: 'تسديد ديون المشتركين', referenceLabel: 'مرجع تسديد الديون', columns: [{ key: 'subscriberId', label: 'اسم المشترك', type: 'select', option: 'subscribers' }, { key: 'paidValue', label: 'المبلغ المدفوع ($)', type: 'number' }, { key: 'monthDate', label: 'عن شهر' }, { key: 'notes', label: 'ملاحظات' }] },
};
async function openFinance(kind, id, replace = false) {
    if (!replace && focusOpenWindow(`[data-finance="${kind}"]`))
        return;
    document.querySelector(`[data-finance="${kind}"]`)?.remove();
    const data = await window.desktopApi.getFinance(kind, id);
    const config = financeConfigs[kind];
    let currentId = data.header?.id;
    let rows = [...data.rows];
    const win = document.createElement('section');
    win.className = 'document-window finance-window maximized';
    win.dataset.finance = kind;
    win.innerHTML = `<header class="document-titlebar"><h2>${config.title}</h2><div class="window-controls"><button data-fin="min">—</button><button data-fin="max">□</button><button data-fin="close">×</button></div></header><div class="toolbar"><button data-fin="new"><img class="search-button-icon" src="/icons/new-icon.png" alt="" />جديد</button><button data-fin="save" class="primary"><img class="search-button-icon" src="/icons/save-icon.png" alt="" />حفظ</button><button data-fin="search"><img class="search-button-icon" src="/icons/search-reference.png" alt="" />${kind === 'payments' ? 'بحث عن مرجع المستحقات' : 'بحث'}</button>${kind === 'repayments' ? '<button data-fin="search-name"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button>' : ''}<button data-fin="delete"><img class="search-button-icon" src="/icons/delete-icon.png" alt="" />مسح</button><button data-fin="reload">إعادة تحميل المعلومات</button>${kind === 'repayments' ? '<button data-fin="report"><img class="search-button-icon" src="/icons/report-icon.png" alt="" />تقرير</button>' : ''}<button data-fin="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-fin="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div><div class="finance-header">${kind === 'payments' ? `<label>مرجع المستحقات<input name="due-reference" value="${escapeHtml(rows[0]?.dueReference ?? '')}" readonly /></label>` : `<label>${config.referenceLabel}<input name="fin-reference" value="${escapeHtml(data.header?.reference ?? '')}" /></label>`}<label>التاريخ<input name="fin-date" type="date" value="${data.header?.date?.slice(0, 10) ?? todayIso()}" /></label>${kind === 'repayments' ? '' : `<label class="finance-notes">ملاحظات<input name="fin-notes" value="${escapeHtml(data.header?.notes ?? '')}" /></label>`}</div><div class="grid-area"><table class="editable-grid finance-grid"><thead><tr><th class="row-number">#</th>${config.columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody></tbody><tfoot><tr data-fin="add"><td>✱</td><td colspan="${config.columns.length}">انقر هنا لإضافة سطر جديد</td></tr></tfoot></table></div><footer class="document-status message"></footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    enableDocumentMovement(win);
    const body = win.querySelector('tbody');
    const status = win.querySelector('footer');
    const message = (text, type = '') => { status.textContent = text; status.className = `document-status message ${type}`; };
    const optionRowsById = Object.fromEntries(Object.entries(data.options).map(([name, options]) => [name, new Map(options.map(option => [String(option.id), option]))]));
    const columnsByKey = new Map(config.columns.map(column => [column.key, column]));
    const subscriberLabels = buildOptionLabels(data.options.subscribers ?? []);
    const optionMaps = {};
    for (const [name, options] of Object.entries(data.options)) {
        const list = document.createElement('datalist');
        list.id = `finance-${kind}-${name}`;
        const map = new Map();
        for (const option of options) {
            let label = String(option.name ?? option.id);
            if (name === 'subscribers')
                label = subscriberLabels.get(String(option.id));
            if (name === 'dues')
                label = `${option.reference} - ${option.name} - ${option.remaining}`;
            map.set(label, String(option.id));
            list.append(new Option(label));
        }
        optionMaps[name] = map;
        win.append(list);
    }
    const setDueReference = (reference, clearRows = true) => { if (kind !== 'payments')
        return; win.querySelector('[name="due-reference"]').value = reference; const list = win.querySelector(`#finance-${kind}-dues`); const map = optionMaps.dues; list.replaceChildren(); map.clear(); for (const option of data.options.dues.filter(item => String(item.reference) === reference)) {
        const label = `${option.name} - المتبقي ${option.remaining}`;
        map.set(label, String(option.id));
        list.append(new Option(label));
    } if (clearRows) {
        rows = [];
        render();
    } message(`تم تحميل أصناف المرجع: ${reference}`, 'success'); };
    const financeOptionLabel = (optionName, value, row) => { const option = optionRowsById[optionName]?.get(String(value)); if (optionName === 'subscribers')
        return option ? subscriberLabels.get(String(option.id)) : String(row.subscriberName ?? ''); if (optionName === 'dues')
        return option ? `${option.name} - المتبقي ${option.remaining}` : String(row.itemName ?? ''); return String(option?.name ?? row.itemName ?? ''); };
    const render = () => { body.replaceChildren(); rows.forEach((row, index) => { const tr = document.createElement('tr'); tr.dataset.index = String(index); tr.innerHTML = `<td class="row-number">${index + 1}</td>`; for (const col of config.columns) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.dataset.field = col.key;
        input.type = col.type === 'number' ? 'number' : 'text';
        if (col.type === 'select') {
            input.setAttribute('list', `finance-${kind}-${col.option}`);
            input.dataset.option = col.option;
            input.value = financeOptionLabel(col.option, row[col.key], row);
        }
        else
            input.value = String(row[col.key] ?? '');
        td.append(input);
        tr.append(td);
    } tr.addEventListener('contextmenu', event => showDeleteMenu(event, () => { rows.splice(index, 1); render(); })); body.append(tr); }); };
    const sync = () => { body.querySelectorAll('tr').forEach(tr => { const row = rows[Number(tr.dataset.index)]; tr.querySelectorAll('[data-field]').forEach(input => { const col = columnsByKey.get(input.dataset.field); row[col.key] = input.dataset.option ? Number(optionMaps[input.dataset.option]?.get(input.value)) || 0 : col.type === 'number' ? Number(input.value) || 0 : input.value; }); }); };
    const add = () => { if (kind === 'payments' && !win.querySelector('[name="due-reference"]').value) {
        message('ابحث عن مرجع المستحقات أولاً.', 'error');
        return;
    } sync(); const row = {}; if (kind === 'repayments')
        row.monthDate = new Date().toLocaleDateString('en-GB', { month: '2-digit', year: 'numeric' }); rows.push(row); render(); body.querySelector('tr:last-child')?.querySelector('input')?.focus(); };
    if (kind === 'payments' && rows[0]?.dueReference)
        setDueReference(String(rows[0].dueReference), false);
    render();
    let closeAfterSave = false;
    const closeImmediately = () => win.remove();
    const close = async () => { const choice = await saveBeforeCloseDialog(); if (choice === 'discard')
        closeImmediately(); else if (choice === 'save') {
        closeAfterSave = true;
        win.querySelector('[data-fin="save"]').click();
    } };
    win.querySelectorAll('[data-fin="close"]').forEach(b => b.addEventListener('click', () => void close()));
    win.querySelector('[data-fin="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-fin="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelector('[data-fin="add"]').addEventListener('click', add);
    win.querySelector('[data-fin="new"]').addEventListener('click', () => void openFinance(kind, undefined, true));
    win.querySelectorAll('[data-fin="refresh"],[data-fin="reload"]').forEach(b => b.addEventListener('click', () => void openFinance(kind, currentId, true)));
    win.querySelector('[data-fin="save"]').addEventListener('click', () => void (async () => { sync(); const reference = kind === 'payments' ? win.querySelector('[name="due-reference"]').value : win.querySelector('[name="fin-reference"]').value; const header = { id: currentId, reference, date: (win.querySelector('[name="fin-date"]')).value, notes: win.querySelector('[name="fin-notes"]')?.value ?? '' }; message('جارٍ الحفظ...'); const result = await window.desktopApi.saveFinance(kind, header, rows); if (result.ok) {
        currentId = result.id;
        await messageDialog('تم الحفظ بنجاح.', 'success');
        if (closeAfterSave)
            closeImmediately();
        else
            message('تم الحفظ بنجاح.', 'success');
    }
    else {
        closeAfterSave = false;
        message(result.message ?? 'تعذّر الحفظ.', 'error');
        await messageDialog(result.message ?? 'تعذّر الحفظ.', 'error');
    } })());
    const sequential = (items, promptText) => selectSearchResult(items, promptText);
    win.querySelector('[data-fin="search"]').addEventListener('click', () => void (kind === 'payments' ? sequential([...new Set(data.options.dues.map(option => String(option.reference)))].map(reference => ({ label: reference, run: () => setDueReference(reference) })), 'أدخل مرجع المستحقات أو جزءاً منه') : sequential(data.references.map(ref => ({ label: ref.reference, run: () => void openFinance(kind, ref.id, true) })), 'أدخل المرجع أو جزءاً منه')));
    win.querySelector('[data-fin="search-name"]')?.addEventListener('click', () => { sync(); void sequential(rows.map((row, index) => ({ label: financeOptionLabel('subscribers', row.subscriberId, row), run: () => pinSearchResult(body, body.querySelector(`tr[data-index="${index}"]`)) })), 'أدخل اسم المشترك أو جزءاً منه'); });
    win.querySelector('[data-fin="delete"]').addEventListener('click', () => void (async () => { if (!currentId) {
        message('لا يوجد مرجع محفوظ لمسحه.', 'error');
        return;
    } if (!await searchDialog('هل أنت متأكد من مسح المرجع كاملاً؟', false))
        return; const result = await window.desktopApi.deleteFinance(kind, currentId); if (result.ok)
        void openFinance(kind, undefined, true);
    else
        message(result.message ?? 'تعذّر المسح.', 'error'); })());
    win.querySelector('[data-fin="report"]')?.addEventListener('click', () => message('سيتم تصميم تقرير تسديد ديون المشتركين عند تزويدي بنموذج الطباعة.'));
}
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const meterReportRegionOrder = ['البشرون 1', 'البشرون 2', 'البشرون 3', 'البشرون 4', 'الريجي 1', 'الريجي 2', 'الريجي 3', 'الريجي 4', 'الريجي 5', 'الريجي 6', 'الريجي 7', 'الريجي 8', 'السنتر', 'شمس الدين', 'كرم العريش 1', 'كرم العريش 2', 'كرم العريش 3'];
const meterReportBoxOrder = [
    'علبة احمد مكي', 'علبة ال بدران', 'علبة ال عطالله', 'علبة ال قبلاوي', 'علبة الشهيد كاظم', 'علبة المختار الجوني', 'علبة المدرسة', 'علبة ام انور', 'علبة ياسر قبلاوي', 'علبة الحصاي', 'علبة الدوار', 'علبة حبيب غدار', 'علبة مصبغة دانة', 'مكتبة التقي', 'بناية يحى حجازي(البشرون)', 'علبة الشقور', 'علبة المجمع', 'علبة عادل خليفة', 'علبة مدرسة الانروا',
    'بناية جهاد جعفر', 'بناية فقيه', 'علبة ابو هيثم', 'علبة حمزة غدار', 'علبة خزعل .', 'علبة علي ديب', 'بوتيك فاطمة', 'علبة ال نادر', 'علبة محمود شحوري', 'علبة ال الزيناتي', 'علبة امونة', 'علبة غندور', 'علبة السعادة للدخان', 'علبة ام اكرم حسون', 'علبة بلوط', 'علبة بناية جعفر جهجاه', 'علبة بناية محمد خليفة الحلاق', 'علبة حسين اللحام', 'علبة محمد حسون', 'علبة محمد حسون 2',
    'بناية ابو فادي غدار', 'علبة احمد محسن', 'علبة حمود', 'علبة حمود 2', 'علبة وسترن للصيرفة', 'عتبة ال السيد ميكانيك', 'علبة ال السيد', 'علبة ال جوني', 'علبة حسن غدار first line', 'علبة حمادة جوني', 'بناية الجسر(حجازي)', 'علبة الجسر', 'علبة بناية ابو سلام', 'علبة دهانات فيفكو', 'علبة عزت خليفة', 'علبة مركز الحاج بسام تقي', 'علبة مركز خليفة الطبي', 'مستوصف الامام الرضا(ع)', 'مشروع يحى حجازي(الريجي)', 'مصطفى ضاهر', 'علبة العباس', 'علبة علي الازموز', 'علبة ملحمة العباس',
    'علبة ابو سمير حسون 1', 'علبة بوابة الريجي', 'كلينك العلي', 'سنتر حريري 1', 'سنتر حريري 2', 'سنتر حريري 3', 'علبة علي شمس الدين', 'علبة ال العزي', 'علبة ال عجور', 'علبة خالد العزي', 'علبة مقبل', 'علبة يوسف نجم (كرم العريش)', 'علبة احمد شحوري', 'علبة ام عصام خليفة', 'علبة بناية احمد ابو شوقي', 'علبة بناية الحاج عصام خليفة', 'علبة حبيب قبلاوي', 'علبة ابو خليل', 'علبة ال الشحوري', 'علبة ال عزام', 'علبة الدرج ال علوش', 'علبة حي الدرج'
];
const meterOrderKey = (value) => String(value ?? '').normalize('NFKD').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[.،,()]/g, '').replace(/\s+/g, ' ').trim();
async function showCounterCatalogReport(exportImmediately = false) {
    document.querySelector('.counter-catalog-preview')?.remove();
    const [counterData, subscriberData, boxData, regionData] = await Promise.all([window.desktopApi.getCatalog('counters'), window.desktopApi.getCatalog('subscribers'), window.desktopApi.getCatalog('boxes'), window.desktopApi.getCatalog('regions')]);
    const subscribers = new Map(subscriberData.rows.map(row => [String(row.id), row]));
    const regionsById = new Map(regionData.rows.map(region => [String(region.id), String(region.name ?? '')]));
    const boxRowsById = new Map(boxData.rows.map(box => [String(box.id), box]));
    const boxOptions = subscriberData.options.boxes ?? [];
    const boxInfo = new Map(boxOptions.map(box => { const fullBox = boxRowsById.get(String(box.id)); const regionId = String(box.regionId ?? fullBox?.regionId ?? ''); return [String(box.id), { name: String(box.name ?? fullBox?.name ?? ''), regionName: String(box.regionName ?? regionsById.get(regionId) ?? '') }]; }));
    const grouped = new Map();
    for (const counter of counterData.rows) {
        if (counter.active === false || Number(counter.active) === 0)
            continue;
        const subscriber = subscribers.get(String(counter.subscriberId));
        if (!subscriber || subscriber.active === false || Number(subscriber.active) === 0)
            continue;
        const boxId = String(subscriber.boxId ?? '');
        const list = grouped.get(boxId) ?? [];
        list.push({ subscriberId: Number(subscriber.id) || 0, subscriberNumber: String(subscriber.subscriberNumber ?? ''), name: String(subscriber.name ?? ''), phone: String(subscriber.phone ?? ''), counterNumber: String(counter.counterNumber ?? '') });
        grouped.set(boxId, list);
    }
    const regionOrder = new Map(meterReportRegionOrder.map((name, index) => [meterOrderKey(name), index]));
    const boxOrder = new Map(meterReportBoxOrder.map((name, index) => [meterOrderKey(name), index]));
    const originalBoxOrder = new Map(boxOptions.map((box, index) => [String(box.id), index]));
    const groups = [...grouped.entries()].map(([boxId, rows]) => { const info = boxInfo.get(boxId) ?? { name: 'بدون علبة', regionName: '' }; return { boxId, name: info.name, regionName: info.regionName, rows: rows.sort((a, b) => a.subscriberId - b.subscriberId) }; }).sort((a, b) => {
        const ar = regionOrder.get(meterOrderKey(a.regionName)) ?? 99999, br = regionOrder.get(meterOrderKey(b.regionName)) ?? 99999;
        if (ar !== br)
            return ar - br;
        const ab = boxOrder.get(meterOrderKey(a.name)) ?? 99999, bb = boxOrder.get(meterOrderKey(b.name)) ?? 99999;
        return ab - bb || (originalBoxOrder.get(a.boxId) ?? 99999) - (originalBoxOrder.get(b.boxId) ?? 99999) || Number(a.boxId) - Number(b.boxId);
    });
    const pages = [];
    let page = [], units = 0;
    const maxUnits = 48;
    let activeRegion = '';
    const pushPage = () => { if (page.length) {
        pages.push(page);
        page = [];
        units = 0;
    } };
    for (const group of groups) {
        const startsRegion = group.regionName !== activeRegion;
        if (startsRegion) {
            if (maxUnits - units < 2)
                pushPage();
            page.push({ regionName: group.regionName, showBoxHeader: false, rows: [] });
            units += 2;
            activeRegion = group.regionName;
        }
        let offset = 0, showBoxHeader = true;
        while (offset < group.rows.length) {
            const overhead = showBoxHeader ? 2 : 0;
            const capacity = Math.max(0, maxUnits - units - overhead);
            if (capacity === 0) {
                pushPage();
                showBoxHeader = false;
                continue;
            }
            const take = Math.min(capacity, group.rows.length - offset);
            page.push({ name: group.name, showBoxHeader, rows: group.rows.slice(offset, offset + take) });
            units += take + overhead;
            offset += take;
            if (offset < group.rows.length) {
                pushPage();
                showBoxHeader = false;
            }
        }
    }
    pushPage();
    if (!pages.length)
        pages.push([]);
    const now = new Date();
    const printDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const columns = `<colgroup><col class="subscriber-info"/><col class="phone"/><col class="meter-number"/><col class="blank"/></colgroup>`;
    const headings = `<thead><tr><th class="subscriber-heading"><span>رقم المشترك</span><span>إسم المشترك</span></th><th>تلفون</th><th>رقم العداد</th><th></th></tr></thead>`;
    const pageMarkup = pages.map((segments, pageIndex) => `<section class="counter-report-page ${pageIndex === 0 ? 'active' : ''}" data-counter-report-page="${pageIndex}"><header class="counter-report-header"><div>تاريخ الطباعة: <b>${printDate}</b></div></header><main>${segments.map(segment => segment.regionName !== undefined ? `<h2 class="counter-report-region">${escapeHtml(segment.regionName)}</h2>` : `<section class="counter-report-group ${segment.showBoxHeader ? '' : 'continuation'}">${segment.showBoxHeader ? `<h3>العلبة: <b>${escapeHtml(segment.name)}</b></h3>` : ''}<table>${columns}${segment.showBoxHeader ? headings : ''}<tbody>${segment.rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.phone)}</td><td>${escapeHtml(row.counterNumber)}</td><td></td></tr>`).join('')}</tbody></table></section>`).join('')}</main><footer>صفحة <b>${pageIndex + 1}</b> من <b>${pages.length}</b></footer></section>`).join('');
    const win = document.createElement('section');
    win.className = 'document-window maximized print-preview counter-catalog-preview';
    let currentPage = 0;
    win.innerHTML = `<header class="document-titlebar no-print"><h2>معاينة تقرير العدادات</h2><div class="window-controls"><button data-counter-preview="close">×</button></div></header><div class="toolbar no-print"><button data-counter-preview="print" class="primary">🖨 طباعة</button><button data-counter-preview="export">تصدير PDF</button><button data-counter-preview="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button><div class="preview-navigation"><button data-counter-preview="previous" title="الصفحة السابقة">←</button><b data-counter-page-indicator>1 / ${pages.length}</b><button data-counter-preview="next" title="الصفحة التالية">→</button></div></div><div class="counter-report-scroll"><div class="counter-report-pages">${pageMarkup}</div></div>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    const showPage = (index) => { currentPage = Math.max(0, Math.min(index, pages.length - 1)); win.querySelectorAll('[data-counter-report-page]').forEach((item, i) => item.classList.toggle('active', i === currentPage)); win.querySelector('[data-counter-page-indicator]').textContent = `${currentPage + 1} / ${pages.length}`; win.querySelector('[data-counter-preview="previous"]').disabled = currentPage === 0; win.querySelector('[data-counter-preview="next"]').disabled = currentPage === pages.length - 1; };
    win.querySelectorAll('[data-counter-preview="close"]').forEach(button => button.addEventListener('click', () => win.remove()));
    win.querySelector('[data-counter-preview="print"]').addEventListener('click', () => window.print());
    const exportPdf = () => void (async () => { const result = await window.desktopApi.exportCurrentViewPdf('تقرير عدادات.pdf'); if (result.canceled)
        return; await messageDialog(result.ok ? `تم تصدير التقرير بنجاح إلى:\n${result.path}` : `تعذّر تصدير التقرير:\n${result.message ?? ''}`, result.ok ? 'success' : 'error'); })();
    win.querySelector('[data-counter-preview="export"]').addEventListener('click', exportPdf);
    win.querySelector('[data-counter-preview="previous"]').addEventListener('click', () => showPage(currentPage - 1));
    win.querySelector('[data-counter-preview="next"]').addEventListener('click', () => showPage(currentPage + 1));
    showPage(0);
    if (exportImmediately)
        exportPdf();
}
const arabicMonths = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
function showInvoicePreview(header, rows, usd) {
    document.querySelector('.print-preview')?.remove();
    const win = document.createElement('section');
    win.className = 'document-window maximized print-preview';
    const invoices = rows.map(row => {
        const { usage, monthlyValue, vat, total } = meterReportAmounts(row, usd);
        const rate = Number(usd ? row.kiloPriceUsd : row.kiloPriceLbp);
        const fee = Number(usd ? row.subscriptionFeeUsd : row.subscriptionFeeLbp);
        const date = new Date(`${header.consumptionDate}T00:00:00`);
        const money = amount => usd ? '$' + amount.toFixed(2) : Math.round(amount).toLocaleString('en-US');
        return `<article class="invoice meter-invoice"><div class="invoice-inner"><div class="invoice-top"><span>محطة بشرون الكهربائية</span><span class="invoice-region">${escapeHtml(row.regionName ?? '')}</span><span class="invoice-whish" dir="ltr"><span>Whish:</span><bdi dir="ltr">70/400467</bdi></span><span>رقم الصيانة: <bdi dir="ltr">71/118620</bdi></span></div><div class="invoice-body"><div class="invoice-column"><div>اسم المشترك: ${escapeHtml(row.subscriberName)}</div><div>رقم العداد الحالي: ${row.counterValue}</div><div>رقم العداد السابق: ${row.previousCounterValue}</div><div>استهلاك الشهر: ${usage}</div></div><div class="invoice-column"><div class="invoice-phone${row.phone?.trim() ? '' : ' invoice-phone-empty'}">تلفون: <bdi dir="ltr">${escapeHtml(row.phone?.trim() ?? '')}</bdi></div><div>قيمة العداد: <bdi dir="ltr">${money(rate)}</bdi></div><div>رسم الاشتراك: <bdi dir="ltr">${money(fee)}</bdi></div><div>قيمة العداد بالأمبير: ${escapeHtml(row.amperes)}</div></div><div class="invoice-column invoice-totals"><div>التاريخ: <bdi class="invoice-date" dir="ltr"><span dir="rtl">${escapeHtml(arabicMonths[date.getMonth()])}</span><span>/${date.getFullYear()}</span></bdi></div><div>القيمة الشهرية: <bdi dir="ltr">${money(monthlyValue)}</bdi></div><div class="invoice-vat" dir="ltr"><bdi dir="rtl">VAT 11%:</bdi><bdi dir="ltr">${money(vat)}</bdi></div><div class="invoice-due">المجموع: <bdi dir="ltr">${usd ? '$' + Math.round(total) : money(total)}</bdi></div></div></div><div class="invoice-meter-number">رقم العداد: <bdi dir="ltr">${escapeHtml(row.counterNumber)}</bdi></div><p class="invoice-note">الرجاء تسديد الفاتورة قبل السابع من الشهر</p></div></article>`;
    });
    const pageCount = Math.ceil(invoices.length / 4);
    const pages = Array.from({ length: pageCount }, (_, index) => `<section class="invoice-page ${index === 0 ? 'active' : ''}" data-invoice-page="${index}">${invoices.slice(index * 4, index * 4 + 4).join('')}</section>`).join('');
    let currentPage = 0;
    win.innerHTML = `<header class="document-titlebar no-print"><h2>معاينة تقرير الفواتير</h2><div class="window-controls"><button data-preview="close">×</button></div></header><div class="toolbar no-print"><button data-preview="print" class="primary">🖨 طباعة</button><button data-preview="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button><div class="preview-navigation"><button data-preview="previous" title="الصفحة السابقة">←</button><b data-page-indicator>1 / ${pageCount}</b><button data-preview="next" title="الصفحة التالية">→</button></div></div><div class="invoice-scroll"><main class="invoice-pages">${pages}</main></div>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    const showPage = (page) => { currentPage = Math.max(0, Math.min(page, pageCount - 1)); win.querySelectorAll('[data-invoice-page]').forEach((item, index) => item.classList.toggle('active', index === currentPage)); win.querySelector('[data-page-indicator]').textContent = `${currentPage + 1} / ${pageCount}`; win.querySelector('[data-preview="previous"]').disabled = currentPage === 0; win.querySelector('[data-preview="next"]').disabled = currentPage === pageCount - 1; };
    win.querySelectorAll('[data-preview="close"]').forEach(button => button.addEventListener('click', () => win.remove()));
    win.querySelector('[data-preview="print"]').addEventListener('click', () => window.print());
    win.querySelector('[data-preview="previous"]').addEventListener('click', () => showPage(currentPage - 1));
    win.querySelector('[data-preview="next"]').addEventListener('click', () => showPage(currentPage + 1));
    showPage(0);
}
function meterReportAmounts(row, usd) {
    const usage = Math.max(0, Number(row.counterValue) - Number(row.previousCounterValue));
    const rate = Number(usd ? row.kiloPriceUsd : row.kiloPriceLbp);
    const fee = Number(usd ? row.subscriptionFeeUsd : row.subscriptionFeeLbp);
    // Calculate in cents (USD) or whole pounds (LBP) so displayed amounts add up.
    const scale = usd ? 100 : 1;
    const monthlyUnits = Math.round((usage * rate + fee + Number.EPSILON) * scale);
    const vatUnits = Math.round(monthlyUnits * 11 / 100);
    return {
        usage,
        monthlyValue: monthlyUnits / scale,
        vat: vatUnits / scale,
        total: (monthlyUnits + vatUnits) / scale,
    };
}
async function openMeterReport(periodId, replace = false) {
    const existing = document.querySelector('[data-report="meters"]');
    if (!replace && existing) {
        focusOpenWindow('[data-report="meters"]');
        return;
    }
    const stopLoading = showLoadingOverlay(existing, 'جارٍ تحميل تقرير العدادات...');
    let data;
    try {
        data = await window.desktopApi.getMeterReport(periodId);
    }
    catch (error) {
        stopLoading();
        await messageDialog(error instanceof Error ? error.message : 'تعذّر تحميل تقرير العدادات.', 'error');
        return;
    }
    existing?.remove();
    stopLoading();
    let selected = new Set();
    let usd = true;
    let sort = 'location';
    let state = 'all';
    let regionFilter = '';
    let boxFilter = '';
    const regionOptions = [...new Set(data.rows.map(row => row.regionName))].sort((a, b) => arabicCollator.compare(a, b));
    const boxOptions = [...new Set(data.rows.map(row => row.boxName))].sort((a, b) => arabicCollator.compare(a, b));
    const win = document.createElement('section');
    win.className = 'document-window maximized meter-report-window';
    win.dataset.report = 'meters';
    win.innerHTML = `<header class="document-titlebar"><h2>تقرير مشتركي العدادات</h2><div class="window-controls"><button data-report-cmd="min">—</button><button data-report-cmd="max">□</button><button data-report-cmd="close">×</button></div></header><div class="toolbar"><button data-report-cmd="find-ref"><img class="search-button-icon" src="/icons/search-reference.png" alt="" />بحث</button><button data-report-cmd="find-name"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button><button data-report-cmd="find-meter"><img class="search-button-icon" src="/icons/meters-tab.png" alt="" />بحث عن رقم عداد</button><button data-report-cmd="preview" class="primary"><img class="search-button-icon" src="/icons/report-icon.png" alt="" />تقرير</button><button data-report-cmd="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-report-cmd="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div><div class="report-options"><label>المرجع <input name="report-reference" value="${escapeHtml(data.header?.reference ?? '')}" readonly /></label><label>قيمة الدولار <input value="${data.header?.dollarRate ?? 0}" readonly /></label><label>$ <input name="usd" type="checkbox" checked /></label><label>الحي <select name="region-filter"><option value="">كل الأحياء</option>${regionOptions.map(region => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join('')}</select></label><label>العلبة <select name="box-filter"><option value="">كل العلب</option>${boxOptions.map(box => `<option value="${escapeHtml(box)}">${escapeHtml(box)}</option>`).join('')}</select></label><label>الترتيب <select name="sort"><option value="location" selected>حسب الحي والعلب</option><option value="subscriber">حسب المشتركين</option></select></label><label>الحالة <select name="state"><option value="all">الكل</option><option value="unpaid">غير مدفوع</option><option value="paid">مدفوع</option></select></label></div><div class="grid-area"><table class="editable-grid report-grid"><thead><tr><th>#</th><th>اسم المشترك</th><th>رقم العداد</th><th>اسم العلبة</th><th>قيمة العداد الجديدة</th><th>قيمة العداد القديمة</th><th>المصروف</th><th>رسم الاشتراك</th><th>القيمة الشهرية</th><th>VAT 11%</th><th>المجموع</th><th><label>تحديد الكل <input type="checkbox" data-select-all /></label></th></tr></thead><tbody></tbody></table></div><footer class="document-status message"></footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    const body = win.querySelector('tbody');
    const status = win.querySelector('footer');
    const message = (text, type = '') => { status.textContent = text; status.className = `document-status message ${type}`; };
    const shown = () => data.rows.filter(row => (!regionFilter || row.regionName === regionFilter) && (!boxFilter || row.boxName === boxFilter) && (state === 'all' || (state === 'paid') === row.paid)).sort((a, b) => sort === 'subscriber' ? arabicCollator.compare(a.subscriberName, b.subscriberName) : arabicCollator.compare(a.regionName, b.regionName) || arabicCollator.compare(a.boxName, b.boxName) || arabicCollator.compare(a.subscriberName, b.subscriberName));
    const render = () => {
        body.replaceChildren();
        const fragment = document.createDocumentFragment();
        const money = amount => usd ? '$' + amount.toFixed(2) : String(amount);
        shown().forEach((row, index) => {
            const { usage, monthlyValue, vat, total } = meterReportAmounts(row, usd);
            const tr = document.createElement('tr');
            tr.dataset.id = String(row.id);
            tr.innerHTML = `<td>${index + 1}</td><td>${escapeHtml(row.subscriberName)}</td><td>${escapeHtml(row.counterNumber)}</td><td>${escapeHtml(row.boxName)}</td><td>${row.counterValue}</td><td>${row.previousCounterValue}</td><td>${usage}</td><td>${usd ? '$' + row.subscriptionFeeUsd.toFixed(2) : row.subscriptionFeeLbp}</td><td>${money(monthlyValue)}</td><td>${money(vat)}</td><td>${money(total)}</td><td><input type="checkbox" data-select ${selected.has(row.id) ? 'checked' : ''} /></td>`;
            tr.querySelector('[data-select]').addEventListener('change', event => {
                if (event.target.checked)
                    selected.add(row.id);
                else
                    selected.delete(row.id);
            });
            fragment.append(tr);
        });
        body.append(fragment);
    };
    const revealSearchRow = (row) => {
        const filtersChanged = Boolean(regionFilter || boxFilter || state !== 'all');
        regionFilter = '';
        boxFilter = '';
        state = 'all';
        win.querySelector('[name="region-filter"]').value = '';
        win.querySelector('[name="box-filter"]').value = '';
        win.querySelector('[name="state"]').value = 'all';
        if (filtersChanged)
            render();
        pinSearchResult(body, body.querySelector(`tr[data-id="${row.id}"]`));
    };
    render();
    const close = () => win.remove();
    win.querySelectorAll('[data-report-cmd="close"]').forEach(b => b.addEventListener('click', close));
    win.querySelector('[data-report-cmd="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-report-cmd="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelector('[data-select-all]').addEventListener('change', event => { const checked = event.target.checked; shown().forEach(row => checked ? selected.add(row.id) : selected.delete(row.id)); body.querySelectorAll('[data-select]').forEach(input => { input.checked = checked; }); });
    win.querySelector('[name="usd"]').addEventListener('change', event => { usd = event.target.checked; render(); });
    win.querySelector('[name="region-filter"]').addEventListener('change', event => { regionFilter = event.target.value; boxFilter = ''; win.querySelector('[name="box-filter"]').value = ''; selected.clear(); win.querySelector('[data-select-all]').checked = false; render(); });
    win.querySelector('[name="box-filter"]').addEventListener('change', event => { boxFilter = event.target.value; selected.clear(); win.querySelector('[data-select-all]').checked = false; render(); });
    win.querySelector('[name="sort"]').addEventListener('change', event => { sort = event.target.value; render(); });
    win.querySelector('[name="state"]').addEventListener('change', event => { state = event.target.value; render(); });
    const searchable = item => ({ ...item, searchText: String(item.label ?? '').toLocaleLowerCase('ar') });
    const searchItems = {
        reference: prioritizedMeterPeriods(data.periods).map(period => searchable({ label: period.reference, run: () => void openMeterReport(period.id, true) })),
        name: data.rows.map(row => searchable({ label: row.subscriberName, run: () => revealSearchRow(row) })),
        counter: data.rows.map(row => searchable({ label: row.counterNumber, run: () => revealSearchRow(row) })),
    };
    const search = async (kind) => { const entered = await searchDialog(kind === 'reference' ? 'أدخل المرجع أو جزءاً منه' : kind === 'name' ? 'أدخل اسم المشترك أو جزءاً منه' : 'أدخل رقم العداد أو جزءاً منه', true); if (typeof entered !== 'string' || !entered.trim())
        return; const q = entered.toLocaleLowerCase('ar'); const matches = searchItems[kind].filter(item => item.searchText.includes(q)); if (!matches.length) {
        showNoSearchResults();
        return;
    } for (const item of matches)
        if (await searchDialog(`هل "${item.label}" هو المطلوب؟`, false)) {
            item.run();
            return;
        } };
    win.querySelector('[data-report-cmd="find-ref"]').addEventListener('click', () => void search('reference'));
    win.querySelector('[data-report-cmd="find-name"]').addEventListener('click', () => void search('name'));
    win.querySelector('[data-report-cmd="find-meter"]').addEventListener('click', () => void search('meter'));
    win.querySelector('[data-report-cmd="refresh"]').addEventListener('click', () => void openMeterReport(data.header?.id, true));
    win.querySelector('[data-report-cmd="preview"]').addEventListener('click', () => { if (!data.header) {
        message('ابحث عن مرجع أولاً.', 'error');
        return;
    } const rows = data.rows.filter(row => selected.has(row.id)); if (!rows.length) {
        message('اختر فاتورة واحدة على الأقل.', 'error');
        return;
    } showInvoicePreview(data.header, rows, usd); });
}
function showBreakerInvoicePreview(header, rows) {
    document.querySelector('.print-preview')?.remove();
    const win = document.createElement('section');
    win.className = 'document-window maximized print-preview';
    const date = new Date(`${header.monthDate}T00:00:00`);
    const invoices = rows.map(row => { const due = Math.max(0, Number(row.priceUsd) - Number(row.discountUsd) - Number(row.paidValueUsd)); return `<article class="invoice"><div class="invoice-inner"><div class="invoice-top"><span>محطة بشرون الكهربائية</span><span>1</span><span>بشرون 1</span><span>رقم الصيانة: 71/118620</span></div><div class="invoice-body breaker-invoice-body"><div class="invoice-column"><div>اسم المشترك: ${escapeHtml(row.subscriberName)}</div></div><div class="invoice-column"><div>الديجنتر: ${escapeHtml(row.breakerName)}</div></div><div class="invoice-column"><div>عن شهر: ${arabicMonths[date.getMonth()]} ${date.getFullYear()}</div><div class="invoice-due">مستحق الدفع: $${Math.round(due)}</div></div></div><p class="invoice-note">الرجاء تسديد الفاتورة قبل السابع من الشهر</p></div></article>`; });
    const pageCount = Math.ceil(invoices.length / 4);
    const pages = Array.from({ length: pageCount }, (_, index) => `<section class="invoice-page ${index === 0 ? 'active' : ''}" data-invoice-page="${index}">${invoices.slice(index * 4, index * 4 + 4).join('')}</section>`).join('');
    let currentPage = 0;
    win.innerHTML = `<header class="document-titlebar no-print"><h2>معاينة فواتير الديجنتيرات</h2><div class="window-controls"><button data-preview="close">×</button></div></header><div class="toolbar no-print"><button data-preview="print" class="primary">🖨 طباعة</button><button data-preview="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button><div class="preview-navigation"><button data-preview="previous">←</button><b data-page-indicator>1 / ${pageCount}</b><button data-preview="next">→</button></div></div><div class="invoice-scroll"><main class="invoice-pages">${pages}</main></div>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    const showPage = (page) => { currentPage = Math.max(0, Math.min(page, pageCount - 1)); win.querySelectorAll('[data-invoice-page]').forEach((item, index) => item.classList.toggle('active', index === currentPage)); win.querySelector('[data-page-indicator]').textContent = `${currentPage + 1} / ${pageCount}`; win.querySelector('[data-preview="previous"]').disabled = currentPage === 0; win.querySelector('[data-preview="next"]').disabled = currentPage === pageCount - 1; };
    win.querySelectorAll('[data-preview="close"]').forEach(button => button.addEventListener('click', () => win.remove()));
    win.querySelector('[data-preview="print"]').addEventListener('click', () => window.print());
    win.querySelector('[data-preview="previous"]').addEventListener('click', () => showPage(currentPage - 1));
    win.querySelector('[data-preview="next"]').addEventListener('click', () => showPage(currentPage + 1));
    showPage(0);
}
async function openBreakerReport(periodId, replace = false) {
    if (!replace && focusOpenWindow('[data-report="breakers"]'))
        return;
    document.querySelector('[data-report="breakers"]')?.remove();
    const data = await window.desktopApi.getBreakerMonth(periodId);
    const selected = new Set();
    const win = document.createElement('section');
    win.className = 'document-window maximized meter-report-window';
    win.dataset.report = 'breakers';
    win.innerHTML = `<header class="document-titlebar"><h2>تقرير مشتركي الديجنتيرات</h2><div class="window-controls"><button data-br="min">—</button><button data-br="max">□</button><button data-br="close">×</button></div></header><div class="toolbar"><button data-br="find-ref"><img class="search-button-icon" src="/icons/search-reference.png" alt="" />بحث</button><button data-br="find-name"><img class="search-button-icon" src="/icons/search-person.png" alt="" />بحث عن اسم مشترك</button><button data-br="preview" class="primary"><img class="search-button-icon" src="/icons/report-icon.png" alt="" />تقرير</button><button data-br="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-br="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div><div class="report-options"><label>المرجع <input value="${escapeHtml(data.header?.reference ?? '')}" readonly /></label><label>التاريخ <input value="${escapeHtml(data.header?.monthDate?.slice(0, 10) ?? '')}" readonly /></label></div><div class="grid-area"><table class="editable-grid report-grid"><thead><tr><th>#</th><th>اسم المشترك</th><th>اسم العلبة</th><th>الديجنتر</th><th>السعر ($)</th><th>الحسم ($)</th><th>المدفوع ($)</th><th>المستحق ($)</th><th><label>تحديد الكل <input type="checkbox" data-br-select-all /></label></th></tr></thead><tbody></tbody></table></div><footer class="document-status message"></footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    const body = win.querySelector('tbody');
    const status = win.querySelector('footer');
    const render = () => { body.replaceChildren(); data.details.forEach((row, index) => { const due = Math.max(0, row.priceUsd - row.discountUsd - row.paidValueUsd); const tr = document.createElement('tr'); tr.dataset.id = String(row.id); tr.innerHTML = `<td>${index + 1}</td><td>${escapeHtml(row.subscriberName)}</td><td>${escapeHtml(row.boxName)}</td><td>${escapeHtml(row.breakerName)}</td><td>$${row.priceUsd}</td><td>$${row.discountUsd}</td><td>$${row.paidValueUsd}</td><td>$${due}</td><td><input type="checkbox" data-br-select ${selected.has(row.id) ? 'checked' : ''} /></td>`; tr.querySelector('[data-br-select]').addEventListener('change', event => event.target.checked ? selected.add(row.id) : selected.delete(row.id)); body.append(tr); }); };
    render();
    const close = () => win.remove();
    win.querySelectorAll('[data-br="close"]').forEach(button => button.addEventListener('click', close));
    win.querySelector('[data-br="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-br="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelector('[data-br="refresh"]').addEventListener('click', () => void openBreakerReport(data.header?.id, true));
    win.querySelector('[data-br-select-all]').addEventListener('change', event => { const checked = event.target.checked; data.details.forEach(row => checked ? selected.add(row.id) : selected.delete(row.id)); body.querySelectorAll('[data-br-select]').forEach(input => { input.checked = checked; }); });
    const search = async (kind) => { const entered = await searchDialog(kind === 'reference' ? 'أدخل المرجع أو جزءاً منه' : 'أدخل اسم المشترك أو جزءاً منه', true); if (typeof entered !== 'string' || !entered.trim())
        return; const query = entered.toLocaleLowerCase('ar'); const items = kind === 'reference' ? data.periods.map(period => ({ label: period.reference, run: () => void openBreakerReport(period.id, true) })) : data.details.map(row => ({ label: row.subscriberName, run: () => pinSearchResult(body, body.querySelector(`tr[data-id="${row.id}"]`)) })); const matches = findSearchMatches(items, query); if (!matches.length) {
        showNoSearchResults();
        return;
    } for (const item of matches)
        if (await searchDialog(`هل "${item.label}" هو المطلوب؟`, false)) {
            item.run();
            return;
        } };
    win.querySelector('[data-br="find-ref"]').addEventListener('click', () => void search('reference'));
    win.querySelector('[data-br="find-name"]').addEventListener('click', () => void search('name'));
    win.querySelector('[data-br="preview"]').addEventListener('click', () => { if (!data.header) {
        status.textContent = 'ابحث عن مرجع أولاً.';
        status.className = 'document-status message error';
        return;
    } const rows = data.details.filter(row => selected.has(row.id)); if (!rows.length) {
        status.textContent = 'اختر فاتورة واحدة على الأقل.';
        status.className = 'document-status message error';
        return;
    } showBreakerInvoicePreview(data.header, rows); });
}
async function openInstitutionDebts(selectedReference, replace = false) {
    if (!replace && focusOpenWindow('[data-report="institution-debts"]'))
        return;
    document.querySelector('[data-report="institution-debts"]')?.remove();
    const allRows = await window.desktopApi.getInstitutionDebts();
    const rows = selectedReference ? allRows.filter(row => row.reference === selectedReference) : [];
    const required = rows.reduce((sum, row) => sum + Number(row.requiredAmount), 0), paid = rows.reduce((sum, row) => sum + Number(row.paidAmount), 0), remaining = rows.reduce((sum, row) => sum + Number(row.remainingAmount), 0);
    const win = document.createElement('section');
    win.className = 'document-window maximized institution-debts-window';
    win.dataset.report = 'institution-debts';
    const usd = (value) => `$${Math.round(Number(value)).toLocaleString('en-US')}`;
    win.innerHTML = `<header class="document-titlebar"><h2>ديون المؤسسة</h2><div class="window-controls"><button data-debt="min">—</button><button data-debt="max">□</button><button data-debt="close">×</button></div></header><div class="toolbar"><button data-debt="search" class="primary"><img class="search-button-icon" src="/icons/search-reference.png" alt="" />بحث عن مرجع</button><button data-debt="refresh"><img class="search-button-icon" src="/icons/refresh-icon.png" alt="" />تحديث</button><button data-debt="close"><img class="search-button-icon" src="/icons/close-icon.png" alt="" />إغلاق</button></div><div class="debt-reference"><b>المرجع:</b><span>${escapeHtml(selectedReference ?? 'لم يتم اختيار مرجع')}</span></div><div class="debt-summary"><div><span>إجمالي المبلغ المطلوب</span><strong>${usd(required)}</strong></div><div><span>إجمالي المبلغ المسدد</span><strong>${usd(paid)}</strong></div><div class="remaining"><span>إجمالي المبلغ المتبقي</span><strong>${usd(remaining)}</strong></div></div><div class="grid-area"><table class="editable-grid institution-debts-grid"><thead><tr><th class="row-number">#</th><th>التاريخ</th><th>الصنف</th><th>المبلغ المطلوب ($)</th><th>المبلغ المسدد ($)</th><th>المبلغ المتبقي ($)</th></tr></thead><tbody></tbody></table></div><footer class="document-status message">${selectedReference ? '' : 'ابحث عن مرجع لعرض تفاصيل ديون المؤسسة.'}</footer>`;
    $('#workspace').append(win);
    win.style.zIndex = String(++topWindowLayer);
    const body = win.querySelector('tbody');
    const status = win.querySelector('footer');
    rows.forEach((row, index) => { const tr = document.createElement('tr'); tr.dataset.id = String(row.id); tr.innerHTML = `<td class="row-number">${index + 1}</td><td>${escapeHtml(row.date?.slice(0, 10))}</td><td>${escapeHtml(row.itemName)}</td><td>${usd(row.requiredAmount)}</td><td>${usd(row.paidAmount)}</td><td>${usd(row.remainingAmount)}</td>`; body.append(tr); });
    const filterWrap = document.createElement('label');
    filterWrap.className = 'debt-item-filter';
    filterWrap.innerHTML = '<span>الصنف:</span><select><option value="">جميع الأصناف</option></select>';
    const itemFilter = filterWrap.querySelector('select');
    [...new Set(rows.map(row => row.itemName))].sort((a, b) => arabicCollator.compare(a, b)).forEach(item => { const option = document.createElement('option'); option.value = item; option.textContent = item; itemFilter.append(option); });
    win.querySelector('.debt-reference').append(filterWrap);
    const applyItemFilter = () => { const filtered = itemFilter.value ? rows.filter(row => row.itemName === itemFilter.value) : rows; body.replaceChildren(); filtered.forEach((row, index) => { const tr = document.createElement('tr'); tr.dataset.id = String(row.id); tr.innerHTML = `<td class="row-number">${index + 1}</td><td>${escapeHtml(row.date?.slice(0, 10))}</td><td>${escapeHtml(row.itemName)}</td><td>${usd(row.requiredAmount)}</td><td>${usd(row.paidAmount)}</td><td>${usd(row.remainingAmount)}</td>`; body.append(tr); }); const totals = [filtered.reduce((sum, row) => sum + Number(row.requiredAmount), 0), filtered.reduce((sum, row) => sum + Number(row.paidAmount), 0), filtered.reduce((sum, row) => sum + Number(row.remainingAmount), 0)]; win.querySelectorAll('.debt-summary strong').forEach((element, index) => element.textContent = usd(totals[index])); };
    itemFilter.addEventListener('change', applyItemFilter);
    const close = () => win.remove();
    win.querySelectorAll('[data-debt="close"]').forEach(b => b.addEventListener('click', close));
    win.querySelector('[data-debt="min"]').addEventListener('click', () => win.classList.toggle('minimized'));
    win.querySelector('[data-debt="max"]').addEventListener('click', () => win.classList.toggle('maximized'));
    win.querySelector('[data-debt="refresh"]').addEventListener('click', () => void openInstitutionDebts(selectedReference, true));
    win.querySelector('[data-debt="search"]').addEventListener('click', () => void (async () => { const entered = await searchDialog('أدخل المرجع أو جزءاً منه', true); if (typeof entered !== 'string' || !entered.trim())
        return; const query = entered.toLocaleLowerCase('ar'); const references = findSearchMatches([...new Set(allRows.map(row => row.reference))], query, reference => reference); if (!references.length) {
        showNoSearchResults();
        return;
    } for (const reference of references)
        if (await searchDialog(`هل "${reference}" هو المطلوب؟`, false)) {
            void openInstitutionDebts(reference, true);
            return;
        } })());
}
$('#subscribers-button').addEventListener('click', () => void openCatalog('subscribers'));
$('#counters-button').addEventListener('click', () => void openCatalog('counters'));
$('#breakers-button').addEventListener('click', () => void openCatalog('breakers'));
$('#fees-button').addEventListener('click', () => void openCatalog('amperePlans'));
$('#regions-button').addEventListener('click', () => void openCatalog('regions'));
$('#boxes-button').addEventListener('click', () => void openCatalog('boxes'));
$('#items-button').addEventListener('click', () => void openCatalog('expenseItems'));
$('#backup-button').addEventListener('click', () => void (async () => { if (!await confirmationDialog('هل تريد إنشاء نسخة احتياطية الآن واستبدال النسخة القديمة؟'))
    return; const result = await window.desktopApi.createBackup(); await messageDialog(result.ok ? `تم حفظ النسخة الاحتياطية بنجاح في:\n${result.path}` : `تعذّر إنشاء النسخة الاحتياطية:\n${result.message ?? ''}`, result.ok ? 'success' : 'error'); })());
$('#consumption-button').addEventListener('click', () => void openConsumption());
$('#breaker-month-button').addEventListener('click', () => void openBreakerMonth());
$('#expenses-button').addEventListener('click', () => void openFinance('expenses'));
$('#payments-button').addEventListener('click', () => void openFinance('payments'));
$('#meter-report-button').addEventListener('click', () => void openMeterReport());
$('#breaker-report-button').addEventListener('click', () => void openBreakerReport());
$('#institution-debts-button').addEventListener('click', () => void openInstitutionDebts());
const appMenu = $('#app-menu'), appMenuButton = $('#app-menu-button'), automaticBackupStatus = $('#automatic-backup-status'), enableAutomaticBackup = $('#enable-automatic-backup'), disableAutomaticBackup = $('#disable-automatic-backup');
async function refreshAutomaticBackupStatus(message) { const result = await window.desktopApi.getAutomaticBackupStatus(); automaticBackupStatus.textContent = message ?? (result.enabled ? 'مفعّل — سيتم الاحتفاظ بأحدث نسخة فقط.' : 'غير مفعّل'); automaticBackupStatus.className = result.enabled ? 'success' : 'error'; enableAutomaticBackup.disabled = result.enabled; disableAutomaticBackup.disabled = !result.enabled; }
appMenuButton.addEventListener('click', event => { event.stopPropagation(); const opening = appMenu.classList.contains('hidden'); appMenu.classList.toggle('hidden'); appMenuButton.setAttribute('aria-expanded', String(opening)); if (opening)
    void refreshAutomaticBackupStatus(); });
appMenu.addEventListener('click', event => event.stopPropagation());
document.addEventListener('click', () => { appMenu.classList.add('hidden'); appMenuButton.setAttribute('aria-expanded', 'false'); });
enableAutomaticBackup.addEventListener('click', () => void (async () => { enableAutomaticBackup.disabled = true; automaticBackupStatus.textContent = 'جارٍ التفعيل...'; try {
    const result = await window.desktopApi.enableAutomaticBackup();
    await refreshAutomaticBackupStatus(result.message ?? (result.ok ? 'تم التفعيل.' : 'تعذّر التفعيل.'));
}
catch {
    automaticBackupStatus.textContent = 'تعذّر تفعيل النسخ الاحتياطي التلقائي.';
    automaticBackupStatus.className = 'error';
    enableAutomaticBackup.disabled = false;
} })());
disableAutomaticBackup.addEventListener('click', () => void (async () => { disableAutomaticBackup.disabled = true; automaticBackupStatus.textContent = 'جارٍ الإلغاء...'; try {
    const result = await window.desktopApi.disableAutomaticBackup();
    await refreshAutomaticBackupStatus(result.message ?? (result.ok ? 'تم الإلغاء.' : 'تعذّر الإلغاء.'));
}
catch {
    automaticBackupStatus.textContent = 'تعذّر إلغاء النسخ الاحتياطي التلقائي.';
    automaticBackupStatus.className = 'error';
    disableAutomaticBackup.disabled = false;
} })());
document.querySelectorAll('[data-ribbon-tab]').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-ribbon-tab]').forEach(item => item.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('[data-ribbon-pane]').forEach(item => item.classList.add('hidden'));
    document.querySelector(`[data-ribbon-pane="${tab.dataset.ribbonTab}"]`)?.classList.remove('hidden');
    if (tab.dataset.ribbonTab === 'operations' || tab.dataset.ribbonTab === 'reports')
        void window.desktopApi.warmRecentMeterReferences();
}));
$('#workspace').addEventListener('pointerdown', event => {
    const target = event.target.closest('.document-window');
    if (target)
        target.style.zIndex = String(++topWindowLayer);
});
void setupAuth();
function repairPackagedIconPaths(root = document) {
    root.querySelectorAll('img[src^="/icons/"]').forEach((image) => {
        const source = image.getAttribute('src');
        if (source)
            image.setAttribute('src', `.${source}`);
    });
}
repairPackagedIconPaths();
new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (!(node instanceof Element))
                continue;
            if (node.matches('img[src^="/icons/"]'))
                repairPackagedIconPaths(node.parentNode ?? document);
            else
                repairPackagedIconPaths(node);
        }
    }
}).observe(document.body, { childList: true, subtree: true });
