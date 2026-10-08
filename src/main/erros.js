// Classificação de falhas e leitura das respostas das Edge Functions.
// Lógica pura, sem Electron, coberta por test/erros.test.js.

// Extrai o texto de erro do corpo da resposta (as Edge Functions devolvem
// { success: false, error: "..." }).
function responseErrorText(error) {
    const data = error?.response?.data;
    if (!data) return '';
    if (typeof data === 'string') return data;
    return String(data.error || data.message || JSON.stringify(data));
}

// Mensagens que o servidor devolve quando o JWT não vale mais. As Edge Functions
// antigas respondiam 400 nesses casos (caíam no catch genérico); as novas
// respondem 401. Reconhecemos as duas formas para o app continuar funcionando
// mesmo contra um servidor ainda não atualizado.
const AUTH_ERROR_PATTERNS = [
    'token inválido', 'token invalido',
    'autenticação necessária', 'autenticacao necessaria',
    'jwt expired', 'invalid jwt', 'invalid claim', 'bad_jwt',
    'sessão expirada', 'sessao expirada'
];

function looksLikeAuthMessage(text) {
    const t = String(text || '').toLowerCase();
    return AUTH_ERROR_PATTERNS.some(p => t.includes(p));
}

// Classifica uma falha em:
//   'auth'      -> credencial inválida: renovar sessão e reenviar
//   'network'   -> sem resposta (rede, DNS, timeout): pausar a fila até a rede voltar
//   'server'    -> 5xx/429: tentar de novo mais tarde, com limite de tentativas
//   'permanent' -> erro de dados/cadastro: reenviar não resolve
function classifyFailure(error) {
    if (error.authFatal) return 'auth';
    // Sem `response` = rede, DNS, timeout ou socket fechado. A sessão pode estar
    // perfeitamente válida — nunca tratamos isso como sessão perdida.
    if (error.networkDown || !error.response) return 'network';

    const status = error.response.status;
    const codigo = error.response.data?.codigo;
    if (status === 401 || codigo === 'AUTH_EXPIRADA') return 'auth';
    if (status === 429 || status >= 500) return 'server';
    if ((status === 400 || status === 403) && looksLikeAuthMessage(responseErrorText(error))) return 'auth';
    return 'permanent';
}

function describeError(error) {
    const detail = responseErrorText(error);
    return detail ? `${error.message} - ${detail}` : error.message;
}

// O documentos-processar responde HTTP 200 mesmo quando nada saiu (WhatsApp
// desconectado, nenhum canal ligado no cadastro): o resultado está em `success`.
// Ignorar esse campo fazia o app mostrar "Enviado" para documento não enviado.
function resumoProcessar(data) {
    const d = data || {};
    const results = Array.isArray(d.results) ? d.results : [];
    const falhas = results.filter(r => r && r.status === 'erro');
    const protocolo = d.protocolo || null;

    if (d.success === false) {
        const motivo = d.error
            || (falhas.length ? falhas.map(f => `${f.contato} (${f.metodo}): ${f.erro}`).join('; ') : '')
            || 'o servidor não confirmou o envio';
        return { ok: false, motivo, protocolo };
    }

    return {
        ok: true,
        protocolo,
        idempotente: !!d.idempotente,
        parcial: falhas.length > 0,
        falhas: falhas.map(f => `${f.contato} (${f.metodo})`),
    };
}

// Por que o documentos-upload não casou o documento com um cliente cadastrado.
function motivoPendencia(uploadData) {
    const d = uploadData || {};
    const ident = d.cnpj_identificado;
    if (d.multiplas_filiais) return `várias filiais com o identificador ${ident} — escolha a empresa no painel do OneChat`;
    if (!ident) return 'não foi possível identificar o CPF/CNPJ no documento';
    return `cliente ${ident} não está cadastrado no OneChat`;
}

module.exports = {
    responseErrorText,
    looksLikeAuthMessage,
    classifyFailure,
    describeError,
    resumoProcessar,
    motivoPendencia,
};
