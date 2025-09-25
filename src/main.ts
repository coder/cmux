import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { load_config_or_default, save_config, Config } from './config';

let mainWindow: BrowserWindow | null = null;

// Register IPC handlers before creating window
ipcMain.handle('config:load', async () => {
  const config = load_config_or_default();
  return {
    projects: Array.from(config.projects)
  };
});

ipcMain.handle('config:save', async (event, configData: any) => {
  const config: Config = {
    projects: new Set(configData.projects)
  };
  save_config(config);
  return true;
});

ipcMain.handle('dialog:selectDirectory', async () => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Cmux - Coding Agent Multiplexer'
  });

  // Always load from dev server for now
  mainWindow.loadURL('http://localhost:5173');
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});