const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  saveExcel: (buffer, defaultName) =>
    ipcRenderer.invoke('dialog:saveExcel', buffer, defaultName),

  writeLog: (entry) =>
    ipcRenderer.invoke('log:write', entry),

  getAppDataPath: () =>
    ipcRenderer.invoke('app:getAppDataPath')
})
