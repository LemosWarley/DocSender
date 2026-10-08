const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyFailure, resumoProcessar, motivoPendencia } = require('../src/main/erros');

const resp = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

test('sem resposta do servidor é queda de rede, nunca sessão perdida', () => {
    assert.equal(classifyFailure(new Error('ECONNRESET')), 'network');
    assert.equal(classifyFailure(Object.assign(new Error('x'), { networkDown: true })), 'network');
});

test('5xx e 429 são erro do servidor', () => {
    assert.equal(classifyFailure(resp(503)), 'server');
    assert.equal(classifyFailure(resp(500)), 'server');
    assert.equal(classifyFailure(resp(429)), 'server');
});

test('credencial inválida: 401, código estável ou mensagem antiga com 400', () => {
    assert.equal(classifyFailure(resp(401)), 'auth');
    assert.equal(classifyFailure(resp(400, { codigo: 'AUTH_EXPIRADA' })), 'auth');
    assert.equal(classifyFailure(resp(400, { error: 'Token inválido' })), 'auth');
    assert.equal(classifyFailure(Object.assign(new Error('x'), { authFatal: true })), 'auth');
});

test('erro de dados é definitivo', () => {
    assert.equal(classifyFailure(resp(400, { error: 'Nenhum contato cadastrado para esta empresa' })), 'permanent');
});

test('processar com HTTP 200 e success:false NÃO é envio', () => {
    const r = resumoProcessar({ success: false, error: 'Nenhum canal de envio habilitado', results: [] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /Nenhum canal/);
});

test('processar sem `error` monta o motivo pelos contatos que falharam', () => {
    const r = resumoProcessar({
        success: false, protocolo: 'P1',
        results: [{ contato: 'Ana', metodo: 'whatsapp', status: 'erro', erro: 'WhatsApp não configurado' }],
    });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'Ana (whatsapp): WhatsApp não configurado');
});

test('sucesso parcial lista quem não recebeu', () => {
    const r = resumoProcessar({
        success: true, protocolo: 'P2',
        results: [
            { contato: 'Ana', metodo: 'whatsapp', status: 'enviado' },
            { contato: 'Bruno', metodo: 'whatsapp', status: 'erro', erro: 'timeout' },
        ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.parcial, true);
    assert.deepEqual(r.falhas, ['Bruno (whatsapp)']);
});

test('repetição idempotente é sucesso', () => {
    const r = resumoProcessar({ success: true, protocolo: 'P3', results: [], idempotente: true });
    assert.equal(r.ok, true);
    assert.equal(r.idempotente, true);
    assert.equal(r.parcial, false);
});

test('motivo da pendência', () => {
    assert.match(motivoPendencia({ cnpj_identificado: null }), /não foi possível identificar/);
    assert.match(motivoPendencia({ cnpj_identificado: '12.345.678/0001-90' }), /não está cadastrado/);
    assert.match(motivoPendencia({ cnpj_identificado: '12345678', multiplas_filiais: true }), /várias filiais/);
});
