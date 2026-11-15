// Tela "Baixar notas". Usa o que o renderer.js deixa no escopo global ($, showToast,
// mostrarCaminho, isConnected, SPINNER, switchSection). A rede é do processo principal (notas.js).
//
// A configuração é do usuário logado: ligado/desligado e empresas ficam no servidor; pasta e
// modelo ficam neste computador. Nada é gravado até clicar em Salvar.

const ROTULOS_TIPO = { nfe: 'NF-e', nfce: 'NFC-e', cte: 'CT-e', nfse: 'NFS-e' };
const ROTULOS_LADO = { entrada: 'Entrada', saida: 'Saída' };
const EXEMPLO_MODELO = {
    empresa: 'Pasta › EMPRESA - documento › 2026-10 › Entrada › NF-e',
    mes: 'Pasta › 2026-10 › EMPRESA - documento › Entrada › NF-e',
};

const notas = {
    carregado: false,
    carregando: false,
    sujo: false,
    ativo: false,
    incluirNovas: false,
    pasta: '',
    modelo: 'empresa',
    empresas: [], // { documento, nome, tipos_permitidos, marcada, tipos, lados }
    busca: '',
    status: null,
};

function formatarDocumento(d) {
    const s = String(d || '');
    if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s;
}

function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function mostrarAvisoNotas(texto) {
    const aviso = $('notasAviso');
    aviso.textContent = texto || '';
    aviso.style.display = texto ? 'block' : 'none';
    $('notasConteudo').style.display = texto ? 'none' : 'block';
}

function marcarSujo() {
    notas.sujo = true;
    renderStatusNotas();
}

