const appVersion = "1.1.2"; 
let folderEnvio = "";
let folderBackup = "";
let folderCertificados = "";
let accessToken = ""; 

const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb3NpaGlzYmhkZXR0cXNsaWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDY3NjIsImV4cCI6MjA4NzUyMjc2Mn0.Pcg65rr6Lbgtbs4UGp1xPn2Y9avI1Y1J-nTcdRewNGA";

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

function addLog(msg, type = 'info') {
    if (!logArea) return;
    const p = document.createElement('div');
    p.className = `log-item ${type}`;
    const time = new Date().toLocaleTimeString();
    p.innerHTML = `${getIconForLog(type)} <span>[${time}] ${msg}</span>`;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight; 
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const settings = await window.electronAPI.getSettings();
        folderEnvio = settings.folderEnvio; inputEnvio.value = folderEnvio;
        folderBackup = settings.folderBackup; inputBackup.value = folderBackup;
        folderCertificados = settings.folderCertificados || ""; inputCertFolder.value = folderCertificados;
        chkStartup.checked = settings.iniciarComWindows;

        const creds = await window.electronAPI.getSavedCredentials();
        if (creds.email) inputEmail.value = creds.email;
        if (creds.email && creds.password) {
            inputPassword.value = creds.password;
            chkRememberMe.checked = true;
            addLog("Autenticando automaticamente...", "info");
            await performLogin(creds.email, creds.password, true); 
        }
        
        if (folderCertificados) {
            await window.electronAPI.refreshCertificates();
        }
        
        setTimeout(checkForUpdates, 3000);
    } catch (e) { addLog("Erro ao carregar configurações.", "error"); }
});

async function performLogin(email, password, autoStartMonitor = false) {
    btnLogin.disabled = true; btnLogin.innerText = "Conectando...";
    const result = await window.electronAPI.login({ email, password });
    if (result.success) {
        accessToken = result.token;
        if (chkRememberMe.checked) await window.electronAPI.saveCredentials({ email, password });
        else await window.electronAPI.clearCredentials();

        loginMessage.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; gap:5px;">${getIconForLog('success')} Conectado!</div>`; 
        loginMessage.style.color = "#3fb950";
        statusIndicator.innerHTML = '<span class="status-dot dot-online"></span> Conectado';
        switchSection('monitor');
        if (autoStartMonitor && folderEnvio && folderBackup) await startMonitoringProcess();
    } else {
        loginMessage.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; gap:5px;">${getIconForLog('error')} ${result.error}</div>`; 
        loginMessage.style.color = "#e94560";
        btnLogin.disabled = false; btnLogin.innerText = "Conectar";
    }
}

async function startMonitoringProcess() {
    btnStart.disabled = true; btnStop.disabled = false;
    await window.electronAPI.startMonitoring({ folder: folderEnvio, backupFolder: folderBackup, autoSend: true });
    addLog(`Monitoramento ativo em: ${folderEnvio}`, "success");
}

btnLogin.addEventListener('click', () => performLogin(inputEmail.value.trim(), inputPassword.value.trim(), false));
btnStart.addEventListener('click', startMonitoringProcess);
btnStop.addEventListener('click', async () => {
    await window.electronAPI.stopMonitoring();
    addLog(`Monitoramento parado.`, 'warning');
    btnStart.disabled = false; btnStop.disabled = true;
});

function switchSection(s) {
    navProfile.classList.toggle('active', s === 'profile'); 
    navMonitor.classList.toggle('active', s === 'monitor');
    navCertificados.classList.toggle('active', s === 'certificados');
    navConfiguracoes.classList.toggle('active', s === 'configuracoes');

    sectionProfile.style.display = s === 'profile' ? 'block' : 'none'; 
    sectionMonitor.style.display = s === 'monitor' ? 'flex' : 'none';
    sectionCertificados.style.display = s === 'certificados' ? 'flex' : 'none';
    sectionConfiguracoes.style.display = s === 'configuracoes' ? 'block' : 'none';
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
btnClearLog.addEventListener('click', () => { logArea.innerHTML = ''; });
window.electronAPI.onLogEvent((data) => addLog(data.msg, data.type));

// Sessão recuperada silenciosamente pelo processo principal (refresh ou re-login).
window.electronAPI.onSessionStatus((data) => {
    if (data && data.connected) {
        statusIndicator.innerHTML = '<span class="status-dot dot-online"></span> Conectado';
    }
});

// A sessão caiu e não foi possível recuperar automaticamente: pede reconexão manual.
window.electronAPI.onForceReconnect(() => {
    statusIndicator.innerHTML = '<span class="status-dot dot-offline"></span> Desconectado';
    addLog("Sua sessão expirou e não foi possível reconectar automaticamente. Faça login novamente.", "error");
    loginMessage.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; gap:5px;">${getIconForLog('warning')} Sessão expirada. Reconecte.</div>`;
    loginMessage.style.color = "#e94560";
    btnLogin.disabled = false;
    btnLogin.innerText = "Conectar";
    switchSection('profile');
});

function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1; if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}

async function checkForUpdates() {
    try {
        const res = await fetch("https://ojosihisbhdettqsliam.supabase.co/functions/v1/docsender-check-update", {
            headers: { 'apikey': API_KEY, 'Authorization': `Bearer ${API_KEY}` }
        });
        const data = await res.json();
        if (data.version && compareVersions(data.version, appVersion) > 0) {
            document.getElementById('updateBanner').style.display = "flex";
            document.getElementById('btnDownloadUpdate').onclick = () => window.open(data.download_url, '_blank');
        }
    } catch (e) {
        console.error("Erro ao verificar atualização:", e);
    }
}


