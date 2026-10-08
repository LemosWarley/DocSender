// Monitoramento da pasta de envio e envio de cada PDF ao OneChat.

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const axios = require('axios');
const FormData = require('form-data');

const {
    API_BASE_URL, API_KEY, ERROR_FOLDER_NAME, PENDING_FOLDER_NAME, MAX_PDF_BYTES,
    MAX_CONCURRENT_UPLOADS, SERVER_RETRY_MS, NETWORK_RETRY_MS,
} = require('./config');
const { store } = require('./armazenamento');
const { sendToRenderer, log } = require('./ui');
const sessao = require('./sessao');
const { criarFila } = require('./fila');
const { classifyFailure, describeError, resumoProcessar, motivoPendencia } = require('./erros');
const { moveFile, isValidPdf, hashArquivo, nomeOriginal, nomeComCarimbo, estaDentroDe, listarPdfs } = require('./arquivos');

const fila = criarFila({ processar: processPdf, maxConcorrentes: MAX_CONCURRENT_UPLOADS });

let watcher = null;
let configAtual = null; // { folder, backupFolder, autoSend }
let verificacaoPastaTimer = null;
let pastaInacessivel = false;

function formatDelay(ms) {
    return ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)} min`;
}

function avisarMudancaNasPastas() {
    sendToRenderer('error-files-changed');
}

// --- Estado da rede ---
// Avisa uma vez por queda, não uma vez por arquivo.
let semRede = false;

function marcarSemRede(atrasoMs) {
    if (semRede) return;
    semRede = true;
    log('warning', `Sem conexão com o servidor. Os envios continuam sozinhos quando a rede voltar (próxima tentativa em ${formatDelay(atrasoMs)}).`);
    sendToRenderer('session-status', { connected: true, offline: true });
}

function marcarRedeOk() {
    if (!semRede) return;
    semRede = false;
    log('success', 'Conexão restabelecida. Retomando os envios.');
    sendToRenderer('session-status', { connected: true });
}

// --- Destinos do arquivo ---

function pastasDoJob(folder) {
    return {
        pastaErros: path.join(folder, ERROR_FOLDER_NAME),
        pastaPendentes: path.join(folder, PENDING_FOLDER_NAME),
    };
}

function moverPara(job, pasta, nome, rotulo) {
    try {
        moveFile(job.filePath, pasta, nomeComCarimbo(nome));
        avisarMudancaNasPastas();
        return true;
    } catch (e) {
        log('error', `Não foi possível mover ${nome} para ${rotulo}: ${e.message}`);
        return false;
    }
}

function moverParaErros(job, nome) {
    return moverPara(job, job.pastaErros, nome, 'a pasta de erro');
}

// Arquivos enviados com sucesso aguardando a cópia para o backup. Enquanto
// estiverem aqui, o observador não os coloca na fila de novo.
const aguardandoBackup = new Set();

// O envio já aconteceu: uma falha ao mover para o backup (pasta de rede fora,
// arquivo aberto em outro programa) não pode virar "falha de envio", senão o
// documento seria reenviado. Tenta mover de novo algumas vezes.
function arquivar(job, nome, tentativa = 0) {
    try {
        moveFile(job.filePath, job.backupFolder, nomeComCarimbo(nome));
        aguardandoBackup.delete(job.filePath);
        avisarMudancaNasPastas();
    } catch (e) {
        if (!fs.existsSync(job.filePath)) { aguardandoBackup.delete(job.filePath); return; }
        if (tentativa >= 5) {
            aguardandoBackup.delete(job.filePath);
            log('error', `${nome} foi enviado, mas não foi possível movê-lo para o backup (${e.message}). Ele continua na pasta de envio; mova-o à mão.`);
            return;
        }
        aguardandoBackup.add(job.filePath);
        if (tentativa === 0) log('warning', `${nome} foi enviado, mas não foi possível movê-lo para o backup (${e.message}). Tentando de novo em 1 min.`);
        setTimeout(() => arquivar(job, nome, tentativa + 1), 60 * 1000);
    }
}

// --- Envio ---

async function processPdf(job) {
    const { filePath, autoSend } = job;
    const nome = nomeOriginal(path.basename(filePath));

    // O arquivo pode ter sumido enquanto esperava na fila.
    if (!fs.existsSync(filePath)) return;

    // Validação: arquivo inválido/corrompido vai direto para a pasta de erro.
    if (!isValidPdf(filePath, MAX_PDF_BYTES)) {
        log('error', `Arquivo inválido (não é PDF ou passa de ${MAX_PDF_BYTES / (1024 * 1024)} MB): ${nome}`);
        moverParaErros(job, nome);
        return;
    }

    try {
        if (job.attempt === 0 && job.netAttempt === 0 && !job.authRetried) {
            log('info', `Detectado: ${nome}`);
        }

        // Chave de idempotência (SHA-256 do conteúdo) — o servidor devolve o envio
        // já existente em vez de criar outro, então repetir a tentativa é seguro.
        const idempotencyKey = await hashArquivo(filePath);

        const form = new FormData();
        // Sempre o nome original: o prefixo de horário é coisa nossa.
        form.append('file', fs.createReadStream(filePath), nome);

        const uploadRes = await axios.post(`${API_BASE_URL}/functions/v1/documentos-upload`, form, {
            headers: { ...form.getHeaders(), 'Authorization': `Bearer ${await sessao.ensureValidToken()}`, 'apikey': API_KEY, 'x-idempotency-key': idempotencyKey },
            maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 120000
        });
        marcarRedeOk();
        const upload = uploadRes.data || {};

        if (!autoSend) {
            log('success', `Enviado para análise: ${nome}`);
            arquivar(job, nome);
            return;
        }

        // Sem cliente identificado não há para quem enviar. Antes o arquivo ia
        // para o backup sem nenhum aviso; agora fica em _Pendentes até alguém
        // cadastrar o cliente e reprocessar.
        if (!upload.empresa_encontrada) {
            log('warning', `Pendente: ${nome} — ${motivoPendencia(upload)}.`);
            moverPara(job, job.pastaPendentes, nome, 'a pasta de pendentes');
            return;
        }

        // Token pedido de novo: o upload inclui análise de IA e pode demorar
        // o bastante para o token capturado antes dele já não servir.
        const procRes = await axios.post(`${API_BASE_URL}/functions/v1/documentos-processar`, { envio_id: upload.envio_id }, {
            headers: { 'Authorization': `Bearer ${await sessao.ensureValidToken()}`, 'apikey': API_KEY, 'Content-Type': 'application/json' }, timeout: 60000
        });

        const resultado = resumoProcessar(procRes.data);
        if (!resultado.ok) {
            log('error', `Não enviado: ${nome} — ${resultado.motivo}`);
            moverParaErros(job, nome);
            return;
        }

        const protocolo = resultado.protocolo ? ` (protocolo ${resultado.protocolo})` : '';
        if (resultado.idempotente) {
            log('success', `Já havia sido enviado: ${nome}${protocolo}`);
        } else if (resultado.parcial) {
            log('warning', `Enviado com falhas: ${nome}${protocolo}. Não chegou para: ${resultado.falhas.join(', ')}.`);
        } else {
            log('success', `Enviado: ${nome}${protocolo}`);
        }
        arquivar(job, nome);
    } catch (error) {
        await tratarFalha(job, error, nome);
    }
}

// Reagenda após erro do servidor, ou desiste se já esgotou as tentativas.
function reagendarErroServidor(job, nome, detail) {
    const atraso = SERVER_RETRY_MS[job.attempt];
    if (atraso === undefined) {
        log('error', `Erro em ${nome} após ${SERVER_RETRY_MS.length + 1} tentativas: ${detail}`);
        moverParaErros(job, nome);
        return;
    }
    job.attempt++;
    if (fila.reagendar(job, atraso)) {
        log('warning', `Falha temporária em ${nome} (${detail}). Nova tentativa em ${formatDelay(atraso)}.`);
    }
}

// Sem rede: pausa a fila inteira (os outros arquivos falhariam do mesmo jeito)
// e tenta de novo sem gastar as tentativas do arquivo.
function reagendarSemRede(job) {
    const atraso = NETWORK_RETRY_MS[Math.min(job.netAttempt, NETWORK_RETRY_MS.length - 1)];
    job.netAttempt++;
    fila.bloquearAte(Date.now() + atraso);
    fila.reagendar(job, atraso);
    marcarSemRede(atraso);
}

// Decide o destino de um envio que falhou: reenviar agora (sessão renovada),
// reagendar (rede ou servidor) ou mandar para a pasta de erro (falha definitiva).
async function tratarFalha(job, error, nome) {
    const kind = classifyFailure(error);
    const detail = describeError(error);

    if (kind === 'network') return reagendarSemRede(job);
    if (kind === 'server') return reagendarErroServidor(job, nome, detail);

    if (kind === 'auth') {
        // Uma renovação por documento: descarta o token em memória, recupera a
        // sessão e reenvia na hora. É isto que evita o "erro de autenticação"
        // que só saía deslogando e logando de novo.
        if (!job.authRetried) {
            job.authRetried = true;
            sessao.invalidarToken();

            const rec = await sessao.recoverSession();
            if (rec.ok) {
                sendToRenderer('session-status', { connected: true });
                if (fila.reagendar(job, 0)) log('warning', `Sessão renovada. Reenviando ${nome}...`);
                return;
            }
            // Servidor inalcançável: a sessão pode estar viva, trata como queda de rede.
            if (rec.reason === 'network') return reagendarSemRede(job);
        }

        // Sessão perdida de verdade: aí sim pede reconexão manual. O arquivo
        // fica na pasta de envio e volta a ser lido quando o monitoramento religar.
        log('error', `${nome} não foi enviado: a sessão expirou e não foi possível reconectar.`);
        sessao.requestReconnect();
        return;
    }

    // Erro definitivo (cadastro, dados do documento): repetir não resolve.
    log('error', `Erro em ${nome}: ${detail}`);
    moverParaErros(job, nome);
}

function enfileirar(filePath, extra) {
    if (aguardandoBackup.has(filePath)) return;
    fila.adicionar({ filePath, ...extra });
}

// --- Monitoramento ---

function usarVarreduraPeriodica(folder) {
    // Compartilhamento de rede (\\servidor\pasta): o Windows não entrega os
    // eventos de arquivo novo de forma confiável, então o chokidar faz varredura.
    return store().get('pasta_rede', false) || folder.startsWith('\\\\');
}

function pararObservador() {
    if (watcher) { watcher.close(); watcher = null; }
    if (verificacaoPastaTimer) { clearInterval(verificacaoPastaTimer); verificacaoPastaTimer = null; }
}

function iniciarObservador(config) {
    pararObservador();
    const backupFolder = config.backupFolder ? path.resolve(config.backupFolder) : null;
    // Ignora as pastas de erro e pendentes (dentro da monitorada) e a de backup,
    // para não reprocessar em loop arquivos que nós mesmos movemos.
    const ignored = (p) => {
        const partes = path.resolve(p).split(path.sep);
        if (partes.includes(ERROR_FOLDER_NAME) || partes.includes(PENDING_FOLDER_NAME)) return true;
        const resolved = path.resolve(p);
        if (backupFolder && (resolved === backupFolder || resolved.startsWith(backupFolder + path.sep))) return true;
        return false;
    };
    const polling = usarVarreduraPeriodica(config.folder);
    watcher = chokidar.watch(config.folder, {
        persistent: true,
        ignored,
        awaitWriteFinish: { stabilityThreshold: 2000 },
        usePolling: polling,
        interval: 3000,
        binaryInterval: 3000,
    });
    const extra = { backupFolder: config.backupFolder, autoSend: config.autoSend, ...pastasDoJob(config.folder) };
    watcher.on('add', (filePath) => {
        if (filePath.toLowerCase().endsWith('.pdf')) enfileirar(filePath, extra);
    });
    watcher.on('error', (error) => {
        log('error', `Erro ao observar a pasta de envio: ${error.message}`);
    });

    // Se a pasta some (unidade de rede desconectada), o observador para sem
    // avisar. Confere a cada minuto e religa quando ela voltar.
    pastaInacessivel = false;
    verificacaoPastaTimer = setInterval(() => {
        const existe = fs.existsSync(config.folder);
        if (!existe && !pastaInacessivel) {
            pastaInacessivel = true;
            log('error', `A pasta de envio não está acessível: ${config.folder}. Os envios voltam quando ela estiver disponível.`);
        } else if (existe && pastaInacessivel) {
            log('success', 'A pasta de envio voltou a ficar acessível.');
            iniciarObservador(config);
        }
    }, 60 * 1000);
}

function iniciarMonitoramento(config) {
    if (!config?.folder || !fs.existsSync(config.folder)) {
        return { success: false, error: 'A pasta de envio não existe ou não está acessível.' };
    }
    if (!config.backupFolder) {
        return { success: false, error: 'Defina a pasta de Backup em Configurações.' };
    }
    fila.limpar();
    configAtual = config;
    iniciarObservador(config);
    return { success: true, varreduraPeriodica: usarVarreduraPeriodica(config.folder) };
}

// Os arquivos só saem da pasta monitorada quando o envio termina, então o que
// estava na fila é reencontrado pela varredura inicial ao religar o monitoramento.
function pararMonitoramento() {
    pararObservador();
    configAtual = null;
    fila.limpar();
}

// Ao acordar da suspensão: não espera o fim da pausa por falta de rede.
function retomarAposSuspensao() {
    fila.desbloquear();
}

// --- Pastas de erro e de pendentes ---

const PASTAS_ESPECIAIS = { erros: ERROR_FOLDER_NAME, pendentes: PENDING_FOLDER_NAME };

function pastaEspecial(tipo) {
    const folder = store().get('folderEnvio');
    const nome = PASTAS_ESPECIAIS[tipo];
    return folder && nome ? path.join(folder, nome) : null;
}

function reprocessar(tipo, fileNames) {
    const dir = pastaEspecial(tipo);
    const folder = store().get('folderEnvio');
    const backupFolder = store().get('folderBackup');
    if (!dir || !fs.existsSync(dir)) return { success: false, error: 'Nenhum arquivo para reprocessar.' };
    if (!backupFolder) return { success: false, error: 'Defina a pasta de Backup em Configurações.' };

    // Sem argumento = reprocessar todos.
    const todos = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
    const lista = (fileNames && fileNames.length) ? fileNames.filter(f => todos.includes(f)) : todos;

    for (const name of lista) {
        // Reprocessa em cima do próprio arquivo; se falhar de novo, volta para
        // a pasta de erro ou de pendentes conforme o novo motivo.
        enfileirar(path.join(dir, name), { backupFolder, autoSend: true, ...pastasDoJob(folder) });
    }
    return { success: true, count: lista.length };
}

function excluir(tipo, fileName) {
    const dir = pastaEspecial(tipo);
    if (!dir) return { success: false };
    const alvo = path.join(dir, fileName);
    if (!estaDentroDe(dir, alvo)) return { success: false };
    try {
        if (fs.existsSync(alvo)) fs.unlinkSync(alvo);
        avisarMudancaNasPastas();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function registrarIpc() {
    ipcMain.handle('start-monitoring', (event, config) => iniciarMonitoramento(config));
    ipcMain.handle('stop-monitoring', () => { pararMonitoramento(); return true; });
    ipcMain.handle('list-folder-files', (event, tipo) => listarPdfs(pastaEspecial(tipo)));
    ipcMain.handle('reprocess-folder-files', (event, tipo, fileNames) => reprocessar(tipo, fileNames));
    ipcMain.handle('delete-folder-file', (event, tipo, fileName) => excluir(tipo, fileName));
}

module.exports = { registrarIpc, retomarAposSuspensao };
