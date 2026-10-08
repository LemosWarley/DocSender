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

    // --- Envios com erro e pendentes ('erros' | 'pendentes') ---
    listFolderFiles: (tipo) => ipcRenderer.invoke('list-folder-files', tipo),
    reprocessFolderFiles: (tipo, fileNames) => ipcRenderer.invoke('reprocess-folder-files', tipo, fileNames),
    deleteFolderFile: (tipo, fileName) => ipcRenderer.invoke('delete-folder-file', tipo, fileName),
    onErrorFilesChanged: (callback) => {
        ipcRenderer.on('error-files-changed', () => callback());
    },

    // --- Autenticação e Sessão ---
    // A senha salva nunca volta para a tela: o login automático acontece no
    // processo principal.
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    autoConnect: () => ipcRenderer.invoke('auto-connect'),
    // Logout: derruba a sessão inteira.
    clearCredentials: () => ipcRenderer.invoke('clear-credentials'),

    // --- Configurações do Sistema ---
    toggleStartup: (enable) => ipcRenderer.invoke('toggle-startup', enable),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setOption: (chave, valor) => ipcRenderer.invoke('set-option', chave, valor),

    // --- Atualização ---
    checkUpdate: () => ipcRenderer.invoke('check-update'),
    openUpdateDownload: () => ipcRenderer.invoke('open-update-download'),

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
    refreshCertificates: () => ipcRenderer.invoke('refresh-certificates'),

    onCertificatesLoading: (callback) => {
        ipcRenderer.on('certificates-loading', (event, data) => callback(data));
    },

    onCertificatesUpdate: (callback) => {
        ipcRenderer.on('certificates-update', (event, data) => callback(data));
    }
});
