// Faz o caderno da resenha começar com dias de antes de ele existir, a partir de uma conversa
// exportada pelo WhatsApp. Roda no Mac; o robô (que pode estar num celular) recebe pelo banco.
//
//   pnpm exec tsx scripts/caderno/importar.ts ~/Downloads/_chat.txt --dias=2026-11-24,2026-11-25 --robo="Assistente Marco"
//   ... --gravar      deixa o recado para o robô (sem isso, só mostra o que a IA propôs)
//
// Cada dia é uma chamada à IA (a mesma leitura das 23:30). O robô junta as linhas ao que está
// pendente, conta ao dono na manhã seguinte e só então passa a usar; o dono veta como sempre.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getDb } from '@/db/client';
import { MIN_FALAS, RECADO_DO_CADERNO, lerODia, type Nota } from '@/robo/caderno';
import { falasDaExportacao } from '@/robo/caderno-importar';
import { pastaDoRobo } from '@/robo/estado';
import { criarCliente } from '@/robo/ia';
import { gravarRecado, lerRecado } from '@/server/ponte-do-robo';

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const arquivo = process.argv[2];
const dias = (arg('dias') ?? '').split(',').map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
const robo = arg('robo') ?? '';
if (!arquivo || !existsSync(arquivo) || !dias.length || !robo) {
  console.error('Uso: tsx scripts/caderno/importar.ts <conversa.txt> --dias=AAAA-MM-DD[,AAAA-MM-DD] --robo="nome do robô no grupo" [--gravar]');
  process.exit(1);
}
const env = join(pastaDoRobo(process.env, homedir()), '.env');
if (existsSync(env)) process.loadEnvFile(env);
const chave = process.env.ANTHROPIC_API_KEY?.trim();
if (!chave) {
  console.error(`Falta ANTHROPIC_API_KEY (no ambiente ou em ${env}).`);
  process.exit(1);
}

async function principal(chaveDaIA: string): Promise<void> {
  const porDia = falasDaExportacao(readFileSync(arquivo, 'utf8'), dias, robo);
  const cliente = criarCliente(chaveDaIA);
  const modelo = process.env.ROBO_MODELO?.trim() || 'claude-haiku-5-5';
  const novas: string[] = [];
  for (const dia of dias) {
    const falas = porDia.get(dia) ?? [];
    if (falas.length < MIN_FALAS) {
      console.log(`${dia}: ${falas.length} fala(s), pouco para ler.`);
      continue;
    }
    // As linhas dos dias anteriores vão como caderno atual, para a IA não repetir.
    const notas: Nota[] = novas.map((texto, i) => ({ id: i + 1, texto, desde: dia }));
    const p = await lerODia(cliente, modelo, notas, falas, dia, (u) => console.log(`${dia}: ${falas.length} falas, ${u.entrada} tokens de entrada, ${u.saida} de saída`));
    for (const t of p.novas) console.log(`  + ${t}`);
    novas.push(...p.novas);
  }
  if (!novas.length) {
    console.log('Nada para o caderno.');
  } else if (process.argv.includes('--gravar')) {
    const db = getDb();
    if (await lerRecado(db, RECADO_DO_CADERNO)) {
      console.error('Já há um recado do caderno esperando o robô. Espere ele ler antes de mandar outro.');
      process.exit(1);
    }
    await gravarRecado(db, RECADO_DO_CADERNO, JSON.stringify({ dia: dias.at(-1), novas }), new Date());
    console.log(`Recado deixado para o robô: ${novas.length} linha(s). Ele conta ao dono na próxima manhã.`);
    process.exit(0);
  } else {
    console.log(`\n${novas.length} linha(s). Nada foi gravado (rode de novo com --gravar para deixar o recado para o robô).`);
  }
}

principal(chave).catch((err) => {
  console.error(`A importação falhou: ${(err as Error).message}`);
  process.exit(1);
});
