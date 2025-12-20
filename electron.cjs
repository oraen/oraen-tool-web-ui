const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');

let mainWindow;

// Get preload path - handle both dev and packaged scenarios
function getPreloadPath() {
  // In packaged app, preload.cjs is at the same level as electron.cjs
  const preloadPath = path.join(__dirname, 'preload.cjs');
  console.log('[Electron] Preload path:', preloadPath);
  console.log('[Electron] Preload exists:', fs.existsSync(preloadPath));
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
  // Register IPC handler AFTER app is ready
  // This bypasses CORS completely since we use native Node.js http module
  ipcMain.handle('http-request', async (event, requestData) => {
    console.log('[IPC] http-request received:', {
      url: requestData.url,
      method: requestData.method,
      hasBody: !!requestData.body,
    });

    return new Promise((resolve) => {
      try {
        const { url, method, headers, body } = requestData;
        
        // Parse URL
        let parsedUrl;
        try {
          parsedUrl = new URL(url);
        } catch (err) {
          console.error('[IPC] Invalid URL:', url, err.message);
          resolve({
            error: {
              message: `Invalid URL: ${err.message}`,
              code: 'INVALID_URL',
            },
          });
          return;
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
          method: method || 'GET',
          headers: headers || {},
        };

        console.log('[IPC] Making request:', {
          url,
          method: options.method,
          headerKeys: Object.keys(options.headers),
        });

        const req = protocol.request(url, options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            // Convert headers to plain object
            const responseHeaders = {};
            Object.entries(res.headers).forEach(([key, value]) => {
              responseHeaders[key] = String(value);
            });

            console.log('[IPC] Response received:', {
              status: res.statusCode,
              contentType: res.headers['content-type'],
              bodyLength: data.length,
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
          console.error('[IPC] Request error:', error.message, error.code);
          resolve({
            error: {
              message: error.message,
              code: error.code,
            },
          });
        });

        // Send body if present
        if (body) {
          console.log('[IPC] Writing body, length:', body.length);
          req.write(body);
        }
        req.end();
      } catch (error) {
        console.error('[IPC] Catch error:', error.message);
        resolve({
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    });
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
