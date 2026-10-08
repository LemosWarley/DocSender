# Estado atual

**Última atualização:** 2026-10-08

## Onde o projeto está

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
