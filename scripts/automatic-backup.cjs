const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const appData = process.env.APPDATA;
  if (!appData) throw new Error('APPDATA is not available.');
  const source = path.join(appData, 'bashroun-ishtirak', 'ishtirak.sqlite');
  if (!fs.existsSync(source)) throw new Error(`Database not found: ${source}`);
  const backupFolder = path.join(os.homedir(), 'Desktop', 'IshtirakBackUp');
  fs.mkdirSync(backupFolder, { recursive: true });
  const destination = path.join(backupFolder, 'IshtirakBackUp.Bak');
  const temporary = `${destination}.tmp`;
  if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  const database = new Database(source, { readonly: true });
  try {
    await database.backup(temporary);
  } finally {
    database.close();
  }
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  fs.copyFileSync(temporary, destination);
  fs.rmSync(temporary, { force: true });
  console.log(`Automatic backup saved: ${destination}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
