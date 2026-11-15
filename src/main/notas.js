// "Baixar notas": traz os XML do OneXml (NF-e, NFC-e, CT-e e NFS-e) para uma pasta deste
// computador, separados por empresa, mês, lado e tipo.
// Plano: onechattotal/docs/plans/onexml-baixar-no-computador.md.
//
// Divisão da configuração (decisão de 2026-11-14):
//   - no SERVIDOR, por usuário: ligado/desligado, empresas, tipos e lados (function
//     `onexml-sincronizar`). O servidor só entrega o que o usuário marcou.
//   - AQUI, por usuário do OneChat: pasta, modelo de pastas e os marcadores do que já veio.
//     Guardado em `notas.<id do usuário>` — outro login neste computador tem o seu.
//
// Como anda:
//   1. Ao ligar, pede ao servidor o marcador de "agora" (`inicio`).
//   2. A cada rodada, pede o que mudou depois do marcador (`novidades`), página a página.
//   3. Empresa marcada pela primeira vez (ou depois de trocar a pasta) recebe o histórico
//      inteiro (`novidades` com `documento`), uma vez.
//   4. Só pede link (`links`) do que ainda não está na pasta, e grava o XML descompactado.

const { ipcMain, shell } = require('electron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { API_BASE_URL, API_KEY } = require('./config');
const { store } = require('./armazenamento');
const { sendToRenderer } = require('./ui');
const sessao = require('./sessao');
const { classifyFailure, responseErrorText } = require('./erros');
const { existe, moveFile, emParalelo, estaDentroDe } = require('./arquivos');
const {
    MODELOS, FORMATOS_NOME, nomePastaEmpresa, acharPastaPorDocumento, estaCancelada, caminhosDaNota, comChave,
    pastaOndeFicaAEmpresa, raizDaEmpresa, nomePastaInscricao, acharPastaPorInscricao, ehPastaDeInscricao,
} = require('./notas-caminhos');

const FUNCAO = `${API_BASE_URL}/functions/v1/onexml-sincronizar`;
const INTERVALO_MS = 20 * 60 * 1000;
const PRIMEIRA_RODADA_MS = 60 * 1000;
const MAX_PAGINAS_POR_RODADA = 30;
const LOTE_LINKS = 100;
const DOWNLOADS_SIMULTANEOS = 4;

let timer = null;
let rodando = false;
let pedirDeNovo = false;
let status = { estado: 'parado', mensagem: '', ultima: null, baixadasUltima: 0 };

function atualizarStatus(parcial) {
    status = { ...status, ...parcial };
    sendToRenderer('notas-status', status);
}

// ---------------------------------------------------------------- estado local

function chaveLocal(userId) {
    return `notas.${userId}`;
}

function lerLocal(userId) {
    // Sem formatoNome gravado = padrão "numero" (desde a 1.2.4).
    return { pasta: '', modelo: 'empresa', formatoNome: 'numero', cursores: null, iniciados: {}, historico: {}, ...store().get(chaveLocal(userId), {}) };
}

function gravarLocal(userId, local) {
    store().set(chaveLocal(userId), local);
}

// ---------------------------------------------------------------- servidor

async function chamar(corpo) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
        const token = await sessao.ensureValidToken();
        try {
            const res = await axios.post(FUNCAO, corpo, {
                headers: { apikey: API_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                timeout: 60000,
            });
            return res.data;
        } catch (e) {
            if (tentativa === 0 && classifyFailure(e) === 'auth') { sessao.invalidarToken(); continue; }
            throw e;
        }
    }
}

// O link assinado tem de apontar para o armazenamento do próprio OneChat.
function linkConfiavel(url) {
    try {
        const u = new URL(url);
        const api = new URL(API_BASE_URL);
        return u.origin === api.origin && u.pathname.startsWith('/storage/v1/object/sign/');
    } catch (e) {
        return false;
    }
}

async function baixarXml(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxRedirects: 0 });
    const buf = Buffer.from(res.data);
    // O bucket guarda em gzip (1f 8b). Se um dia vier cru, grava como veio.
    return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf;
}

