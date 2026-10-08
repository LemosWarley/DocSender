# DocSender

> Arquivo canônico de contexto deste projeto. Vale para qualquer assistente de IA.

## Leia antes de começar

A memória viva do projeto está em `docs/memoria/`. O índice (`docs/memoria/INDICE.md`)
diz em que linhas está cada assunto; leia só a faixa que interessa:

- `docs/memoria/estado-atual.md` — onde o projeto está, o que está em andamento
- `docs/memoria/decisoes.md` — o que foi decidido e por quê (não reabra sem motivo novo)
- `docs/memoria/armadilhas.md` — o que já quebrou e como evitar
- `docs/plano-melhorias.md` — plano por versão (1.2.0 → 1.4.0), com o que já foi feito

Ao terminar um trabalho relevante, atualize esses arquivos e regere o índice:
`node scripts/gerar-indice-memoria.mjs`.

## O que é

Aplicativo de Windows do **OneChat** instalado nos escritórios contábeis clientes. Vigia
uma pasta; cada PDF que cai nela vai para o OneChat, onde a IA identifica o CNPJ do
cliente, e o documento é enviado ao cliente por WhatsApp/e-mail. Também gerencia os
certificados digitais (`.pfx`) do escritório no Windows.

## Stack

- Electron 44 (JavaScript CommonJS, sem TypeScript, sem framework de UI)
- Backend: Supabase do OneChat (`suwacpmwnxeazbbavwmn`), via Edge Functions do repositório
  `onechattotal` (`D:\antigravity\OneChat SUPABASE\onechattotal`)
- Instalador NSIS por usuário (`electron-builder`), **sem assinatura de código**
- Gerenciador de pacotes: **npm** (`package-lock.json`) — exceção ao padrão Bun dos
  projetos web

## Comandos

```bash
npm install
npm start                 # abre o app (ver "Testar sem tocar no app instalado")
npm test                  # node --test (test/*.test.js)
npm run build             # gera dist/DocSender Setup <versão>.exe
```

### Testar sem tocar no app instalado

Esta máquina tem o DocSender instalado e rodando, com credenciais e pastas reais. O app
em desenvolvimento aceita duas variáveis (ignoradas pelo app instalado):

- `DOCSENDER_PERFIL=<pasta>` — pasta de dados isolada (configuração, sessão, senhas)
- `DOCSENDER_API_URL=http://127.0.0.1:<porta>` — servidor falso no lugar do Supabase

No terminal do VS Code, `ELECTRON_RUN_AS_NODE=1` vem ligado e faz o Electron rodar como
Node puro: desligue antes de abrir o app.

## Arquitetura

`src/main.js` só inicializa; a lógica do processo principal fica em `src/main/`.
O renderer (`src/renderer.js`) não fala com a rede: tudo passa pela ponte do
`src/preload.js` (`window.electronAPI`) até o processo principal.

- `src/main/envio.js` — observa a pasta (chokidar), envia cada PDF
  (`documentos-upload` → `documentos-processar`), decide o destino do arquivo
- `src/main/fila.js` — fila com 2 envios simultâneos, reagendamento e pausa sem rede
- `src/main/erros.js` — classifica falhas (`auth` / `network` / `server` / `permanent`) e
  lê as respostas das Edge Functions
- `src/main/sessao.js` — login, refresh token, re-login silencioso, reconexão na abertura
- `src/main/certificados.js` — leitura de `.pfx` (node-forge) e instalação via PowerShell
- `src/main/armazenamento.js` — `electron-store` + segredos com `safeStorage`
- `src/main/janela.js` — janela sem moldura, bandeja, configurações, checagem de versão
- `test/` — testes das partes sem Electron (`erros`, `fila`, `arquivos`)

Destino de cada PDF da pasta de envio:

| Resultado | Pasta |
|---|---|
| Enviado (inclusive parcial) | pasta de backup, com prefixo de horário |
| Cliente não identificado | `_Pendentes` (dentro da pasta de envio) |
| Não enviado, PDF inválido, erro definitivo | `_Erros_Envio` (dentro da pasta de envio) |
| Sem rede / sessão perdida | continua na pasta de envio |

## Convenções deste projeto

- Código, comentários e mensagens da tela em português; identificadores mistos (o
  código antigo usa inglês, o novo usa português).
- Texto vindo de fora (nome de arquivo, nome de certificado, mensagem do servidor) entra
  na tela só por `textContent`. A página tem CSP.
- O prefixo de horário (`1728390000000_`) é só para nome único em disco: o nome enviado
  ao servidor é sempre o original (`nomeOriginal()` em `src/main/arquivos.js`).
