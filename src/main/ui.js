// Ponte do processo principal para a janela. Guardada num módulo próprio para
// que fila, sessão e certificados possam avisar a tela sem depender uns dos outros.

let mainWindow = null;

function setMainWindow(win) {
    mainWindow = win;
}

function getMainWindow() {
    return mainWindow;
}

// Envia mensagens ao renderer com segurança (a janela pode ter sido destruída)
function sendToRenderer(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function log(type, msg) {
    sendToRenderer('log', { type, msg });
}

module.exports = { setMainWindow, getMainWindow, sendToRenderer, log };
