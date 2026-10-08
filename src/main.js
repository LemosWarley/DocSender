// Ponto de entrada do processo principal. A lógica fica em src/main/:
//   sessao.js        login, renovação do token, reconexão
//   envio.js         monitoramento da pasta e envio dos PDFs
//   fila.js          fila com concorrência, reagendamento e pausa
//   erros.js         classificação de falhas e leitura das respostas
//   certificados.js  certificados digitais
//   janela.js        janela, bandeja, configurações
const { app, powerMonitor } = require('electron');
const path = require('path');

// Perfil isolado para testar em desenvolvimento sem tocar na configuração (e
// nas credenciais) do DocSender instalado na mesma máquina.
if (!app.isPackaged && process.env.DOCSENDER_PERFIL) {
    app.setPath('userData', path.resolve(process.env.DOCSENDER_PERFIL));
}

// --- GARANTIA DE INSTÂNCIA ÚNICA ---
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

const { store } = require('./main/armazenamento');
const janela = require('./main/janela');
const sessao = require('./main/sessao');
const envio = require('./main/envio');
const certificados = require('./main/certificados');

janela.registrarIpc();
sessao.registrarIpc();
envio.registrarIpc();
certificados.registrarIpc();

app.whenReady().then(() => {
    janela.criarJanela();
    janela.criarBandeja();
    // Em desenvolvimento não mexe na entrada de inicialização do Windows, que
    // pode ser a do DocSender instalado na mesma máquina.
    if (app.isPackaged) janela.configurarInicioAutomatico(store().get('iniciar_com_windows', false));
    sessao.iniciarVerificacaoPeriodica();
    certificados.iniciar();

    // Ao voltar da suspensão o intervalo de 5 min está atrasado e o access token
    // provavelmente venceu. Revalida na hora e destrava a fila, em vez de deixar
    // o primeiro envio pós-hibernação falhar.
    powerMonitor.on('resume', () => { sessao.checkSession(); envio.retomarAposSuspensao(); });
});

app.on('second-instance', () => janela.mostrarJanela());
