let folderEnvio = "";
let folderBackup = "";
let folderCertificados = "";

const navProfile = document.getElementById('navProfile');
const navMonitor = document.getElementById('navMonitor');
const navCertificados = document.getElementById('navCertificados');
const navConfiguracoes = document.getElementById('navConfiguracoes');

const sectionProfile = document.getElementById('sectionProfile');
const sectionMonitor = document.getElementById('sectionMonitor');
const sectionCertificados = document.getElementById('sectionCertificados');
const sectionConfiguracoes = document.getElementById('sectionConfiguracoes');

const btnLogin = document.getElementById('btnLogin');
const inputEmail = document.getElementById('inputEmail');
const inputPassword = document.getElementById('inputPassword');
const loginMessage = document.getElementById('loginMessage');
const statusIndicator = document.getElementById('statusIndicator');
const chkRememberMe = document.getElementById('chkRememberMe');
const chkStartup = document.getElementById('chkStartup');
const chkPastaRede = document.getElementById('chkPastaRede');

// Perfil: estados de login vs conectado
const loginCard = document.getElementById('loginCard');
const connectedCard = document.getElementById('connectedCard');
const connectedEmail = document.getElementById('connectedEmail');
const btnGoMonitor = document.getElementById('btnGoMonitor');
const btnLogout = document.getElementById('btnLogout');
const profileTitle = document.getElementById('profileTitle');
const profileSubtitle = document.getElementById('profileSubtitle');
const appVersionLabel = document.getElementById('appVersionLabel');

const monitorLockNotice = document.getElementById('monitorLockNotice');

const btnSelectEnvio = document.getElementById('btnSelectEnvio');
const btnSelectBackup = document.getElementById('btnSelectBackup');
const inputEnvio = document.getElementById('pastaEnvio');
const inputBackup = document.getElementById('pastaBackup');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const logArea = document.getElementById('logArea');
const btnClearLog = document.getElementById('btnClearLog');

// Certificados Elements
const btnSelectCertFolder = document.getElementById('btnSelectCertFolder');
const inputCertFolder = document.getElementById('pastaCertificados');
const inputCertPassword = document.getElementById('inputCertPassword');
const btnUnlockCerts = document.getElementById('btnUnlockCerts');
const certificadosList = document.getElementById('certificadosList');
const certLoadingContainer = document.getElementById('certLoadingContainer');
const certLoadingText = document.getElementById('certLoadingText');
const certTabs = document.getElementById('certTabs');
const tabBtns = document.querySelectorAll('.tab-btn');
const inputSearchCert = document.getElementById('inputSearchCert');

let currentCertsData = [];
let currentCertTab = 'todos';
let currentSearchTerm = '';

if (inputSearchCert) {
    inputSearchCert.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.trim().toLowerCase();
        renderCertificates();
    });
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCertTab = btn.getAttribute('data-filter');
        renderCertificates();
    });
});

function getIconForLog(type) {
    switch (type) {
        case 'success': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        case 'warning': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        case 'error': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        default: return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
}

const ICONE_SPINNER = `<svg class="spinner icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; width:14px; height:14px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;

// Ícone (HTML fixo) + texto. O texto entra sempre por textContent: nome de
// arquivo, nome de certificado e mensagem do servidor não são confiáveis.
function iconeComTexto(el, iconeHtml, texto) {
    el.innerHTML = iconeHtml;
    const span = document.createElement('span');
    span.textContent = texto;
    el.appendChild(span);
}

const MAX_LOG_ITEMS = 500;
function addLog(msg, type = 'info') {
    if (!logArea) return;
    const p = document.createElement('div');
    p.className = `log-item ${type}`;
    const time = new Date().toLocaleTimeString();
    iconeComTexto(p, getIconForLog(type), `[${time}] ${msg}`);
    logArea.appendChild(p);
    // Mantém apenas os últimos N registros para não consumir memória sem limite.
    while (logArea.childElementCount > MAX_LOG_ITEMS) {
        logArea.removeChild(logArea.firstChild);
    }
    logArea.scrollTop = logArea.scrollHeight;
}

function setLoginMessage(texto, type = 'error') {
    loginMessage.innerHTML = '';
    if (!texto) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:center; align-items:center; gap:5px;';
    iconeComTexto(div, getIconForLog(type), texto);
    loginMessage.appendChild(div);
    loginMessage.style.color = "#e94560";
}

function setStatus(dot, texto) {
    statusIndicator.innerHTML = `<span class="status-dot ${dot}"></span>`;
    statusIndicator.appendChild(document.createTextNode(` ${texto}`));
}

// --- CONTROLES DA BARRA DE TÍTULO ---
document.getElementById('winMinimize').addEventListener('click', () => window.electronAPI.windowMinimize());
document.getElementById('winMaximize').addEventListener('click', () => window.electronAPI.windowMaximize());
document.getElementById('winClose').addEventListener('click', () => window.electronAPI.windowClose());
window.electronAPI.onWindowState((data) => {
    const btn = document.getElementById('winMaximize');
    if (!btn) return;
    btn.innerHTML = data.maximized
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="1"></rect><path d="M4 16V5a1 1 0 0 1 1-1h11"></path></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="1"></rect></svg>`;
    btn.title = data.maximized ? 'Restaurar' : 'Maximizar';
});

