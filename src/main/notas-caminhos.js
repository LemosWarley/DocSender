// Onde cada XML do OneXml fica no computador. Lógica pura, sem Electron, coberta por
// test/notas-caminhos.test.js. Plano: onechattotal/docs/plans/onexml-baixar-no-computador.md.
//
// Modelo "empresa" (padrão):  <pasta>\<NOME - doc>\[<inscrição>]\<ano>\<10 - Outubro>\<Entrada|Saida>\<tipo>\<arquivo>
// Modelo "mes":               <pasta>\<ano>\<10 - Outubro>\<NOME - doc>\[<inscrição>]\<Entrada|Saida>\<tipo>\<arquivo>
// O mês leva o número na frente para o Windows ordenar de janeiro a dezembro (e não por ordem
// alfabética). A pasta de inscrição só existe para cliente com mais de uma (produtor rural): o
// servidor manda `item.inscricao` só nesse caso.
// Arquivo: pelo número da nota (padrão desde a 1.2.4) ou pela chave de acesso.
// Nota cancelada (ou NFS-e substituída) vai para a subpasta `Canceladas` dentro do tipo.

const path = require('path');

const ROTULO_TIPO = { nfe: 'NF-e', nfce: 'NFC-e', cte: 'CT-e', nfse: 'NFS-e' };
const ROTULO_LADO = { entrada: 'Entrada', saida: 'Saida' };
const MODELOS = ['empresa', 'mes'];
const SITUACOES_CANCELADAS = ['cancelada', 'substituida', 'denegada'];

// Nome de pasta aceito pelo Windows: sem \ / : * ? " < > |, sem caractere de controle,
// sem ponto ou espaço no fim, e sem os nomes reservados (CON, PRN, AUX, NUL, COM1…).
function limparNome(nome) {
    let s = String(nome || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
        .replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
    return s;
}

function nomePastaEmpresa(nome, documento) {
    const n = limparNome(nome);
    return n && n !== documento ? `${n} - ${documento}` : documento;
}

// Pasta de empresa já existente com o mesmo documento (a razão social pode ter mudado).
function acharPastaPorDocumento(nomesExistentes, documento) {
    const fim = ` - ${documento}`;
    return (nomesExistentes || []).find(n => n === documento || n.endsWith(fim)) || null;
}

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
    'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// '2026-10' → ['2026', '10 - Outubro']. Sem data válida → ['Sem data'].
function pastasDoMes(mes) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
    const n = m ? Number(m[2]) : 0;
    if (!m || n < 1 || n > 12) return ['Sem data'];
    return [m[1], `${m[2]} - ${NOMES_MES[n - 1]}`];
}

// Pasta da inscrição: "IE 112366406 - FAZ. SANTA RITA", "Sem inscrição" ou "A classificar".
// Reconhecida pelo número da IE, para sobreviver à troca do nome da fazenda.
const PASTA_SEM_INSCRICAO = 'Sem inscrição';
const PASTA_A_CLASSIFICAR = 'A classificar';

function ieDaInscricao(inscricao) {
    return String(inscricao?.ie || '').replace(/\D/g, '');
}

function nomePastaInscricao(inscricao) {
    if (!inscricao) return null;
    if (inscricao.classe === 'inscricao') {
        const ie = ieDaInscricao(inscricao);
        if (!ie) return PASTA_A_CLASSIFICAR;
        const nome = limparNome(inscricao.nome).slice(0, 50).replace(/[. ]+$/, '');
        return nome ? `IE ${ie} - ${nome}` : `IE ${ie}`;
    }
    return inscricao.classe === 'sem_inscricao' ? PASTA_SEM_INSCRICAO : PASTA_A_CLASSIFICAR;
}

function acharPastaPorInscricao(nomesExistentes, inscricao) {
    if (inscricao?.classe !== 'inscricao') return null;
    const ie = ieDaInscricao(inscricao);
    if (!ie) return null;
    return (nomesExistentes || []).find(n => n === `IE ${ie}` || n.startsWith(`IE ${ie} - `)) || null;
}

// Pastas de inscrição numa pasta de empresa (para achar uma nota que mudou de inscrição).
function ehPastaDeInscricao(nome) {
    return /^IE \d+( - |$)/.test(nome) || nome === PASTA_SEM_INSCRICAO || nome === PASTA_A_CLASSIFICAR;
}

function estaCancelada(situacao) {
    return SITUACOES_CANCELADAS.includes(String(situacao || ''));
}

const FORMATOS_NOME = ['numero', 'chave'];

