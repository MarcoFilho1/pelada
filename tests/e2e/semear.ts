// Banco novo do e2e: migrações, o admin, 8 jogadores com times, 7 sem time (sorteio com COMPLETE),
// os novatos de PIN padrão (um por teste de jogador), as peladas
// de hoje/amanhã e da lista da semana, e um histórico de duas partidas para o ranking.
import { rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/db/schema';
import { semearAdmin } from '../../src/db/seed';
import { dataDe, mesDe, proximaQuarta } from '../../src/domain/tempo';
import { encerrarPartida, iniciarPartida, registrarLance } from '../../src/server/partidas';
import { salvarTimesDefinitivos, timesDaPelada } from '../../src/server/times';
import { E2E } from './ambiente';

async function main() {
  rmSync(E2E.banco, { recursive: true, force: true });
  const client = new PGlite(E2E.banco);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  await semearAdmin(db, { ADMIN_USUARIO: E2E.usuario, ADMIN_SENHA: E2E.senha });

  const criados = await db
    .insert(schema.jogadores)
    .values([
      ...[...E2E.azul, ...E2E.laranja, ...E2E.sorteio, E2E.semTime].map((nome) => ({ nome, pinPrecisaTrocar: false })),
      ...Object.values(E2E.novatos).map((nome) => ({ nome })),
    ])
    .returning({ id: schema.jogadores.id, nome: schema.jogadores.nome });
  const idDe = (nome: string) => criados.find((j) => j.nome === nome)!.id;
  const elencos = [E2E.azul.map(idDe), E2E.laranja.map(idDe)];

  // Nada aqui depende de a rodada atravessar a meia-noite ou de que dia da semana é hoje:
  // - o anotador precisa da pelada de HOJE (iniciar partida exige data = hoje); semeamos hoje e
  //   amanhã, com os mesmos times, para a rodada que virar o dia achar a pelada do novo dia;
  // - a lista da semana é a da próxima quarta; ela fica aberta à mão (estado "aberta"), então
  //   funciona em qualquer dia e hora, e semeamos a de hoje e a de amanhã pelo mesmo motivo.
  const agora = new Date();
  const hoje = dataDe(agora);
  const amanha = dataDe(new Date(agora.getTime() + 24 * 3_600_000));
  const datas = [...new Set([hoje, amanha, proximaQuarta(agora), proximaQuarta(new Date(agora.getTime() + 24 * 3_600_000))])];
  for (const data of datas) {
    const [pelada] = await db.insert(schema.peladas).values({ data, estadoManual: 'aberta' }).returning({ id: schema.peladas.id });
    if (data === hoje || data === amanha) await salvarTimesDefinitivos(db, pelada.id, elencos);
  }

  // Histórico para o ranking: duas partidas encerradas numa quarta de duas semanas atrás.
  const passado = dataDe(new Date(agora.getTime() - 14 * 24 * 3_600_000));
  const [antiga] = await db.insert(schema.peladas).values({ data: passado }).returning({ id: schema.peladas.id });
  await salvarTimesDefinitivos(db, antiga.id, elencos);
  const [timeA, timeB] = (await timesDaPelada(db, antiga.id)).map((t) => t.id);
  const noJogo = new Date(`${passado}T21:00:00-03:00`);
  const jogar = async (gols: [string, string][], minutos: number) => {
    const inicio = new Date(noJogo.getTime() + minutos * 60_000);
    const partida = await iniciarPartida(db, antiga.id, timeA, timeB, inicio);
    for (const [nome, tipo] of gols) await registrarLance(db, partida, idDe(nome), tipo as 'gol' | 'assistencia');
    await encerrarPartida(db, partida, new Date(inicio.getTime() + 5 * 60_000));
  };
  await jogar([[E2E.azul[0], 'gol'], [E2E.azul[1], 'assistencia'], [E2E.azul[0], 'gol'], [E2E.laranja[0], 'gol'], [E2E.azul[2], 'gol']], 0);
  await jogar([[E2E.laranja[1], 'gol'], [E2E.laranja[2], 'assistencia'], [E2E.azul[3], 'gol']], 10);
  console.log(`Ranking semeado em ${mesDe(noJogo)}.`);

  // Uma quarta de três semanas atrás só para o novato do jogador no PC ter "Quartas" no perfil (contra o Juca,
  // que no sorteio de hoje continua sem time).
  const outra = dataDe(new Date(agora.getTime() - 21 * 24 * 3_600_000));
  const [velha] = await db.insert(schema.peladas).values({ data: outra }).returning({ id: schema.peladas.id });
  await salvarTimesDefinitivos(db, velha.id, [[idDe(E2E.novatos.jogadorPc)], [idDe(E2E.semTime)]]);
  const [timeC, timeD] = (await timesDaPelada(db, velha.id)).map((t) => t.id);
  const inicioVelha = new Date(`${outra}T21:00:00-03:00`);
  const partidaVelha = await iniciarPartida(db, velha.id, timeC, timeD, inicioVelha);
  await registrarLance(db, partidaVelha, idDe(E2E.novatos.jogadorPc), 'gol');
  await encerrarPartida(db, partidaVelha, new Date(inicioVelha.getTime() + 5 * 60_000));

  await client.close();
  console.log('Banco do e2e pronto.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