// --- TOASTS E CONFIRMAÇÃO (substituem alert/confirm nativos) ---
function showToast(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirmOverlay');
        const msgEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');
        msgEl.textContent = message;
        overlay.style.display = 'flex';

        const cleanup = (result) => {
            overlay.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onBackdrop);
    });
}

let isConnected = false;

let isMonitoring = false;

// Marca que o monitoramento foi interrompido por queda de sessão, para religar
// sozinho assim que o usuário reconectar.
let resumeMonitoringAfterLogin = false;

// O app abriu sem rede: o processo principal segue tentando conectar e avisa
// por 'session-status' quando conseguir.
let aguardandoConexao = false;

window.addEventListener('DOMContentLoaded', async () => {
    setAuthState(false);
    try {
        const settings = await window.electronAPI.getSettings();
        if (appVersionLabel) appVersionLabel.innerText = `v${settings.versao}`;
        folderEnvio = settings.folderEnvio; inputEnvio.value = folderEnvio;
        folderBackup = settings.folderBackup; inputBackup.value = folderBackup;
        folderCertificados = settings.folderCertificados || ""; inputCertFolder.value = folderCertificados;
        chkStartup.checked = settings.iniciarComWindows;
        chkPastaRede.checked = settings.pastaRede;
        if (settings.email) inputEmail.value = settings.email;
        chkRememberMe.checked = settings.temSenhaSalva;

        // Retoma a sessão salva (refresh token e, se falhar, a senha lembrada).
        const res = await window.electronAPI.autoConnect();
        if (res.success) {
            await onConectado(res.email, { iniciarMonitoramento: true });
            addLog("Sessão retomada.", "success");
        } else if (res.reason === 'network') {
            aguardandoConexao = true;
            setStatus('dot-warning', 'Sem conexão');
            addLog("Sem conexão com o servidor. O DocSender vai se conectar sozinho quando a rede voltar.", "warning");
        }

        if (folderCertificados) {
            await window.electronAPI.refreshCertificates();
        }

        await loadFolderFiles();
        setTimeout(checkForUpdates, 3000);
    } catch (e) { addLog("Erro ao carregar configurações.", "error"); }
});

// Mantém os botões Iniciar/Parar coerentes com o estado real e a conexão.
function syncMonitorButtons() {
    const canStart = isConnected && !isMonitoring;
    btnStart.disabled = !canStart;
    btnStop.disabled = !isMonitoring;
    if (monitorLockNotice) monitorLockNotice.style.display = isConnected ? 'none' : 'flex';
}

// Centraliza o visual de "conectado" vs "desconectado" em toda a interface.
function setAuthState(connected, email = '') {
    isConnected = connected;
    if (connected) {
        loginCard.style.display = 'none';
        connectedCard.style.display = 'block';
        connectedEmail.innerText = email || inputEmail.value || '—';
        profileTitle.innerText = 'Minha Conta';
        profileSubtitle.innerText = 'Você está conectado e pronto para enviar documentos.';
        setStatus('dot-online', 'Conectado');
    } else {
        loginCard.style.display = 'block';
        connectedCard.style.display = 'none';
        profileTitle.innerText = 'Autenticação';
        profileSubtitle.innerText = 'Conecte-se para começar a enviar documentos.';
        setStatus('dot-offline', 'Desconectado');
        btnLogin.disabled = false;
        btnLogin.innerText = 'Conectar';
        isMonitoring = false;
    }
    syncMonitorButtons();
}

