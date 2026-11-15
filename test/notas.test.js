// Rodada completa do "Baixar notas" contra um servidor falso local: marcador inicial, histórico
// da empresa marcada, links, download em gzip, pastas, e nota cancelada depois de baixada.
// Electron, electron-store e a sessão são substituídos por dublês — nada sai desta máquina.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const Module = require('module');

const DOC = '11796880000170';
const OUTRO = '22222222000122';
const USER = '0d6f3c1e-1111-4222-8333-944455556666';

function nota(id, chave, extra = {}) {
    return { id, chave, tipo: 'nfe', documento: DOC, lado: 'entrada', situacao: 'autorizada', mes: '2026-10', ...extra };
}

// Estado do servidor falso, mexido pelo teste entre as rodadas.
const srv = {
    ativo: true,
    global: [],       // itens devolvidos por `novidades` sem documento (uma vez)
    historico: [],    // itens devolvidos por `novidades` com documento
    pedidosLinks: [],
    chamadas: [],
    entregues: new Map(), // tudo que novidades já devolveu (para montar o link)
};

function servidor() {
    return http.createServer((req, res) => {
        let corpo = '';
        req.on('data', c => { corpo += c; });
        req.on('end', () => {
            const json = (b, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
            if (req.method === 'GET' && req.url.startsWith('/storage/v1/object/sign/')) {
                const chave = req.url.split('/').pop().split('?')[0];
                res.writeHead(200, { 'Content-Type': 'application/gzip' });
                res.end(zlib.gzipSync(`<nfeProc><chNFe>${chave}</chNFe></nfeProc>`));
                return;
            }
            if (req.url !== '/functions/v1/onexml-sincronizar') return json({ error: 'rota' }, 404);
            assert.equal(req.headers.authorization, 'Bearer token-falso');
            const b = JSON.parse(corpo);
            srv.chamadas.push(b.acao + (b.documento ? `:${b.documento}` : ''));
            const cur = { em: '2026-11-15T00:00:00.000Z', id: null };
            if (b.acao === 'config') {
                return json({
                    ativo: srv.ativo, incluir_novas: false, modulos: { busca_xml: true, busca_nfse: true },
                    empresas: [
                        { documento: DOC, nome: 'ACME/GO LTDA', tipos_permitidos: ['nfe'], marcada: true, tipos: ['nfe'], lados: ['entrada', 'saida'] },
                        { documento: OUTRO, nome: 'OUTRA', tipos_permitidos: ['nfe'], marcada: false, tipos: ['nfe'], lados: ['entrada', 'saida'] },
                    ],
                });
            }
            if (b.acao === 'inicio') return json({ cursores: { nfe: cur, nfse: cur, cte: cur } });
            if (b.acao === 'novidades') {
                const itens = b.documento ? srv.historico : srv.global;
                for (const n of itens) srv.entregues.set(n.id, n);
                if (!b.documento) srv.global = [];
                return json({ ativo: srv.ativo, itens, cursores: { nfe: cur, nfse: cur, cte: cur }, fim: true, nomes: { [DOC]: 'ACME/GO LTDA' } });
            }
            if (b.acao === 'links') {
                srv.pedidosLinks.push(...b.itens.map(i => i.id));
                const base = `http://127.0.0.1:${res.socket.localPort}`;
                const todos = [...srv.entregues.values()];
                return json({
                    links: b.itens.map(i => ({
                        tipo: i.tipo, id: i.id,
                        url: `${base}/storage/v1/object/sign/busca-xml/x/${(todos.find(n => n.id === i.id) || { chave: '0' }).chave}?token=t`,
                    })),
                });
            }
            return json({ error: 'acao' }, 400);
        });
    });
}

function carregarNotasComDubles(porta, dadosStore) {
    process.env.DOCSENDER_API_URL = `http://127.0.0.1:${porta}`;
    const raiz = path.join(__dirname, '..', 'src', 'main');
    const dubles = {
        electron: {
            app: { isPackaged: false },
            ipcMain: { handle() {} },
            shell: { openPath: async () => '' },
            safeStorage: { isEncryptionAvailable: () => false },
        },
        'electron-store': class { get(k, d) { return k in dadosStore ? dadosStore[k] : d; } set(k, v) { dadosStore[k] = v; } delete(k) { delete dadosStore[k]; } },
        [path.join(raiz, 'sessao.js')]: {
            ensureValidToken: async () => 'token-falso',
            invalidarToken() {},
            getUserId: () => USER,
        },
        [path.join(raiz, 'ui.js')]: { sendToRenderer() {}, log() {} },
    };
    const original = Module._load;
    Module._load = function (pedido, pai, ...resto) {
        if (dubles[pedido]) return dubles[pedido];
        try {
            const resolvido = Module._resolveFilename(pedido, pai);
            if (dubles[resolvido]) return dubles[resolvido];
        } catch (e) { /* módulo nativo ou inexistente: segue o fluxo normal */ }
        return original.call(this, pedido, pai, ...resto);
    };
    for (const k of Object.keys(require.cache)) if (k.startsWith(raiz)) delete require.cache[k];
    try {
        return require(path.join(raiz, 'notas.js'));
    } finally {
        Module._load = original;
    }
}

test('rodada completa: histórico, novidades, pastas, gzip e cancelada movida', async () => {
    const s = servidor();
    await new Promise(r => s.listen(0, '127.0.0.1', r));
    const porta = s.address().port;
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'notas-'));
    const dadosStore = { [`notas.${USER}`]: { pasta, modelo: 'empresa' } };
    try {
        const notas = carregarNotasComDubles(porta, dadosStore);
        const A = '52261011871237000164550020000000011000000011';
        const B = '52261011871237000164550020000000021000000022';
        srv.historico = [nota('a0000000-0000-4000-8000-000000000001', A), nota('a0000000-0000-4000-8000-000000000002', B, { lado: 'saida' })];
        srv.global = [];

        await notas.sincronizar();

        const empresa = path.join(pasta, `ACME GO LTDA - ${DOC}`, '2026-10');
        const arqA = path.join(empresa, 'Entrada', 'NF-e', `${A}.xml`);
        const arqB = path.join(empresa, 'Saida', 'NF-e', `${B}.xml`);
        assert.equal(fs.readFileSync(arqA, 'utf8'), `<nfeProc><chNFe>${A}</chNFe></nfeProc>`, 'XML gravado descompactado');
        assert.ok(fs.existsSync(arqB));
        assert.deepEqual(srv.chamadas, ['config', 'inicio', 'novidades', `novidades:${DOC}`, 'links']);
        const local = dadosStore[`notas.${USER}`];
        assert.equal(local.iniciados[DOC], true, 'histórico da empresa marcado como feito');
        assert.equal(local.iniciados[OUTRO], undefined, 'empresa desmarcada não recebe histórico');

        // Rodada 2: B foi cancelada depois de baixada; A volta (ex.: updated_at mexeu) e é pulada.
        srv.chamadas = []; srv.pedidosLinks = [];
        srv.global = [nota('a0000000-0000-4000-8000-000000000002', B, { lado: 'saida', situacao: 'cancelada' }),
            nota('a0000000-0000-4000-8000-000000000001', A)];
        await notas.sincronizar();
        assert.ok(!fs.existsSync(arqB), 'cancelada sai do lugar normal');
        assert.ok(fs.existsSync(path.join(empresa, 'Saida', 'NF-e', 'Canceladas', `${B}.xml`)), 'e vai para Canceladas');
        assert.deepEqual(srv.pedidosLinks, [], 'nada que já está na pasta pede link de novo');
        assert.deepEqual(srv.chamadas, ['config', 'novidades'], 'histórico não se repete');

        // Rodada 2b: as notas agora vêm com número. A, que já estava com o nome pela chave, só é
        // renomeada; D cai num nome já usado por OUTRA nota e leva a chave junto.
        srv.chamadas = []; srv.pedidosLinks = [];
        const D = '52261011871237000164550020000000991000000099';
        const arqNumeroA = path.join(empresa, 'Entrada', 'NF-e', 'NF-e 000001 serie 2 - SEIVA (11871237000164).xml');
        srv.global = [
            nota('a0000000-0000-4000-8000-000000000001', A, { numero: '1', serie: '2', emitente_doc: '11871237000164', emitente_nome: 'SEIVA' }),
        ];
        await notas.sincronizar();
        assert.ok(fs.existsSync(arqNumeroA), 'arquivo antigo renomeado para o número');
        assert.ok(!fs.existsSync(arqA), 'e o nome pela chave some');
        assert.deepEqual(srv.pedidosLinks, [], 'renomear não baixa de novo');

        srv.chamadas = []; srv.pedidosLinks = [];
        srv.global = [nota('a0000000-0000-4000-8000-000000000099', D, { numero: '1', serie: '2', emitente_doc: '11871237000164', emitente_nome: 'SEIVA' })];
        await notas.sincronizar();
        assert.equal(fs.readFileSync(arqNumeroA, 'utf8').includes(A), true, 'o arquivo de A não é sobrescrito');
        const arqD = arqNumeroA.replace(/\.xml$/, ` (${D}).xml`);
        assert.equal(fs.readFileSync(arqD, 'utf8'), `<nfeProc><chNFe>${D}</chNFe></nfeProc>`, 'D leva a chave no nome');

        // Rodada 3: desligado no servidor — não lista nada.
        srv.chamadas = []; srv.ativo = false;
        await notas.sincronizar();
        assert.deepEqual(srv.chamadas, ['config']);
    } finally {
        s.close();
        fs.rmSync(pasta, { recursive: true, force: true });
    }
});
