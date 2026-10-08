// Constantes compartilhadas pelo processo principal.

const { app } = require('electron');

// Projeto Supabase proprio (migracao saindo do Lovable Cloud, 09/08/2026).
// Anterior: https://ojosihisbhdettqsliam.supabase.co
// A anon key e publica por definicao - ja viaja em toda requisicao deste app.
// Ao trocar de projeto, o refresh_token salvo em disco deixa de valer: ele foi
// emitido pelo projeto antigo, entao o usuario precisa entrar de novo (as
// credenciais sao as mesmas, os usuarios vieram no dump).
const PRODUCAO_URL = "https://suwacpmwnxeazbbavwmn.supabase.co";
// Em desenvolvimento, DOCSENDER_API_URL aponta para um servidor falso local
// (teste de ponta a ponta sem enviar documento de verdade).
const API_BASE_URL = (!app.isPackaged && process.env.DOCSENDER_API_URL) || PRODUCAO_URL;
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1d2FjcG13bnhlYXpiYmF2d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAzOTAsImV4cCI6MjEwMTg1NjM5MH0.OFaIVwUrsmkjj-775Xpnbyj7LS2ugP7c8dnXTzGagOQ";

// Subpastas criadas dentro da pasta monitorada. O observador as ignora para não
// reprocessar em loop os arquivos que o próprio app moveu para lá.
const ERROR_FOLDER_NAME = '_Erros_Envio';
const PENDING_FOLDER_NAME = '_Pendentes';

// Igual ao limite do documentos-upload (MAX_DOCUMENTO_PDF_BYTES, 10 MB): acima
// disso o servidor recusa, então nem vale subir o arquivo.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const MAX_CONCURRENT_UPLOADS = 2;

// Erro do servidor (5xx, 429): tenta de novo nestes intervalos e, esgotados,
// manda o arquivo para a pasta de erro.
const SERVER_RETRY_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

// Sem rede: pausa a fila e tenta de novo sem limite de tentativas. Queda de
// internet não é defeito do documento e não deve encher a pasta de erro.
const NETWORK_RETRY_MS = [15 * 1000, 30 * 1000, 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];

// Destinos que podem ser abertos no navegador do sistema (link de atualização).
const ALLOWED_EXTERNAL_HOSTS = ['suwacpmwnxeazbbavwmn.supabase.co', 'apponechat.com'];

module.exports = {
    API_BASE_URL,
    API_KEY,
    ERROR_FOLDER_NAME,
    PENDING_FOLDER_NAME,
    MAX_PDF_BYTES,
    MAX_CONCURRENT_UPLOADS,
    SERVER_RETRY_MS,
    NETWORK_RETRY_MS,
    ALLOWED_EXTERNAL_HOSTS,
};
