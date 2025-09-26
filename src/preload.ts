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
    isActive: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:isActive', projectName, branch),
    getOutput: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:getOutput', projectName, branch),
    list: () => ipcRenderer.invoke('claude:list'),
    getWorkspaceInfo: (projectName: string, branch: string) =>
      ipcRenderer.invoke('claude:getWorkspaceInfo', projectName, branch),
    setPlanMode: (projectName: string, branch: string, planMode: boolean) =>
      ipcRenderer.invoke('claude:setPlanMode', projectName, branch, planMode),
    sendMessage: (projectName: string, branch: string, message: string) =>
      ipcRenderer.invoke('claude:sendMessage', projectName, branch, message),
    handleSlashCommand: (projectName: string, branch: string, command: string) =>
      ipcRenderer.invoke('claude:handleSlashCommand', projectName, branch, command),
    onOutput: (callback: (data: any) => void) => {
      ipcRenderer.on('claude:output', (event, data) => callback(data));
      // Return unsubscribe function
      return () => ipcRenderer.removeAllListeners('claude:output');
    },
    onClear: (callback: (data: any) => void) => {
      ipcRenderer.on('claude:clear', (event, data) => callback(data));
      // Return unsubscribe function
      return () => ipcRenderer.removeAllListeners('claude:clear');
    },
    onCompactionComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('claude:compaction-complete', (event, data) => callback(data));
      // Return unsubscribe function
      return () => ipcRenderer.removeAllListeners('claude:compaction-complete');
    }
  }
});