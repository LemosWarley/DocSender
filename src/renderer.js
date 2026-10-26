let folderEnvio = "";
let folderBackup = "";
let folderCertificados = "";

const $ = (id) => document.getElementById(id);

const navProfile = $('navProfile');
const navMonitor = $('navMonitor');
const navCertificados = $('navCertificados');
const navConfiguracoes = $('navConfiguracoes');

const sectionProfile = $('sectionProfile');
const sectionMonitor = $('sectionMonitor');
const sectionCertificados = $('sectionCertificados');
const sectionConfiguracoes = $('sectionConfiguracoes');

const btnLogin = $('btnLogin');
const inputEmail = $('inputEmail');
const inputPassword = $('inputPassword');
const loginMessage = $('loginMessage');
const statusIndicator = $('statusIndicator');
const chkRememberMe = $('chkRememberMe');
const chkStartup = $('chkStartup');
const chkPastaRede = $('chkPastaRede');

// Conta: login vs conectado, e o cartão da conta na barra lateral
const loginCard = $('loginCard');
const connectedCard = $('connectedCard');
const connectedEmail = $('connectedEmail');
const connectedAvatar = $('connectedAvatar');
const accountName = $('accountName');
const accountAvatar = $('accountAvatar');
const btnGoMonitor = $('btnGoMonitor');
const btnLogout = $('btnLogout');
const appVersionLabel = $('appVersionLabel');

const monitorLockNotice = $('monitorLockNotice');
const monitorHero = $('monitorHero');

const btnSelectEnvio = $('btnSelectEnvio');
const btnSelectBackup = $('btnSelectBackup');
const inputEnvio = $('pastaEnvio');
const inputBackup = $('pastaBackup');
const btnStart = $('btnStart');
const btnStop = $('btnStop');
const logArea = $('logArea');
const btnClearLog = $('btnClearLog');

// Certificados
const btnSelectCertFolder = $('btnSelectCertFolder');
const inputCertFolder = $('pastaCertificados');
const inputCertPassword = $('inputCertPassword');
const btnUnlockCerts = $('btnUnlockCerts');
const certificadosList = $('certificadosList');
const certLoadingContainer = $('certLoadingContainer');
const certLoadingText = $('certLoadingText');
const certTabs = $('certTabs');
const tabBtns = document.querySelectorAll('.tab-btn');
const inputSearchCert = $('inputSearchCert');

let currentCertsData = [];
let currentCertTab = 'todos';
let currentSearchTerm = '';

// --- ÍCONES ---
const ICONES = {
    success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    escudo: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    escudoOk: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    cadeado: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    cadeadoAberto: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
    relogio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>',
    lixeira: '<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    refazer: '<svg class="icon" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    usuario: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    sol: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    lua: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    monitor: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    olho: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    olhoFechado: '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
};
const SPINNER = '<span class="spinner"></span>';

function getIconForLog(type) {
    return ICONES[type] || ICONES.info;
}

// Ícone (HTML fixo) + texto. O texto entra sempre por textContent: nome de
// arquivo, nome de certificado e mensagem do servidor não são confiáveis.
function iconeComTexto(el, iconeHtml, texto) {
    el.innerHTML = iconeHtml;
    const span = document.createElement('span');
    span.textContent = texto;
    el.appendChild(span);
}

// Caminho longo: mostra o fim (a pasta), que é o que identifica.
function mostrarCaminho(input, valor) {
    input.value = valor || '';
    input.title = valor || '';
    requestAnimationFrame(() => { input.scrollLeft = input.scrollWidth; });
}

function iniciais(email) {
    const nome = String(email || '').split('@')[0].replace(/[^a-zA-ZÀ-ÿ]/g, '');
    return nome ? nome[0].toUpperCase() : '?';
}

