console.log("1. Iniciando o processo do DocSender...");

const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, Notification, safeStorage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const axios = require('axios');
const FormData = require('form-data');
const forge = require('node-forge');
const { execFile } = require('child_process');
const crypto = require('crypto');

// --- GARANTIA DE INSTÂNCIA ÚNICA ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

const Store = require('electron-store');
const store = new Store(); 

let mainWindow;
let tray;
let watcher;
let certWatcher;
let cachedCertificates = []; // Armazena info descriptografada dos certs
let refreshTimeout = null; // Atraso para chokidar

// Estado da Sessão (Refresh Token)
let currentAccessToken = null;
let currentRefreshToken = null;
let tokenExpiresAt = 0;

// Projeto Supabase proprio (migracao saindo do Lovable Cloud, 09/08/2026).
// Anterior: https://ojosihisbhdettqsliam.supabase.co
// A anon key e publica por definicao - ja viaja em toda requisicao deste app.
// Ao trocar de projeto, o refresh_token salvo em disco deixa de valer: ele foi
// emitido pelo projeto antigo, entao o usuario precisa entrar de novo (as
// credenciais sao as mesmas, os usuarios vieram no dump).
const API_BASE_URL = "https://suwacpmwnxeazbbavwmn.supabase.co";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1d2FjcG13bnhlYXpiYmF2d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAzOTAsImV4cCI6MjEwMTg1NjM5MH0.OFaIVwUrsmkjj-775Xpnbyj7LS2ugP7c8dnXTzGagOQ";

// --- HELPERS DE COMUNICAÇÃO E ARMAZENAMENTO SEGURO ---

// Envia mensagens ao renderer com segurança (a janela pode ter sido destruída)
function sendToRenderer(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

// O refresh token é a credencial mais sensível (sessão de longa duração).
// Guardamos criptografado com safeStorage, com fallback para texto puro.
function saveRefreshToken(token) {
    if (!token) return;
    if (safeStorage.isEncryptionAvailable()) {
        store.set('saved_refresh_token', safeStorage.encryptString(token).toString('base64'));
        store.set('refresh_token_encrypted', true);
    } else {
        store.set('saved_refresh_token', token);
        store.set('refresh_token_encrypted', false);
    }
}

function getRefreshToken() {
    const raw = store.get('saved_refresh_token');
    if (!raw) return null;
    if (store.get('refresh_token_encrypted') && safeStorage.isEncryptionAvailable()) {
        try {
            return safeStorage.decryptString(Buffer.from(raw, 'base64'));
        } catch (e) {
            return null; // Não foi possível descriptografar (ex: perfil/máquina mudou)
        }
    }
    return raw;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ERROR_FOLDER_NAME = '_Erros_Envio';
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

// Move um arquivo com fallback para cópia+remoção quando origem e destino
// estão em drives diferentes (rename lança EXDEV nesse caso).
function moveFile(src, destDir, fileName) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, fileName);
    try {
        fs.renameSync(src, dest);
    } catch (err) {
        if (err.code === 'EXDEV') {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
        } else {
            throw err;
        }
    }
    return dest;
}

// Valida se o arquivo é realmente um PDF (magic bytes "%PDF") e cabe no limite.
function isValidPdf(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size === 0 || stat.size > MAX_PDF_BYTES) return false;
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        return buf.toString('latin1') === '%PDF';
    } catch (e) {
        return false;
    }
}

// --- SESSÃO / TOKEN ---

// Extrai o texto de erro do corpo da resposta (as Edge Functions devolvem
// { success: false, error: "..." }).
function responseErrorText(error) {
    const data = error?.response?.data;
    if (!data) return '';
    if (typeof data === 'string') return data;
    return String(data.error || data.message || JSON.stringify(data));
}

// Mensagens que o servidor devolve quando o JWT não vale mais. As Edge Functions
// antigas respondiam 400 nesses casos (caíam no catch genérico); as novas
// respondem 401. Reconhecemos as duas formas para o app continuar funcionando
// mesmo contra um servidor ainda não atualizado.
const AUTH_ERROR_PATTERNS = [
    'token inválido', 'token invalido',
    'autenticação necessária', 'autenticacao necessaria',
    'jwt expired', 'invalid jwt', 'invalid claim', 'bad_jwt',
    'sessão expirada', 'sessao expirada'
];

function looksLikeAuthMessage(text) {
    const t = String(text || '').toLowerCase();
    return AUTH_ERROR_PATTERNS.some(p => t.includes(p));
}