async function onConectado(email, { iniciarMonitoramento = false } = {}) {
    aguardandoConexao = false;
    setLoginMessage('');
    setAuthState(true, email);
    switchSection('monitor');
    // Religa o monitoramento que foi parado por uma queda de sessão.
    const resume = resumeMonitoringAfterLogin;
    resumeMonitoringAfterLogin = false;
    if ((iniciarMonitoramento || resume) && folderEnvio && folderBackup) await startMonitoringProcess();
}

async function performLogin(email, password) {
    if (!email || !password) {
        setLoginMessage('Informe email e senha.');
        return;
    }
    btnLogin.disabled = true; btnLogin.innerText = "Conectando...";
    const result = await window.electronAPI.login({ email, password, lembrar: chkRememberMe.checked });
    if (result.success) {
        inputPassword.value = '';
        if (result.aviso) {
            chkRememberMe.checked = false;
            showToast(result.aviso, 'warning', 6000);
        }
        await onConectado(result.email);
    } else {
        setAuthState(false);
        setLoginMessage(result.error);
    }
}

async function startMonitoringProcess() {
    if (!isConnected) {
        addLog("Conecte-se antes de iniciar o monitoramento.", "error");
        switchSection('profile');
        return;
    }
    if (!folderEnvio || !folderBackup) {
        addLog("Defina as pastas de Envio e Backup em Configurações antes de iniciar.", "warning");
        switchSection('configuracoes');
        return;
    }
    const res = await window.electronAPI.startMonitoring({ folder: folderEnvio, backupFolder: folderBackup, autoSend: true });
    if (!res.success) {
        isMonitoring = false;
        syncMonitorButtons();
        addLog(`Não foi possível iniciar o monitoramento: ${res.error}`, "error");
        return;
    }
    isMonitoring = true;
    syncMonitorButtons();
    const modo = res.varreduraPeriodica ? ' (pasta de rede: verificação a cada 3 s)' : '';
    addLog(`Monitoramento ativo em: ${folderEnvio}${modo}`, "success");
}

// Senha NÃO recebe trim (espaços podem fazer parte da senha); email sim.
btnLogin.addEventListener('click', () => performLogin(inputEmail.value.trim(), inputPassword.value));
inputPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') performLogin(inputEmail.value.trim(), inputPassword.value); });
btnGoMonitor.addEventListener('click', () => switchSection('monitor'));
btnLogout.addEventListener('click', async () => {
    await window.electronAPI.stopMonitoring();
    await window.electronAPI.clearCredentials();
    inputPassword.value = '';
    chkRememberMe.checked = false;
    isMonitoring = false;
    aguardandoConexao = false;
    resumeMonitoringAfterLogin = false;
    setAuthState(false); // já chama syncMonitorButtons
    addLog("Você foi desconectado.", "warning");
});
btnStart.addEventListener('click', startMonitoringProcess);
btnStop.addEventListener('click', async () => {
    await window.electronAPI.stopMonitoring();
    isMonitoring = false;
    addLog(`Monitoramento parado.`, 'warning');
    syncMonitorButtons();
});

// --- ENVIOS COM ERRO E PENDENTES ---
function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PAINEIS = {
    erros: {
        panel: document.getElementById('errorPanel'),
        count: document.getElementById('errorCount'),
        list: document.getElementById('errorList'),
        btnAll: document.getElementById('btnReprocessAll'),
        rotulo: 'da pasta de erros',
    },
    pendentes: {
        panel: document.getElementById('pendingPanel'),
        count: document.getElementById('pendingCount'),
        list: document.getElementById('pendingList'),
        btnAll: document.getElementById('btnReprocessPending'),
        rotulo: 'dos pendentes',
    },
};

async function reprocessar(tipo, nomes) {
    if (!isConnected) { showToast('Conecte-se antes de reprocessar.', 'warning'); switchSection('profile'); return false; }
    const res = await window.electronAPI.reprocessFolderFiles(tipo, nomes);
    if (!res.success) { showToast(res.error || 'Falha ao reprocessar.', 'error'); return false; }
    showToast(`Reprocessando ${res.count} arquivo(s)...`, 'info');
    return true;
}

