<!-- GERADO POR scripts/gerar-indice-memoria.mjs — NÃO EDITE À MÃO -->

# Índice da memória do projeto

Os três arquivos abaixo **não** são carregados automaticamente na sessão:
são append-only e crescem a cada sessão. Use este índice para achar a seção
e leia **só a faixa de linhas**:

```bash
sed -n '112,160p' docs/memoria/decisoes.md
```

Para procurar por assunto quando o título não bastar:

```bash
grep -n -i "palavra" docs/memoria/*.md
```

Regravar este índice depois de escrever na memória:
`node scripts/gerar-indice-memoria.mjs`

## docs/memoria/estado-atual.md

Foto do agora: onde o projeto está, o que está em andamento, pendências. — 2 KB, 5 seções.

- `5-15` — Onde o projeto está
- `16-23` — Em andamento
- `24-31` — Próximos passos
- `32-37` — Pendências e bloqueios
- `38-45` — Contexto que não está no código

## docs/memoria/decisoes.md

Append-only. Por que cada escolha foi feita, em ordem cronológica inversa. — 4 KB, 7 seções.

- `10-21` — 2026-10-08 — Atualização automática adiada
- `22-33` — 2026-10-08 — PDF sem cliente identificado vai para `_Pendentes`
- `34-46` — 2026-10-08 — Falha da IA no upload responde 503
- `47-55` — 2026-10-08 — Testes com o executor nativo do Node
- `56-64` — 2026-10-08 — Processo principal dividido em `src/main/`
- `65-73` — 2026-08-09 — Supabase próprio do OneChat
- `74-80` — 2026-07-05 — Electron com instalador NSIS por usuário

## docs/memoria/armadilhas.md

Append-only. O que já quebrou e o que a aparência esconde. — 3 KB, 7 seções.

- `7-16` — HTTP 200 do `documentos-processar` não quer dizer que o documento saiu
- `17-25` — `empresa_encontrada: false` mistura três casos
- `26-32` — Limite de tamanho: o servidor aceita 10 MB
- `33-41` — Rodar o app de desenvolvimento usa o perfil do app instalado
- `42-48` — `ELECTRON_RUN_AS_NODE=1` no terminal do VS Code
- `49-56` — Login manual não liga o monitoramento sozinho
- `57-62` — electron-builder 26 recusa `win.publisherName`
