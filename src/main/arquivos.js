// Operações de arquivo usadas pela fila de envio. Sem dependência do Electron,
// para poderem ser testadas com `node --test`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Move um arquivo com fallback para cópia+remoção quando origem e destino
// estão em drives diferentes (rename lança EXDEV nesse caso). Assíncrono: a
// cópia para um backup na rede travava a janela pelo tempo da transferência.
async function moveFile(src, destDir, fileName) {
    await fs.promises.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, fileName);
    try {
        await fs.promises.rename(src, dest);
    } catch (err) {
        if (err.code === 'EXDEV') {
            await fs.promises.copyFile(src, dest);
            await fs.promises.unlink(src);
        } else {
            throw err;
        }
    }
    return dest;
}

// Valida se o arquivo é realmente um PDF (magic bytes "%PDF") e cabe no limite.
// Assíncrono: em pasta de rede, cada acesso síncrono travava a janela.
async function isValidPdf(filePath, maxBytes) {
    let fd = null;
    try {
        const stat = await fs.promises.stat(filePath);
        if (stat.size === 0 || stat.size > maxBytes) return false;
        fd = await fs.promises.open(filePath, 'r');
        const buf = Buffer.alloc(4);
        await fd.read(buf, 0, 4, 0);
        return buf.toString('latin1') === '%PDF';
    } catch (e) {
        return false;
    } finally {
        if (fd) await fd.close().catch(() => {});
    }
}

async function existe(caminho) {
    try {
        await fs.promises.access(caminho);
        return true;
    } catch (e) {
        return false;
    }
}

// SHA-256 do conteúdo, lido em streaming: um PDF de 50 MB lido de uma vez
// travava o processo principal (e com ele a janela).
function hashArquivo(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(filePath)
            .on('error', reject)
            .on('data', (chunk) => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')));
    });
}

// Ao mover um arquivo, o app prefixa o horário (`1728390000000_`) para não
// sobrescrever outro de mesmo nome. Antes, cada passagem pela pasta de erro
// acrescentava mais um prefixo, e o nome poluído chegava ao painel.
const CARIMBO_RE = /^(\d{13}_)+/;

function nomeOriginal(fileName) {
    return fileName.replace(CARIMBO_RE, '') || fileName;
}

function nomeComCarimbo(fileName, agora = Date.now()) {
    return `${agora}_${nomeOriginal(fileName)}`;
}

// Impede path traversal: `alvo` precisa estar dentro de `pasta`.
function estaDentroDe(pasta, alvo) {
    return path.resolve(alvo).startsWith(path.resolve(pasta) + path.sep);
}

// PDFs de uma pasta, do mais recente para o mais antigo.
async function listarPdfs(dir) {
    if (!dir) return [];
    try {
        const nomes = (await fs.promises.readdir(dir)).filter(f => f.toLowerCase().endsWith('.pdf'));
        const itens = await Promise.all(nomes.map(async (f) => {
            const st = await fs.promises.stat(path.join(dir, f));
            return { name: f, nomeOriginal: nomeOriginal(f), size: st.size, mtime: st.mtimeMs };
        }));
        return itens.sort((a, b) => b.mtime - a.mtime);
    } catch (e) {
        return []; // pasta ainda não criada ou inacessível
    }
}

// Executa `fn` para cada item com no máximo `limite` em andamento ao mesmo
// tempo, preservando a ordem dos resultados. Em pasta de rede, ler arquivos em
// paralelo é ~13x mais rápido que um por um (cada leitura espera a rede).
async function emParalelo(itens, limite, fn) {
    const resultados = new Array(itens.length);
    let proximo = 0;
    async function trabalhador() {
        while (proximo < itens.length) {
            const i = proximo++;
            resultados[i] = await fn(itens[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
    return resultados;
}

module.exports = { moveFile, isValidPdf, existe, hashArquivo, nomeOriginal, nomeComCarimbo, estaDentroDe, listarPdfs, emParalelo };