// Classifica uma falha em:
//   'auth'      -> credencial inválida: renovar sessão e reenviar
//   'transient' -> rede/5xx/429: tentar de novo mais tarde, o arquivo continua válido
//   'permanent' -> erro de dados/cadastro: reenviar não resolve
function classifyFailure(error) {
    if (error.authFatal) return 'auth';
    // Sem `response` = rede, DNS, timeout ou socket fechado. A sessão pode estar
    // perfeitamente válida — nunca tratamos isso como sessão perdida.
    if (error.networkDown || !error.response) return 'transient';

    const status = error.response.status;
    if (status === 401) return 'auth';
    if (status === 429 || status >= 500) return 'transient';
    if ((status === 400 || status === 403) && looksLikeAuthMessage(responseErrorText(error))) return 'auth';
    return 'permanent';
}

function describeError(error) {
    const detail = responseErrorText(error);
    return detail ? `${error.message} - ${detail}` : error.message;
}

let refreshPromise = null; // Single-flight: evita renovações concorrentes (race de rotação)

// Sem esta trava o loop de 5 min reemitiria 'force-reconnect' (e o erro no log)
// a cada ciclo enquanto o usuário não voltasse a logar.
let reconnectRequested = false;
function requestReconnect() {
    if (reconnectRequested) return;
    reconnectRequested = true;
    sendToRenderer('force-reconnect');
}