function renderStatusNotas() {
    const el = $('notasStatus');
    if (notas.sujo) { el.textContent = 'Há alterações não salvas.'; return; }
    const s = notas.status;
    if (!notas.ativo) { el.textContent = 'Desligado.'; return; }
    if (!s || s.estado === 'parado') { el.textContent = 'Ligado. A primeira busca acontece em instantes.'; return; }
    if (s.estado === 'sincronizando') { el.textContent = s.mensagem || 'Baixando…'; return; }
    const quando = s.ultima ? new Date(s.ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    el.textContent = [quando ? `Última busca: ${quando}` : '', s.mensagem].filter(Boolean).join(' · ');
}

function renderTopoNotas() {
    $('chkNotasAtivo').checked = notas.ativo;
    $('chkNotasNovas').checked = notas.incluirNovas;
    mostrarCaminho($('notasPasta'), notas.pasta);
    document.querySelectorAll('#notasModelo button').forEach(b => {
        b.classList.toggle('active', b.dataset.modelo === notas.modelo);
    });
    $('notasModeloExemplo').textContent = EXEMPLO_MODELO[notas.modelo];
    const marcadas = notas.empresas.filter(e => e.marcada).length;
    $('notasContagem').textContent = notas.empresas.length ? `${marcadas}/${notas.empresas.length}` : '';
}

function chipAlternavel(texto, ativo, habilitado, aoClicar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip chip-sm${ativo ? ' active' : ''}`;
    b.textContent = texto;
    b.disabled = !habilitado;
    b.addEventListener('click', aoClicar);
    return b;
}

function alternar(lista, valor) {
    return lista.includes(valor) ? lista.filter(v => v !== valor) : [...lista, valor];
}

function renderListaNotas() {
    const lista = $('notasLista');
    lista.textContent = '';
    if (!notas.empresas.length) {
        const vazio = document.createElement('div');
        vazio.className = 'empty';
        const forte = document.createElement('strong');
        forte.textContent = 'Nenhuma empresa no OneXml';
        const span = document.createElement('span');
        span.textContent = 'Ative os clientes na tela OneXml do OneChat para que apareçam aqui.';
        vazio.append(forte, span);
        lista.appendChild(vazio);
        return;
    }
    const termo = semAcento(notas.busca);
    const visiveis = notas.empresas.filter(e =>
        !termo || semAcento(e.nome).includes(termo) || e.documento.includes(termo.replace(/\D/g, '') || '\u0000'));
    for (const e of visiveis) {
        const linha = document.createElement('div');
        linha.className = `notas-linha${e.marcada ? '' : ' is-off'}`;

        const marca = document.createElement('label');
        marca.className = 'notas-marca';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = e.marcada;
        chk.addEventListener('change', () => { e.marcada = chk.checked; marcarSujo(); renderTopoNotas(); renderListaNotas(); });
        const nome = document.createElement('span');
        nome.className = 'notas-nome';
        const titulo = document.createElement('strong');
        titulo.textContent = e.nome;
        const doc = document.createElement('small');
        doc.textContent = formatarDocumento(e.documento);
        nome.append(titulo, doc);
        marca.append(chk, nome);

        const opcoes = document.createElement('div');
        opcoes.className = 'notas-opcoes';
        for (const t of e.tipos_permitidos) {
            opcoes.appendChild(chipAlternavel(ROTULOS_TIPO[t] || t, e.tipos.includes(t), e.marcada, () => {
                e.tipos = alternar(e.tipos, t); marcarSujo(); renderListaNotas();
            }));
        }
        const sep = document.createElement('span');
        sep.className = 'notas-sep';
        opcoes.appendChild(sep);
        for (const l of ['entrada', 'saida']) {
            opcoes.appendChild(chipAlternavel(ROTULOS_LADO[l], e.lados.includes(l), e.marcada, () => {
                e.lados = alternar(e.lados, l); marcarSujo(); renderListaNotas();
            }));
        }
        linha.append(marca, opcoes);
        lista.appendChild(linha);
    }
}

async function abrirTelaNotas(forcar = false) {
    if (!isConnected) { mostrarAvisoNotas('Entre na sua conta para configurar o download das notas.'); return; }
    if (notas.carregando || (notas.carregado && notas.sujo && !forcar)) return;
    notas.carregando = true;
    if (!notas.carregado) mostrarAvisoNotas('Carregando…');
    try {
        const r = await window.electronAPI.notasConfig();
        if (!r.ok) { mostrarAvisoNotas(r.erro || 'Não foi possível carregar.'); return; }
        const d = r.dados;
        notas.ativo = !!d.ativo;
        notas.incluirNovas = !!d.incluir_novas;
        notas.pasta = d.pasta || '';
        notas.modelo = d.modelo || 'empresa';
        notas.empresas = (d.empresas || []).map(e => ({ ...e, tipos: [...e.tipos], lados: [...e.lados] }));
        notas.status = d.status || null;
        notas.sujo = false;
        notas.carregado = true;
        mostrarAvisoNotas('');
        renderTopoNotas();
        renderListaNotas();
        renderStatusNotas();
    } finally {
        notas.carregando = false;
    }
}

async function salvarNotas() {
    const marcadas = notas.empresas.filter(e => e.marcada);
    if (notas.ativo && !notas.pasta) { showToast('Escolha a pasta antes de ligar.', 'warning'); return; }
    if (notas.ativo && !marcadas.length && !notas.incluirNovas) {
        showToast('Marque ao menos uma empresa.', 'warning'); return;
    }
    const incompleta = marcadas.find(e => !e.tipos.length || !e.lados.length);
    if (incompleta) { showToast(`${incompleta.nome}: escolha ao menos um tipo e um lado.`, 'warning', 5000); return; }

    const btn = $('btnNotasSalvar');
    btn.disabled = true;
    btn.innerHTML = `${SPINNER} Salvando...`;
    try {
        const r = await window.electronAPI.notasSalvar({
            ativo: notas.ativo,
            incluir_novas: notas.incluirNovas,
            pasta: notas.pasta,
            modelo: notas.modelo,
            empresas: marcadas.map(e => ({ documento: e.documento, tipos: e.tipos, lados: e.lados })),
        });
        if (!r.ok) { showToast(r.erro || 'Não foi possível salvar.', 'error', 6000); return; }
        notas.sujo = false;
        showToast(notas.ativo ? 'Salvo. O download começa em instantes.' : 'Salvo. O download está desligado.', 'success');
        renderStatusNotas();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

$('chkNotasAtivo').addEventListener('change', (e) => { notas.ativo = e.target.checked; marcarSujo(); });
$('chkNotasNovas').addEventListener('change', (e) => { notas.incluirNovas = e.target.checked; marcarSujo(); });
$('btnNotasPasta').addEventListener('click', async () => {
    const f = await window.electronAPI.selectFolder();
    if (f) { notas.pasta = f; mostrarCaminho($('notasPasta'), f); marcarSujo(); }
});
document.querySelectorAll('#notasModelo button').forEach(b => b.addEventListener('click', () => {
    notas.modelo = b.dataset.modelo; marcarSujo(); renderTopoNotas();
}));
$('notasBusca').addEventListener('input', (e) => { notas.busca = e.target.value; renderListaNotas(); });
$('btnNotasMarcarTodas').addEventListener('click', () => {
    notas.empresas.forEach(e => { e.marcada = true; }); marcarSujo(); renderTopoNotas(); renderListaNotas();
});
$('btnNotasDesmarcarTodas').addEventListener('click', () => {
    notas.empresas.forEach(e => { e.marcada = false; }); marcarSujo(); renderTopoNotas(); renderListaNotas();
});
$('btnNotasSalvar').addEventListener('click', salvarNotas);
$('btnNotasSincronizar').addEventListener('click', async () => {
    if (notas.sujo) { showToast('Salve as alterações antes.', 'warning'); return; }
    if (!notas.ativo) { showToast('Ligue o download e salve antes.', 'warning'); return; }
    await window.electronAPI.notasSincronizar();
    showToast('Procurando notas novas…', 'info');
});
$('btnNotasAbrirPasta').addEventListener('click', async () => {
    if (!(await window.electronAPI.notasAbrirPasta())) showToast('Escolha e salve a pasta primeiro.', 'warning');
});

window.electronAPI.onNotasStatus((s) => {
    notas.status = s;
    if (notas.carregado) renderStatusNotas();
});