async function gravarAtomico(destino, conteudo) {
    await fs.promises.mkdir(path.dirname(destino), { recursive: true });
    const tmp = `${destino}.parcial`;
    await fs.promises.writeFile(tmp, conteudo);
    await fs.promises.rename(tmp, destino);
}

// ---------------------------------------------------------------- pastas

// Subpastas de uma pasta, lidas uma vez por rodada (cache). Pasta que ainda não existe = vazia.
function criarListador() {
    const listagens = new Map();
    return async function listar(onde) {
        if (!listagens.has(onde)) {
            let nomes = [];
            try { nomes = (await fs.promises.readdir(onde, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name); }
            catch (e) { /* a pasta ainda não existe */ }
            listagens.set(onde, nomes);
        }
        return listagens.get(onde);
    };
}

// Pastas de cada nota, por rodada:
//   - empresa: reconhecida pelo DOCUMENTO — se a razão social mudar, a pasta antiga continua;
//   - inscrição (só cliente com mais de uma): reconhecida pelo número da IE;
//   - as OUTRAS pastas de inscrição da empresa, onde a nota pode estar se mudou de fazenda.
function criarResolvedorDePastas(local) {
    const listar = criarListador();
    return async function pastasDaNota(item, nome) {
        const onde = pastaOndeFicaAEmpresa(item, { base: local.pasta, modelo: local.modelo });
        const empresas = await listar(onde);
        let pastaEmpresa = acharPastaPorDocumento(empresas, item.documento);
        if (!pastaEmpresa) { pastaEmpresa = nomePastaEmpresa(nome, item.documento); empresas.push(pastaEmpresa); }

        const raiz = raizDaEmpresa(item, { base: local.pasta, modelo: local.modelo, pastaEmpresa });
        const inscricoes = await listar(raiz);
        let pastaInscricao = null;
        if (item.inscricao) {
            pastaInscricao = acharPastaPorInscricao(inscricoes, item.inscricao) || nomePastaInscricao(item.inscricao);
            if (!inscricoes.includes(pastaInscricao)) inscricoes.push(pastaInscricao);
        }
        // `null` = sem o nível de inscrição (onde a nota estava antes de o cliente ganhar a 2ª IE).
        const outras = [null, ...inscricoes.filter(ehPastaDeInscricao)].filter(p => p !== pastaInscricao);
        return { pastaEmpresa, pastaInscricao, outras };
    };
}

// ---------------------------------------------------------------- processamento

// O arquivo é desta nota? O nome pela chave já prova; no nome pelo número, o XML traz a chave
// (NF-e, NFC-e e CT-e no Id e no chNFe/chCTe; NFS-e no Id "NFS…").
async function ehDaNota(arquivo, chave) {
    if (path.basename(arquivo).includes(chave)) return true;
    try {
        return (await fs.promises.readFile(arquivo, 'utf8')).includes(chave);
    } catch (e) {
        return false;
    }
}

// Todos os lugares e nomes em que a nota pode já estar.
function lugaresPossiveis(c, chave) {
    return [c.normal, c.cancelada, comChave(c.normal, chave), comChave(c.cancelada, chave), c.normalChave, c.canceladaChave];
}

// Decide o que fazer com cada nota da página. Devolve as que precisam ser baixadas.
async function separar(itens, nomes, local, pastasDaNota) {
    const baixar = [];
    let movidas = 0;
    for (const item of itens) {
        const { pastaEmpresa, pastaInscricao, outras } = await pastasDaNota(item, nomes[item.documento]);
        const opcoes = { base: local.pasta, modelo: local.modelo, pastaEmpresa, formato: local.formatoNome };
        const c = caminhosDaNota(item, { ...opcoes, pastaInscricao });
        const chave = String(item.chave || '').replace(/\D/g, '');
        // A nota pode estar na pasta de outra inscrição (reclassificada) ou sem o nível de inscrição.
        const alternativos = outras.flatMap(p => lugaresPossiveis(caminhosDaNota(item, { ...opcoes, pastaInscricao: p }), chave));
        // Defesa extra: nada sai da pasta escolhida.
        if (![...lugaresPossiveis(c, chave), ...alternativos].every(p => estaDentroDe(local.pasta, p))) continue;
        const cancelada = estaCancelada(item.situacao);
        let destino = cancelada ? c.cancelada : c.normal;

        // Nome já usado: se for desta nota, nada a fazer; se for de outra (mesmo número de emitentes
        // que o nome não separa), esta leva a chave junto.
        if (await existe(destino)) {
            if (await ehDaNota(destino, chave)) continue;
            destino = comChave(destino, chave);
            if (await existe(destino)) continue;
        }

        // A nota pode já estar na pasta com outro nome ou em outro lugar: cancelada depois de
        // baixada, com o nome antigo (pela chave) ou em outra inscrição. Só muda de lugar.
        const outros = [...lugaresPossiveis(c, chave), ...alternativos]
            .filter((p, i, todos) => p !== destino && todos.indexOf(p) === i);
        let achado = null;
        for (const origem of outros) {
            if (await existe(origem) && await ehDaNota(origem, chave)) { achado = origem; break; }
        }
        if (achado) {
            await moveFile(achado, path.dirname(destino), path.basename(destino));
            movidas++;
            continue;
        }
        baixar.push({ item, destino });
    }
    return { baixar, movidas };
}

async function baixarTodas(pendentes) {
    let baixadas = 0;
    let falhas = 0;
    for (let i = 0; i < pendentes.length; i += LOTE_LINKS) {
        const lote = pendentes.slice(i, i + LOTE_LINKS);
        const resp = await chamar({ acao: 'links', itens: lote.map(p => ({ tipo: p.item.tipo, id: p.item.id })) });
        const porId = new Map((resp.links || []).map(l => [`${l.tipo}:${l.id}`, l.url]));
        await emParalelo(lote, DOWNLOADS_SIMULTANEOS, async (p) => {
            const url = porId.get(`${p.item.tipo}:${p.item.id}`);
            if (!url || !linkConfiavel(url)) { falhas++; return; }
            try {
                await gravarAtomico(p.destino, await baixarXml(url));
                baixadas++;
            } catch (e) {
                falhas++;
                console.error('[notas] falha ao baixar', p.item.chave, e.message);
            }
        });
    }
    return { baixadas, falhas };
}

// Percorre as páginas de `novidades` a partir dos `cursores`. Grava o marcador só depois de a
// página inteira estar na pasta: se a rodada cair no meio, a próxima recomeça dali.
async function percorrer({ local, cursores, documento, aoAvancar, pastasDaNota }) {
    let total = { baixadas: 0, falhas: 0, movidas: 0 };
    for (let pagina = 0; pagina < MAX_PAGINAS_POR_RODADA; pagina++) {
        const r = await chamar({ acao: 'novidades', cursores: cursores || {}, ...(documento ? { documento } : {}) });
        if (!r.ativo) return { ...total, desligado: true };
        const { baixar, movidas } = await separar(r.itens || [], r.nomes || {}, local, pastasDaNota);
        const { baixadas, falhas } = await baixarTodas(baixar);
        total = { baixadas: total.baixadas + baixadas, falhas: total.falhas + falhas, movidas: total.movidas + movidas };
        // Com falha de download o marcador NÃO avança: a página volta na próxima rodada, e o que
        // já foi gravado é reconhecido e pulado.
        if (falhas) return { ...total, incompleto: true };
        cursores = r.cursores;
        aoAvancar(cursores);
        if (r.fim) return { ...total, fim: true };
    }
    return { ...total, incompleto: true };
}

async function rodada() {
    let userId;
    try {
        await sessao.ensureValidToken();
        userId = sessao.getUserId();
    } catch (e) {
        return; // sem sessão: nada a fazer
    }
    if (!userId) return;
    const local = lerLocal(userId);
    if (!local.pasta) { atualizarStatus({ estado: 'sem-pasta', mensagem: 'Escolha a pasta para começar.' }); return; }

    const cfg = await chamar({ acao: 'config' });
    if (!cfg.ativo) { atualizarStatus({ estado: 'desligado', mensagem: '' }); return; }

    atualizarStatus({ estado: 'sincronizando', mensagem: 'Procurando notas novas…' });
    const pastasDaNota = criarResolvedorDePastas(local);
    let soma = { baixadas: 0, falhas: 0, movidas: 0 };
    let incompleto = false;

    // 1. Marcador inicial.
    if (!local.cursores) {
        local.cursores = (await chamar({ acao: 'inicio' })).cursores;
        gravarLocal(userId, local);
    }

    // 2. O que mudou desde a última rodada, em todas as empresas marcadas.
    const g = await percorrer({
        local, cursores: local.cursores, pastasDaNota,
        aoAvancar: (c) => { local.cursores = c; gravarLocal(userId, local); },
    });
    if (g.desligado) { atualizarStatus({ estado: 'desligado', mensagem: '' }); return; }
    soma = { baixadas: soma.baixadas + g.baixadas, falhas: soma.falhas + g.falhas, movidas: soma.movidas + g.movidas };
    incompleto = incompleto || !!g.incompleto;

    // 3. Histórico de cada empresa recém-marcada.
    const marcadas = (cfg.empresas || [])
        .filter(e => cfg.incluir_novas || e.marcada)
        .map(e => e.documento);
    // Empresa desmarcada esquece o histórico: se voltar, recebe tudo de novo (o que já está na
    // pasta é pulado).
    for (const doc of Object.keys(local.iniciados)) {
        if (!marcadas.includes(doc)) { delete local.iniciados[doc]; delete local.historico[doc]; }
    }
    // Empresa que ganhou (ou perdeu) a 2ª inscrição: o histórico volta, e o que já está na pasta é
    // movido para a pasta da inscrição (ou tirado dela), sem baixar de novo.
    local.multi = local.multi || {};
    for (const e of cfg.empresas || []) {
        const agora = !!e.multi_inscricao;
        if (e.documento in local.multi && local.multi[e.documento] !== agora) {
            delete local.iniciados[e.documento]; delete local.historico[e.documento];
        }
        local.multi[e.documento] = agora;
    }
    gravarLocal(userId, local);
    for (const doc of marcadas) {
        if (local.iniciados[doc]) continue;
        atualizarStatus({ estado: 'sincronizando', mensagem: 'Baixando o histórico das empresas marcadas…' });
        const h = await percorrer({
            local, cursores: local.historico[doc] || {}, documento: doc, pastasDaNota,
            aoAvancar: (c) => { local.historico[doc] = c; gravarLocal(userId, local); },
        });
        if (h.desligado) { atualizarStatus({ estado: 'desligado', mensagem: '' }); return; }
        soma = { baixadas: soma.baixadas + h.baixadas, falhas: soma.falhas + h.falhas, movidas: soma.movidas + h.movidas };
        if (h.fim) { local.iniciados[doc] = true; delete local.historico[doc]; gravarLocal(userId, local); }
        else incompleto = true;
    }

    const partes = [];
    partes.push(soma.baixadas === 1 ? '1 nota nova' : `${soma.baixadas} notas novas`);
    if (soma.movidas) partes.push(`${soma.movidas} movida(s) ou renomeada(s)`);
    if (soma.falhas) partes.push(`${soma.falhas} não baixada(s) — nova tentativa na próxima rodada`);
    else if (incompleto) partes.push('ainda há mais notas; continua na próxima rodada');
    atualizarStatus({
        estado: soma.falhas ? 'aviso' : 'ok',
        mensagem: partes.join(' · '),
        ultima: new Date().toISOString(),
        baixadasUltima: soma.baixadas,
    });
    // Ainda há o que baixar: não espera 20 minutos.
    if (incompleto && !soma.falhas) pedirDeNovo = true;
}

async function sincronizar() {
    if (rodando) { pedirDeNovo = true; return; }
    rodando = true;
    try {
        do {
            pedirDeNovo = false;
            await rodada();
        } while (pedirDeNovo);
    } catch (e) {
        const tipo = classifyFailure(e);
        const msg = tipo === 'network' ? 'Sem conexão com o OneChat. Nova tentativa em instantes.'
            : tipo === 'auth' ? 'Sessão expirada. Entre de novo na sua conta.'
            : (responseErrorText(e) || e.message || 'Erro ao baixar as notas.');
        atualizarStatus({ estado: 'erro', mensagem: msg });
        console.error('[notas] rodada falhou:', e.message);
    } finally {
        rodando = false;
    }
}

function iniciar() {
    if (timer) clearInterval(timer);
    timer = setInterval(sincronizar, INTERVALO_MS);
    setTimeout(sincronizar, PRIMEIRA_RODADA_MS);
}

// ---------------------------------------------------------------- tela

async function obterConfig() {
    await sessao.ensureValidToken();
    const userId = sessao.getUserId();
    const local = lerLocal(userId);
    const cfg = await chamar({ acao: 'config' });
    return { ...cfg, pasta: local.pasta, modelo: local.modelo, formatoNome: local.formatoNome, status };
}

async function salvar({ ativo, incluir_novas, empresas, pasta, modelo, formatoNome }) {
    await sessao.ensureValidToken();
    const userId = sessao.getUserId();
    if (!userId) throw new Error('Sessão sem usuário');
    const local = lerLocal(userId);
    const novoModelo = MODELOS.includes(modelo) ? modelo : 'empresa';
    const novoFormato = FORMATOS_NOME.includes(formatoNome) ? formatoNome : 'numero';
    if (ativo && !pasta) return { ok: false, erro: 'Escolha a pasta antes de ligar.' };
    // Pasta, modelo ou nome novo: as empresas recebem o histórico de novo, já no lugar novo. O que
    // já estava na pasta com o nome antigo é renomeado, não baixado de novo.
    if (pasta !== local.pasta || novoModelo !== local.modelo || novoFormato !== local.formatoNome) {
        local.iniciados = {}; local.historico = {};
    }
    local.pasta = pasta || '';
    local.modelo = novoModelo;
    local.formatoNome = novoFormato;
    await chamar({ acao: 'salvar', ativo: !!ativo, incluir_novas: !!incluir_novas, empresas: empresas || [] });
    gravarLocal(userId, local);
    if (ativo) setTimeout(sincronizar, 500);
    else atualizarStatus({ estado: 'desligado', mensagem: '' });
    return { ok: true };
}

function mensagemDeErro(e) {
    const tipo = classifyFailure(e);
    if (tipo === 'network') return 'Sem conexão com o OneChat.';
    if (tipo === 'auth') return 'Sessão expirada. Entre de novo na sua conta.';
    return responseErrorText(e) || e.message || 'Erro inesperado.';
}

function registrarIpc() {
    ipcMain.handle('notas-config', async () => {
        try { return { ok: true, dados: await obterConfig() }; }
        catch (e) { return { ok: false, erro: mensagemDeErro(e), status: e.response?.status || null }; }
    });
    ipcMain.handle('notas-salvar', async (e, dados) => {
        try { return await salvar(dados || {}); }
        catch (err) { return { ok: false, erro: mensagemDeErro(err) }; }
    });
    ipcMain.handle('notas-sincronizar', () => { sincronizar(); return true; });
    ipcMain.handle('notas-abrir-pasta', async () => {
        try {
            await sessao.ensureValidToken();
            const local = lerLocal(sessao.getUserId());
            if (!local.pasta) return false;
            await fs.promises.mkdir(local.pasta, { recursive: true });
            return (await shell.openPath(local.pasta)) === '';
        } catch (e) {
            return false;
        }
    });
}

module.exports = { registrarIpc, iniciar, sincronizar };
