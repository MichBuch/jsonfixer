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

  mainWindow.loadURL('http://localhost:3000');
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
  startNext();
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
