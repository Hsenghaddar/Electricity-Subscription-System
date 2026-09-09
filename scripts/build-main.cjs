const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'dist', 'main');
const sourceDirectories = ['main', 'preload', 'shared'];

function copyRuntimeSources() {
  for (const directory of sourceDirectories) {
    const source = path.join(root, 'src', directory);
    const destination = path.join(outputRoot, directory);
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) {
        fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
      }
    }
  }
}

copyRuntimeSources();

if (process.argv.includes('--watch')) {
  console.log('Watching Electron JavaScript sources...');
  for (const directory of sourceDirectories) {
    const source = path.join(root, 'src', directory);
    fs.watch(source, { persistent: true }, (_event, filename) => {
      if (filename && filename.endsWith('.js')) copyRuntimeSources();
    });
  }
} else {
  console.log('Electron JavaScript sources copied.');
}
