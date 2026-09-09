"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    getAppInfo: () => electron_1.ipcRenderer.invoke('app:get-info'),
    exportCurrentViewPdf: (suggestedName) => electron_1.ipcRenderer.invoke('app:export-current-view-pdf', suggestedName),
    createBackup: () => electron_1.ipcRenderer.invoke('app:create-backup'),
    getAutomaticBackupStatus: () => electron_1.ipcRenderer.invoke('backup-schedule:status'),
    enableAutomaticBackup: () => electron_1.ipcRenderer.invoke('backup-schedule:enable'),
    disableAutomaticBackup: () => electron_1.ipcRenderer.invoke('backup-schedule:disable'),
    hasUsers: () => electron_1.ipcRenderer.invoke('auth:has-users'),
    createFirstUser: (input) => electron_1.ipcRenderer.invoke('auth:create-first', input),
    login: (username, password) => electron_1.ipcRenderer.invoke('auth:login', username, password),
    logout: () => electron_1.ipcRenderer.invoke('auth:logout'),
    listUsers: () => electron_1.ipcRenderer.invoke('users:list'),
    saveUser: (input) => electron_1.ipcRenderer.invoke('users:save', input),
    deleteUser: (id) => electron_1.ipcRenderer.invoke('users:delete', id),
    getCatalog: (name) => electron_1.ipcRenderer.invoke('catalog:get', name),
    saveCatalog: (name, rows) => electron_1.ipcRenderer.invoke('catalog:save', name, rows),
    deleteCatalogRow: (name, id) => electron_1.ipcRenderer.invoke('catalog:delete', name, id),
    getConsumption: (id) => electron_1.ipcRenderer.invoke('consumption:get', id),
    warmRecentMeterReferences: () => electron_1.ipcRenderer.invoke('consumption:warm-recent'),
    saveConsumption: (header, details) => electron_1.ipcRenderer.invoke('consumption:save', header, details),
    deleteConsumption: (id) => electron_1.ipcRenderer.invoke('consumption:delete', id),
    getMeterReport: (id) => electron_1.ipcRenderer.invoke('report:meters', id),
    getFinance: (kind, id) => electron_1.ipcRenderer.invoke('finance:get', kind, id),
    saveFinance: (kind, header, rows) => electron_1.ipcRenderer.invoke('finance:save', kind, header, rows),
    deleteFinance: (kind, id) => electron_1.ipcRenderer.invoke('finance:delete', kind, id),
    getInstitutionDebts: () => electron_1.ipcRenderer.invoke('report:institution-debts'),
    getBreakerMonth: (id) => electron_1.ipcRenderer.invoke('breaker-month:get', id),
    saveBreakerMonth: (header, details) => electron_1.ipcRenderer.invoke('breaker-month:save', header, details),
    deleteBreakerMonth: (id) => electron_1.ipcRenderer.invoke('breaker-month:delete', id),
};
electron_1.contextBridge.exposeInMainWorld('desktopApi', api);
