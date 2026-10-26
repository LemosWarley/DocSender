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
const { ehPastaDeRede } = require('./rede');
const { emParalelo } = require('./arquivos');

// Leituras simultâneas de .pfx. Medido em 2026-10-08 numa pasta de rede com 182
// arquivos: desbloquear levou ~17 s com 8 ou 16 (o Node faz no máximo 4
// leituras de arquivo de cada vez), contra minutos lendo um por um.
const LEITURAS_SIMULTANEAS = 8;
// Pasta de rede: varredura da lista de arquivos (sem fs.watch, ver rede.js).
const VARREDURA_REDE_MS = 60 * 1000;

const DIAS_AVISO_VENCIMENTO = 15;

let certWatcher = null;
let varreduraTimer = null;
let pastaObservada = null;
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

function pararObservacao() {
    if (certWatcher) { certWatcher.close(); certWatcher = null; }
    if (varreduraTimer) { clearInterval(varreduraTimer); varreduraTimer = null; }
}

async function listarCertificados(folder) {
    try {
        return (await fs.promises.readdir(folder)).filter(ehCertificado);
    } catch (e) {
        return null; // pasta inacessível (rede fora, unidade desconectada)
    }
}

// Pasta de rede: compara a lista de arquivos de tempos em tempos e só
// atualiza quando ela muda. readdir é assíncrono e não trava a janela.
function iniciarVarredura(folder) {
    let assinatura = null;
    varreduraTimer = setInterval(async () => {
        const lista = await listarCertificados(folder);
        if (!lista || pastaObservada !== folder) return;
        const atual = lista.slice().sort().join('|');
        if (assinatura !== null && atual !== assinatura) triggerRefreshCertificates(folder);
        assinatura = atual;
    }, VARREDURA_REDE_MS);
}

