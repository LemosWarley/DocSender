const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { nomeOriginal, nomeComCarimbo, estaDentroDe, isValidPdf, hashArquivo, moveFile, listarPdfs } = require('../src/main/arquivos');

test('o nome enviado ao servidor perde todos os prefixos de horário', () => {
    assert.equal(nomeOriginal('DAS março.pdf'), 'DAS março.pdf');
    assert.equal(nomeOriginal('1728390000000_DAS.pdf'), 'DAS.pdf');
    assert.equal(nomeOriginal('1728390000000_1728390099999_DAS.pdf'), 'DAS.pdf');
    // Número que faz parte do nome real fica.
    assert.equal(nomeOriginal('2026_DAS.pdf'), '2026_DAS.pdf');
});

test('passar várias vezes pela pasta de erro não acumula prefixo', () => {
    const uma = nomeComCarimbo('DAS.pdf', 1728390000000);
    const duas = nomeComCarimbo(uma, 1728390099999);
    assert.equal(duas, '1728390099999_DAS.pdf');
});

test('bloqueia caminho fora da pasta', () => {
    assert.equal(estaDentroDe('C:\\envio\\_Erros_Envio', 'C:\\envio\\_Erros_Envio\\a.pdf'), true);
    assert.equal(estaDentroDe('C:\\envio\\_Erros_Envio', 'C:\\envio\\_Erros_Envio\\..\\..\\b.pdf'), false);
});

test('validação, hash em streaming, mover e listar', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsender-'));
    try {
        const pdf = path.join(dir, 'a.pdf');
        const conteudo = Buffer.from('%PDF-1.4 teste');
        fs.writeFileSync(pdf, conteudo);
        fs.writeFileSync(path.join(dir, 'falso.pdf'), 'não é pdf');

        assert.equal(isValidPdf(pdf, 1024), true);
        assert.equal(isValidPdf(path.join(dir, 'falso.pdf'), 1024), false);
        assert.equal(isValidPdf(pdf, 4), false); // acima do limite

        const esperado = crypto.createHash('sha256').update(conteudo).digest('hex');
        assert.equal(await hashArquivo(pdf), esperado);

        const destino = moveFile(pdf, path.join(dir, '_Pendentes'), nomeComCarimbo('a.pdf', 1728390000000));
        assert.equal(fs.existsSync(destino), true);
        assert.equal(fs.existsSync(pdf), false);

        const lista = listarPdfs(path.join(dir, '_Pendentes'));
        assert.equal(lista.length, 1);
        assert.equal(lista[0].nomeOriginal, 'a.pdf');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
