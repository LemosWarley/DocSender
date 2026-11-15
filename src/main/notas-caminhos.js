// Onde cada XML do OneXml fica no computador. Lógica pura, sem Electron, coberta por
// test/notas-caminhos.test.js. Plano: onechattotal/docs/plans/onexml-baixar-no-computador.md.
//
// Modelo "empresa" (padrão):  <pasta>\<NOME - documento>\<AAAA-MM>\<Entrada|Saida>\<tipo>\<chave>.xml
// Modelo "mes":               <pasta>\<AAAA-MM>\<NOME - documento>\<Entrada|Saida>\<tipo>\<chave>.xml
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

function mesValido(mes) {
    return /^\d{4}-\d{2}$/.test(String(mes || '')) ? mes : 'sem-data';
}

function estaCancelada(situacao) {
    return SITUACOES_CANCELADAS.includes(String(situacao || ''));
}

// Só a chave (dígitos) vira nome de arquivo: nada que venha do servidor entra cru no caminho.
function nomeArquivo(chave) {
    const c = String(chave || '').replace(/\D/g, '');
    if (!c) throw new Error('Nota sem chave');
    return `${c}.xml`;
}

// Caminho relativo à pasta da empresa resolvida (ver `pastaDaEmpresa` em notas.js).
// Devolve { normal, cancelada } — os dois lugares possíveis do arquivo.
function caminhosDaNota(item, { base, modelo, pastaEmpresa }) {
    const tipo = ROTULO_TIPO[item.tipo];
    const lado = ROTULO_LADO[item.lado];
    if (!tipo || !lado) throw new Error(`Nota com tipo ou lado desconhecido: ${item.tipo}/${item.lado}`);
    const mes = mesValido(item.mes);
    const raiz = modelo === 'mes'
        ? path.join(base, mes, pastaEmpresa)
        : path.join(base, pastaEmpresa, mes);
    const pastaTipo = path.join(raiz, lado, tipo);
    const arquivo = nomeArquivo(item.chave);
    return {
        normal: path.join(pastaTipo, arquivo),
        cancelada: path.join(pastaTipo, 'Canceladas', arquivo),
    };
}

// Onde a pasta da empresa é procurada: no modelo "mes" ela fica dentro de cada mês.
function pastaOndeFicaAEmpresa(item, { base, modelo }) {
    return modelo === 'mes' ? path.join(base, mesValido(item.mes)) : base;
}

module.exports = {
    ROTULO_TIPO,
    ROTULO_LADO,
    MODELOS,
    limparNome,
    nomePastaEmpresa,
    acharPastaPorDocumento,
    estaCancelada,
    nomeArquivo,
    caminhosDaNota,
    pastaOndeFicaAEmpresa,
};
