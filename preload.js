const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  listCharacters: () => ipcRenderer.invoke('list-characters'),
  openCharactersFolder: () => ipcRenderer.invoke('open-characters-folder'),
  loadIcon: (filename) => ipcRenderer.invoke('load-icon', filename),
  loadBossData: () => ipcRenderer.invoke('load-boss-data'),
  saveBossData: (data) => ipcRenderer.invoke('save-boss-data', data),
  resetBossData: () => ipcRenderer.invoke('reset-boss-data')
});
