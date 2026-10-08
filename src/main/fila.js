// Fila de envio com concorrência limitada, reagendamento e pausa global.
// Não sabe nada de PDF nem de servidor: recebe a função `processar` pronta.
// Sem Electron, coberta por test/fila.test.js.

function criarFila({ processar, maxConcorrentes = 2, agora = () => Date.now(), esperaMinimaMs = 1000 }) {
    let fila = [];
    let ativos = 0;
    let timer = null;
    let bloqueadaAte = 0;
    // Cada limpeza abre uma nova geração. Um job que estava em andamento quando
    // o monitoramento parou não volta para a fila ao falhar depois.
    let geracao = 0;
    const emAndamento = new Set();

    function contem(filePath) {
        return emAndamento.has(filePath) || fila.some(j => j.filePath === filePath);
    }

    function adicionar(job) {
        // O chokidar pode reemitir o mesmo caminho; não duplica na fila nem
        // concorre com um envio já em andamento do mesmo arquivo.
        if (contem(job.filePath)) return false;
        fila.push({ attempt: 0, netAttempt: 0, ...job, nextAttemptAt: agora(), geracao });
        bombear();
        return true;
    }

    function limpar() {
        fila = [];
        geracao++;
        if (timer) { clearTimeout(timer); timer = null; }
    }

    // Recoloca um job que falhou. Não religa a fila: quem faz isso é o `finally`
    // do job atual, já com a contabilidade de ativos correta.
    function reagendar(job, atrasoMs) {
        if (job.geracao !== geracao) return false;
        job.nextAttemptAt = agora() + atrasoMs;
        fila.push(job);
        return true;
    }

    // Nenhum job novo começa antes de `ts` (usado quando a rede cai).
    function bloquearAte(ts) {
        bloqueadaAte = Math.max(bloqueadaAte, ts);
    }

    function desbloquear() {
        bloqueadaAte = 0;
        for (const j of fila) j.nextAttemptAt = Math.min(j.nextAttemptAt, agora());
        bombear();
    }

    function bombear() {
        if (timer) { clearTimeout(timer); timer = null; }

        if (agora() >= bloqueadaAte) {
            while (ativos < maxConcorrentes) {
                const t = agora();
                const idx = fila.findIndex(j => j.nextAttemptAt <= t);
                if (idx === -1) break;
                const [job] = fila.splice(idx, 1);
                ativos++;
                emAndamento.add(job.filePath);
                Promise.resolve()
                    .then(() => processar(job))
                    .catch(() => {})
                    .finally(() => {
                        ativos--;
                        emAndamento.delete(job.filePath);
                        bombear();
                    });
            }
        }

        // Reagenda o próximo despertar para o job pendente mais próximo.
        if (fila.length > 0) {
            const proximo = Math.max(bloqueadaAte, Math.min(...fila.map(j => j.nextAttemptAt)));
            timer = setTimeout(bombear, Math.max(esperaMinimaMs, proximo - agora()));
        }
    }

    return {
        adicionar,
        limpar,
        reagendar,
        bloquearAte,
        desbloquear,
        bombear,
        contem,
        get tamanho() { return fila.length + ativos; },
    };
}

module.exports = { criarFila };