async function loadPainel(tipo) {
    const p = PAINEIS[tipo];
    let files = [];
    try { files = await window.electronAPI.listFolderFiles(tipo); } catch (e) { files = []; }

    if (!files || files.length === 0) {
        p.panel.style.display = 'none';
        return;
    }
    p.panel.style.display = 'block';
    p.count.innerText = String(files.length);
    p.list.innerHTML = '';

    files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'error-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'error-item-name';
        const quando = new Date(f.mtime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        nameEl.textContent = `${f.nomeOriginal}  ·  ${formatBytes(f.size)}  ·  ${quando}`;

        const actions = document.createElement('div');
        actions.className = 'error-item-actions';

        const btnRe = document.createElement('button');
        btnRe.className = 'btn-green';
        btnRe.textContent = 'Reprocessar';
        btnRe.addEventListener('click', async () => {
            btnRe.disabled = true; btnRe.textContent = '...';
            if (await reprocessar(tipo, [f.name])) switchSection('monitor');
            loadPainel(tipo);
        });

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-red';
        btnDel.textContent = 'Excluir';
        btnDel.addEventListener('click', async () => {
            const ok = await showConfirm(`Excluir definitivamente "${f.nomeOriginal}" ${p.rotulo}?`);
            if (!ok) return;
            await window.electronAPI.deleteFolderFile(tipo, f.name);
            loadPainel(tipo);
        });

        actions.appendChild(btnRe);
        actions.appendChild(btnDel);
        item.appendChild(nameEl);
        item.appendChild(actions);
        p.list.appendChild(item);
    });
}

function loadFolderFiles() {
    return Promise.all([loadPainel('erros'), loadPainel('pendentes')]);
}

for (const tipo of Object.keys(PAINEIS)) {
    const btn = PAINEIS[tipo].btnAll;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        await reprocessar(tipo);
        btn.disabled = false;
        loadPainel(tipo);
    });
}

window.electronAPI.onErrorFilesChanged(() => loadFolderFiles());

function switchSection(s) {
    navProfile.classList.toggle('active', s === 'profile');
    navMonitor.classList.toggle('active', s === 'monitor');
    navCertificados.classList.toggle('active', s === 'certificados');
    navConfiguracoes.classList.toggle('active', s === 'configuracoes');

    sectionProfile.style.display = s === 'profile' ? 'block' : 'none';
    sectionMonitor.style.display = s === 'monitor' ? 'flex' : 'none';
    sectionCertificados.style.display = s === 'certificados' ? 'flex' : 'none';
    sectionConfiguracoes.style.display = s === 'configuracoes' ? 'block' : 'none';

    if (s === 'monitor') { syncMonitorButtons(); loadFolderFiles(); }
}

navProfile.addEventListener('click', () => switchSection('profile'));
navMonitor.addEventListener('click', () => switchSection('monitor'));
navCertificados.addEventListener('click', () => switchSection('certificados'));
navConfiguracoes.addEventListener('click', () => switchSection('configuracoes'));

btnSelectEnvio.addEventListener('click', async () => {
    const f = await window.electronAPI.selectFolder();
    if (f) { folderEnvio = f; inputEnvio.value = f; await window.electronAPI.saveFolders({ folderEnvio, folderBackup }); }
});

btnSelectBackup.addEventListener('click', async () => {
    const f = await window.electronAPI.selectFolder();
    if (f) { folderBackup = f; inputBackup.value = f; await window.electronAPI.saveFolders({ folderEnvio, folderBackup }); }
});

chkStartup.addEventListener('change', async (e) => await window.electronAPI.toggleStartup(e.target.checked));
chkPastaRede.addEventListener('change', async (e) => {
    await window.electronAPI.setOption('pasta_rede', e.target.checked);
    // O modo de observação só muda ao religar o monitoramento.
    if (isMonitoring) await startMonitoringProcess();
});
btnClearLog.addEventListener('click', () => { logArea.innerHTML = ''; });
window.electronAPI.onLogEvent((data) => addLog(data.msg, data.type));

// Sessão recuperada silenciosamente pelo processo principal (refresh ou re-login).
window.electronAPI.onSessionStatus(async (data) => {
    if (!data) return;
    if (data.offline) {
        // Servidor inacessível: a sessão continua válida, só a rede está fora.
        setStatus('dot-warning', 'Sem conexão');
    } else if (data.connected) {
        if (aguardandoConexao && !isConnected) {
            addLog("Conectado.", "success");
            await onConectado(data.email, { iniciarMonitoramento: true });
        } else if (isConnected) {
            setStatus('dot-online', 'Conectado');
        }
    }
});