function soDigitosChave(chave) {
    const c = String(chave || '').replace(/\D/g, '');
    if (!c) throw new Error('Nota sem chave');
    return c;
}

// Nome pela chave de acesso: só os dígitos — nada que venha do servidor entra cru no caminho.
function nomeArquivo(chave) {
    return `${soDigitosChave(chave)}.xml`;
}

// Nome pelo número da nota. O número só é único por emitente (e por série/modelo), então o
// emitente entra no nome sempre que não for o próprio cliente:
//   NF-e 000123 serie 1.xml
//   NF-e 004585 serie 2 - FORNECEDOR LTDA (12345678000190).xml
// Sem número, cai na chave.
function nomeArquivoPorNumero(item) {
    const numero = String(item.numero ?? '').replace(/[^0-9A-Za-z]/g, '');
    if (!numero) return nomeArquivo(item.chave);
    const tipo = ROTULO_TIPO[item.tipo] || 'Nota';
    let nome = `${tipo} ${/^\d+$/.test(numero) ? numero.padStart(6, '0') : numero}`;
    const serie = String(item.serie ?? '').replace(/[^0-9A-Za-z]/g, '');
    if (serie) nome += ` serie ${serie}`;
    const emitente = String(item.emitente_doc || '').replace(/\D/g, '');
    if (emitente && emitente !== item.documento) {
        const nomeEmitente = limparNome(item.emitente_nome).slice(0, 40).replace(/[. ]+$/, '');
        nome += nomeEmitente ? ` - ${nomeEmitente} (${emitente})` : ` - ${emitente}`;
    }
    return `${nome}.xml`;
}

// Quando duas notas diferentes caem no mesmo nome, a segunda leva a chave junto.
function comChave(caminho, chave) {
    return caminho.replace(/\.xml$/i, ` (${soDigitosChave(chave)}).xml`);
}

// Pasta da empresa no disco: no modelo "mes" ela fica dentro do ano e do mês.
function raizDaEmpresa(item, { base, modelo, pastaEmpresa }) {
    return modelo === 'mes'
        ? path.join(base, ...pastasDoMes(item.mes), pastaEmpresa)
        : path.join(base, pastaEmpresa);
}

// Caminhos da nota a partir da pasta da empresa e da inscrição já resolvidas (ver notas.js).
// Devolve { normal, cancelada } — os dois lugares possíveis do arquivo — e
// { normalChave, canceladaChave }: onde a nota estaria com o nome pela chave.
// `pastaInscricao` null = sem o nível de inscrição.
function caminhosDaNota(item, { base, modelo, pastaEmpresa, pastaInscricao = null, formato = 'chave' }) {
    const tipo = ROTULO_TIPO[item.tipo];
    const lado = ROTULO_LADO[item.lado];
    if (!tipo || !lado) throw new Error(`Nota com tipo ou lado desconhecido: ${item.tipo}/${item.lado}`);
    const empresa = raizDaEmpresa(item, { base, modelo, pastaEmpresa });
    const comInscricao = pastaInscricao ? path.join(empresa, pastaInscricao) : empresa;
    const raiz = modelo === 'mes' ? comInscricao : path.join(comInscricao, ...pastasDoMes(item.mes));
    const pastaTipo = path.join(raiz, lado, tipo);
    const porChave = nomeArquivo(item.chave);
    const arquivo = formato === 'numero' ? nomeArquivoPorNumero(item) : porChave;
    return {
        normal: path.join(pastaTipo, arquivo),
        cancelada: path.join(pastaTipo, 'Canceladas', arquivo),
        normalChave: path.join(pastaTipo, porChave),
        canceladaChave: path.join(pastaTipo, 'Canceladas', porChave),
    };
}

// Onde a pasta da empresa é procurada: no modelo "mes" ela fica dentro do ano e do mês.
function pastaOndeFicaAEmpresa(item, { base, modelo }) {
    return modelo === 'mes' ? path.join(base, ...pastasDoMes(item.mes)) : base;
}

module.exports = {
    ROTULO_TIPO,
    ROTULO_LADO,
    MODELOS,
    FORMATOS_NOME,
    nomeArquivoPorNumero,
    comChave,
    limparNome,
    nomePastaEmpresa,
    acharPastaPorDocumento,
    estaCancelada,
    nomeArquivo,
    caminhosDaNota,
    pastaOndeFicaAEmpresa,
    pastasDoMes,
    raizDaEmpresa,
    nomePastaInscricao,
    acharPastaPorInscricao,
    ehPastaDeInscricao,
};
