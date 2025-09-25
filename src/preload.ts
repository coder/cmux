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
    launch: (workspacePath: string, projectPath: string, branch: string) => 
      ipcRenderer.invoke('claude:launch', workspacePath, projectPath, branch),
    check: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:check', projectName, branch),
    terminate: (projectName: string, branch: string) => 
      ipcRenderer.invoke('claude:terminate', projectName, branch),
    listAll: () => ipcRenderer.invoke('claude:listAll')
  }
});