// --- TEMA ---
// Preferência deste computador; sem ela, segue o tema do Windows.
const TEMA_CHAVE = 'docsender-tema';
const TEMAS = ['system', 'light', 'dark'];
const ROTULO_TEMA = { system: 'Tema: igual ao Windows', light: 'Tema: claro', dark: 'Tema: escuro' };

function lerTema() {
    try { return TEMAS.includes(localStorage.getItem(TEMA_CHAVE)) ? localStorage.getItem(TEMA_CHAVE) : 'system'; } catch (e) { return 'system'; }
}

function aplicarTema(tema) {
    if (tema === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', tema);
    try { localStorage.setItem(TEMA_CHAVE, tema); } catch (e) { /* sem armazenamento: vale só nesta sessão */ }
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.classList.toggle('active', b.dataset.themeChoice === tema));
    const btn = $('btnTheme');
    btn.innerHTML = tema === 'light' ? ICONES.sol : tema === 'dark' ? ICONES.lua : ICONES.monitor;
    btn.title = ROTULO_TEMA[tema];
}

aplicarTema(lerTema());
$('btnTheme').addEventListener('click', () => {
    const atual = lerTema();
    aplicarTema(TEMAS[(TEMAS.indexOf(atual) + 1) % TEMAS.length]);
});
document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => aplicarTema(b.dataset.themeChoice)));

// --- ATIVIDADE ---
const MAX_LOG_ITEMS = 500;
let enviadosNaSessao = 0;

function addLog(msg, type = 'info') {
    if (!logArea) return;
    const item = document.createElement('div');
    item.className = `log-item ${type}`;

    const icone = document.createElement('span');
    icone.className = 'log-icon';
    icone.innerHTML = getIconForLog(type);

    const texto = document.createElement('span');
    texto.className = 'log-msg';
    texto.textContent = msg;

    const hora = document.createElement('time');
    hora.className = 'log-time';
    hora.textContent = new Date().toLocaleTimeString('pt-BR');

    item.append(icone, texto, hora);
    // Mais recente no topo.
    logArea.insertBefore(item, logArea.firstChild);
    while (logArea.childElementCount > MAX_LOG_ITEMS) {
        logArea.removeChild(logArea.lastChild);
    }
    $('logEmpty').style.display = 'none';

    if ((type === 'success' || type === 'warning') && /^Enviado/.test(msg)) {
        enviadosNaSessao++;
        $('statEnviados').textContent = String(enviadosNaSessao);
    }
}

function setLoginMessage(texto, type = 'error') {
    loginMessage.innerHTML = '';
    if (!texto) return;
    const div = document.createElement('div');
    iconeComTexto(div, getIconForLog(type), texto);
    loginMessage.appendChild(div);
}

function setStatus(dot, texto) {
    statusIndicator.innerHTML = `<span class="status-dot ${dot}"></span>`;
    statusIndicator.appendChild(document.createTextNode(` ${texto}`));
}

// --- CONTROLES DA BARRA DE TÍTULO ---
$('winMinimize').addEventListener('click', () => window.electronAPI.windowMinimize());
$('winMaximize').addEventListener('click', () => window.electronAPI.windowMaximize());
$('winClose').addEventListener('click', () => window.electronAPI.windowClose());
window.electronAPI.onWindowState((data) => {
    const btn = $('winMaximize');
    if (!btn) return;
    btn.innerHTML = data.maximized
        ? '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/></svg>'
        : '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';
    btn.title = data.maximized ? 'Restaurar' : 'Maximizar';
});

