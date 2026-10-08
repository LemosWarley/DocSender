// Sessão com o Supabase: login, renovação do token, re-login silencioso e
// reconexão automática quando o app abre sem rede.

const { ipcMain } = require('electron');
const axios = require('axios');
const { API_BASE_URL, API_KEY } = require('./config');
const { store, salvarSegredo, lerSegredo } = require('./armazenamento');
const { sendToRenderer } = require('./ui');

const AUTH_TIMEOUT_MS = 20000;

let currentAccessToken = null;
let currentRefreshToken = null;
let tokenExpiresAt = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function aplicarTokens(data) {
    currentAccessToken = data.access_token;
    currentRefreshToken = data.refresh_token;
    tokenExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
    // O refresh token é a credencial mais sensível (sessão de longa duração).
    salvarSegredo('saved_refresh_token', currentRefreshToken);
    reconnectRequested = false;
}

function postToken(grantType, body) {
    return axios.post(`${API_BASE_URL}/auth/v1/token?grant_type=${grantType}`, body, {
        headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }, timeout: AUTH_TIMEOUT_MS
    });
}

// Resposta do servidor de autenticação que não diz nada sobre a credencial.
function falhaDeRede(error) {
    const status = error.response?.status;
    return !error.response || status === 429 || status >= 500;
}

function temSessaoSalva() {
    return !!(currentRefreshToken || store().get('saved_refresh_token') || store().get('saved_password'));
}

let refreshPromise = null; // Single-flight: evita renovações concorrentes (race de rotação)

// Sem esta trava o loop de 5 min reemitiria 'force-reconnect' (e o erro no log)
// a cada ciclo enquanto o usuário não voltasse a logar.
let reconnectRequested = false;
function requestReconnect() {
    if (reconnectRequested) return;
    reconnectRequested = true;
    sendToRenderer('force-reconnect');
}

// Executa a renovação real com retry e backoff. Não deve ser chamada diretamente.
// Lança erro marcado com `authFatal` (refresh token morto) ou `networkDown`
// (servidor inalcançável) — quem chama precisa reagir de forma diferente a cada um.
async function doRefresh() {
    const refreshToken = currentRefreshToken || lerSegredo('saved_refresh_token');
    if (!refreshToken) {
        const err = new Error("Sessão expirada. Reconecte.");
        err.authFatal = true;
        throw err;
    }
    currentRefreshToken = refreshToken;

    const backoff = [2000, 5000, 10000]; // 3 tentativas
    let lastError = null;

    for (let attempt = 0; attempt < backoff.length; attempt++) {
        try {
            const res = await postToken('refresh_token', { refresh_token: currentRefreshToken });
            aplicarTokens(res.data);
            return currentAccessToken;
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            // 400/401 = refresh token inválido/rotacionado -> retry não adianta, aborta já.
            if (status === 400 || status === 401) {
                const err = new Error("Sessão expirada. Reconecte.");
                err.authFatal = true;
                err.cause = error;
                throw err;
            }
            // Erros transitórios (rede/5xx): espera e tenta de novo.
            if (attempt < backoff.length - 1) await sleep(backoff[attempt]);
        }
    }

    // Só chega aqui por rede/5xx: o refresh token provavelmente continua bom.
    const err = new Error("Não foi possível falar com o servidor de autenticação.");
    err.networkDown = true;
    err.cause = lastError;
    throw err;
}

// Garante um token válido, reutilizando uma renovação em andamento (single-flight).
async function ensureValidToken() {
    const now = Math.floor(Date.now() / 1000);
    if (currentAccessToken && (tokenExpiresAt - now) > 300) return currentAccessToken;

    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    return refreshPromise;
}

// Descarta o token em memória para forçar uma renovação na próxima chamada.
function invalidarToken() {
    currentAccessToken = null;
    tokenExpiresAt = 0;
}

// Lê o e-mail do payload do JWT (o Supabase inclui `email`). Serve só para
// exibir na interface ao retomar a sessão — quem valida o token é o servidor.
function getEmail() {
    if (currentAccessToken) {
        try {
            const payload = currentAccessToken.split('.')[1];
            const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            const email = JSON.parse(json).email;
            if (email) return email;
        } catch (e) { /* cai no e-mail salvo */ }
    }
    return store().get('saved_email', '');
}

// Tenta re-logar silenciosamente com as credenciais salvas (a senha é guardada criptografada).
// Última linha de defesa antes de pedir reconexão manual ao usuário.
// Retorna { ok, reason }: 'network' quando o servidor não respondeu (a senha pode
// estar correta), 'auth' quando o servidor recusou ou não há credencial salva.
async function attemptSilentRelogin() {
    const email = store().get('saved_email', '');
    const password = lerSegredo('saved_password');
    if (!email || !password) return { ok: false, reason: 'auth' };

    try {
        const res = await postToken('password', { email, password });
        aplicarTokens(res.data);
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: falhaDeRede(e) ? 'network' : 'auth' };
    }
}

