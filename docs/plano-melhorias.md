# Plano de melhorias do DocSender

Criado em 2026-10-08, a partir da análise completa do app (versão 1.1.4) e das Edge
Functions que ele chama no `onechattotal` (`documentos-upload`, `documentos-processar`,
`docsender-check-update`, `docsender-download`).

**Decisões de 2026-10-08 (Warley):**
- PDF sem cliente identificado vai para a pasta nova `_Pendentes`, não para o backup.
- **Atualização automática (Fase 3) fica de fora por enquanto.** Sem ela, toda versão
  nova continua chegando pelo banner + instalação manual.

## Situação

| Versão | Conteúdo | Situação |
|---|---|---|
| 1.2.0 | Fase 0 + Fase 1 + Fase 2 + correções pequenas de certificado | na `main` (2026-10-08), testada com login real; instalador a publicar no Super Admin |
| 1.3.0 | Fase 4 (visibilidade) | a fazer |
| 1.4.0 | Fase 5 (certificados) | a fazer |
| — | Fase 3 (atualização automática) | adiada |

Como a 1.2.0 foi verificada: `npm test` (18 testes de fila, classificação de erro e
arquivos) e teste de ponta a ponta com o app real contra um servidor falso que imita as
Edge Functions (envio ok, pendente, `success:false`, sucesso parcial, PDF inválido, queda
de rede, reprocessamento e abertura sem rede). O app em desenvolvimento aceita
`DOCSENDER_PERFIL` (pasta de dados isolada) e `DOCSENDER_API_URL` (servidor falso); o
app instalado ignora as duas.

---

## Fase 0 — Base ✅

- [x] `src/main.js` separado em módulos em `src/main/`: `config`, `ui`, `armazenamento`,
      `sessao`, `fila`, `erros`, `arquivos`, `envio`, `certificados`, `janela`.
- [x] Versão única: a tela lê `app.getVersion()`.
- [x] URL e anon key só no processo principal; a checagem de versão saiu da tela.
- [x] Testes com o executor nativo do Node (`npm test` = `node --test`), sem
      dependência nova — trocado do Vitest previsto.
- [ ] ~~Script `lint`~~: não adicionado (exigiria ESLint como dependência nova).
- [ ] Memória do projeto (`/memoria-init`): `AGENTS.md`, `docs/memoria/`, índice do hub.

## Fase 1 — Envio confiável ✅

### No app
- [x] `success:false` do `documentos-processar` → "Não enviado: motivo", pasta de erro.
      Sucesso parcial → aviso com quem não recebeu.
- [x] Sem cliente identificado → "Pendente: motivo", pasta `_Pendentes`, com painel
      próprio na tela (reprocessar / excluir).
- [x] Abertura sem rede: o login automático foi para o processo principal, tenta o
      refresh token antes da senha e reconecta sozinho; ao conectar, liga o monitoramento.
- [x] Sem rede durante o monitoramento: fila pausada, sem gastar tentativas, aviso uma
      vez por queda. Erro do servidor (5xx/429): 4 novas tentativas (30 s, 2, 10, 30 min).
- [x] Falha ao mover para o backup depois de enviado não reenvia mais o documento.
- [x] Nome enviado ao servidor sempre sem o prefixo de horário; o prefixo não acumula.
- [x] Hash do PDF em streaming.
- [x] Observador com tratamento de erro, verificação da pasta a cada minuto e opção
      "pasta de rede" (varredura periódica; automática para `\\servidor\...`).
- [x] Limite de PDF alinhado ao do servidor: 10 MB (era 50 MB no app).
- [x] Sessão perdida não joga mais o PDF na pasta de erro: ele fica na pasta de envio e
      sai quando o usuário reconectar.

### No servidor (`onechattotal`)
- [x] `documentos-upload`: falha da IA responde **503** `IA_INDISPONIVEL`, apaga a linha
      e o arquivo da tentativa e registra em `system_logs`. **Publicado em 2026-10-08
      (versão 134).** Compatível com a 1.1.4 (que trata 503 como falha temporária).
- [x] O app aceita `codigo` estável no corpo de erro (`AUTH_EXPIRADA`); o servidor ainda
      não manda os demais códigos.

## Fase 2 — Segurança ✅

- [x] Nome de certificado, mensagens do servidor e nomes de arquivo entram na tela só
      como texto. Verificado com um certificado de nome malicioso: não executou.
- [x] CSP no `index.html`.
- [x] A senha salva não volta mais para a tela.
- [x] Sem `safeStorage`: nenhuma senha nem token vai para o disco em texto puro.
- [x] Janela não navega nem abre outras janelas; links externos só por
      `shell.openExternal` para domínios conhecidos. `sandbox: true` explícito.
- [x] Electron 29 → **44.4.5**, axios 1.20.0, form-data 4.0.6, chokidar 3 → 4 (tira o
      `braces` vulnerável), electron-builder 26.16.1 (`publisherName` foi para
      `win.signtoolOptions`, exigência da versão 26).
- Restante no `npm audit --omit=dev`: `node-forge` (verificação de assinatura RSA, que o
  app não usa; sem correção publicada).

## Fase 3 — Atualização automática (adiada)

Ver a conversa de 2026-10-08: `electron-updater` + Cloudflare R2 + assinatura de código
(OV, Sectigo/DigiCert; o Azure Artifact Signing não atende o Brasil). Quando for feita,
a versão que a trouxer será a última instalada à mão.

## Fase 4 — Visibilidade (1.3.0)

- [ ] Notificações do Windows: sessão expirada, envio com erro, documento pendente.
- [ ] Bandeja: ícone por status, "Pausar envios", "Abrir painel OneChat", contador.
- [ ] Sinal de vida para o painel (tabela `docsender_instancias`).
- [ ] Log em arquivo com rotação + botão "Abrir pasta de logs".
- [ ] Tela "Envios de hoje" com protocolo e link para o painel.
- [ ] Arrastar e soltar PDF para envio avulso.

## Fase 5 — Certificados (1.4.0)

- [x] *(adiantado para a 1.2.0)* Aviso de "expirado" não é mais bloqueado pelo de
      "prestes"; certificado prestes a vencer e instalado mostra "Remover do Windows";
      senha sem `trim()`; a lista volta a aparecer quando a senha não desbloqueia nada.
- [ ] Avisos com 30, 15 e 7 dias; aviso ao painel / cliente.
- [ ] Abertura de `.pfx` em `worker_thread`.
- [ ] Várias senhas de uma vez.
- [ ] Senha associada ao thumbprint, não ao nome do arquivo.
- [ ] Excluir manda para a lixeira (`shell.trashItem`).
