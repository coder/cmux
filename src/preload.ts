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
    list: () => ipcRenderer.invoke('claude:list'),
    getWorkspaceInfo: (projectName: string, branch: string) =>
      ipcRenderer.invoke('claude:getWorkspaceInfo', projectName, branch),
    setPermissionMode: (projectName: string, branch: string, permissionMode: import('./types/global').UIPermissionMode) =>
      ipcRenderer.invoke('claude:setPermissionMode', projectName, branch, permissionMode),
    sendMessage: (projectName: string, branch: string, message: string) =>
      ipcRenderer.invoke('claude:sendMessage', projectName, branch, message),
    handleSlashCommand: (projectName: string, branch: string, command: string) =>
      ipcRenderer.invoke('claude:handleSlashCommand', projectName, branch, command),
    streamHistory: (projectName: string, branch: string) =>
      ipcRenderer.invoke('claude:streamHistory', projectName, branch),
    onOutput: (workspaceId: string, callback: (data: any) => void) => {
      const channel = `claude:output:${workspaceId}`;
      const handler = (event: any, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onClear: (workspaceId: string, callback: (data: any) => void) => {
      const channel = `claude:clear:${workspaceId}`;
      const handler = (event: any, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener(channel, handler);
    }
  }
});