async function startCertMonitoring(folder) {
    pararObservacao();
    pastaObservada = folder;
    if (await ehPastaDeRede(folder)) {
        if (pastaObservada === folder) iniciarVarredura(folder);
        return;
    }
    if (pastaObservada !== folder) return;
    certWatcher = chokidar.watch(folder, { persistent: true, depth: 0, ignoreInitial: true });
    certWatcher.on('all', (event, filePath) => {
        // Ignora subpastas garantindo que o arquivo está na raiz
        if (path.dirname(filePath) !== folder) return;
        if (ehCertificado(filePath)) triggerRefreshCertificates(folder);
    });
    // Rede que o detector não reconheceu: o fs.watch falha em loop e trava o
    // processo. Na primeira falha, troca para a varredura.
    certWatcher.on('error', () => {
        if (!certWatcher || pastaObservada !== folder) return;
        certWatcher.close();
        certWatcher = null;
        iniciarVarredura(folder);
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

// Uma atualização por vez. Pedidos que chegam durante uma atualização viram
// uma só, rodada no fim (antes, seleção da pasta + abertura do app + observador
// disparavam várias leituras da pasta inteira ao mesmo tempo).
let atualizacaoEmAndamento = null;
let atualizarDeNovo = false;

function refreshCertificates(folder, silent = false) {
    if (atualizacaoEmAndamento) {
        atualizarDeNovo = true;
        return atualizacaoEmAndamento;
    }
    atualizacaoEmAndamento = atualizarLista(folder, silent)
        .catch((e) => console.error('Falha ao atualizar certificados:', e))
        .finally(() => {
            atualizacaoEmAndamento = null;
            if (atualizarDeNovo) {
                atualizarDeNovo = false;
                refreshCertificates(store().get('folderCertificados'), true);
            }
        });
    return atualizacaoEmAndamento;
}

// Avisa o progresso no máximo a cada 250 ms.
function criarProgresso(total, texto, silent) {
    let ultimo = 0;
    return (feitos, forcar = false) => {
        if (silent) return;
        const agora = Date.now();
        if (!forcar && agora - ultimo < 250) return;
        ultimo = agora;
        sendToRenderer('certificates-loading', { total, current: feitos, text: texto });
    };
}

async function atualizarLista(folder, silent) {
    if (!folder) return;
    const files = await listarCertificados(folder);
    if (!files) {
        sendToRenderer('certificates-update', cachedCertificates);
        log('error', `A pasta de certificados não está acessível: ${folder}`);
        return;
    }

    const progresso = criarProgresso(files.length, 'Atualizando lista', silent);
    progresso(0, true);

    const savedPasswords = getSavedCertPasswords();
    // A consulta ao Windows (PowerShell) roda junto com a leitura dos arquivos.
    const instaladosPromise = getInstalledThumbprints();
    const anterior = new Map(cachedCertificates.map(c => [c.file, c]));

    let feitos = 0;
    const lidos = await emParalelo(files, LEITURAS_SIMULTANEAS, async (file) => {
        const filePath = path.join(folder, file);
        const senha = savedPasswords[file];
        let info = null;
        const prev = anterior.get(file);
        if (prev && !prev.isLocked && senha) {
            // Reaproveita os dados sem ler o arquivo ou usar criptografia novamente
            info = { name: prev.name, validTo: prev.validTo, thumbprint: prev.thumbprint };
        } else if (senha) {
            // Sem senha não há o que ler: o certificado aparece bloqueado. Antes o
            // app lia todos os arquivos assim mesmo — em rede, minutos de espera.
            try {
                info = extractCertInfo(await fs.promises.readFile(filePath), senha);
            } catch (err) {
                console.error(`Falha ao ler arquivo: ${file}`);
            }
        }
        progresso(++feitos);
        return { file, filePath, info };
    });

    const installedCerts = await instaladosPromise;
    cachedCertificates = lidos.map(({ file, filePath, info }) => {
        let status = 'bloqueado';
        let instalado = false;
        if (info) {
            instalado = installedCerts.includes(info.thumbprint);
            status = calcularStatus(info.validTo, instalado);
            notificarVencimento(info, status);
        }
        return {
            file,
            filePath,
            isLocked: !info,
            name: info ? info.name : file,
            validTo: info ? info.validTo : null,
            thumbprint: info ? info.thumbprint : null,
            status,
            instalado,
        };
    });
    sendToRenderer('certificates-update', cachedCertificates);
}

async function desbloquear(passwordsToTry) {
    const folder = store().get('folderCertificados');
    const files = folder ? await listarCertificados(folder) : null;
    if (!files) return { success: false, unlockedCount: 0 };

    const savedPasswords = getSavedCertPasswords();
    // Bloqueado = sem senha guardada, ou com uma senha que não abre o arquivo.
    const bloqueados = new Set(cachedCertificates.filter(c => c.isLocked).map(c => c.file));
    const lockedFiles = files.filter(f => !savedPasswords[f] || bloqueados.has(f));
    let unlockedCount = 0;

    const progresso = criarProgresso(lockedFiles.length, 'Desbloqueando certificados', false);
    progresso(0, true);
    let feitos = 0;
    await emParalelo(lockedFiles, LEITURAS_SIMULTANEAS, async (file) => {
        try {
            const pfxData = await fs.promises.readFile(path.join(folder, file));
            // Testar a senha leva ~2 ms por arquivo (medido): não trava a janela.
            for (const pass of passwordsToTry) {
                if (extractCertInfo(pfxData, pass)) {
                    savedPasswords[file] = pass;
                    unlockedCount++;
                    break;
                }
            }
        } catch (err) {
            console.error(`Falha ao ler arquivo no desbloqueio: ${file}`);
        }
        progresso(++feitos);
    });

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
        await fs.promises.unlink(cert.filePath).catch((e) => { if (e.code !== 'ENOENT') throw e; });

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

// Sem checagem síncrona da pasta: em unidade de rede desconectada, um
// existsSync pode travar o processo até o Windows desistir da conexão.
function iniciar() {
    const folder = store().get('folderCertificados', '');
    if (folder) startCertMonitoring(folder);
}

function registrarIpc() {
    ipcMain.handle('select-cert-folder', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory'] });
        if (result.canceled) return null;
        const folder = result.filePaths[0];
        store().set('folderCertificados', folder);
        cachedCertificates = []; // o cache é por nome de arquivo: não vale para outra pasta
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
