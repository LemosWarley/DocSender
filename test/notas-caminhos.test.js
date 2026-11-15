const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
    limparNome, nomePastaEmpresa, acharPastaPorDocumento, estaCancelada, nomeArquivo, caminhosDaNota, pastaOndeFicaAEmpresa,
} = require('../src/main/notas-caminhos');

const BASE = path.join('D:', 'XML');
const NOTA = { chave: '52260811871237000164550020000045851058109551', tipo: 'nfe', lado: 'entrada', mes: '2026-10', documento: '11796880000170', situacao: 'autorizada' };

test('limparNome tira o que o Windows recusa e o ponto do fim', () => {
    assert.equal(limparNome('A/B: C* "D" <E>|F?'), 'A B C D E F');
    assert.equal(limparNome('  ACME LTDA.  '), 'ACME LTDA');
    assert.equal(limparNome('CON'), '_CON');
    assert.equal(limparNome('x'.repeat(200)).length, 80);
});

test('pasta da empresa leva o documento; sem nome, só o documento', () => {
    assert.equal(nomePastaEmpresa('ACME/GO LTDA', '11796880000170'), 'ACME GO LTDA - 11796880000170');
    assert.equal(nomePastaEmpresa('', '11796880000170'), '11796880000170');
    assert.equal(nomePastaEmpresa('11796880000170', '11796880000170'), '11796880000170');
});

test('pasta existente é reconhecida pelo documento, mesmo com outro nome', () => {
    const existentes = ['NOME ANTIGO - 11796880000170', 'OUTRA - 22222222000122'];
    assert.equal(acharPastaPorDocumento(existentes, '11796880000170'), 'NOME ANTIGO - 11796880000170');
    assert.equal(acharPastaPorDocumento(existentes, '33333333000133'), null);
    // Documento que é final de outro não casa: o separador " - " faz parte da regra.
    assert.equal(acharPastaPorDocumento(['X - 911796880000170'], '11796880000170'), null);
});

test('modelo empresa: empresa > ano > mês > lado > tipo', () => {
    const c = caminhosDaNota(NOTA, { base: BASE, modelo: 'empresa', pastaEmpresa: 'ACME - 11796880000170' });
    assert.equal(c.normal, path.join(BASE, 'ACME - 11796880000170', '2026', '10 - Outubro', 'Entrada', 'NF-e', `${NOTA.chave}.xml`));
    assert.equal(c.cancelada, path.join(BASE, 'ACME - 11796880000170', '2026', '10 - Outubro', 'Entrada', 'NF-e', 'Canceladas', `${NOTA.chave}.xml`));
});

test('modelo mês: ano > mês > empresa > lado > tipo', () => {
    const item = { ...NOTA, tipo: 'nfse', lado: 'saida' };
    const c = caminhosDaNota(item, { base: BASE, modelo: 'mes', pastaEmpresa: 'ACME - 11796880000170' });
    assert.equal(c.normal, path.join(BASE, '2026', '10 - Outubro', 'ACME - 11796880000170', 'Saida', 'NFS-e', `${NOTA.chave}.xml`));
    assert.equal(pastaOndeFicaAEmpresa(item, { base: BASE, modelo: 'mes' }), path.join(BASE, '2026', '10 - Outubro'));
    assert.equal(pastaOndeFicaAEmpresa(item, { base: BASE, modelo: 'empresa' }), BASE);
});

test('mês inválido vira Sem data, e a chave só aceita dígitos', () => {
    const c = caminhosDaNota({ ...NOTA, mes: '../..', chave: '..\\..\\123' }, { base: BASE, modelo: 'empresa', pastaEmpresa: 'X' });
    assert.equal(c.normal, path.join(BASE, 'X', 'Sem data', 'Entrada', 'NF-e', '123.xml'));
    assert.throws(() => nomeArquivo('abc'));
});

test('tipo ou lado desconhecido é recusado', () => {
    assert.throws(() => caminhosDaNota({ ...NOTA, tipo: 'mdfe' }, { base: BASE, modelo: 'empresa', pastaEmpresa: 'X' }));
    assert.throws(() => caminhosDaNota({ ...NOTA, lado: 'outra' }, { base: BASE, modelo: 'empresa', pastaEmpresa: 'X' }));
});

test('cancelada, substituída e denegada vão para Canceladas', () => {
    assert.equal(estaCancelada('cancelada'), true);
    assert.equal(estaCancelada('substituida'), true);
    assert.equal(estaCancelada('denegada'), true);
    assert.equal(estaCancelada('autorizada'), false);
});

const { nomeArquivoPorNumero, comChave } = require('../src/main/notas-caminhos');

