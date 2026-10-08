# Armadilhas

<!-- Coisas que já quebraram, já custaram tempo, ou que parecem erradas mas estão certas. -->

---

## HTTP 200 do `documentos-processar` não quer dizer que o documento saiu

**Sintoma:** o log mostra "Enviado" e o PDF vai para o backup, mas o cliente não recebe.
**Causa:** o `documentos-processar` responde 200 com `success: false` quando nenhum
canal está ligado no cadastro ou quando todos os envios por WhatsApp falham. Até a 1.1.4
o app só olhava o status HTTP.
**Solução:** ler o corpo (`resumoProcessar` em `src/main/erros.js`). `success: false` =
não enviado; `results[]` com `status: 'erro'` e `success: true` = sucesso parcial.
**Não faça:** confiar em `axios` não ter lançado exceção.

## `empresa_encontrada: false` mistura três casos

**Sintoma:** documento "some" sem ser enviado.
**Causa:** o upload volta `empresa_encontrada: false` quando o cliente não está
cadastrado, quando há várias filiais com a mesma raiz de CNPJ (`multiplas_filiais`) e,
até 2026-10-08, também quando a IA estava fora do ar.
**Solução:** tratar como pendência (`_Pendentes`) com o motivo lido de
`cnpj_identificado` / `multiplas_filiais`.

## Limite de tamanho: o servidor aceita 10 MB

**Sintoma:** PDF grande vai para a pasta de erro com "Arquivo excede o limite de 10 MB".
**Causa:** `MAX_DOCUMENTO_PDF_BYTES` no `onechattotal` é 10 MB; o app aceitava 50 MB.
**Solução:** `MAX_PDF_BYTES` em `src/main/config.js` igual ao do servidor. Se mudar lá,
mude aqui.

## Rodar o app de desenvolvimento usa o perfil do app instalado

**Sintoma:** risco de o teste monitorar a pasta real e enviar documento de verdade, ou de
apagar a entrada "iniciar com o Windows" do app instalado.
**Causa:** o app de desenvolvimento e o instalado usam o mesmo nome e, portanto, a mesma
pasta `%APPDATA%\docsender`.
**Solução:** `DOCSENDER_PERFIL=<pasta temporária>`. A entrada de inicialização só é
regravada no app instalado (`app.isPackaged`).

## `ELECTRON_RUN_AS_NODE=1` no terminal do VS Code

**Sintoma:** `npx electron --version` devolve a versão do Node (`v24.x`) e o app não abre
janela.
**Causa:** o VS Code define a variável para os processos filhos.
**Solução:** `unset ELECTRON_RUN_AS_NODE` (bash) ou remova do `env` ao abrir o processo.

## Login manual não liga o monitoramento sozinho

**Sintoma:** depois de conectar pela tela, nada é enviado.
**Causa:** é de propósito. Só a conexão automática (abertura do app, reconexão depois de
queda de sessão) liga o monitoramento; no login manual o usuário clica em "Iniciar".
**Não faça:** concluir que o envio está quebrado sem conferir se o monitoramento está
ativo.

## electron-builder 26 recusa `win.publisherName`

**Sintoma:** `configuration.win should be one of these: null`.
**Causa:** na versão 26 o campo foi para `win.signtoolOptions.publisherName`.
**Solução:** já movido no `package.json`.
