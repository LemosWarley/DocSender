#!/usr/bin/env node
/**
 * Gera docs/memoria/INDICE.md a partir dos títulos dos arquivos de memória.
 *
 * Por que existe: decisoes.md e armadilhas.md são append-only — só crescem.
 * Importados com `@` no CLAUDE.md, entram inteiros em toda requisição da API
 * (no onechattotal, de onde veio este script, isso chegou a ~138k tokens).
 *
 * O índice troca esse custo fixo por um mapa: o agente vê o que existe e lê
 * só a faixa de linhas que interessa.
 *
 * Uso: node scripts/gerar-indice-memoria.mjs
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARQUIVOS = [
  {
    caminho: "docs/memoria/estado-atual.md",
    descricao: "Foto do agora: onde o projeto está, o que está em andamento, pendências.",
  },
  {
    caminho: "docs/memoria/decisoes.md",
    descricao: "Append-only. Por que cada escolha foi feita, em ordem cronológica inversa.",
  },
  {
    caminho: "docs/memoria/armadilhas.md",
    descricao: "Append-only. O que já quebrou e o que a aparência esconde.",
  },
];

/** Extrai as seções `## ` com a faixa de linhas que cada uma ocupa. */
function extrairSecoes(texto) {
  const linhas = texto.split(/\r?\n/);
  const secoes = [];
  linhas.forEach((linha, i) => {
    if (linha.startsWith("## ")) {
      secoes.push({ titulo: linha.slice(3).trim(), inicio: i + 1 });
    }
  });
  secoes.forEach((s, i) => {
    s.fim = i + 1 < secoes.length ? secoes[i + 1].inicio - 1 : linhas.length;
  });
  return secoes;
}

const partes = [
  "<!-- GERADO POR scripts/gerar-indice-memoria.mjs — NÃO EDITE À MÃO -->",
  "",
  "# Índice da memória do projeto",
  "",
  "Os três arquivos abaixo **não** são carregados automaticamente na sessão:",
  "são append-only e crescem a cada sessão. Use este índice para achar a seção",
  "e leia **só a faixa de linhas**:",
  "",
  "```bash",
  "sed -n '112,160p' docs/memoria/decisoes.md",
  "```",
  "",
  "Para procurar por assunto quando o título não bastar:",
  "",
  "```bash",
  'grep -n -i "palavra" docs/memoria/*.md',
  "```",
  "",
  "Regravar este índice depois de escrever na memória:",
  "`node scripts/gerar-indice-memoria.mjs`",
  "",
];

for (const { caminho, descricao } of ARQUIVOS) {
  const absoluto = join(raiz, caminho);
  const texto = readFileSync(absoluto, "utf8");
  const kb = Math.round(statSync(absoluto).size / 1024);
  const secoes = extrairSecoes(texto);

  partes.push(`## ${caminho}`, "", `${descricao} — ${kb} KB, ${secoes.length} seções.`, "");
  for (const s of secoes) {
    partes.push(`- \`${s.inicio}-${s.fim}\` — ${s.titulo}`);
  }
  partes.push("");
}

const destino = join(raiz, "docs/memoria/INDICE.md");
const conteudo = partes.join("\n");
writeFileSync(destino, conteudo, "utf8");

const kb = (Buffer.byteLength(conteudo, "utf8") / 1024).toFixed(1);
console.log(`INDICE.md gerado: ${kb} KB (~${Math.round(Buffer.byteLength(conteudo, "utf8") / 3.3)} tokens)`);