// Executa a renovação real com retry e backoff. Não deve ser chamada diretamente.
// Lança erro marcado com `authFatal` (refresh token morto) ou `networkDown`
// (servidor inalcançável) — quem chama precisa reagir de forma diferente a cada um.
async function doRefresh() {
    const refreshToken = currentRefreshToken || getRefreshToken();
    if (!refreshToken) {
        const err = new Error("Sessão expirada. Reconecte.");
        err.authFatal = true;
        throw err;
    }
    currentRefreshToken = refreshToken;

    const backoff = [2000, 5000, 10000]; // 3 tentativas
    let lastError = null;

    for (let attempt = 0; attempt < backoff.length; attempt++) {
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/v1/token?grant_type=refresh_token`,
                { refresh_token: currentRefreshToken },
                { headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }, timeout: 20000 }
            );
            currentAccessToken = res.data.access_token;
            currentRefreshToken = res.data.refresh_token;
            tokenExpiresAt = Math.floor(Date.now() / 1000) + res.data.expires_in;
            saveRefreshToken(currentRefreshToken);
            reconnectRequested = false;
            return currentAccessToken;
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            // 400/401 = refresh token inválido/rotacionado -> retry não adianta, aborta já.
            if (status === 400 || status === 401) {
                const err = new Error("Sessão expirada. Reconecte.");
                err.authFatal = true;
                err.cause = error;
                throw err;
            }
            // Erros transitórios (rede/5xx): espera e tenta de novo.
            if (attempt < backoff.length - 1) await sleep(backoff[attempt]);
        }
    }

    // Só chega aqui por rede/5xx: o refresh token provavelmente continua bom.
    const err = new Error("Não foi possível falar com o servidor de autenticação.");
    err.networkDown = true;
    err.cause = lastError;
    throw err;
}

// Garante um token válido, reutilizando uma renovação em andamento (single-flight).
async function ensureValidToken() {
    const now = Math.floor(Date.now() / 1000);
    if (currentAccessToken && (tokenExpiresAt - now) > 300) return currentAccessToken;

    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    return refreshPromise;
}

// Lê o e-mail do payload do JWT (o Supabase inclui `email`). Serve só para
// exibir na interface ao retomar a sessão — quem valida o token é o servidor.
function getEmailFromToken() {
    if (!currentAccessToken) return '';
    try {
        const payload = currentAccessToken.split('.')[1];
        const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        return JSON.parse(json).email || '';
    } catch (e) {
        return '';
    }
}

// Tenta re-logar silenciosamente com as credenciais salvas (a senha é guardada criptografada).
// Última linha de defesa antes de pedir reconexão manual ao usuário.
// Retorna { ok, reason }: 'network' quando o servidor não respondeu (a senha pode
// estar correta), 'auth' quando o servidor recusou ou não há credencial salva.
async function attemptSilentRelogin() {
    const email = store.get('saved_email', '');
    let password = store.get('saved_password', '');
    if (password && safeStorage.isEncryptionAvailable()) {
        try { password = safeStorage.decryptString(Buffer.from(password, 'base64')); } catch (e) { password = ''; }
    }
    if (!email || !password) return { ok: false, reason: 'auth' };

    try {
        const res = await axios.post(`${API_BASE_URL}/auth/v1/token?grant_type=password`,
            { email, password },
            { headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }, timeout: 20000 }
        );
        currentAccessToken = res.data.access_token;
        currentRefreshToken = res.data.refresh_token;
        tokenExpiresAt = Math.floor(Date.now() / 1000) + res.data.expires_in;
        saveRefreshToken(currentRefreshToken);
        reconnectRequested = false;
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.response ? 'auth' : 'network' };
    }
}

// Recupera a sessão: renova o token e, se falhar, tenta re-login silencioso.
// Retorna { ok, reason }. Só 'auth' significa sessão realmente perdida —
// 'network' é temporário e NÃO deve deslogar o usuário.
async function recoverSession() {
    try {
        await ensureValidToken();
        return { ok: true };
    } catch (e) {
        // Servidor inalcançável: não dá para afirmar que a sessão morreu.
        if (e.networkDown) return { ok: false, reason: 'network' };
        return await attemptSilentRelogin();
    }
}

// Revalida a sessão e avisa o renderer. Chamada pelo loop periódico e ao
// acordar da suspensão.
async function checkSession() {
    if (!getRefreshToken() && !store.get('saved_password')) return;
    const rec = await recoverSession();
    if (rec.ok) {
        sendToRenderer('session-status', { connected: true });
    } else if (rec.reason === 'network') {
        // Rede fora não é sessão perdida: segue conectado e tenta no próximo ciclo.
        sendToRenderer('session-status', { connected: true, offline: true });
    } else {
        requestReconnect();
    }
}

let tokenRefreshInterval = null;
function startTokenRefreshLoop() {
    if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = setInterval(checkSession, 5 * 60 * 1000); // Checa a cada 5 minutos
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100, height: 780, minWidth: 900, minHeight: 680,
        title: "DocSender", show: false, frame: false, backgroundColor: '#0a0e1a',
        icon: path.join(__dirname, '..', 'assets', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Reflete no renderer o estado de maximizado (para trocar o ícone).
    mainWindow.on('maximize', () => sendToRenderer('window-state', { maximized: true }));
    mainWindow.on('unmaximize', () => sendToRenderer('window-state', { maximized: false }));

    if (!process.argv.includes('--hidden')) {
        mainWindow.once('ready-to-show', () => mainWindow.show());
    }
}

// Controles da barra de título customizada
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'logo.png');
    if (fs.existsSync(iconPath)) {
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Abrir DocSender', click: () => mainWindow.show() },
            { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } }
        ]);
        tray.setContextMenu(contextMenu);
    }
}

function setupAutoStart(enable) {
    let args = ['--hidden'];
    if (!app.isPackaged) args.unshift(path.resolve(process.argv[1]));
    app.setLoginItemSettings({ openAtLogin: enable, args: args });
}

app.whenReady().then(() => {
    createWindow();
    createTray();
    setupAutoStart(store.get('iniciar_com_windows', false));
    startTokenRefreshLoop();
    
    const savedCertFolder = store.get('folderCertificados', '');
    if (savedCertFolder && fs.existsSync(savedCertFolder)) {
        startCertMonitoring(savedCertFolder);
    }

    // Ao voltar da suspensão o intervalo de 5 min está atrasado e o access token
    // provavelmente venceu. Revalida na hora e destrava a fila, em vez de deixar
    // o primeiro envio pós-hibernação falhar.
    powerMonitor.on('resume', () => { checkSession(); pumpQueue(); });
});

app.on('second-instance', () => {
    if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
    }
});

// --- IPC HANDLERS ---
ipcMain.handle('login', async (event, { email, password }) => {
    try {
        const res = await axios.post(`${API_BASE_URL}/auth/v1/token?grant_type=password`, { email, password }, {
            headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }
        });
        currentAccessToken = res.data.access_token;
        currentRefreshToken = res.data.refresh_token;
        tokenExpiresAt = Math.floor(Date.now() / 1000) + res.data.expires_in;
        saveRefreshToken(currentRefreshToken);
        reconnectRequested = false;
        return { success: true, token: currentAccessToken };
    } catch (error) {
        return { success: false, error: error.response?.data?.error_description || "Erro de login" };
    }
});

ipcMain.handle('save-credentials', (e, { email, password }) => {
    store.set('saved_email', email);
    if (safeStorage.isEncryptionAvailable()) {
        store.set('saved_password', safeStorage.encryptString(password).toString('base64'));
    } else { store.set('saved_password', password); }
    return true;
});

ipcMain.handle('get-saved-credentials', () => {
    const email = store.get('saved_email', '');
    let password = store.get('saved_password', '');
    if (password && safeStorage.isEncryptionAvailable()) {
        try { password = safeStorage.decryptString(Buffer.from(password, 'base64')); } catch (e) { password = ''; }
    }
    return { email, password };
});

// Logout explícito: derruba tudo, inclusive a sessão em memória.
ipcMain.handle('clear-credentials', () => {
    store.delete('saved_email'); store.delete('saved_password');
    store.delete('saved_refresh_token'); store.delete('refresh_token_encrypted');
    currentAccessToken = null; currentRefreshToken = null; tokenExpiresAt = 0;
    return true;
});

// "Lembrar de mim" desmarcado: esquece apenas a senha guardada. O refresh token
// É a sessão — apagá-lo aqui derrubava o login que acabara de ser feito, e todo
// envio seguinte falhava por falta de token.
ipcMain.handle('forget-saved-password', () => {
    store.delete('saved_email'); store.delete('saved_password');
    return true;
});

// Retoma a sessão a partir do refresh token em disco, sem pedir a senha.
// Usada na abertura do app quando não há credencial salva.
ipcMain.handle('restore-session', async () => {
    if (!getRefreshToken() && !store.get('saved_password')) return { success: false, reason: 'auth' };
    const rec = await recoverSession();
    if (!rec.ok) return { success: false, reason: rec.reason };
    return { success: true, email: getEmailFromToken() || store.get('saved_email', '') };
});

ipcMain.handle('toggle-startup', (e, enable) => {
    store.set('iniciar_com_windows', enable);
    setupAutoStart(enable);
    return true;
});

ipcMain.handle('get-settings', () => ({
    folderEnvio: store.get('folderEnvio', ''),
    folderBackup: store.get('folderBackup', ''),
    folderCertificados: store.get('folderCertificados', ''),
    iniciarComWindows: store.get('iniciar_com_windows', false)
}));

ipcMain.handle('save-folders', (e, { folderEnvio, folderBackup }) => {
    if (folderEnvio !== undefined) store.set('folderEnvio', folderEnvio); 
    if (folderBackup !== undefined) store.set('folderBackup', folderBackup);
    return true;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
});

// --- FILA DE ENVIO COM CONCORRÊNCIA LIMITADA E RETRY COM BACKOFF ---
const MAX_CONCURRENT_UPLOADS = 2;

// Falha transitória (rede caiu, 5xx, timeout) não manda o arquivo para a pasta
// de erro na hora: reagenda. Só desiste depois de esgotar estas tentativas.
const RETRY_BACKOFF_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000];

let uploadQueue = [];
let activeUploads = 0;
let queueTimer = null;
const inFlight = new Set(); // Caminhos sendo enviados neste momento

function formatDelay(ms) {
    return ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)} min`;
}

function enqueuePdf(filePath, backupFolder, autoSend, errorDir) {
    // O chokidar pode reemitir o mesmo caminho; não duplica na fila nem
    // concorre com um envio já em andamento do mesmo arquivo.
    if (inFlight.has(filePath) || uploadQueue.some(j => j.filePath === filePath)) return;
    uploadQueue.push({ filePath, backupFolder, autoSend, errorDir, attempt: 0, nextAttemptAt: Date.now() });
    pumpQueue();
}

function clearQueue() {
    uploadQueue = [];
    if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }
}

