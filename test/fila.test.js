const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarFila } = require('../src/main/fila');

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

test('não duplica o mesmo arquivo na fila nem durante o envio', async () => {
    const processados = [];
    const fila = criarFila({ processar: async (job) => { processados.push(job.filePath); await esperar(20); } });
    assert.equal(fila.adicionar({ filePath: 'a.pdf' }), true);
    assert.equal(fila.adicionar({ filePath: 'a.pdf' }), false);
    await esperar(5);
    assert.equal(fila.adicionar({ filePath: 'a.pdf' }), false); // em andamento
    await esperar(40);
    assert.deepEqual(processados, ['a.pdf']);
});

test('respeita o limite de envios simultâneos', async () => {
    let ativos = 0, pico = 0;
    const fila = criarFila({
        maxConcorrentes: 2,
        processar: async () => { ativos++; pico = Math.max(pico, ativos); await esperar(20); ativos--; },
    });
    for (let i = 0; i < 5; i++) fila.adicionar({ filePath: `${i}.pdf` });
    await esperar(150);
    assert.equal(pico, 2);
    assert.equal(fila.tamanho, 0);
});

test('reagenda um job que falhou e processa de novo', async () => {
    let chamadas = 0;
    const fila = criarFila({
        esperaMinimaMs: 5,
        processar: async (job) => { chamadas++; if (chamadas === 1) fila.reagendar(job, 10); },
    });
    fila.adicionar({ filePath: 'a.pdf' });
    await esperar(80);
    assert.equal(chamadas, 2);
});

test('fila bloqueada (sem rede) não começa envio novo até desbloquear', async () => {
    const processados = [];
    const fila = criarFila({ esperaMinimaMs: 5, processar: async (job) => { processados.push(job.filePath); } });
    fila.bloquearAte(Date.now() + 60 * 1000);
    fila.adicionar({ filePath: 'a.pdf' });
    await esperar(30);
    assert.deepEqual(processados, []);
    fila.desbloquear();
    await esperar(30);
    assert.deepEqual(processados, ['a.pdf']);
});

test('job em andamento quando a fila foi limpa não volta para ela', async () => {
    let chamadas = 0;
    let reagendou = null;
    const fila = criarFila({
        esperaMinimaMs: 5,
        processar: async (job) => { chamadas++; await esperar(20); reagendou = fila.reagendar(job, 0); },
    });
    fila.adicionar({ filePath: 'a.pdf' });
    await esperar(5);
    fila.limpar(); // monitoramento parado no meio do envio
    await esperar(60);
    assert.equal(reagendou, false);
    assert.equal(chamadas, 1);
});