// --- LÓGICA DE CERTIFICADOS ---

btnSelectCertFolder.addEventListener('click', async () => {
    const f = await window.electronAPI.selectCertFolder();
    if (f) {
        folderCertificados = f;
        inputCertFolder.value = f;
    }
});

btnUnlockCerts.addEventListener('click', async () => {
    const pwd = inputCertPassword.value.trim();
    if (!pwd) return;
    
    btnUnlockCerts.disabled = true;
    btnUnlockCerts.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M16.24 16.24l2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="M4.93 19.07l2.83-2.83"></path><path d="M16.24 7.76l2.83-2.83"></path></svg> Desbloqueando...`;
    
    const result = await window.electronAPI.unlockCertificates([pwd]);
    
    btnUnlockCerts.disabled = false;
    btnUnlockCerts.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"></path><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"></circle></svg> Desbloquear`;
    
    if (result.unlockedCount > 0) {
        inputCertPassword.value = '';
        alert(`Sucesso! ${result.unlockedCount} certificado(s) bloqueado(s) foram desbloqueado(s) com essa senha.`);
    } else {
        alert("A senha não serviu para nenhum certificado bloqueado.");
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
    
    if (currentCertsData.length > 0) {
        certTabs.style.display = 'flex';
    } else {
        certTabs.style.display = 'none';
    }
    
    renderCertificates();
});

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
        
        let statusText = '';
        let statusIcon = '';
        
        if (cert.isLocked) {
            statusText = 'Bloqueado';
            statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
        } else if (cert.status === 'instalado') {
            statusText = 'Instalado';
            statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (cert.status === 'nao_instalado') {
            statusText = 'Não Instalado';
            statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        } else if (cert.status === 'expirado') {
            statusText = 'Expirado';
            statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        } else if (cert.status === 'prestes') {
            statusText = 'Prestes a Expirar';
            statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        }

        const dateStr = cert.validTo ? new Date(cert.validTo).toLocaleDateString('pt-BR') : 'Desconhecida';
        
        let btnInstallHTML = '';
        if (!cert.isLocked && cert.status !== 'expirado') {
            if (cert.status === 'instalado') {
                btnInstallHTML = `<button class="btn-outline btn-uninstall" data-thumbprint="${cert.thumbprint}" style="color: #e94560; border-color: #e94560; display: flex; align-items: center; justify-content: center; gap: 5px;"><svg class="icon" style="margin:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Remover do Windows</button>`;
            } else {
                btnInstallHTML = `<button class="btn-green btn-install" data-thumbprint="${cert.thumbprint}">Instalar</button>`;
            }
        }

        card.innerHTML = `
            <div class="cert-header">
                <div>
                    <h4 class="cert-name" title="${cert.name}">${cert.name}</h4>
                    <p class="cert-date">Válido até: ${dateStr}</p>
                </div>
            </div>
            <div>
                <span class="cert-status status-${cert.isLocked ? 'bloqueado' : cert.status}">
                    ${statusIcon} ${statusText}
                </span>
            </div>
            <div class="cert-actions">
                ${btnInstallHTML}
                ${cert.status === 'expirado' ? `<button class="btn-red btn-delete" data-thumbprint="${cert.thumbprint}">Excluir</button>` : ''}
            </div>
        `;
        
        const btnInstall = card.querySelector('.btn-install');
        if (btnInstall) {
            btnInstall.addEventListener('click', async () => {
                btnInstall.disabled = true;
                btnInstall.innerHTML = `<svg class="spinner icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; width:14px; height:14px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Instalando...`;
                const res = await window.electronAPI.installCertificate(cert.thumbprint);
                if (!res.success) {
                    alert(`Falha ao instalar: ${res.error}`);
                    btnInstall.disabled = false;
                    btnInstall.innerText = "Instalar";
                }
            });
        }

        const btnUninstall = card.querySelector('.btn-uninstall');
        if (btnUninstall) {
            btnUninstall.addEventListener('click', async () => {
                if (window.confirm("Atenção: Esta ação irá desinstalar o certificado apenas do Repositório do Windows.\n\nO seu arquivo de backup (.pfx) continuará intocado na pasta.\n\nDeseja continuar?")) {
                    btnUninstall.disabled = true;
                    btnUninstall.innerHTML = `<svg class="spinner icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; width:14px; height:14px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Desinstalando...`;
                    const res = await window.electronAPI.uninstallCertificate(cert.thumbprint);
                    if (!res.success) {
                        alert(`Falha ao desinstalar: ${res.error}`);
                        btnUninstall.disabled = false;
                        btnUninstall.innerText = "Remover do Windows";
                    }
                }
            });
        }

        const btnDelete = card.querySelector('.btn-delete');
        if (btnDelete) {
            btnDelete.addEventListener('click', async () => {
                if (window.confirm("Atenção: Esta ação excluirá definitivamente o certificado desta pasta e do Repositório do Windows.\n\nDeseja continuar?")) {
                    btnDelete.disabled = true;
                    btnDelete.innerHTML = `<svg class="spinner icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; width:14px; height:14px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Excluindo...`;
                    const res = await window.electronAPI.deleteCertificate(cert.thumbprint);
                    if (!res.success) {
                        alert(`Falha ao excluir: ${res.error}`);
                        btnDelete.disabled = false;
                        btnDelete.innerText = "Excluir";
                    }
                }
            });
        }
        
        certificadosList.appendChild(card);
    });
}