function pumpQueue() {
    if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }

    // Só puxa jobs cujo horário de tentativa já chegou.
    while (activeUploads < MAX_CONCURRENT_UPLOADS) {
        const idx = uploadQueue.findIndex(j => j.nextAttemptAt <= Date.now());
        if (idx === -1) break;
        const [job] = uploadQueue.splice(idx, 1);
        activeUploads++;
        inFlight.add(job.filePath);
        processPdf(job).finally(() => {
            activeUploads--;
            inFlight.delete(job.filePath);
            pumpQueue();
        });
    }

    // Reagenda o próximo despertar para o job pendente mais próximo.
    if (uploadQueue.length > 0) {
        const soonest = Math.min(...uploadQueue.map(j => j.nextAttemptAt));
        queueTimer = setTimeout(pumpQueue, Math.max(1000, soonest - Date.now()));
    }
}

// Reagenda o job após falha transitória, ou desiste se já esgotou o orçamento.
function scheduleRetry(job, fileName, detail) {
    const delay = RETRY_BACKOFF_MS[job.attempt];
    if (delay === undefined) {
        sendToRenderer('log', { type: 'error', msg: `Erro em ${fileName} após ${RETRY_BACKOFF_MS.length + 1} tentativas: ${detail}` });
        moveToErrorFolder(job.filePath, fileName, job.errorDir);
        return;
    }
    job.attempt++;
    job.nextAttemptAt = Date.now() + delay;
    // Idem: quem religa a fila é o `finally` do job atual.
    uploadQueue.push(job);
    sendToRenderer('log', { type: 'warning', msg: `Falha temporária em ${fileName} (${detail}). Nova tentativa em ${formatDelay(delay)}.` });
}

// Caminho da pasta de erro para a pasta de envio configurada.
function getErrorDir() {
    const folder = store.get('folderEnvio');
    return folder ? path.join(folder, ERROR_FOLDER_NAME) : null;
}