test('nome pelo número: emitente entra quando não é a própria empresa', () => {
    const saida = { ...NOTA, lado: 'saida', numero: '123', serie: '1', emitente_doc: NOTA.documento, emitente_nome: 'ACME' };
    assert.equal(nomeArquivoPorNumero(saida), 'NF-e 000123 serie 1.xml');
    const entrada = { ...NOTA, numero: '4585', serie: '2', emitente_doc: '12345678000190', emitente_nome: 'FORNECEDOR/GO LTDA.' };
    assert.equal(nomeArquivoPorNumero(entrada), 'NF-e 004585 serie 2 - FORNECEDOR GO LTDA (12345678000190).xml');
    const nfse = { ...NOTA, tipo: 'nfse', numero: '1069', serie: null, emitente_doc: '10789478000104', emitente_nome: '' };
    assert.equal(nomeArquivoPorNumero(nfse), 'NFS-e 001069 - 10789478000104.xml');
});

test('nome pelo número: sem número cai na chave, e nada estranho entra no nome', () => {
    assert.equal(nomeArquivoPorNumero({ ...NOTA, numero: null }), `${NOTA.chave}.xml`);
    assert.equal(nomeArquivoPorNumero({ ...NOTA, numero: '../12', serie: '1/2', emitente_doc: NOTA.documento }), 'NF-e 000012 serie 12.xml');
});

test('comChave acrescenta a chave antes da extensão', () => {
    assert.equal(comChave(path.join(BASE, 'NF-e 000001.xml'), NOTA.chave), path.join(BASE, `NF-e 000001 (${NOTA.chave}).xml`));
});

test('caminhosDaNota no formato número guarda também o caminho pela chave', () => {
    const c = caminhosDaNota({ ...NOTA, numero: '7', serie: '1', emitente_doc: NOTA.documento },
        { base: BASE, modelo: 'empresa', pastaEmpresa: 'X', formato: 'numero' });
    assert.equal(path.basename(c.normal), 'NF-e 000007 serie 1.xml');
    assert.equal(path.basename(c.normalChave), `${NOTA.chave}.xml`);
});

const { pastasDoMes, nomePastaInscricao, acharPastaPorInscricao, ehPastaDeInscricao } = require('../src/main/notas-caminhos');

test('pastasDoMes: ano e mês pelo nome, com o número na frente para ordenar', () => {
    assert.deepEqual(pastasDoMes('2026-01'), ['2026', '01 - Janeiro']);
    assert.deepEqual(pastasDoMes('2026-03'), ['2026', '03 - Março']);
    assert.deepEqual(pastasDoMes('2026-12'), ['2026', '12 - Dezembro']);
    assert.deepEqual(pastasDoMes('2026-13'), ['Sem data']);
    assert.deepEqual(pastasDoMes('sem-data'), ['Sem data']);
});

test('pasta da inscrição: IE com nome da fazenda, Sem inscrição e A classificar', () => {
    assert.equal(nomePastaInscricao({ classe: 'inscricao', ie: '112366406', nome: 'FAZ. SANTA RITA' }), 'IE 112366406 - FAZ. SANTA RITA');
    assert.equal(nomePastaInscricao({ classe: 'inscricao', ie: '112366406', nome: null }), 'IE 112366406');
    assert.equal(nomePastaInscricao({ classe: 'sem_inscricao' }), 'Sem inscrição');
    assert.equal(nomePastaInscricao({ classe: 'a_classificar' }), 'A classificar');
    assert.equal(nomePastaInscricao(null), null);
});

test('pasta da inscrição é reconhecida pelo número da IE, mesmo com outro nome de fazenda', () => {
    const existentes = ['IE 112366406 - NOME ANTIGO', 'IE 1123664061 - OUTRA', 'Sem inscrição'];
    assert.equal(acharPastaPorInscricao(existentes, { classe: 'inscricao', ie: '112366406', nome: 'NOVO' }), 'IE 112366406 - NOME ANTIGO');
    assert.equal(acharPastaPorInscricao(existentes, { classe: 'inscricao', ie: '999' }), null);
    assert.equal(ehPastaDeInscricao('IE 112366406'), true);
    assert.equal(ehPastaDeInscricao('A classificar'), true);
    assert.equal(ehPastaDeInscricao('2026'), false);
});

test('com inscrição: empresa > inscrição > ano > mês (modelo empresa) e ano > mês > empresa > inscrição (modelo mês)', () => {
    const op = { base: BASE, pastaEmpresa: 'JOAO - 12345678900', pastaInscricao: 'IE 1 - FAZ' };
    assert.equal(caminhosDaNota(NOTA, { ...op, modelo: 'empresa' }).normal,
        path.join(BASE, 'JOAO - 12345678900', 'IE 1 - FAZ', '2026', '10 - Outubro', 'Entrada', 'NF-e', `${NOTA.chave}.xml`));
    assert.equal(caminhosDaNota(NOTA, { ...op, modelo: 'mes' }).normal,
        path.join(BASE, '2026', '10 - Outubro', 'JOAO - 12345678900', 'IE 1 - FAZ', 'Entrada', 'NF-e', `${NOTA.chave}.xml`));
});
