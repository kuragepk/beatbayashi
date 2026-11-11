// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Electron Main Process
// Wraps React UI in a desktop application window

const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--beatbayashi-version=${app.getVersion()}`]
    },
    // BeatBayashi icon U2 (window, taskbar). Windows prefers the multi-size
    // .ico (16/32/48/256); elsewhere the 512 px PNG. Both are under assets/.
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  const startUrl = isDev
    ? 'http://localhost:5173'  // Vite dev server
    : `file://${path.join(__dirname, 'dist/index.html')}`; // Vite production build output

  mainWindow.loadURL(startUrl);

  if (isDev && !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About BeatBayashi',
              message: 'BeatBayashi',
              detail:
                'Code licence: MIT-0. Built-in presets and patterns: CC0 1.0 or MIT-0, your choice.\n' +
                'All sounds are synthesized at runtime (no bundled audio samples).\n' +
                'Patterns and exported audio you create belong to you: commercial use, ' +
                'redistribution and modification are all permitted, no attribution required.\n\n' +
                'See PROVENANCE.md and PROJECT-POLICY.md in the source repository for details.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle
app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  // macOS: quit on Cmd+Q, not on window close
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