// --- TOASTS E CONFIRMAÇÃO (substituem alert/confirm nativos) ---
function showToast(msg, type = 'info', duration = 3500) {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icone = document.createElement('span');
    icone.className = 'toast-icon';
    icone.innerHTML = getIconForLog(type);
    const texto = document.createElement('span');
    texto.textContent = msg;
    toast.append(icone, texto);
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showConfirm(message, { titulo = 'Confirmar ação', confirmar = 'Confirmar' } = {}) {
    return new Promise((resolve) => {
        const overlay = $('confirmOverlay');
        const okBtn = $('confirmOk');
        const cancelBtn = $('confirmCancel');
        overlay.querySelector('.modal-title').textContent = titulo;
        $('confirmMessage').textContent = message;
        okBtn.textContent = confirmar;
        overlay.style.display = 'flex';
        okBtn.focus();

        const cleanup = (result) => {
            overlay.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };
        const onKey = (e) => { if (e.key === 'Escape') cleanup(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);
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

// Servidor fora do alcance com a sessão ainda válida.
let semConexao = false;

window.addEventListener('DOMContentLoaded', async () => {
    setAuthState(false);
    switchSection('profile');
    try {
        const settings = await window.electronAPI.getSettings();
        if (appVersionLabel) appVersionLabel.innerText = `Versão ${settings.versao}`;
        folderEnvio = settings.folderEnvio; mostrarCaminho(inputEnvio, folderEnvio);
        folderBackup = settings.folderBackup; mostrarCaminho(inputBackup, folderBackup);
        folderCertificados = settings.folderCertificados || ""; mostrarCaminho(inputCertFolder, folderCertificados);
        chkStartup.checked = settings.iniciarComWindows;
        chkPastaRede.checked = settings.pastaRede;
        if (settings.email) inputEmail.value = settings.email;
        chkRememberMe.checked = settings.temSenhaSalva;
        syncMonitorButtons();

        // Retoma a sessão salva (refresh token e, se falhar, a senha lembrada).
        const res = await window.electronAPI.autoConnect();
        if (res.success) {
            await onConectado(res.email, { iniciarMonitoramento: true });
            addLog("Sessão retomada.", "success");
        } else if (res.reason === 'network') {
            aguardandoConexao = true;
            setStatus('dot-warning', 'Sem conexão');
            syncMonitorButtons();
            switchSection('monitor');
            addLog("Sem conexão com o servidor. O DocSender vai se conectar sozinho quando a rede voltar.", "warning");
        }

        // Sem esperar: numa pasta de rede grande a lista leva um tempo, e o resto
        // da abertura não depende dela.
        if (folderCertificados) window.electronAPI.refreshCertificates();

        await loadFolderFiles();
        setTimeout(checkForUpdates, 3000);
    } catch (e) { addLog("Erro ao carregar configurações.", "error"); }
});

// Estado do monitoramento: botões, aviso de login e o bloco de destaque.
const ESTADOS_MONITOR = {
    ativo: ['Monitorando a pasta de envio', 'Cada PDF novo vai para o OneChat em poucos segundos.'],
    offline: ['Sem conexão com o servidor', 'Os envios continuam sozinhos quando a rede voltar.'],
    bloqueado: ['Desconectado', 'Entre com a sua conta para começar a enviar.'],
};

function syncMonitorButtons() {
    btnStart.hidden = isMonitoring;
    btnStop.hidden = !isMonitoring;
    btnStart.disabled = !isConnected;
    btnStop.disabled = !isMonitoring;
    if (monitorLockNotice) monitorLockNotice.style.display = (isConnected || aguardandoConexao) ? 'none' : 'flex';

    let estado = 'parado';
    if (aguardandoConexao || (semConexao && isConnected)) estado = 'offline';
    else if (!isConnected) estado = 'bloqueado';
    else if (isMonitoring) estado = 'ativo';
    monitorHero.dataset.state = estado;

    const [titulo, sub] = ESTADOS_MONITOR[estado] || ['Monitoramento parado',
        folderEnvio && folderBackup ? 'Clique em Iniciar monitoramento para começar.' : 'Escolha as pastas de envio e backup em Configurações.'];
    $('monitorStateTitle').textContent = titulo;
    $('monitorStateSub').textContent = sub;

    for (const [id, valor] of [['heroFolderEnvio', folderEnvio], ['heroFolderBackup', folderBackup]]) {
        const el = $(id);
        el.textContent = valor || 'não definida';
        el.title = valor || '';
    }
}

// Centraliza o visual de "conectado" vs "desconectado" em toda a interface.
function setAuthState(connected, email = '') {
    isConnected = connected;
    if (connected) {
        const conta = email || inputEmail.value || '';
        loginCard.style.display = 'none';
        connectedCard.style.display = 'block';
        connectedEmail.textContent = conta || '—';
        connectedAvatar.textContent = iniciais(conta);
        accountName.textContent = conta || 'Conectado';
        accountAvatar.textContent = iniciais(conta);
        accountAvatar.classList.remove('is-empty');
        setStatus(semConexao ? 'dot-warning' : 'dot-online', semConexao ? 'Sem conexão' : 'Conectado');
    } else {
        loginCard.style.display = 'flex';
        connectedCard.style.display = 'none';
        accountName.textContent = 'Não conectado';
        accountAvatar.innerHTML = ICONES.usuario;
        accountAvatar.classList.add('is-empty');
        setStatus('dot-offline', 'Desconectado');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Conectar';
        isMonitoring = false;
    }
    syncMonitorButtons();
}

async function onConectado(email, { iniciarMonitoramento = false } = {}) {
    aguardandoConexao = false;
    semConexao = false;
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
        setLoginMessage('Informe e-mail e senha.');
        return;
    }
    btnLogin.disabled = true;
    btnLogin.innerHTML = `${SPINNER} Conectando...`;
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
inputEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') inputPassword.focus(); });
$('btnShowPassword').addEventListener('click', () => {
    const mostrar = inputPassword.type === 'password';
    inputPassword.type = mostrar ? 'text' : 'password';
    $('btnShowPassword').innerHTML = mostrar ? ICONES.olhoFechado : ICONES.olho;
    $('btnShowPassword').title = mostrar ? 'Esconder senha' : 'Mostrar senha';
});
btnGoMonitor.addEventListener('click', () => switchSection('monitor'));
$('btnLockLogin').addEventListener('click', () => switchSection('profile'));
btnLogout.addEventListener('click', async () => {
    const ok = await showConfirm('O monitoramento para e a senha lembrada é apagada deste computador.', { titulo: 'Desconectar?', confirmar: 'Desconectar' });
    if (!ok) return;
    await window.electronAPI.stopMonitoring();
    await window.electronAPI.clearCredentials();
    inputPassword.value = '';
    chkRememberMe.checked = false;
    isMonitoring = false;
    aguardandoConexao = false;
    semConexao = false;
    resumeMonitoringAfterLogin = false;
    setAuthState(false); // já chama syncMonitorButtons
    switchSection('profile');
    addLog("Você foi desconectado.", "warning");
});
btnStart.addEventListener('click', startMonitoringProcess);
btnStop.addEventListener('click', async () => {
    await window.electronAPI.stopMonitoring();
    isMonitoring = false;
    addLog(`Monitoramento parado.`, 'warning');
    syncMonitorButtons();
});

// --- ABAS DE ENVIOS ---
function abrirAba(nome) {
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === nome));
    document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== nome; });
    document.querySelectorAll('.tabs-actions [data-for]').forEach(b => { b.style.display = b.dataset.for === nome ? '' : 'none'; });
}
document.querySelectorAll('.tabs .tab').forEach(t => t.addEventListener('click', () => abrirAba(t.dataset.tab)));
document.querySelectorAll('.stat').forEach(s => s.addEventListener('click', () => abrirAba(s.dataset.tab)));

// --- ENVIOS COM ERRO E PENDENTES ---
function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PAINEIS = {
    erros: {
        count: $('errorCount'), stat: $('statErros'), list: $('errorList'), empty: $('errorEmpty'),
        btnAll: $('btnReprocessAll'), tom: 'tone-danger', rotulo: 'da pasta de erros',
    },
    pendentes: {
        count: $('pendingCount'), stat: $('statPendentes'), list: $('pendingList'), empty: $('pendingEmpty'),
        btnAll: $('btnReprocessPending'), tom: 'tone-warning', rotulo: 'dos pendentes',
    },
};
const totais = { erros: 0, pendentes: 0 };

function atualizarSelo() {
    const total = totais.erros + totais.pendentes;
    const selo = $('navBadge');
    selo.textContent = String(total);
    selo.style.display = total > 0 ? '' : 'none';
    selo.title = `${totais.pendentes} pendente(s), ${totais.erros} com erro`;
}

async function reprocessar(tipo, nomes) {
    if (!isConnected) { showToast('Conecte-se antes de reprocessar.', 'warning'); switchSection('profile'); return false; }
    const res = await window.electronAPI.reprocessFolderFiles(tipo, nomes);
    if (!res.success) { showToast(res.error || 'Falha ao reprocessar.', 'error'); return false; }
    showToast(`Reprocessando ${res.count} arquivo(s)...`, 'info');
    return true;
}

function botaoPequeno(classe, html, texto, aoClicar) {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${classe}`;
    iconeComTexto(btn, html, texto);
    btn.addEventListener('click', aoClicar);
    return btn;
}

async function loadPainel(tipo) {
    const p = PAINEIS[tipo];
    let files = [];
    try { files = await window.electronAPI.listFolderFiles(tipo); } catch (e) { files = []; }
    files = files || [];

    totais[tipo] = files.length;
    p.count.textContent = files.length ? String(files.length) : '';
    p.stat.textContent = String(files.length);
    p.btnAll.disabled = files.length === 0;
    p.empty.style.display = files.length ? 'none' : '';
    atualizarSelo();

    p.list.innerHTML = '';
    files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const icone = document.createElement('span');
        icone.className = `file-icon ${p.tom}`;
        icone.textContent = 'PDF';

        const info = document.createElement('div');
        info.className = 'file-info';
        const nome = document.createElement('span');
        nome.className = 'file-name';
        nome.textContent = f.nomeOriginal;
        nome.title = f.nomeOriginal;
        const meta = document.createElement('span');
        meta.className = 'file-meta';
        const quando = new Date(f.mtime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        meta.textContent = `${formatBytes(f.size)} · ${quando}`;
        info.append(nome, meta);

        const actions = document.createElement('div');
        actions.className = 'file-actions';
        const btnRe = botaoPequeno('btn-secondary', ICONES.refazer, 'Reprocessar', async () => {
            btnRe.disabled = true; btnRe.innerHTML = SPINNER;
            await reprocessar(tipo, [f.name]);
            loadPainel(tipo);
        });
        const btnDel = botaoPequeno('btn-danger-ghost', ICONES.lixeira, 'Excluir', async () => {
            const ok = await showConfirm(`"${f.nomeOriginal}" será apagado ${p.rotulo}. Esta ação não pode ser desfeita.`, { titulo: 'Excluir arquivo?', confirmar: 'Excluir' });
            if (!ok) return;
            await window.electronAPI.deleteFolderFile(tipo, f.name);
            loadPainel(tipo);
        });
        actions.append(btnRe, btnDel);

        item.append(icone, info, actions);
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
    // Escondido, o campo não tem largura para rolar: refaz ao aparecer.
    if (s === 'configuracoes') [inputEnvio, inputBackup, inputCertFolder].forEach(i => mostrarCaminho(i, i.value));
}

navProfile.addEventListener('click', () => switchSection('profile'));
navMonitor.addEventListener('click', () => switchSection('monitor'));
navCertificados.addEventListener('click', () => switchSection('certificados'));
navConfiguracoes.addEventListener('click', () => switchSection('configuracoes'));

btnSelectEnvio.addEventListener('click', async () => {
    const f = await window.electronAPI.selectFolder();
    if (f) { folderEnvio = f; mostrarCaminho(inputEnvio, f); await window.electronAPI.saveFolders({ folderEnvio, folderBackup }); syncMonitorButtons(); }
});

btnSelectBackup.addEventListener('click', async () => {
    const f = await window.electronAPI.selectFolder();
    if (f) { folderBackup = f; mostrarCaminho(inputBackup, f); await window.electronAPI.saveFolders({ folderEnvio, folderBackup }); syncMonitorButtons(); }
});

chkStartup.addEventListener('change', async (e) => await window.electronAPI.toggleStartup(e.target.checked));
chkPastaRede.addEventListener('change', async (e) => {
    await window.electronAPI.setOption('pasta_rede', e.target.checked);
    // O modo de observação só muda ao religar o monitoramento.
    if (isMonitoring) await startMonitoringProcess();
});
btnClearLog.addEventListener('click', () => {
    logArea.innerHTML = '';
    $('logEmpty').style.display = '';
});
window.electronAPI.onLogEvent((data) => addLog(data.msg, data.type));

// Sessão recuperada silenciosamente pelo processo principal (refresh ou re-login).
window.electronAPI.onSessionStatus(async (data) => {
    if (!data) return;
    if (data.offline) {
        // Servidor inacessível: a sessão continua válida, só a rede está fora.
        semConexao = true;
        setStatus('dot-warning', 'Sem conexão');
        syncMonitorButtons();
    } else if (data.connected) {
        semConexao = false;
        if (aguardandoConexao && !isConnected) {
            addLog("Conectado.", "success");
            await onConectado(data.email, { iniciarMonitoramento: true });
        } else if (isConnected) {
            setStatus('dot-online', 'Conectado');
            syncMonitorButtons();
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
    setLoginMessage('Sessão expirada. Entre de novo para continuar enviando.', 'warning');
    switchSection('profile');
});

async function checkForUpdates() {
    const data = await window.electronAPI.checkUpdate();
    if (!data.disponivel) return;
    $('updateText').textContent = data.releaseNotes
        ? `Nova versão ${data.version}: ${data.releaseNotes}`
        : `Nova versão ${data.version} disponível`;
    $('updateBanner').style.display = 'flex';
    $('btnDownloadUpdate').onclick = () => window.electronAPI.openUpdateDownload();
}


// --- CERTIFICADOS ---

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

btnSelectCertFolder.addEventListener('click', async () => {
    const f = await window.electronAPI.selectCertFolder();
    if (f) {
        folderCertificados = f;
        mostrarCaminho(inputCertFolder, f);
    }
});

async function desbloquearCertificados() {
    // Sem trim: espaço no começo ou no fim pode fazer parte da senha do .pfx.
    const pwd = inputCertPassword.value;
    if (!pwd) { inputCertPassword.focus(); return; }

    btnUnlockCerts.disabled = true;
    btnUnlockCerts.innerHTML = `${SPINNER} Desbloqueando...`;

    const result = await window.electronAPI.unlockCertificates([pwd]);

    btnUnlockCerts.disabled = false;
    iconeComTexto(btnUnlockCerts, ICONES.cadeadoAberto, 'Desbloquear');

    if (result.unlockedCount > 0) {
        inputCertPassword.value = '';
        showToast(`${result.unlockedCount} certificado(s) desbloqueado(s) com essa senha.`, 'success');
    } else {
        showToast("A senha não serviu para nenhum certificado bloqueado.", 'warning');
    }
}
btnUnlockCerts.addEventListener('click', desbloquearCertificados);
$('btnRefreshCerts').addEventListener('click', async () => {
    if (!folderCertificados) { switchSection('configuracoes'); return; }
    const btn = $('btnRefreshCerts');
    btn.disabled = true;
    await window.electronAPI.refreshCertificates();
    btn.disabled = false;
});
inputCertPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') desbloquearCertificados(); });

window.electronAPI.onCertificatesLoading((data) => {
    certificadosList.style.display = 'none';
    certTabs.style.display = 'none';
    certLoadingContainer.style.display = 'flex';
    const baseText = data.text || "Processando certificados";
    if (data.total > 0 && data.current > 0) {
        certLoadingText.textContent = `${baseText}: ${data.current} de ${data.total}`;
    } else {
        certLoadingText.textContent = `${baseText}...`;
    }
});

window.electronAPI.onCertificatesUpdate((certs) => {
    certLoadingContainer.style.display = 'none';
    currentCertsData = certs || [];
    certTabs.style.display = currentCertsData.length > 0 ? 'flex' : 'none';
    renderCertificates();
});

const STATUS_CERT = {
    bloqueado: { texto: 'Bloqueado', icone: ICONES.cadeado, tom: 'tone-muted' },
    instalado: { texto: 'Instalado', icone: ICONES.success, tom: 'tone-success' },
    nao_instalado: { texto: 'Não instalado', icone: ICONES.info, tom: 'tone-info' },
    expirado: { texto: 'Expirado', icone: ICONES.error, tom: 'tone-danger' },
    prestes: { texto: 'Perto de vencer', icone: ICONES.relogio, tom: 'tone-warning' },
};

const FILTROS_CERT = {
    todos: () => true,
    validos: (c) => !c.isLocked && (c.status === 'instalado' || c.status === 'nao_instalado'),
    prestes: (c) => !c.isLocked && c.status === 'prestes',
    expirados: (c) => !c.isLocked && c.status === 'expirado',
    bloqueados: (c) => c.isLocked,
};

// CN no padrão ICP-Brasil: "RAZÃO SOCIAL:12345678000190" (CNPJ) ou ":12345678909" (CPF).
function separarNomeCert(nome) {
    const m = /^(.*?):(\d{11}|\d{14})$/.exec(String(nome || '').trim());
    if (!m) return { titulo: nome, doc: '' };
    const d = m[2];
    const doc = d.length === 14
        ? `CNPJ ${d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`
        : `CPF ${d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}`;
    return { titulo: m[1], doc };
}

// Busca pelo nome ou pelo número do documento, com ou sem pontuação.
function certCombina(cert, termo) {
    if (cert.name.toLowerCase().includes(termo)) return true;
    const digitos = termo.replace(/\D/g, '');
    return digitos.length >= 3 && cert.name.replace(/\D/g, '').includes(digitos);
}

function prazoTexto(validTo) {
    const dias = Math.ceil((new Date(validTo) - new Date()) / 86400000);
    if (dias < 0) return `venceu há ${-dias} dia${dias === -1 ? '' : 's'}`;
    if (dias === 0) return 'vence hoje';
    return `vence em ${dias} dia${dias === 1 ? '' : 's'}`;
}

// Botão com estado de "trabalhando" e mensagem ao terminar.
function botaoDeAcao({ classe, html, texto, textoTrabalhando, confirmar, acao, sucesso, falha }) {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${classe}`;
    iconeComTexto(btn, html || '', texto);
    btn.addEventListener('click', async () => {
        if (confirmar && !(await showConfirm(confirmar.mensagem, confirmar))) return;
        btn.disabled = true;
        btn.innerHTML = `${SPINNER} `;
        btn.appendChild(document.createTextNode(textoTrabalhando));
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
    certificadosList.style.display = '';

    for (const [filtro, teste] of Object.entries(FILTROS_CERT)) {
        const el = certTabs.querySelector(`[data-count="${filtro}"]`);
        if (el) el.textContent = String(currentCertsData.filter(teste).length);
    }

    let filtered = currentCertsData.filter(FILTROS_CERT[currentCertTab] || FILTROS_CERT.todos);
    if (currentSearchTerm) {
        filtered = filtered.filter(c => certCombina(c, currentSearchTerm));
    }

    if (filtered.length === 0) {
        const semNada = currentCertsData.length === 0;
        certificadosList.innerHTML = `
            <div class="empty">
                ${ICONES.escudo}
                <strong>${semNada ? 'Nenhum certificado na pasta' : 'Nenhum certificado neste filtro'}</strong>
                <span>${semNada ? 'Coloque os arquivos .pfx ou .p12 na pasta de certificados.' : 'Tente outro filtro ou outra busca.'}</span>
            </div>`;
        return;
    }

    certificadosList.innerHTML = '';
    filtered.forEach(cert => {
        const card = document.createElement('div');
        card.className = 'cert-card';

        const statusKey = cert.isLocked ? 'bloqueado' : cert.status;
        const st = STATUS_CERT[statusKey] || STATUS_CERT.bloqueado;

        // Estrutura fixa; o nome vem de dentro do .pfx e entra só como texto.
        card.innerHTML = `
            <div class="cert-header">
                <span class="cert-icon ${st.tom}">${cert.instalado ? ICONES.escudoOk : ICONES.escudo}</span>
                <div class="cert-titles">
                    <h4 class="cert-name"></h4>
                    <p class="cert-doc"></p>
                    <p class="cert-date"></p>
                </div>
            </div>
            <span class="cert-status status-${statusKey}"></span>
            <div class="cert-actions"></div>
        `;
        const { titulo, doc } = separarNomeCert(cert.name);
        const nameEl = card.querySelector('.cert-name');
        nameEl.textContent = titulo;
        nameEl.title = cert.name;
        card.querySelector('.cert-doc').textContent = doc;
        card.querySelector('.cert-date').textContent = cert.validTo
            ? `Válido até ${new Date(cert.validTo).toLocaleDateString('pt-BR')} · ${prazoTexto(cert.validTo)}`
            : 'Informe a senha acima para ler a validade';
        // Perto de vencer e já instalado: mostra as duas coisas.
        const sufixo = statusKey === 'prestes' && cert.instalado ? ' · Instalado' : '';
        iconeComTexto(card.querySelector('.cert-status'), st.icone, `${st.texto}${sufixo}`);

        const actions = card.querySelector('.cert-actions');
        if (!cert.isLocked && cert.status !== 'expirado') {
            if (cert.instalado) {
                actions.appendChild(botaoDeAcao({
                    classe: 'btn-secondary btn-uninstall', html: ICONES.lixeira,
                    texto: 'Remover do Windows', textoTrabalhando: 'Removendo...',
                    confirmar: {
                        titulo: 'Remover do Windows?', confirmar: 'Remover',
                        mensagem: 'O certificado sai do repositório do Windows. O arquivo .pfx continua intacto na pasta.',
                    },
                    acao: () => window.electronAPI.uninstallCertificate(cert.thumbprint),
                    sucesso: 'Certificado removido do Windows.', falha: 'Falha ao remover',
                }));
            } else {
                actions.appendChild(botaoDeAcao({
                    classe: 'btn-primary btn-install', html: ICONES.download,
                    texto: 'Instalar no Windows', textoTrabalhando: 'Instalando...',
                    acao: () => window.electronAPI.installCertificate(cert.thumbprint),
                    sucesso: 'Certificado instalado no Windows.', falha: 'Falha ao instalar',
                }));
            }
        }
        if (!cert.isLocked && cert.status === 'expirado') {
            actions.appendChild(botaoDeAcao({
                classe: 'btn-danger-ghost btn-delete', html: ICONES.lixeira,
                texto: 'Excluir', textoTrabalhando: 'Excluindo...',
                confirmar: {
                    titulo: 'Excluir certificado?', confirmar: 'Excluir',
                    mensagem: 'O arquivo é apagado desta pasta e o certificado sai do repositório do Windows. Esta ação não pode ser desfeita.',
                },
                acao: () => window.electronAPI.deleteCertificate(cert.thumbprint),
                sucesso: 'Certificado excluído.', falha: 'Falha ao excluir',
            }));
        }

        certificadosList.appendChild(card);
    });
}