ipcMain.handle('start-monitoring', (event, config) => {
    if (watcher) watcher.close();
    clearQueue();
    // Ignora a pasta de erro (dentro da monitorada) e a de backup, para não
    // reprocessar em loop arquivos que nós mesmos movemos.
    const backupFolder = config.backupFolder ? path.resolve(config.backupFolder) : null;
    const ignored = (p) => {
        const resolved = path.resolve(p);
        if (resolved.split(path.sep).includes(ERROR_FOLDER_NAME)) return true;
        if (backupFolder && (resolved === backupFolder || resolved.startsWith(backupFolder + path.sep))) return true;
        return false;
    };
    watcher = chokidar.watch(config.folder, {
        persistent: true,
        ignored,
        awaitWriteFinish: { stabilityThreshold: 2000 }
    });
    const errorDir = path.join(config.folder, ERROR_FOLDER_NAME);
    watcher.on('add', (filePath) => {
        if (filePath.toLowerCase().endsWith('.pdf')) {
            enqueuePdf(filePath, config.backupFolder, config.autoSend, errorDir);
        }
    });
    return true;
});

// Os arquivos só saem da pasta monitorada quando o envio dá certo, então o que
// estava na fila é reencontrado pela varredura inicial ao religar o monitoramento.
ipcMain.handle('stop-monitoring', () => { if (watcher) { watcher.close(); watcher = null; } clearQueue(); return true; });

// Move o arquivo para a subpasta de erro informada (ou a padrão da pasta monitorada).
function moveToErrorFolder(filePath, fileName, errorDir) {
    try {
        const dir = errorDir || path.join(path.dirname(filePath), ERROR_FOLDER_NAME);
        moveFile(filePath, dir, `${Date.now()}_${fileName}`);
        sendToRenderer('error-files-changed');
        return true;
    } catch (e) {
        sendToRenderer('log', { type: 'error', msg: `Não foi possível mover ${fileName} para a pasta de erro: ${e.message}` });
        return false;
    }
}

async function processPdf(job) {
    const { filePath, backupFolder, autoSend, errorDir } = job;
    const fileName = path.basename(filePath);

    // O arquivo pode ter sumido enquanto esperava na fila.
    if (!fs.existsSync(filePath)) return;

    // Validação: arquivo inválido/corrompido vai direto para a pasta de erro.
    if (!isValidPdf(filePath)) {
        sendToRenderer('log', { type: 'error', msg: `Arquivo inválido (não é PDF ou excede o limite): ${fileName}` });
        moveToErrorFolder(filePath, fileName, errorDir);
        return;
    }

    try {
        if (job.attempt === 0 && !job.authRetried) {
            sendToRenderer('log', { type: 'info', msg: `Detectado: ${fileName}` });
        }

        // Chave de idempotência (SHA-256 do conteúdo) — o servidor devolve o envio
        // já existente em vez de criar outro, então repetir a tentativa é seguro.
        const idempotencyKey = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), fileName);

        const uploadRes = await axios.post(`${API_BASE_URL}/functions/v1/documentos-upload`, form, {
            headers: { ...form.getHeaders(), 'Authorization': `Bearer ${await ensureValidToken()}`, 'apikey': API_KEY, 'x-idempotency-key': idempotencyKey },
            maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 120000
        });

        if (uploadRes.data.empresa_encontrada && autoSend) {
            // Token pedido de novo: o upload inclui análise de IA e pode demorar
            // o bastante para o token capturado antes dele já não servir.
            await axios.post(`${API_BASE_URL}/functions/v1/documentos-processar`, { envio_id: uploadRes.data.envio_id }, {
                headers: { 'Authorization': `Bearer ${await ensureValidToken()}`, 'apikey': API_KEY, 'Content-Type': 'application/json' }, timeout: 60000
            });
            sendToRenderer('log', { type: 'success', msg: `Enviado: ${fileName}` });
        }

        moveFile(filePath, backupFolder, `${Date.now()}_${fileName}`);
        // Se veio de um reprocessamento, a lista de erros pode ter diminuído.
        sendToRenderer('error-files-changed');
    } catch (error) {
        await handleSendFailure(job, error, fileName);
    }
}

