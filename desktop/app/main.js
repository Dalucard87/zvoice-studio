// ZVoice Studio — десктоп-обёртка Electron:
// внутренний статический сервер + окно + авто-выдача микрофона
const { app, BrowserWindow, session, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.setName('zvoice-studio');

const ROOT = path.resolve(__dirname, '..', '..'); // папка zvoice-studio с index.html
const LOG = path.join(__dirname, 'app.log');
const log = (msg) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + msg + '\n'); } catch {} };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  } catch {
    res.writeHead(500); res.end();
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('zvoice.studio');
    Menu.setApplicationMenu(null); // чистое окно приложения

    // микрофон — без диалогов (это наше приложение)
    const allow = ['media', 'audioCapture', 'fullscreen', 'clipboard-sanitized-write'];
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allow.includes(permission)));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => allow.includes(permission));

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      log('serving ' + ROOT + ' on http://127.0.0.1:' + port);
      win = new BrowserWindow({
        width: 1280, height: 860, minWidth: 940, minHeight: 600,
        title: 'ZVoice Studio',
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#0e1014',
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      win.loadURL('http://127.0.0.1:' + port + '/?v=' + Date.now()); // кэш не мешает обновлениям
      win.once('ready-to-show', () => win.show());
      win.webContents.on('did-finish-load', () => log('window loaded: ' + win.webContents.getURL()));
      win.webContents.on('console-message', (...args) => {
        const a = args[1];
        let level, msg, src = '';
        if (a && typeof a === 'object' && 'message' in a) {
          level = a.level; msg = a.message; src = a.sourceId || '';
          if (typeof level === 'string') level = level === 'error' ? 3 : level === 'warning' ? 2 : 0;
        } else { level = args[1]; msg = args[2]; src = args[4] || ''; }
        if (level >= 2) log('CONSOLE[' + level + '] ' + msg + ' @ ' + src);
      });
      win.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
      });
      win.on('page-title-updated', (e) => e.preventDefault());
      win.on('closed', () => { win = null; });
    });
  });

  app.on('window-all-closed', () => { try { server.close(); } catch {} app.quit(); });
}