// A sessão caiu e não foi possível recuperar automaticamente: pede reconexão manual.
window.electronAPI.onForceReconnect(async () => {
    // Sem parar o watcher, o processo principal continuaria detectando PDFs
    // com a tela de login aberta.
    if (isMonitoring) {
        await window.electronAPI.stopMonitoring();
        resumeMonitoringAfterLogin = true;
    }
    aguardandoConexao = false;
    setAuthState(false);
    addLog("Sua sessão expirou e não foi possível reconectar automaticamente. Faça login novamente.", "error");
    setLoginMessage('Sessão expirada. Reconecte.', 'warning');
    switchSection('profile');
});

async function checkForUpdates() {
    const data = await window.electronAPI.checkUpdate();
    if (!data.disponivel) return;
    const txt = document.getElementById('updateText');
    if (txt) {
        txt.innerText = data.releaseNotes
            ? `Nova versão ${data.version}: ${data.releaseNotes}`
            : `Nova versão ${data.version} disponível!`;
    }
    document.getElementById('updateBanner').style.display = "flex";
    document.getElementById('btnDownloadUpdate').onclick = () => window.electronAPI.openUpdateDownload();
}


// --- LÓGICA DE CERTIFICADOS ---

btnSelectCertFolder.addEventListener('click', async () => {
    const f = await window.electronAPI.selectCertFolder();
    if (f) {
        folderCertificados = f;
        inputCertFolder.value = f;
    }
});

const ICONE_DESBLOQUEAR = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"></path><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>`;

btnUnlockCerts.addEventListener('click', async () => {
    // Sem trim: espaço no começo ou no fim pode fazer parte da senha do .pfx.
    const pwd = inputCertPassword.value;
    if (!pwd) return;

    btnUnlockCerts.disabled = true;
    iconeComTexto(btnUnlockCerts, ICONE_SPINNER, ' Desbloqueando...');

    const result = await window.electronAPI.unlockCertificates([pwd]);

    btnUnlockCerts.disabled = false;
    iconeComTexto(btnUnlockCerts, ICONE_DESBLOQUEAR, ' Desbloquear');

    if (result.unlockedCount > 0) {
        inputCertPassword.value = '';
        showToast(`${result.unlockedCount} certificado(s) desbloqueado(s) com essa senha.`, 'success');
    } else {
        showToast("A senha não serviu para nenhum certificado bloqueado.", 'warning');
    }
});

window.electronAPI.onCertificatesLoading((data) => {
    certificadosList.style.display = 'none';
    certTabs.style.display = 'none';
    certLoadingContainer.style.display = 'flex';
    const baseText = data.text || "Processando certificados";
    if (data.total > 0 && data.current > 0) {
        certLoadingText.innerText = `${baseText}: ${data.current} de ${data.total}`;
    } else {
        certLoadingText.innerText = `${baseText}...`;
    }
});

window.electronAPI.onCertificatesUpdate((certs) => {
    certLoadingContainer.style.display = 'none';
    currentCertsData = certs || [];
    certTabs.style.display = currentCertsData.length > 0 ? 'flex' : 'none';
    renderCertificates();
});