- Valores dinâmicos para o PowerShell vão por variável de ambiente, nunca interpolados.

## Cuidados

- **O app é a ponta de um contrato com as Edge Functions do `onechattotal`.** Mudança
  de status HTTP ou de campo da resposta lá muda o comportamento aqui. O app trata
  401 como sessão vencida, 5xx/429 como temporário, sem resposta como queda de rede e
  qualquer outro 4xx como definitivo. Ver `docs/memoria/armadilhas.md`.
- **Senha de certificado é o bem mais sensível do app** (com o `.pfx`, assina em nome do
  cliente). Segredo só vai ao disco criptografado com `safeStorage`; sem ele, fica em
  memória.
- O instalador não é assinado: o Windows mostra o alerta do SmartScreen.
- Toda versão nova chega ao escritório pela faixa "Nova versão" + instalação manual. A
  versão publicada é cadastrada no Super Admin do OneChat (tabela `app_versions`).

> Este repositório é **Electron**, não um projeto web: o kit e a tabela de gerações
> abaixo não se aplicam ao código daqui. Valem as regras de idioma, git e segredos.

<!-- BLOCO-PADROES:BEGIN — gerado do hub Sistema-Memoria. Edite lá, não aqui. -->

## Padrões que valem em todos os projetos do Warley

> Fonte: [Sistema-Memoria](https://github.com/LemosWarley/Sistema-Memoria) · `PADROES.md`.
> Se algo aqui divergir do repositório real, o repositório vence — e avise para corrigir o hub.

**Idioma:** responda, comente código e escreva commits em **português do Brasil**.

**O kit.** Todos os projetos web compartilham o mesmo esqueleto (herança do Lovable.dev).
Antes de propor biblioteca nova, verifique se o kit já resolve — quase sempre resolve:
Vite · TypeScript · React · **shadcn/ui** (Radix + `class-variance-authority` + `clsx` +
`tailwind-merge`, via `components.json`) · Tailwind · `react-hook-form` + `zod` ·
`@tanstack/react-query` · `lucide-react` · `sonner` · `recharts` · `date-fns` ·
`embla-carousel-react` · `vaul` · `cmdk` · **Supabase** (Postgres + RLS + Storage +
Edge Functions) · **Bun** como gerenciador de pacotes.

**Duas gerações de stack.** Confirme em qual este repositório está antes de escrever código —
misturar as convenções quebra o build:

| | Geração 1 (até ~jun/2026) | Geração 2 (jul/2026 em diante) |
|---|---|---|
| React | 18.3 | 19.2 |
| Rotas | `react-router-dom` 6 | TanStack Start + Router (por arquivo) |
| Tailwind | 3 (`postcss.config` + `tailwind.config.ts` + `tailwindcss-animate`) | 4 (`@tailwindcss/vite`, **sem** postcss, `tw-animate-css`) |
| Plugin React | `@vitejs/plugin-react-swc` | `@vitejs/plugin-react` |
| Formatação | só ESLint | ESLint + Prettier |
| Deploy | Lovable / Supabase | Cloudflare Workers (`wrangler.jsonc` + `nitro`) |

**Git.** Branch única `main`, commit direto, sem PR. Mensagem: prefixo `feat:` / `fix:` /
`docs:` / `chore:` + uma frase em português que descreve o **efeito**, não a implementação.
Exemplo real: `fix: entrega das campanhas de novidades deixa de depender do navegador`.
Nunca commitar `Changes`, `Work in progress` ou `Lovable update` — são resíduo automático
do Lovable, não exemplo a seguir.

**Segredos.** Vários repositórios versionam `.env` de propósito (sem ele o build do Lovable
quebra). Só há chaves **publicáveis** do Supabase, que são públicas por design e protegidas
por RLS. Antes de adicionar qualquer variável a um `.env` versionado, confirme que ela é
publicável. `SERVICE_ROLE_KEY`, chave de Stripe ou token de API **nunca** vão no arquivo —
vão em Secrets do Cloudflare ou do Supabase.

**Resíduos do Lovable.** `package-lock.json` convive com `bun.lock`: o válido é o do **Bun**.
`lovable-tagger` e `@lovable.dev/*` são do editor, não da aplicação. O Lovable às vezes deixa
ponteiros `.asset.json` no lugar de arquivos reais.

**Repositórios duplicados.** Confirme que está no repositório vivo:
`onechattotal` (vivo) × `onechatoficial` (congelado) · `igreja-betania` (vivo) ×
`betania-revive` (congelado).

<!-- BLOCO-PADROES:END -->
