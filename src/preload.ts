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
    list: () => ipcRenderer.invoke('claude:list'),
    getWorkspaceInfo: (workspaceId: string) =>
      ipcRenderer.invoke('claude:getWorkspaceInfo', workspaceId),
    setPermissionMode: (workspaceId: string, permissionMode: import('./types/global').UIPermissionMode) =>
      ipcRenderer.invoke('claude:setPermissionMode', workspaceId, permissionMode),
    sendMessage: (workspaceId: string, message: string) =>
      ipcRenderer.invoke('claude:sendMessage', workspaceId, message),
    handleSlashCommand: (workspaceId: string, command: string) =>
      ipcRenderer.invoke('claude:handleSlashCommand', workspaceId, command),
    streamHistory: (workspaceId: string) =>
      ipcRenderer.invoke('claude:streamHistory', workspaceId),
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
    },
    removeWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke('claude:removeWorkspace', workspaceId)
  }
});