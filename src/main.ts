import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import { load_config_or_default, save_config, Config } from './config';
import { createWorktree, removeWorktree } from './git';
import claudeLauncher from './claudeLauncher';

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the primary instance
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

// Register IPC handlers before creating window
ipcMain.handle('config:load', async () => {
  const config = load_config_or_default();
  return {
    projects: Array.from(config.projects.entries())
  };
});

ipcMain.handle('config:save', async (event, configData: any) => {
  const config: Config = {
    projects: new Map(configData.projects)
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

ipcMain.handle('git:createWorktree', async (event, projectPath: string, branchName: string) => {
  return await createWorktree(projectPath, branchName);
});

ipcMain.handle('git:removeWorktree', async (event, workspacePath: string) => {
  return await removeWorktree(workspacePath);
});

// Claude Code management handlers
ipcMain.handle('claude:launch', async (event, workspacePath: string, projectPath: string, branch: string) => {
  return await claudeLauncher.launchClaudeCode(workspacePath, projectPath, branch);
});

ipcMain.handle('claude:check', async (event, projectName: string, branch: string) => {
  return await claudeLauncher.checkExisting(projectName, branch);
});

ipcMain.handle('claude:terminate', async (event, projectName: string, branch: string) => {
  return await claudeLauncher.terminateProcess(projectName, branch);
});

ipcMain.handle('claude:listAll', async () => {
  return await claudeLauncher.getAllRunningClaudes();
});

function createMenu() {
  const template: any[] = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
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
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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
  
  // Open DevTools in development
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Only setup app handlers if we got the lock
if (gotTheLock) {
  app.whenReady().then(async () => {
    // Clean up stale locks on startup
    await claudeLauncher.cleanupStaleLocks();
    
    createMenu();
    createWindow();
  });

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
}