// Decide o destino de um envio que falhou: reenviar agora (sessão renovada),
// reagendar (falha temporária) ou mandar para a pasta de erro (falha definitiva).
async function handleSendFailure(job, error, fileName) {
    const kind = classifyFailure(error);
    const detail = describeError(error);

    if (kind === 'transient') {
        return scheduleRetry(job, fileName, detail);
    }

    if (kind === 'auth') {
        // Uma renovação por documento: descarta o token em memória, recupera a
        // sessão e reenvia na hora. É isto que evita o "erro de autenticação"
        // que só saía deslogando e logando de novo.
        if (!job.authRetried) {
            job.authRetried = true;
            currentAccessToken = null;
            tokenExpiresAt = 0;

            const rec = await recoverSession();
            if (rec.ok) {
                sendToRenderer('session-status', { connected: true });
                sendToRenderer('log', { type: 'warning', msg: `Sessão renovada. Reenviando ${fileName}...` });
                job.nextAttemptAt = Date.now();
                // Sem pumpQueue() aqui: ainda estamos dentro do catch deste job,
                // e o `finally` que zera activeUploads/inFlight só roda depois.
                // É ele quem religa a fila, já com a contabilidade correta.
                uploadQueue.push(job);
                return;
            }
            // Servidor inalcançável: a sessão pode estar viva, trata como temporário.
            if (rec.reason === 'network') {
                return scheduleRetry(job, fileName, 'servidor de autenticação inacessível');
            }
        }

        // Sessão perdida de verdade: aí sim pede reconexão manual.
        sendToRenderer('log', { type: 'error', msg: `Erro em ${fileName}: sessão expirada e não foi possível reconectar.` });
        moveToErrorFolder(job.filePath, fileName, job.errorDir);
        requestReconnect();
        return;
    }

    // Erro definitivo (cadastro, dados do documento): repetir não resolve.
    sendToRenderer('log', { type: 'error', msg: `Erro em ${fileName}: ${detail}` });
    moveToErrorFolder(job.filePath, fileName, job.errorDir);
}


// --- ENVIOS COM ERRO (pasta _Erros_Envio) ---

ipcMain.handle('get-error-files', () => {
    const errorDir = getErrorDir();
    if (!errorDir || !fs.existsSync(errorDir)) return [];
    try {
        return fs.readdirSync(errorDir)
            .filter(f => f.toLowerCase().endsWith('.pdf'))
            .map(f => {
                const st = fs.statSync(path.join(errorDir, f));
                return { name: f, size: st.size, mtime: st.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);
    } catch (e) {
        return [];
    }
});

ipcMain.handle('reprocess-error-files', async (event, fileNames) => {
    const errorDir = getErrorDir();
    const backupFolder = store.get('folderBackup');
    if (!errorDir || !fs.existsSync(errorDir)) return { success: false, error: 'Nenhuma pasta de erro encontrada.' };
    if (!backupFolder) return { success: false, error: 'Defina a pasta de Backup em Configurações.' };

    // Sem argumento = reprocessar todos.
    const all = fs.readdirSync(errorDir).filter(f => f.toLowerCase().endsWith('.pdf'));
    const list = (fileNames && fileNames.length) ? fileNames.filter(f => all.includes(f)) : all;

    for (const name of list) {
        const src = path.join(errorDir, name);
        if (fs.existsSync(src)) {
            // Reprocessa em cima do próprio arquivo; on falha volta para a mesma pasta de erro.
            enqueuePdf(src, backupFolder, true, errorDir);
        }
    }
    return { success: true, count: list.length };
});

ipcMain.handle('delete-error-file', (event, fileName) => {
    const errorDir = getErrorDir();
    if (!errorDir) return { success: false };
    try {
        const target = path.join(errorDir, fileName);
        // Impede path traversal: o alvo precisa estar dentro da pasta de erro.
        if (!path.resolve(target).startsWith(path.resolve(errorDir) + path.sep)) return { success: false };
        if (fs.existsSync(target)) fs.unlinkSync(target);
        sendToRenderer('error-files-changed');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});


// --- LÓGICA DE CERTIFICADOS ---

function getSavedCertPasswords() {
    let passwords = store.get('saved_cert_passwords', {});
    if (safeStorage.isEncryptionAvailable()) {
        let decrypted = {};
        for (let file in passwords) {
            try {
                decrypted[file] = safeStorage.decryptString(Buffer.from(passwords[file], 'base64'));
            } catch (e) {}
        }
        return decrypted;
    }
    return passwords;
}

function saveCertPasswords(passwordsMap) {
    if (safeStorage.isEncryptionAvailable()) {
        let encrypted = {};
        for (let file in passwordsMap) {
            encrypted[file] = safeStorage.encryptString(passwordsMap[file]).toString('base64');
        }
        store.set('saved_cert_passwords', encrypted);
    } else {
        store.set('saved_cert_passwords', passwordsMap);
    }
}

ipcMain.handle('select-cert-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    const folder = result.filePaths[0];
    store.set('folderCertificados', folder);
    startCertMonitoring(folder);
    refreshCertificates(folder);
    return folder;
});

ipcMain.handle('get-saved-cert-passwords', () => {
    return Object.keys(getSavedCertPasswords());
});

ipcMain.handle('refresh-certificates', async () => {
    const folder = store.get('folderCertificados');
    if (folder && fs.existsSync(folder)) {
        await refreshCertificates(folder, false);
    }
    return true;
});

function triggerRefreshCertificates(folder) {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        refreshCertificates(folder);
    }, 500); // 500ms de silêncio (debounce) antes de rodar o PowerShell
}

