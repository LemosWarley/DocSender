// Janela principal, bandeja, início com o Windows e configurações gerais.

const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { API_BASE_URL, API_KEY, ALLOWED_EXTERNAL_HOSTS } = require('./config');
const { store, criptografiaDisponivel } = require('./armazenamento');
const { setMainWindow, getMainWindow, sendToRenderer } = require('./ui');

const ICONE = path.join(__dirname, '..', '..', 'assets', 'logo.png');

let tray = null;
let saindo = false;

// Só abre no navegador do sistema endereços https de domínios conhecidos.
function urlExternaPermitida(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' &&
            ALLOWED_EXTERNAL_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
    } catch (e) {
        return false;
    }
}

function criarJanela() {
    const win = new BrowserWindow({
        width: 1100, height: 780, minWidth: 900, minHeight: 680,
        title: "DocSender", show: false, frame: false, backgroundColor: '#0a0e1a',
        icon: ICONE,
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.js'),
            contextIsolation: true, nodeIntegration: false, sandbox: true
        }
    });
    setMainWindow(win);

    // A janela nunca navega nem abre outras janelas: links externos vão para o
    // navegador do sistema, e só os de domínios conhecidos.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (urlExternaPermitida(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    // Em desenvolvimento, erros da tela aparecem no terminal.
    if (!app.isPackaged) {
        win.webContents.on('console-message', (event, ...legado) => {
            const msg = event.message ?? legado[1];
            console.log(`[renderer] ${msg}`);
        });
    }

    win.loadFile(path.join(__dirname, '..', 'index.html'));

    win.on('close', (event) => {
        if (!saindo) {
            event.preventDefault();
            win.hide();
        }
    });

    // Reflete no renderer o estado de maximizado (para trocar o ícone).
    win.on('maximize', () => sendToRenderer('window-state', { maximized: true }));
    win.on('unmaximize', () => sendToRenderer('window-state', { maximized: false }));

    if (!process.argv.includes('--hidden')) {
        win.once('ready-to-show', () => win.show());
    }
    return win;
}

function mostrarJanela() {
    const win = getMainWindow();
    if (!win) return;
    if (!win.isVisible()) win.show();
    win.focus();
}

// Qualquer saída (menu da bandeja, desligamento do Windows) libera o fechamento
// da janela, que no resto do tempo só se esconde.
app.on('before-quit', () => { saindo = true; });

function sair() {
    app.quit();
}

function criarBandeja() {
    if (!fs.existsSync(ICONE)) return;
    tray = new Tray(ICONE);
    tray.setToolTip('DocSender');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Abrir DocSender', click: mostrarJanela },
        { label: 'Sair', click: sair }
    ]));
    tray.on('double-click', mostrarJanela);
}

function configurarInicioAutomatico(enable) {
    const args = ['--hidden'];
    if (!app.isPackaged) args.unshift(path.resolve(process.argv[1]));
    app.setLoginItemSettings({ openAtLogin: enable, args });
}

// Última resposta da checagem de versão. O link de download fica aqui, no
// processo principal: a tela só pede para abrir.
let ultimaAtualizacao = null;

function compararVersoes(a, b) {
    const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}

async function verificarAtualizacao() {
    try {
        const res = await axios.get(`${API_BASE_URL}/functions/v1/docsender-check-update`, {
            headers: { 'apikey': API_KEY, 'Authorization': `Bearer ${API_KEY}` }, timeout: 20000
        });
        const data = res.data || {};
        if (!data.version || compararVersoes(data.version, app.getVersion()) <= 0) return { disponivel: false };
        ultimaAtualizacao = data;
        return { disponivel: true, version: data.version, releaseNotes: data.release_notes || '' };
    } catch (e) {
        console.error("Erro ao verificar atualização:", e.message);
        return { disponivel: false };
    }
}

function abrirDownloadAtualizacao() {
    const url = ultimaAtualizacao?.download_url;
    if (!url || !urlExternaPermitida(url)) return false;
    shell.openExternal(url);
    return true;
}

// Opções simples de liga/desliga que a tela pode gravar.
const OPCOES_PERMITIDAS = ['pasta_rede'];

function registrarIpc() {
    // Controles da barra de título customizada
    ipcMain.on('window-minimize', () => getMainWindow()?.minimize());
    ipcMain.on('window-maximize', () => {
        const win = getMainWindow();
        if (!win) return;
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
    });
    ipcMain.on('window-close', () => getMainWindow()?.close());

    ipcMain.handle('get-settings', () => ({
        versao: app.getVersion(),
        folderEnvio: store().get('folderEnvio', ''),
        folderBackup: store().get('folderBackup', ''),
        folderCertificados: store().get('folderCertificados', ''),
        iniciarComWindows: store().get('iniciar_com_windows', false),
        pastaRede: store().get('pasta_rede', false),
        email: store().get('saved_email', ''),
        temSenhaSalva: !!store().get('saved_password'),
        criptografiaDisponivel: criptografiaDisponivel(),
    }));

    ipcMain.handle('save-folders', (e, { folderEnvio, folderBackup }) => {
        if (folderEnvio !== undefined) store().set('folderEnvio', folderEnvio);
        if (folderBackup !== undefined) store().set('folderBackup', folderBackup);
        return true;
    });

    ipcMain.handle('set-option', (e, chave, valor) => {
        if (!OPCOES_PERMITIDAS.includes(chave)) return false;
        store().set(chave, !!valor);
        return true;
    });

    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory'] });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('toggle-startup', (e, enable) => {
        store().set('iniciar_com_windows', enable);
        configurarInicioAutomatico(enable);
        return true;
    });

    ipcMain.handle('check-update', () => verificarAtualizacao());
    ipcMain.handle('open-update-download', () => abrirDownloadAtualizacao());
}

module.exports = { registrarIpc, criarJanela, criarBandeja, configurarInicioAutomatico, mostrarJanela };
