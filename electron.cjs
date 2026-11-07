const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');

let mainWindow;
const activeHttpRequests = new Map();

// Get preload path - handle both dev and packaged scenarios
function getPreloadPath() {
  // In packaged app, preload.cjs is at the same level as electron.cjs
  const preloadPath = path.join(__dirname, 'preload.cjs');
  if (!fs.existsSync(preloadPath)) {
    throw new Error(`Electron preload script not found: ${preloadPath}`);
  }
  return preloadPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
    icon: path.join(__dirname, 'oraen-tool-web-ui/assets/favicon.63a26457.svg')
  });

  // 加载打包后的 HTML 文件
  mainWindow.loadFile(path.join(__dirname, 'oraen-tool-web-ui/index.html'));

  // Open DevTools only with F12 key
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Open DevTools on F12
    if (input.key.toLowerCase() === 'f12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle('save-text-file', async (event, options) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(ownerWindow, {
        title: typeof options?.title === 'string' ? options.title : '保存备忘录',
        defaultPath: options?.defaultPath || '备忘录.txt',
        filters: Array.isArray(options?.filters) ? options.filters : [{ name: '文本文件', extensions: ['txt'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };

      await fs.promises.writeFile(result.filePath, String(options?.content || ''), 'utf8');
      return { canceled: false, filePath: result.filePath };
    } catch (error) {
      return { canceled: false, error: error.message || String(error) };
    }
  });

  // Register IPC handler AFTER app is ready
  // This bypasses CORS completely since we use native Node.js http module
  ipcMain.handle('http-request', async (event, requestData) => {
    return new Promise((resolve) => {
      try {
        const { requestId, url, method, headers, body, timeout } = requestData;
        
        // Parse URL
        let parsedUrl;
        try {
          parsedUrl = new URL(url);
        } catch (err) {
            resolve({
            error: {
              message: `Invalid URL: ${err.message}`,
              code: 'INVALID_URL',
            },
          });
          return;
        }

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          resolve({ error: { message: 'Only HTTP and HTTPS are supported', code: 'INVALID_URL' } });
          return;
        }
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
          method: method || 'GET',
          headers: headers || {},
        };

        const req = protocol.request(url, options, (res) => {
          const chunks = [];
          res.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk));
          });
          res.on('end', () => {
            if (requestId) activeHttpRequests.delete(requestId);
            const data = Buffer.concat(chunks).toString('utf8');
            // Convert headers to plain object
            const responseHeaders = {};
            Object.entries(res.headers).forEach(([key, value]) => {
              responseHeaders[key] = String(value);
            });

            resolve({
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: responseHeaders,
              body: data,
            });
          });
        });

        req.on('error', (error) => {
          if (requestId) activeHttpRequests.delete(requestId);
          resolve({
            error: {
              message: error.message,
              code: error.code,
            },
          });
        });

        if (requestId) activeHttpRequests.set(requestId, req);
        if (Number.isFinite(timeout) && timeout > 0) {
          req.setTimeout(timeout, () => {
            const timeoutError = new Error(`Request timed out after ${timeout} ms`);
            timeoutError.code = 'ETIMEDOUT';
            req.destroy(timeoutError);
          });
        }

        // Send body if present
        if (body) {
          req.write(body);
        }
        req.end();
      } catch (error) {
        resolve({
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    });
  });

  ipcMain.on('http-request-cancel', (event, requestId) => {
    const request = activeHttpRequests.get(requestId);
    if (request) {
      const error = new Error('Request cancelled');
      error.code = 'ABORTED';
      request.destroy(error);
      activeHttpRequests.delete(requestId);
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
