const { contextBridge, ipcRenderer } = require('electron');

/**
 * A ponte de segurança (ContextBridge) conecta o mundo do Chrome (Renderer)
 * ao mundo do Node.js (Main Process) de forma protegida.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Pastas e Arquivos ---
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    saveFolders: (folders) => ipcRenderer.invoke('save-folders', folders),
    
    // --- Monitoramento ---
    startMonitoring: (config) => ipcRenderer.invoke('start-monitoring', config),
    stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),

    // --- Envios com erro ---
    getErrorFiles: () => ipcRenderer.invoke('get-error-files'),
    reprocessErrorFiles: (fileNames) => ipcRenderer.invoke('reprocess-error-files', fileNames),
    deleteErrorFile: (fileName) => ipcRenderer.invoke('delete-error-file', fileName),
    onErrorFilesChanged: (callback) => {
        ipcRenderer.on('error-files-changed', () => callback());
    },
    
    // --- Autenticação e Sessão ---
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    getSavedCredentials: () => ipcRenderer.invoke('get-saved-credentials'),
    saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
    clearCredentials: () => ipcRenderer.invoke('clear-credentials'),
    
    // --- Configurações do Sistema ---
    toggleStartup: (enable) => ipcRenderer.invoke('toggle-startup', enable),
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // --- Controles da janela (barra de título customizada) ---
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowClose: () => ipcRenderer.send('window-close'),
    onWindowState: (callback) => {
        ipcRenderer.on('window-state', (event, data) => callback(data));
    },
    
    // --- Ouvintes de Eventos (Main -> Renderer) ---
    
    // Recebe mensagens de log vindas do monitoramento
    onLogEvent: (callback) => {
        ipcRenderer.on('log', (event, data) => callback(data));
    },
    
    // Recebe o comando de reconexão forçada se o Refresh Token falhar
    onForceReconnect: (callback) => {
        ipcRenderer.on('force-reconnect', () => callback());
    },

    // Recebe atualizações de status da sessão (ex: reconectado silenciosamente)
    onSessionStatus: (callback) => {
        ipcRenderer.on('session-status', (event, data) => callback(data));
    },

    // --- Certificados ---
    selectCertFolder: () => ipcRenderer.invoke('select-cert-folder'),
    unlockCertificates: (passwordsToTry) => ipcRenderer.invoke('unlock-certificates', passwordsToTry),
    installCertificate: (thumbprint) => ipcRenderer.invoke('install-certificate', thumbprint),
    uninstallCertificate: (thumbprint) => ipcRenderer.invoke('uninstall-certificate', thumbprint),
    deleteCertificate: (thumbprint) => ipcRenderer.invoke('delete-certificate', thumbprint),
    getSavedCertPasswords: () => ipcRenderer.invoke('get-saved-cert-passwords'),
    refreshCertificates: () => ipcRenderer.invoke('refresh-certificates'),
    
    onCertificatesLoading: (callback) => {
        ipcRenderer.on('certificates-loading', (event, data) => callback(data));
    },
    
    onCertificatesUpdate: (callback) => {
        ipcRenderer.on('certificates-update', (event, data) => callback(data));
    }
});