const STATUS_CERT = {
    bloqueado: { texto: 'Bloqueado', icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` },
    instalado: { texto: 'Instalado', icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>` },
    nao_instalado: { texto: 'Não Instalado', icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>` },
    expirado: { texto: 'Expirado', icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>` },
    prestes: { texto: 'Prestes a Expirar', icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>` },
};

const ICONE_LIXEIRA = `<svg class="icon" style="margin:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// Botão com estado de "trabalhando" e mensagem ao terminar.
function botaoDeAcao({ classe, html, texto, textoTrabalhando, confirmar, acao, sucesso, falha }) {
    const btn = document.createElement('button');
    btn.className = classe;
    iconeComTexto(btn, html || '', texto);
    btn.addEventListener('click', async () => {
        if (confirmar && !(await showConfirm(confirmar))) return;
        btn.disabled = true;
        iconeComTexto(btn, ICONE_SPINNER, textoTrabalhando);
        const res = await acao();
        if (!res.success) {
            showToast(`${falha}: ${res.error}`, 'error');
            btn.disabled = false;
            iconeComTexto(btn, html || '', texto);
        } else {
            showToast(sucesso, 'success');
        }
    });
    return btn;
}

function renderCertificates() {
    certificadosList.style.display = 'grid';

    let filtered = currentCertsData;

    // Filtro por Texto (Busca)
    if (currentSearchTerm) {
        filtered = filtered.filter(c => c.name.toLowerCase().includes(currentSearchTerm));
    }

    // Filtro por Abas
    if (currentCertTab === 'validos') {
        filtered = filtered.filter(c => !c.isLocked && (c.status === 'instalado' || c.status === 'nao_instalado'));
    } else if (currentCertTab === 'bloqueados') {
        filtered = filtered.filter(c => c.isLocked);
    } else if (currentCertTab === 'prestes') {
        filtered = filtered.filter(c => !c.isLocked && c.status === 'prestes');
    } else if (currentCertTab === 'expirados') {
        filtered = filtered.filter(c => !c.isLocked && c.status === 'expirado');
    }

    if (filtered.length === 0) {
        certificadosList.style.display = 'block';
        certificadosList.innerHTML = `<div style="text-align: center; color: #8b949e; margin-top: 20px;"><p>Nenhum certificado encontrado para este filtro.</p></div>`;
        return;
    }

    certificadosList.innerHTML = '';
    filtered.forEach(cert => {
        const card = document.createElement('div');
        card.className = 'cert-card';

        const statusKey = cert.isLocked ? 'bloqueado' : cert.status;
        const st = STATUS_CERT[statusKey] || STATUS_CERT.bloqueado;
        const dateStr = cert.validTo ? new Date(cert.validTo).toLocaleDateString('pt-BR') : 'Desconhecida';

        // Estrutura fixa; o nome vem de dentro do .pfx e entra só como texto.
        card.innerHTML = `
            <div class="cert-header">
                <div>
                    <h4 class="cert-name"></h4>
                    <p class="cert-date"></p>
                </div>
            </div>
            <div>
                <span class="cert-status status-${statusKey}"></span>
            </div>
            <div class="cert-actions"></div>
        `;
        const nameEl = card.querySelector('.cert-name');
        nameEl.textContent = cert.name;
        nameEl.title = cert.name;
        card.querySelector('.cert-date').textContent = `Válido até: ${dateStr}`;
        // Perto de vencer e já instalado: mostra as duas coisas.
        const sufixo = statusKey === 'prestes' && cert.instalado ? ' · Instalado' : '';
        iconeComTexto(card.querySelector('.cert-status'), st.icone, ` ${st.texto}${sufixo}`);

        const actions = card.querySelector('.cert-actions');
        if (!cert.isLocked && cert.status !== 'expirado') {
            if (cert.instalado) {
                const btn = botaoDeAcao({
                    classe: 'btn-outline btn-uninstall', html: ICONE_LIXEIRA,
                    texto: ' Remover do Windows', textoTrabalhando: ' Desinstalando...',
                    confirmar: "Esta ação irá desinstalar o certificado apenas do Repositório do Windows.\n\nO seu arquivo de backup (.pfx) continuará intocado na pasta.\n\nDeseja continuar?",
                    acao: () => window.electronAPI.uninstallCertificate(cert.thumbprint),
                    sucesso: 'Certificado removido do Windows.', falha: 'Falha ao desinstalar',
                });
                btn.style.cssText = 'color: #e94560; border-color: #e94560; display: flex; align-items: center; justify-content: center; gap: 5px;';
                actions.appendChild(btn);
            } else {
                actions.appendChild(botaoDeAcao({
                    classe: 'btn-green btn-install', texto: 'Instalar', textoTrabalhando: ' Instalando...',
                    acao: () => window.electronAPI.installCertificate(cert.thumbprint),
                    sucesso: 'Certificado instalado no Windows.', falha: 'Falha ao instalar',
                }));
            }
        }
        if (!cert.isLocked && cert.status === 'expirado') {
            actions.appendChild(botaoDeAcao({
                classe: 'btn-red btn-delete', texto: 'Excluir', textoTrabalhando: ' Excluindo...',
                confirmar: "Esta ação excluirá definitivamente o certificado desta pasta e do Repositório do Windows.\n\nDeseja continuar?",
                acao: () => window.electronAPI.deleteCertificate(cert.thumbprint),
                sucesso: 'Certificado excluído.', falha: 'Falha ao excluir',
            }));
        }

        certificadosList.appendChild(card);
    });
}