// Recupera a sessão: renova o token e, se falhar, tenta re-login silencioso.
// Retorna { ok, reason }. Só 'auth' significa sessão realmente perdida —
// 'network' é temporário e NÃO deve deslogar o usuário.
async function recoverSession() {
    try {
        await ensureValidToken();
        return { ok: true };
    } catch (e) {
        // Servidor inalcançável: não dá para afirmar que a sessão morreu.
        if (e.networkDown) return { ok: false, reason: 'network' };
        return await attemptSilentRelogin();
    }
}

// Revalida a sessão e avisa o renderer. Chamada pelo loop periódico e ao
// acordar da suspensão.
async function checkSession() {
    if (!temSessaoSalva()) return;
    const rec = await recoverSession();
    if (rec.ok) {
        sendToRenderer('session-status', { connected: true, email: getEmail() });
    } else if (rec.reason === 'network') {
        // Rede fora não é sessão perdida: segue conectado e tenta no próximo ciclo.
        sendToRenderer('session-status', { connected: true, offline: true });
    } else {
        requestReconnect();
    }
}

let tokenRefreshInterval = null;
function iniciarVerificacaoPeriodica() {
    if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = setInterval(checkSession, 5 * 60 * 1000); // Checa a cada 5 minutos
}

// --- Conexão automática na abertura ---
// Ao iniciar com o Windows, o app costuma abrir antes da rede. Antes, o login
// falhava uma vez e o monitoramento só começava quando alguém abria a janela.
const RECONEXAO_MS = [10 * 1000, 20 * 1000, 40 * 1000, 60 * 1000, 2 * 60 * 1000];
let reconexaoTimer = null;
let reconexaoTentativa = 0;

function cancelarReconexao() {
    if (reconexaoTimer) { clearTimeout(reconexaoTimer); reconexaoTimer = null; }
    reconexaoTentativa = 0;
}

function agendarReconexao() {
    if (reconexaoTimer) return;
    const atraso = RECONEXAO_MS[Math.min(reconexaoTentativa, RECONEXAO_MS.length - 1)];
    reconexaoTentativa++;
    reconexaoTimer = setTimeout(async () => {
        reconexaoTimer = null;
        const rec = await recoverSession();
        if (rec.ok) {
            reconexaoTentativa = 0;
            sendToRenderer('session-status', { connected: true, email: getEmail() });
        } else if (rec.reason === 'network') {
            agendarReconexao();
        } else {
            reconexaoTentativa = 0;
            requestReconnect();
        }
    }, atraso);
}

async function conectarAutomaticamente() {
    if (!temSessaoSalva()) return { success: false, reason: 'auth' };
    const rec = await recoverSession();
    if (rec.ok) return { success: true, email: getEmail() };
    if (rec.reason === 'network') agendarReconexao();
    return { success: false, reason: rec.reason };
}

// --- Login manual ---

function mensagemDeLogin(error) {
    if (falhaDeRede(error)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    const desc = error.response?.data?.error_description || error.response?.data?.msg || '';
    if (/invalid login credentials/i.test(desc)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(desc)) return "E-mail ainda não confirmado.";
    return desc || "Erro de login";
}

async function login({ email, password, lembrar }) {
    try {
        const res = await postToken('password', { email, password });
        aplicarTokens(res.data);
        cancelarReconexao();
    } catch (error) {
        return { success: false, error: mensagemDeLogin(error) };
    }

    // "Lembrar de mim" desmarcado: esquece apenas a senha guardada. O refresh
    // token É a sessão — apagá-lo aqui derrubaria o login que acabou de ser feito.
    store().set('saved_email', email);
    let aviso = null;
    if (lembrar) {
        if (!salvarSegredo('saved_password', password)) {
            store().delete('saved_password');
            aviso = 'A criptografia do Windows não está disponível nesta máquina, então a senha não foi lembrada.';
        }
    } else {
        store().delete('saved_password');
    }
    return { success: true, email, aviso };
}

// Logout explícito: derruba tudo, inclusive a sessão em memória.
function limparSessao() {
    cancelarReconexao();
    store().delete('saved_email'); store().delete('saved_password');
    store().delete('saved_refresh_token'); store().delete('refresh_token_encrypted');
    currentAccessToken = null; currentRefreshToken = null; tokenExpiresAt = 0;
}

function registrarIpc() {
    ipcMain.handle('login', (e, credenciais) => login(credenciais));
    ipcMain.handle('auto-connect', () => conectarAutomaticamente());
    ipcMain.handle('clear-credentials', () => { limparSessao(); return true; });
}

module.exports = {
    registrarIpc,
    ensureValidToken,
    recoverSession,
    invalidarToken,
    checkSession,
    requestReconnect,
    iniciarVerificacaoPeriodica,
    getEmail,
};
