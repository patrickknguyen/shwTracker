const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function getDataPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'data.json');
}

function getBundledCharactersPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'characters');
  }
  return path.join(__dirname, 'characters');
}

function getCharactersPath() {
  // User-writable folder in appData so new images can be added without rebuilding
  const userCharDir = path.join(app.getPath('userData'), 'characters');
  if (!fs.existsSync(userCharDir)) {
    fs.mkdirSync(userCharDir, { recursive: true });
    // Copy bundled images on first run
    const bundled = getBundledCharactersPath();
    try {
      const files = fs.readdirSync(bundled).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
      files.forEach(f => {
        fs.copyFileSync(path.join(bundled, f), path.join(userCharDir, f));
      });
    } catch {}
  }
  return userCharDir;
}

function getDefaultBossDataPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bossData.json');
  }
  return path.join(__dirname, 'bossData.json');
}

function getCustomBossDataPath() {
  return path.join(app.getPath('userData'), 'bossData.json');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1a1a1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: Load data
ipcMain.handle('load-data', async () => {
  const dataPath = getDataPath();
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

// IPC: Save data
ipcMain.handle('save-data', async (event, data) => {
  const dataPath = getDataPath();
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

// IPC: Load boss data (custom first, fallback to default)
ipcMain.handle('load-boss-data', async () => {
  const customPath = getCustomBossDataPath();
  try {
    const raw = fs.readFileSync(customPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Fall back to default
    try {
      const raw = fs.readFileSync(getDefaultBossDataPath(), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
});

// IPC: Save custom boss data
ipcMain.handle('save-boss-data', async (event, data) => {
  const customPath = getCustomBossDataPath();
  fs.writeFileSync(customPath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

// IPC: Reset boss data to defaults
ipcMain.handle('reset-boss-data', async () => {
  const customPath = getCustomBossDataPath();
  try { fs.unlinkSync(customPath); } catch {}
  const raw = fs.readFileSync(getDefaultBossDataPath(), 'utf-8');
  return JSON.parse(raw);
});

// IPC: Load an icon file from the app directory
ipcMain.handle('load-icon', async (event, filename) => {
  let iconPath;
  if (app.isPackaged) {
    iconPath = path.join(process.resourcesPath, 'icons', filename);
  } else {
    iconPath = path.join(__dirname, filename);
  }
  try {
    const data = fs.readFileSync(iconPath);
    const base64 = data.toString('base64');
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${base64}`;
  } catch {
    return null;
  }
});

// IPC: List character images
ipcMain.handle('list-characters', async () => {
  const charDir = getCharactersPath();
  try {
    const files = fs.readdirSync(charDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
    return files.map(f => {
      const data = fs.readFileSync(path.join(charDir, f));
      const base64 = data.toString('base64');
      const ext = path.extname(f).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return { filename: f, dataUrl: `data:image/${mime};base64,${base64}` };
    });
  } catch {
    return [];
  }
});
