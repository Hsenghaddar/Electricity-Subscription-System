"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const database_1 = require("./database");
const users_1 = require("./users");
const catalogs_1 = require("./catalogs");
const consumptions_1 = require("./consumptions");
const finances_1 = require("./finances");
const breakerMonths_1 = require("./breakerMonths");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const isDevelopment = !electron_1.app.isPackaged;
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const automaticBackupTaskName = 'Bashroun Ishtirak Automatic Backup';
let currentUser;
const { createMeterCache } = require("./meterCache");
let meterCache;
async function runAutomaticBackup() {
    const destination = node_path_1.default.join(node_os_1.default.homedir(), 'Desktop', 'IshtirakBackUp', 'IshtirakBackUp.Bak');
    const temporary = `${destination}.tmp`;
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(destination), { recursive: true });
    if (node_fs_1.default.existsSync(temporary))
        node_fs_1.default.rmSync(temporary, { force: true });
    const db = (0, database_1.openDatabase)();
    await db.backup(temporary);
    if (node_fs_1.default.existsSync(destination))
        node_fs_1.default.rmSync(destination, { force: true });
    node_fs_1.default.copyFileSync(temporary, destination);
    node_fs_1.default.rmSync(temporary, { force: true });
    return destination;
}
const schedulerCommandOptions = { windowsHide: true, timeout: 15000 };
async function automaticBackupEnabled() { try {
    await execFileAsync('schtasks.exe', ['/Query', '/TN', automaticBackupTaskName], schedulerCommandOptions);
    return true;
}
catch {
    return false;
} }
async function enableAutomaticBackupTask() {
    // ScheduledTasks PowerShell cmdlets do not exist on Windows 7. schtasks.exe is
    // available there and also keeps this compatible with newer Windows versions.
    const taskCommand = electron_1.app.isPackaged
        ? `"${process.execPath}" --automatic-backup`
        : `cmd.exe /d /c "cd /d ""${electron_1.app.getAppPath()}"" && npm.cmd run backup:auto"`;
    await execFileAsync('schtasks.exe', ['/Create', '/TN', automaticBackupTaskName, '/TR', taskCommand, '/SC', 'DAILY', '/MO', '2', '/ST', '08:00', '/RL', 'LIMITED', '/F'], schedulerCommandOptions);
}
async function disableAutomaticBackupTask() { await execFileAsync('schtasks.exe', ['/Delete', '/TN', automaticBackupTaskName, '/F'], schedulerCommandOptions); }
function createWindow() {
    const window = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        show: false,
        backgroundColor: '#f4f7f5',
        icon: isDevelopment ? node_path_1.default.join(electron_1.app.getAppPath(), 'build', 'icon.png') : node_path_1.default.join(process.resourcesPath, 'app-icon.png'),
        webPreferences: {
            preload: node_path_1.default.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false,
            webgl: false,
            backgroundThrottling: true,
            devTools: isDevelopment,
        },
    });
    window.once('ready-to-show', () => {
        window.maximize();
        window.show();
    });
    if (isDevelopment) {
        void window.loadURL('http://localhost:5173');
    }
    else {
        void window.loadFile(node_path_1.default.join(__dirname, '../../renderer/index.html'));
    }
}
electron_1.app.whenReady().then(async () => {
    if (process.argv.includes('--automatic-backup')) {
        try {
            await runAutomaticBackup();
            electron_1.app.exit(0);
        }
        catch (error) {
            console.error(error);
            electron_1.app.exit(1);
        }
        return;
    }
    const db = (0, database_1.openDatabase)();
    meterCache = createMeterCache(db, consumptions_1);
    electron_1.ipcMain.handle('app:get-info', () => ({
        name: electron_1.app.getName(),
        version: electron_1.app.getVersion(),
        databasePath: (0, database_1.getDatabasePath)(),
    }));
    electron_1.ipcMain.handle('app:export-current-view-pdf', async (event, suggestedName) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        const owner = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!owner)
            return { ok: false, message: 'تعذّر العثور على نافذة التقرير.' };
        const result = await electron_1.dialog.showSaveDialog(owner, { title: 'تصدير التقرير إلى PDF', defaultPath: node_path_1.default.join(electron_1.app.getPath('desktop'), suggestedName || 'تقرير العدادات.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (result.canceled || !result.filePath)
            return { ok: false, canceled: true };
        try {
            const pdf = await owner.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
            node_fs_1.default.writeFileSync(result.filePath, pdf);
            return { ok: true, path: result.filePath };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر تصدير التقرير إلى PDF.' };
        }
    });
    electron_1.ipcMain.handle('app:create-backup', async () => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        try {
            const destination = await runAutomaticBackup();
            return { ok: true, path: destination };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر إنشاء النسخة الاحتياطية.' };
        }
    });
    electron_1.ipcMain.handle('backup-schedule:status', async () => ({ enabled: await automaticBackupEnabled() }));
    electron_1.ipcMain.handle('backup-schedule:enable', async () => { if (!currentUser)
        return { ok: false, message: 'يرجى تسجيل الدخول.' }; try {
        await enableAutomaticBackupTask();
        return { ok: true, message: 'تم تفعيل النسخ الاحتياطي التلقائي كل يومين الساعة 8:00 صباحاً.' };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'تعذّر تفعيل النسخ الاحتياطي التلقائي.' };
    } });
    electron_1.ipcMain.handle('backup-schedule:disable', async () => { if (!currentUser)
        return { ok: false, message: 'يرجى تسجيل الدخول.' }; try {
        if (await automaticBackupEnabled())
            await disableAutomaticBackupTask();
        return { ok: true, message: 'تم إلغاء النسخ الاحتياطي التلقائي.' };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'تعذّر إلغاء النسخ الاحتياطي التلقائي.' };
    } });
    electron_1.ipcMain.handle('auth:has-users', () => (0, users_1.hasUsers)(db));
    electron_1.ipcMain.handle('auth:create-first', (_event, input) => {
        if ((0, users_1.hasUsers)(db))
            return { ok: false, message: 'تم إنشاء المستخدم الأول سابقاً.' };
        try {
            (0, users_1.saveUser)(db, { ...input, active: true });
            currentUser = (0, users_1.authenticate)(db, input.username, input.password ?? '');
            return { ok: true, user: currentUser };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر إنشاء المستخدم.' };
        }
    });
    electron_1.ipcMain.handle('auth:login', (_event, username, password) => {
        currentUser = (0, users_1.authenticate)(db, username, password);
        return currentUser ? { ok: true, user: currentUser } : { ok: false, message: 'اسم الدخول أو كلمة السر غير صحيحة، أو أن المستخدم غير فعّال.' };
    });
    electron_1.ipcMain.handle('auth:logout', () => { currentUser = undefined; });
    electron_1.ipcMain.handle('users:list', () => currentUser ? (0, users_1.listUsers)(db) : []);
    electron_1.ipcMain.handle('users:save', (_event, input) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        try {
            (0, users_1.saveUser)(db, input);
            return { ok: true };
        }
        catch (error) {
            const message = error instanceof Error && error.message.includes('UNIQUE') ? 'اسم الدخول مستخدم سابقاً.' : error instanceof Error ? error.message : 'تعذّر الحفظ.';
            return { ok: false, message };
        }
    });
    electron_1.ipcMain.handle('users:delete', (_event, id) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        if (currentUser.id === id)
            return { ok: false, message: 'لا يمكن حذف المستخدم الذي يعمل حالياً.' };
        try {
            (0, users_1.deleteUser)(db, id);
            return { ok: true };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر الحذف.' };
        }
    });
    electron_1.ipcMain.handle('catalog:get', (_event, name) => currentUser ? (0, catalogs_1.getCatalog)(db, name) : { rows: [], options: {} });
    electron_1.ipcMain.handle('catalog:save', (_event, name, rows) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        try {
            (0, catalogs_1.saveCatalog)(db, name, rows);
            if (['counters', 'subscribers', 'boxes', 'regions', 'amperePlans'].includes(name)) {
                meterCache.invalidate();
            }
            return { ok: true };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر الحفظ.' };
        }
    });
    electron_1.ipcMain.handle('catalog:delete', (_event, name, id) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        try {
            (0, catalogs_1.deleteCatalogRow)(db, name, id);
            if (['counters', 'subscribers', 'boxes', 'regions', 'amperePlans'].includes(name)) {
                meterCache.invalidate();
            }
            return { ok: true };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : '';
            const message = detail.includes('FOREIGN KEY') ? 'لا يمكن حذف هذا السطر لأنه مرتبط ببيانات أخرى.' : detail || 'تعذّر الحذف.';
            return { ok: false, message };
        }
    });
    const cachedConsumption = id => meterCache.getWorkspace(id);
    const cachedMeterReport = id => meterCache.getReport(id);
    const warmRecentMeterReferences = () => meterCache.warmRecent();
    electron_1.ipcMain.handle('consumption:get', (_event, id) => currentUser ? cachedConsumption(id) : { details: [], periods: [], regions: [], candidates: [] });
    electron_1.ipcMain.handle('consumption:warm-recent', () => { if (currentUser)
        setTimeout(warmRecentMeterReferences, 0); });
    electron_1.ipcMain.handle('consumption:save', (_event, header, details) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        try {
            const id = (0, consumptions_1.saveConsumption)(db, header, details);
            meterCache.invalidate();
            return { ok: true, id };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر الحفظ.' };
        }
    });
    electron_1.ipcMain.handle('consumption:delete', (_event, id) => {
        if (!currentUser)
            return { ok: false, message: 'يرجى تسجيل الدخول.' };
        try {
            (0, consumptions_1.deleteConsumption)(db, id);
            meterCache.invalidate();
            return { ok: true };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'تعذّر المسح.' };
        }
    });
    electron_1.ipcMain.handle('report:meters', (_event, id) => currentUser ? cachedMeterReport(id) : { periods: [], rows: [] });
    electron_1.ipcMain.handle('finance:get', (_event, kind, id) => currentUser ? (0, finances_1.getFinance)(db, kind, id) : { rows: [], references: [], options: {} });
    electron_1.ipcMain.handle('finance:save', (_event, kind, header, rows) => { if (!currentUser)
        return { ok: false, message: 'يرجى تسجيل الدخول.' }; try {
        return { ok: true, id: (0, finances_1.saveFinance)(db, kind, header, rows) };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : '';
        return { ok: false, message: detail.includes('FOREIGN KEY') ? 'لا يمكن حذف مصروف مرتبط بتسديد سابق. يمكنك تعديل قيمته أو إضافة مصروف جديد.' : detail || 'تعذّر الحفظ.' };
    } });
    electron_1.ipcMain.handle('finance:delete', (_event, kind, id) => { if (!currentUser)
        return { ok: false, message: 'يرجى تسجيل الدخول.' }; try {
        (0, finances_1.deleteFinance)(db, kind, id);
        return { ok: true };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'تعذّر المسح.' };
    } });
    electron_1.ipcMain.handle('report:institution-debts', () => currentUser ? (0, finances_1.getInstitutionDebts)(db) : []);
    electron_1.ipcMain.handle('breaker-month:get', (_event, id) => currentUser ? (0, breakerMonths_1.getBreakerMonth)(db, id) : { details: [], periods: [], regions: [], candidates: [] });
    electron_1.ipcMain.handle('breaker-month:save', (_event, header, details) => { if (!currentUser)
        return { ok: false, message: 'يرجى تسجيل الدخول.' }; try {
        return { ok: true, id: (0, breakerMonths_1.saveBreakerMonth)(db, header, details) };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'تعذّر الحفظ.' };
    } });
    electron_1.ipcMain.handle('breaker-month:delete', (_event, id) => { if (!currentUser)
        return { ok: false, message: 'يرجى تسجيل الدخول.' }; try {
        (0, breakerMonths_1.deleteBreakerMonth)(db, id);
        return { ok: true };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'تعذّر المسح.' };
    } });
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('before-quit', database_1.closeDatabase);
