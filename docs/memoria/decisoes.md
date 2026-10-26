# Decisões

<!-- APPEND-ONLY: nunca apague uma decisão, apenas adicione uma nova que a
     substitua (e marque a antiga como Substituída). -->

Mais recentes no topo.

---

## 2026-10-08 — Visual novo: marca OneChat, tema claro e escuro

**Status:** Vigente
**Contexto:** pedido do Warley por uma refatoração completa do visual, "moderna".
**Decisão:** interface refeita (`index.html`, `styles.css`, parte visual do `renderer.js`).
Roxo do logo OneChat como cor de destaque; tema claro e escuro por tokens CSS em
`:root` (segue o Windows, ou fixado em Configurações > Aparência, guardado em
`localStorage` com a chave `docsender-tema`); Envios virou painel (estado do monitoramento,
contadores, abas Atividade / Pendentes / Com erro); atividade com o mais recente no topo;
certificados mostram razão social e CNPJ/CPF formatado separados (CN no padrão ICP-Brasil
`NOME:DIGITOS`) e "vence em X dias".
**Motivo:** fonte é a Segoe UI Variable do próprio Windows porque a CSP não permite fonte
externa e o app precisa abrir sem rede.
**Consequência:** cor nova entra como token em `styles.css`, nos dois temas — nunca
hex solto no HTML ou no JS. Botões usam `--brand-btn`/`--danger-btn` (mais escuros que
`--brand`/`--danger`) para o texto branco ser legível no tema escuro. Os IDs usados pelos
testes de ponta a ponta foram mantidos.


## 2026-10-08 — Atualização automática adiada

**Status:** Vigente
**Contexto:** a análise propôs `electron-updater` + Cloudflare R2 + assinatura de código.
**Decisão:** não fazer agora. Versões novas seguem pela faixa "Nova versão" + instalação
manual.
**Motivo:** decisão do Warley ao aprovar o plano.
**Consequência:** cada versão (1.2.0, 1.3.0, 1.4.0) exige instalação manual em todos os
escritórios. Quando a atualização automática vier, a versão que a trouxer ainda será
instalada à mão. O Azure Artifact Signing não atende o Brasil; o caminho para assinar é
um certificado OV (Sectigo/DigiCert).

## 2026-10-08 — PDF sem cliente identificado vai para `_Pendentes`

**Status:** Vigente
**Contexto:** quando o `documentos-upload` volta `empresa_encontrada: false`, a 1.1.4
movia o PDF para o backup sem nenhum aviso.
**Decisão:** pasta nova `_Pendentes`, dentro da pasta de envio, com painel próprio na
tela (reprocessar / excluir) e motivo no log.
**Motivo:** não é erro do envio, e o backup significa "enviado".
**Descartamos:** backup com aviso — o arquivo continuaria misturado aos enviados.
**Consequência:** o observador ignora `_Pendentes` e `_Erros_Envio`. Reprocessar refaz a
análise (o status `empresa_nao_encontrada` não entra na idempotência do servidor).

## 2026-10-08 — Falha da IA no upload responde 503

**Status:** Vigente. Publicado em 2026-10-08 (`onechattotal` `c15b584`, function versão 134).
**Contexto:** com a IA fora do ar, o `documentos-upload` gravava status `erro` e
respondia 200 sem CNPJ; o app tratava como "cliente não cadastrado".
**Decisão:** 503 `{ codigo: 'IA_INDISPONIVEL' }`, apagando a linha e o arquivo da
tentativa, com aviso em `system_logs`.
**Motivo:** IA indisponível é passageiro; o app tenta de novo sozinho em 5xx.
**Descartamos:** manter a linha com status `erro` — cada nova tentativa criaria outra
linha no painel.
**Consequência:** compatível com a 1.1.4. O painel web passa a mostrar a mensagem de
indisponibilidade em vez de "Não foi possível identificar o CNPJ".

## 2026-10-08 — Testes com o executor nativo do Node

**Status:** Vigente
**Decisão:** `node --test` em vez de Vitest.
**Motivo:** cobre a lógica pura (fila, erros, arquivos) sem dependência nova; o código é
CommonJS e o Vitest exigiria adaptação para importar os módulos.
**Consequência:** módulo testável não pode exigir `electron`. Lógica nova que precise de
teste vai para um módulo puro, como `erros.js` e `fila.js`.

## 2026-10-08 — Processo principal dividido em `src/main/`

**Status:** Vigente
**Contexto:** `src/main.js` tinha 1.058 linhas misturando sessão, fila, certificados e
janela.
**Decisão:** um módulo por responsabilidade; `src/main.js` só inicializa.
**Consequência:** a ponte com a tela (`sendToRenderer`) fica em `src/main/ui.js` para os
módulos não dependerem uns dos outros.

## 2026-08-09 — Supabase próprio do OneChat

**Status:** Vigente
**Contexto:** migração do OneChat do Lovable Cloud para Supabase próprio.
**Decisão:** o app aponta para `suwacpmwnxeazbbavwmn.supabase.co` (antes
`ojosihisbhdettqsliam`).
**Consequência:** refresh tokens antigos deixaram de valer; os usuários entraram de novo
com as mesmas credenciais.

## 2026-07-05 — Electron com instalador NSIS por usuário

**Status:** Vigente
**Decisão:** app Electron, instalador NSIS com `perMachine: false`.
**Consequência:** instala sem pedir administrador; os dados ficam em
`%APPDATA%\docsender`.
