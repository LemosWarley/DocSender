// Configurações em disco (electron-store) e segredos criptografados com safeStorage.

const { safeStorage } = require('electron');
const Store = require('electron-store');

// Criado na primeira chamada: o main.js pode trocar a pasta de dados
// (perfil de teste) antes de qualquer leitura.
let _store = null;
function store() {
    if (!_store) _store = new Store();
    return _store;
}

function criptografiaDisponivel() {
    return safeStorage.isEncryptionAvailable();
}

// Segredo (senha, refresh token) só vai para o disco criptografado. Sem
// safeStorage, não grava: o arquivo de configuração é legível por qualquer
// programa do usuário, e uma senha de certificado ali permite assinar em nome
// do cliente. Retorna false quando não foi possível guardar.
function salvarSegredo(chave, valor) {
    if (!valor || !criptografiaDisponivel()) return false;
    store().set(chave, safeStorage.encryptString(valor).toString('base64'));
    return true;
}

function lerSegredo(chave) {
    const raw = store().get(chave);
    if (!raw || !criptografiaDisponivel()) return '';
    try {
        return safeStorage.decryptString(Buffer.from(raw, 'base64'));
    } catch (e) {
        return ''; // Não foi possível descriptografar (ex: perfil/máquina mudou)
    }
}

// Mapa { chave: segredo } criptografado valor a valor.
function salvarMapaSegredos(chave, mapa) {
    if (!criptografiaDisponivel()) return false;
    const cifrado = {};
    for (const k in mapa) cifrado[k] = safeStorage.encryptString(mapa[k]).toString('base64');
    store().set(chave, cifrado);
    return true;
}

function lerMapaSegredos(chave) {
    const cifrado = store().get(chave, {});
    const mapa = {};
    if (!criptografiaDisponivel()) return mapa;
    for (const k in cifrado) {
        try {
            mapa[k] = safeStorage.decryptString(Buffer.from(cifrado[k], 'base64'));
        } catch (e) { /* senha ilegível: o certificado volta a aparecer bloqueado */ }
    }
    return mapa;
}

module.exports = { store, criptografiaDisponivel, salvarSegredo, lerSegredo, salvarMapaSegredos, lerMapaSegredos };
