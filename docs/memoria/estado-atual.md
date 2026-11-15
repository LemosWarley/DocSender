# Estado atual

**Última atualização:** 2026-11-15

## Onde o projeto está

**2026-11-15 — 1.2.4 gerada, NÃO publicada (a 1.2.3 nunca foi publicada: pule-a).**
`dist/DocSender Setup 1.2.4.exe` (121 MB, sha256 `5604483f…22c2`), conferido no `app.asar`. É a 1.2.2 +
"Baixar notas" + **nome do arquivo pelo número da nota** (padrão; "Chave de acesso" é a outra opção).
O emitente entra no nome quando não é a própria empresa; nome repetido de OUTRA nota leva a chave
junto (conferido pelo conteúdo do XML); arquivo antigo pela chave é renomeado, não baixado de novo.
Publicação: Super Admin → DocSender → enviar o `.exe` (vai direto ao
`supabase.co`, por causa do teto de 100 MB do Cloudflare) → instalar numa máquina → "definir como atual".

"Baixar notas": seção nova que baixa
os XML do OneXml (NF-e, NFC-e, CT-e, NFS-e) para uma pasta, separados por empresa, mês, lado e tipo.
Código: `src/main/notas.js` (sincronização), `src/main/notas-caminhos.js` (pastas, testado),
`src/notas-tela.js` (tela), `sessao.getUserId()`. Servidor já em produção (`onexml-sincronizar`, no
`onechattotal`). Testes: 30 passam, incluindo `test/notas.test.js` (rodada completa contra servidor
falso). A tela abriu em desenvolvimento sem erro de script; **não testada com login real**. Falta
escolher o número da versão (a 1.3.0 estava reservada para a Fase 4), gerar o instalador e publicar.
Plano: `onechattotal/docs/plans/onexml-baixar-no-computador.md`.

**2026-10-30 — 1.2.1 gerada, não publicada.** `dist/DocSender Setup 1.2.1.exe` (121 MB), com o
`app.asar` conferido (traz `x-envio-tentativa` e "Documento reprocessado com sucesso"). É a 1.2.0 +
**reprocessamento**: cada arquivo que entra na pasta ganha um código (`tentativaId`); repetição
automática reusa o código e não reenvia; a mesma guia recolocada na pasta é reenviada com o mesmo
protocolo (plano em `onechattotal/docs/plans/docsender-reprocessamento.md`, servidor já em produção).
⚠️ Os escritórios estão na **1.1.4**: publicar a 1.2.1 leva junto tudo da 1.2.0, que só foi testada com
o login real nesta máquina. Publicação: Super Admin → DocSender → enviar o `.exe` (sobe para a raiz do
bucket `documentos` como `DocSenderSetup_v1.2.1.exe`, `is_current = false`) → baixar e instalar numa
máquina → "definir como atual". A 1.3.0 continua reservada para a Fase 4.

### Antes (2026-10-08)

Em produção nos escritórios a versão **1.1.4** (Electron 29). A **1.2.0** está na `main`
(commit `038f587`), com o instalador gerado em `dist/`, **ainda não publicado** no Super
Admin. Testada com o login real (cópia do perfil desta máquina, pastas vazias): a 1.2.0 leu
a senha salva pela 1.1.4, conectou e ligou o monitoramento.

A 1.2.0 cobre as fases 0, 1 e 2 do `docs/plano-melhorias.md`: código separado em
módulos, envio confiável (sem "Enviado" falso, pasta `_Pendentes`, reconexão sozinha,
fila pausada sem rede), segurança (CSP, texto externo só como texto, senha fora da tela,
Electron 44) e três correções de certificado.

## Em andamento

- [x] `documentos-upload` com 503 quando a IA falha: publicado em 2026-10-08 (versão 134).
- [ ] Publicar o instalador 1.2.0 pelo Super Admin do OneChat (`dist/DocSender Setup
      1.2.0.exe`, 116 MB; limite global de upload do projeto: 200 MB). O envio direto
      pela API foi bloqueado pelo modo automático do Claude Code.
- [ ] Atualizar o DocSender desta máquina: está em `C:\Program Files\DocSender`, e
      instalar por cima pede confirmação de administrador.

## Próximos passos

1. Instalar a 1.2.0 numa máquina real e conferir com o login de verdade: envio, pasta
   `_Pendentes`, aba Certificados.
2. Fase 4 (1.3.0): notificações do Windows, ícone de status na bandeja, sinal de vida para
   o painel, log em arquivo.
3. Fase 5 (1.4.0): melhorias de certificado.

## Pendências e bloqueios

- Atualização automática (Fase 3) adiada por decisão do Warley em 2026-10-08.
- `node-forge` tem alerta alto no `npm audit` sem correção publicada; o app não usa a
  parte afetada (verificação de assinatura RSA).

## Contexto que não está no código

- O DocSender está instalado e rodando **nesta máquina de desenvolvimento**, com pastas
  e credenciais reais. Teste sempre com `DOCSENDER_PERFIL` e, para envio,
  `DOCSENDER_API_URL` apontando para servidor falso (ver `AGENTS.md`).
- O DocSender desta máquina foi instalado para todos os usuários, em
  `C:\Program Files\DocSender`, mas a entrada de inicialização é do usuário
  (`HKCU\...\Run\electron.app.DocSender`). O instalador padrão é por usuário
  (`%LOCALAPPDATA%\Programs`): na hora de atualizar, escolha a mesma pasta, ou ficam
  duas instalações.
- O repositório fica em `C:\Users\Warley1\Documents\DocSender\DocSender`, fora de
  `D:\antigravity`, onde estão os outros projetos.
