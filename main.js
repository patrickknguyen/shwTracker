const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function getDataPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'data.json');
}

function getCharactersPath() {
  // In production, use extraResources; in dev, use local folder
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'characters');
  }
  return path.join(__dirname, 'characters');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1a1b26',
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
