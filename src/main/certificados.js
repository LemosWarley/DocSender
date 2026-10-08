// Certificados digitais (.pfx/.p12): leitura, desbloqueio por senha e
// instalação no repositório do usuário do Windows.

const { ipcMain, dialog, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const forge = require('node-forge');
const { execFile } = require('child_process');

const { store, salvarMapaSegredos, lerMapaSegredos } = require('./armazenamento');
const { sendToRenderer, getMainWindow, log } = require('./ui');

const DIAS_AVISO_VENCIMENTO = 15;

let certWatcher = null;
let cachedCertificates = []; // Armazena info descriptografada dos certs
let refreshTimeout = null; // Atraso para chokidar

// Sem criptografia disponível as senhas não vão para o disco: valem só
// enquanto o app estiver aberto.
const senhasEmMemoria = {};

function getSavedCertPasswords() {
    return { ...lerMapaSegredos('saved_cert_passwords'), ...senhasEmMemoria };
}

function saveCertPasswords(passwordsMap) {
    if (salvarMapaSegredos('saved_cert_passwords', passwordsMap)) return;
    Object.assign(senhasEmMemoria, passwordsMap);
    log('warning', 'A criptografia do Windows não está disponível: as senhas dos certificados valem só até fechar o DocSender.');
}

function ehCertificado(file) {
    const f = file.toLowerCase();
    return f.endsWith('.pfx') || f.endsWith('.p12');
}

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
        if (ehCertificado(filePath)) triggerRefreshCertificates(folder);
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
        const name = subjectAttr ? String(subjectAttr.value) : 'Certificado Desconhecido';
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

// Validade e instalação são coisas independentes: um certificado perto de
// vencer pode estar instalado. Antes, o status "prestes" escondia o "instalado"
// e a tela oferecia "Instalar" para um certificado que já estava no Windows.
function calcularStatus(validTo, instalado, agora = new Date()) {
    const msAviso = DIAS_AVISO_VENCIMENTO * 24 * 60 * 60 * 1000;
    if (validTo < agora) return 'expirado';
    if (validTo - agora <= msAviso) return 'prestes';
    return instalado ? 'instalado' : 'nao_instalado';
}

// Uma notificação por certificado e por status. Antes a chave era só o
// thumbprint: quem era avisado de "prestes a expirar" nunca ouvia "expirou".
function notificarVencimento(info, status) {
    if (status !== 'prestes' && status !== 'expirado') return;
    const chave = `notified_${info.thumbprint}_${status}`;
    // Chave antiga (até a 1.1.4) só existia para o primeiro aviso.
    const legado = status === 'prestes' && store().get(`notified_${info.thumbprint}`);
    if (store().get(chave) || legado) return;
    if (Notification.isSupported()) {
        new Notification({
            title: 'Aviso de Certificado',
            body: `O certificado ${info.name} ${status === 'expirado' ? 'expirou' : 'está prestes a expirar'}.`
        }).show();
    }
    store().set(chave, true);
}

async function refreshCertificates(folder, silent = false) {
    if (!folder || !fs.existsSync(folder)) return;
    const allFiles = await fs.promises.readdir(folder);
    const files = allFiles.filter(ehCertificado);

    if (!silent) {
        sendToRenderer('certificates-loading', { total: files.length, current: 0, text: 'Atualizando lista' });
    }

    const savedPasswords = getSavedCertPasswords();
    const installedCerts = await getInstalledThumbprints();

    const previousCache = [...cachedCertificates];
    const newCache = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
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

        let status = 'bloqueado';
        let instalado = false;
        if (!isLocked && info) {
            instalado = installedCerts.includes(info.thumbprint);
            status = calcularStatus(info.validTo, instalado);
            notificarVencimento(info, status);
        }

        newCache.push({
            file,
            filePath,
            isLocked,
            name: info ? info.name : file,
            validTo: info ? info.validTo : null,
            thumbprint: info ? info.thumbprint : null,
            status,
            instalado,
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

async function desbloquear(passwordsToTry) {
    const folder = store().get('folderCertificados');
    if (!folder || !fs.existsSync(folder)) return { success: false, unlockedCount: 0 };

    const allFiles = await fs.promises.readdir(folder);
    const files = allFiles.filter(ehCertificado);
    const savedPasswords = getSavedCertPasswords();

    const lockedFiles = files.filter(f => !savedPasswords[f]);
    let unlockedCount = 0;

    if (lockedFiles.length > 0) {
        sendToRenderer('certificates-loading', { total: lockedFiles.length, current: 0, text: 'Desbloqueando certificados' });
    }

    for (let i = 0; i < lockedFiles.length; i++) {
        const file = lockedFiles[i];
        const filePath = path.join(folder, file);
        try {
            const pfxData = await fs.promises.readFile(filePath);
            for (const pass of passwordsToTry) {
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

    if (unlockedCount > 0) saveCertPasswords(savedPasswords);
    // Atualiza a lista mesmo sem sucesso: o loading acima escondeu os cards.
    await refreshCertificates(folder, false);

    return { success: true, unlockedCount };
}

async function instalar(thumbprint) {
    const cert = cachedCertificates.find(c => c.thumbprint === thumbprint);
    if (!cert) return { success: false, error: 'Certificado não encontrado na memória.' };

    const password = getSavedCertPasswords()[cert.file];
    if (!password) return { success: false, error: 'Senha não encontrada no cofre.' };

    // Senha e caminho passados por variável de ambiente, nunca interpolados na string.
    const script = 'Import-PfxCertificate -FilePath $env:CERT_PATH -CertStoreLocation Cert:\\CurrentUser\\My -Password (ConvertTo-SecureString -String $env:CERT_PWD -Force -AsPlainText)';
    const { error } = await runPowerShell(script, { CERT_PATH: cert.filePath, CERT_PWD: password });
    if (error) return { success: false, error: error.message };
    await refreshCertificates(store().get('folderCertificados'), true);
    return { success: true };
}

const SCRIPT_REMOVER = 'Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq $env:CERT_TP } | Remove-Item';

async function desinstalar(thumbprint) {
    const cert = cachedCertificates.find(c => c.thumbprint === thumbprint);
    if (!cert) return { success: false, error: 'Certificado não encontrado na memória.' };

    const { error } = await runPowerShell(SCRIPT_REMOVER, { CERT_TP: thumbprint });
    if (error) return { success: false, error: error.message };
    await refreshCertificates(store().get('folderCertificados'), true);
    return { success: true };
}

async function excluir(thumbprint) {
    const cert = cachedCertificates.find(c => c.thumbprint === thumbprint);
    if (!cert) return { success: false, error: 'Certificado não encontrado.' };

    await runPowerShell(SCRIPT_REMOVER, { CERT_TP: thumbprint });
    try {
        if (fs.existsSync(cert.filePath)) {
            fs.unlinkSync(cert.filePath);
        }

        const savedPasswords = getSavedCertPasswords();
        if (savedPasswords[cert.file]) {
            delete savedPasswords[cert.file];
            delete senhasEmMemoria[cert.file];
            saveCertPasswords(savedPasswords);
        }

        await refreshCertificates(store().get('folderCertificados'), true);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function iniciar() {
    const folder = store().get('folderCertificados', '');
    if (folder && fs.existsSync(folder)) startCertMonitoring(folder);
}

function registrarIpc() {
    ipcMain.handle('select-cert-folder', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory'] });
        if (result.canceled) return null;
        const folder = result.filePaths[0];
        store().set('folderCertificados', folder);
        startCertMonitoring(folder);
        refreshCertificates(folder);
        return folder;
    });
    ipcMain.handle('refresh-certificates', async () => {
        await refreshCertificates(store().get('folderCertificados'), false);
        return true;
    });
    ipcMain.handle('unlock-certificates', (event, passwordsToTry) => desbloquear(passwordsToTry));
    ipcMain.handle('install-certificate', (event, thumbprint) => instalar(thumbprint));
    ipcMain.handle('uninstall-certificate', (event, thumbprint) => desinstalar(thumbprint));
    ipcMain.handle('delete-certificate', (event, thumbprint) => excluir(thumbprint));
}

module.exports = { registrarIpc, iniciar };