function startCertMonitoring(folder) {
    if (certWatcher) certWatcher.close();
    certWatcher = chokidar.watch(folder, { persistent: true, depth: 0, ignoreInitial: true });
    certWatcher.on('all', (event, filePath) => {
        // Ignora subpastas garantindo que o arquivo está na raiz
        if (path.dirname(filePath) !== folder) return;

        if (filePath.toLowerCase().endsWith('.pfx') || filePath.toLowerCase().endsWith('.p12')) {
            triggerRefreshCertificates(folder);
        }
    });
    certWatcher.on('error', (error) => {
        console.error('Erro no observador de certificados:', error);
    });
}

// Extrai info de um pfx
function extractCertInfo(pfxData, password) {
    try {
        const p12Asn1 = forge.asn1.fromDer(pfxData.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
        
        let cert = null;
        for (let safeContent of p12.safeContents) {
            for (let safeBag of safeContent.safeBags) {
                if (safeBag.type === forge.pki.oids.certBag) {
                    cert = safeBag.cert;
                    break;
                }
            }
            if (cert) break;
        }

        if (!cert) return null;

        const subjectAttr = cert.subject.attributes.find(a => a.shortName === 'CN') || cert.subject.attributes[0];
        const name = subjectAttr ? subjectAttr.value : 'Certificado Desconhecido';
        const validTo = cert.validity.notAfter;
        const validFrom = cert.validity.notBefore;
        
        // Thumbprint: SHA-1 do DER
        const certAsn1 = forge.pki.certificateToAsn1(cert);
        const certDer = forge.asn1.toDer(certAsn1).getBytes();
        const md = forge.md.sha1.create();
        md.update(certDer);
        const thumbprint = md.digest().toHex().toUpperCase();

        return { name, validTo, validFrom, thumbprint };
    } catch (e) {
        return null;
    }
}

// Executa PowerShell de forma segura: script estático via -Command e valores
// dinâmicos (senhas, caminhos) passados por variáveis de ambiente — nunca
// interpolados na string. Evita injeção de comando e reduz heurística de AV.
// Sempre com timeout para não travar a Promise indefinidamente.
function runPowerShell(script, env = {}) {
    return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
            { env: { ...process.env, ...env }, timeout: 30000, windowsHide: true },
            (error, stdout) => resolve({ error, stdout: stdout || '' })
        );
    });
}

// Executa Powershell para pegar todos os thumbprints instalados
function getInstalledThumbprints() {
    return runPowerShell('Get-ChildItem Cert:\\CurrentUser\\My | Select-Object -ExpandProperty Thumbprint')
        .then(({ error, stdout }) => {
            if (error) return [];
            return stdout.split('\n').map(t => t.trim().toUpperCase()).filter(t => t.length > 0);
        });
}

async function refreshCertificates(folder, silent = false) {
    if (!fs.existsSync(folder)) return;
    const allFiles = await fs.promises.readdir(folder);
    const files = allFiles.filter(f => f.toLowerCase().endsWith('.pfx') || f.toLowerCase().endsWith('.p12'));
    
    if (!silent) {
        sendToRenderer('certificates-loading', { total: files.length, current: 0, text: 'Atualizando lista' });
    }
    
    let savedPasswords = getSavedCertPasswords();
    let installedCerts = await getInstalledThumbprints();
    
    const previousCache = [...cachedCertificates];
    let newCache = [];

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        let info = null;
        let isLocked = true;
        const filePath = path.join(folder, file);
        
        // Verifica se já processamos esse arquivo antes
        const prev = previousCache.find(c => c.file === file);
        if (prev && !prev.isLocked && savedPasswords[file]) {
            // Reaproveita os dados sem ler o arquivo ou usar criptografia novamente
            info = { name: prev.name, validTo: prev.validTo, thumbprint: prev.thumbprint };
            isLocked = false;
        } else {
            // Arquivo novo ou ainda bloqueado, vamos ler do disco
            try {
                const pfxData = await fs.promises.readFile(filePath);
                if (savedPasswords[file]) {
                    info = extractCertInfo(pfxData, savedPasswords[file]);
                    if (info) isLocked = false;
                }
            } catch (err) {
                console.error(`Falha ao ler arquivo: ${file}`);
                continue; // Pula este arquivo se não for possível ler
            }
        }

        const now = new Date();
        let status = 'bloqueado';
        
        if (!isLocked && info) {
            const isInstalled = installedCerts.includes(info.thumbprint);
            const ms15Days = 15 * 24 * 60 * 60 * 1000;
            
            if (info.validTo < now) status = 'expirado';
            else if (info.validTo - now <= ms15Days) status = 'prestes';
            else if (isInstalled) status = 'instalado';
            else status = 'nao_instalado';

            if ((status === 'prestes' || status === 'expirado') && !store.get(`notified_${info.thumbprint}`)) {
                if (Notification.isSupported()) {
                    new Notification({
                        title: 'Aviso de Certificado',
                        body: `O certificado ${info.name} está ${status === 'expirado' ? 'expirado' : 'prestes a expirar'}.`
                    }).show();
                }
                store.set(`notified_${info.thumbprint}`, true);
            }
        }

        newCache.push({
            file,
            filePath,
            isLocked,
            name: info ? info.name : file,
            validTo: info ? info.validTo : null,
            thumbprint: info ? info.thumbprint : null,
            status
        });
        
        if (!silent && i % 10 === 0) {
            sendToRenderer('certificates-loading', { total: files.length, current: i + 1, text: 'Atualizando lista' });
        }

        // Pausa o processamento para manter a tela respondendo
        await new Promise(r => setImmediate(r));
    }

    cachedCertificates = newCache;

    sendToRenderer('certificates-update', cachedCertificates);
}

