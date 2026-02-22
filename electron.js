const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let nextProcess = null;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL('http://localhost:3021');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startNext() {
  nextProcess = spawn('npm', ['start'], {
    cwd: __dirname,
    shell: true,
  });

  nextProcess.stdout.on('data', (data) => {
    console.log(`Next.js: ${data}`);
    if (data.toString().includes('Ready')) {
      createWindow();
    }
  });

  nextProcess.stderr.on('data', (data) => {
    console.error(`Next.js Error: ${data}`);
  });
}

app.on('ready', () => {
  const port = process.env.PORT;
  if (port) {
    // Dev mode: just load the URL
    console.log(`Electron starting in dev mode on port ${port}`);
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } else {
    // Production/Standard mode: Load static index.html from 'out' directory
    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'out/index.html')}`;
    console.log(`Electron starting in production mode, loading: ${startUrl}`);

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true, // true for security
      },
    });

    mainWindow.loadURL(startUrl);

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }
});

app.on('window-all-closed', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
