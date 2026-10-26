// Detecta se um caminho fica numa pasta de rede.
//
// Em pasta de rede o fs.watch do Windows falha em loop (erro UNKNOWN), e cada
// falha trava o processo principal por até 4 s — medido em 2026-10-08 numa
// unidade mapeada (Z: -> \\Bc\...), com 89 erros em 20 s. Por isso, pasta de
// rede é sempre verificada por varredura periódica, nunca por fs.watch.

const { execFile } = require('child_process');

const cache = new Map();

function ehCaminhoUnc(caminho) {
    return caminho.startsWith('\\\\') || caminho.startsWith('//');
}

// Unidade mapeada (Z:) só se descobre perguntando ao Windows: DriveType 4 = rede.
function tipoDaUnidade(letra) {
    return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
            `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${letra}:'").DriveType`],
        { timeout: 15000, windowsHide: true },
        (error, stdout) => resolve(error ? null : String(stdout).trim()));
    });
}

function ehPastaDeRede(caminho) {
    if (!caminho) return Promise.resolve(false);
    if (ehCaminhoUnc(caminho)) return Promise.resolve(true);
    const m = /^([A-Za-z]):/.exec(caminho);
    if (!m) return Promise.resolve(false);
    const letra = m[1].toUpperCase(); // só A-Z: seguro para o filtro do PowerShell
    if (!cache.has(letra)) cache.set(letra, tipoDaUnidade(letra).then(t => t === '4'));
    return cache.get(letra);
}

module.exports = { ehPastaDeRede, ehCaminhoUnc };
