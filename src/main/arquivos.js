// Operações de arquivo usadas pela fila de envio. Sem dependência do Electron,
// para poderem ser testadas com `node --test`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Move um arquivo com fallback para cópia+remoção quando origem e destino
// estão em drives diferentes (rename lança EXDEV nesse caso).
function moveFile(src, destDir, fileName) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, fileName);
    try {
        fs.renameSync(src, dest);
    } catch (err) {
        if (err.code === 'EXDEV') {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
        } else {
            throw err;
        }
    }
    return dest;
}

// Valida se o arquivo é realmente um PDF (magic bytes "%PDF") e cabe no limite.
function isValidPdf(filePath, maxBytes) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size === 0 || stat.size > maxBytes) return false;
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        return buf.toString('latin1') === '%PDF';
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
function listarPdfs(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    try {
        return fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.pdf'))
            .map(f => {
                const st = fs.statSync(path.join(dir, f));
                return { name: f, nomeOriginal: nomeOriginal(f), size: st.size, mtime: st.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);
    } catch (e) {
        return [];
    }
}

module.exports = { moveFile, isValidPdf, hashArquivo, nomeOriginal, nomeComCarimbo, estaDentroDe, listarPdfs };
