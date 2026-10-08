# Estado atual

**Última atualização:** 2026-10-08

## Onde o projeto está

Em produção nos escritórios a versão **1.1.4** (Electron 29). A **1.2.0** está
implementada e testada localmente, com o instalador gerado em `dist/`, mas **não foi
commitada nem publicada**.

A 1.2.0 cobre as fases 0, 1 e 2 do `docs/plano-melhorias.md`: código separado em
módulos, envio confiável (sem "Enviado" falso, pasta `_Pendentes`, reconexão sozinha,
fila pausada sem rede), segurança (CSP, texto externo só como texto, senha fora da tela,
Electron 44) e três correções de certificado.

## Em andamento

- [ ] Commitar a 1.2.0 no DocSender e a mudança do `documentos-upload` no
      `onechattotal` — aguardando autorização do Warley.
- [ ] Publicar a Edge Function `documentos-upload` (503 quando a IA falha). Pode ir
      antes da 1.2.0: a 1.1.4 trata 503 como falha temporária.
- [ ] Publicar o instalador 1.2.0 pelo Super Admin do OneChat.

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
- O repositório fica em `C:\Users\Warley1\Documents\DocSender\DocSender`, fora de
  `D:\antigravity`, onde estão os outros projetos.
