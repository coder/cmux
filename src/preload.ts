import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config: any) => ipcRenderer.invoke('config:save', config)
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory')
  },
  git: {
    createWorktree: (projectPath: string, branchName: string) => 
      ipcRenderer.invoke('git:createWorktree', projectPath, branchName),
    removeWorktree: (workspacePath: string) => 
      ipcRenderer.invoke('git:removeWorktree', workspacePath)
  },
  claude: {
    start: (workspacePath: string, projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:start', workspacePath, projectName, branch),
    stop: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:stop', projectName, branch),
    isActive: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:isActive', projectName, branch),
    getOutput: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:getOutput', projectName, branch),
    listActive: () => ipcRenderer.invoke('claude:listActive'),
    sendMessage: (projectName: string, branch: string, message: string) =>
      ipcRenderer.invoke('claude:sendMessage', projectName, branch, message),
    onOutput: (callback: (data: any) => void) => {
      ipcRenderer.on('claude:output', (event, data) => callback(data));
    }
  }
});