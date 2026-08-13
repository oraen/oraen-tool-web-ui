const { contextBridge, ipcRenderer } = require('electron');

// Expose a flag to detect Electron environment
// This allows the renderer process to detect it's running in Electron
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isElectron: true,
  // Expose IPC method for making HTTP requests in main process
  // This bypasses CORS since we use native Node.js http/https
  makeRequest: (requestData) => ipcRenderer.invoke('http-request', requestData),
  cancelRequest: (requestId) => ipcRenderer.send('http-request-cancel', requestId),
});

// Also expose __ELECTRON__ flag as backup detection method
contextBridge.exposeInMainWorld('__ELECTRON__', true);
