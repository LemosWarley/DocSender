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

- `5-16` — Onde o projeto está
- `17-25` — Em andamento
- `26-33` — Próximos passos
- `34-39` — Pendências e bloqueios
- `40-52` — Contexto que não está no código

## docs/memoria/decisoes.md

Append-only. Por que cada escolha foi feita, em ordem cronológica inversa. — 5 KB, 8 seções.

- `10-28` — 2026-10-08 — Visual novo: marca OneChat, tema claro e escuro
- `29-40` — 2026-10-08 — Atualização automática adiada
- `41-52` — 2026-10-08 — PDF sem cliente identificado vai para `_Pendentes`
- `53-65` — 2026-10-08 — Falha da IA no upload responde 503
- `66-74` — 2026-10-08 — Testes com o executor nativo do Node
- `75-83` — 2026-10-08 — Processo principal dividido em `src/main/`
- `84-92` — 2026-08-09 — Supabase próprio do OneChat
- `93-99` — 2026-07-05 — Electron com instalador NSIS por usuário

## docs/memoria/armadilhas.md

Append-only. O que já quebrou e o que a aparência esconde. — 4 KB, 8 seções.

- `7-29` — Pasta de rede (inclusive unidade mapeada) trava o app inteiro com `fs.watch`
- `30-39` — HTTP 200 do `documentos-processar` não quer dizer que o documento saiu
- `40-48` — `empresa_encontrada: false` mistura três casos
- `49-55` — Limite de tamanho: o servidor aceita 10 MB
- `56-64` — Rodar o app de desenvolvimento usa o perfil do app instalado
- `65-71` — `ELECTRON_RUN_AS_NODE=1` no terminal do VS Code
- `72-79` — Login manual não liga o monitoramento sozinho
- `80-85` — electron-builder 26 recusa `win.publisherName`