ipcMain.handle('unlock-certificates', async (event, passwordsToTry) => {
    const folder = store.get('folderCertificados');
    if (!folder || !fs.existsSync(folder)) return { success: false, unlockedCount: 0 };

    const allFiles = await fs.promises.readdir(folder);
    const files = allFiles.filter(f => f.toLowerCase().endsWith('.pfx') || f.toLowerCase().endsWith('.p12'));
    let savedPasswords = getSavedCertPasswords();
    
    const lockedFiles = files.filter(f => !savedPasswords[f]);
    let unlockedCount = 0;

    if (lockedFiles.length > 0) {
        sendToRenderer('certificates-loading', { total: lockedFiles.length, current: 0, text: 'Desbloqueando certificados' });
    }

    for (let i = 0; i < lockedFiles.length; i++) {
        let file = lockedFiles[i];
        const filePath = path.join(folder, file);
        try {
            const pfxData = await fs.promises.readFile(filePath);
            for (let pass of passwordsToTry) {
                const info = extractCertInfo(pfxData, pass);
                if (info) {
                    savedPasswords[file] = pass;
                    unlockedCount++;
                    break;
                }
            }
        } catch (err) {
            console.error(`Falha ao ler arquivo no desbloqueio: ${file}`);
        }
        
        if (i % 2 === 0) {
            sendToRenderer('certificates-loading', { total: lockedFiles.length, current: i + 1, text: 'Desbloqueando certificados' });
        }
        
        // Yield para o event loop, mantendo a interface responsiva
        await new Promise(r => setImmediate(r));
    }

    if (unlockedCount > 0) {
        saveCertPasswords(savedPasswords);
        await refreshCertificates(folder, false);
    }
    
    return { success: true, unlockedCount };
});

ipcMain.handle('install-certificate', async (event, thumbprint) => {
    const cert = cachedCertificates.find(c => c.thumbprint === thumbprint);
    if (!cert) return { success: false, error: 'Certificado não encontrado na memória.' };

    const savedPasswords = getSavedCertPasswords();
    const password = savedPasswords[cert.file];
    if (!password) return { success: false, error: 'Senha não encontrada no cofre.' };

    // Senha e caminho passados por variável de ambiente, nunca interpolados na string.
    const script = 'Import-PfxCertificate -FilePath $env:CERT_PATH -CertStoreLocation Cert:\\CurrentUser\\My -Password (ConvertTo-SecureString -String $env:CERT_PWD -Force -AsPlainText)';
    const { error } = await runPowerShell(script, { CERT_PATH: cert.filePath, CERT_PWD: password });
    if (error) return { success: false, error: error.message };
    await refreshCertificates(store.get('folderCertificados'), true);
    return { success: true };
});

ipcMain.handle('uninstall-certificate', async (event, thumbprint) => {
    const cert = cachedCertificates.find(c => c.thumbprint === thumbprint);
    if (!cert) return { success: false, error: 'Certificado não encontrado na memória.' };

    const script = 'Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq $env:CERT_TP } | Remove-Item';
    const { error } = await runPowerShell(script, { CERT_TP: thumbprint });
    if (error) return { success: false, error: error.message };
    await refreshCertificates(store.get('folderCertificados'), true);
    return { success: true };
});

ipcMain.handle('delete-certificate', async (event, thumbprint) => {
    const cert = cachedCertificates.find(c => c.thumbprint === thumbprint);
    if (!cert) return { success: false, error: 'Certificado não encontrado.' };

    const script = 'Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq $env:CERT_TP } | Remove-Item';
    await runPowerShell(script, { CERT_TP: thumbprint });
    try {
        if (fs.existsSync(cert.filePath)) {
            fs.unlinkSync(cert.filePath);
        }

        let savedPasswords = getSavedCertPasswords();
        if (savedPasswords[cert.file]) {
            delete savedPasswords[cert.file];
            saveCertPasswords(savedPasswords);
        }

        await refreshCertificates(store.get('folderCertificados'), true);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});