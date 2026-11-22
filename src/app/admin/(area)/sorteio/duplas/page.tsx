import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { listarDuplas } from '@/server/duplas';
import { listarJogadores } from '@/server/jogadores';
import { lerSessaoAdmin } from '@/server/sessao';
import { juntarDeNovo } from './acoes';
import { NovaDupla } from './nova-dupla';

export const metadata: Metadata = { title: 'Duplas separadas · Pelada' };

// Só os organizadores veem: pares que o sorteio (site e robô) nunca põe no mesmo time.
export default async function DuplasPage() {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const [duplas, ativos] = await Promise.all([listarDuplas(db), listarJogadores(db, { incluirInativos: false })]);
  return (
    <main className="flex flex-1 flex-col pb-10 lg:max-w-2xl">
      <Link href="/admin/sorteio" className="mt-6 self-start text-base font-medium text-apagado underline underline-offset-4">
        Voltar ao sorteio
      </Link>
      <h1 className="mt-3 font-placa text-titulo font-semibold">Duplas separadas</h1>
      <p className="mt-2 text-base text-apagado">
        O sorteio do site e o do robô nunca põem essas duplas no mesmo time. Só os organizadores veem esta lista.
      </p>
      {duplas.length ? (
        <ul className="mt-6 flex flex-col gap-2">
          {duplas.map((d) => (
            <li key={d.id} className="flex h-toque items-center justify-between gap-3 rounded-placa bg-placa pr-1 pl-4">
              <span className="min-w-0 truncate text-linha font-medium">
                {d.a.nome} e {d.b.nome}
              </span>
              <form action={juntarDeNovo}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="h-toque shrink-0 rounded-full px-4 text-base font-medium text-apagado transition-colors hover:text-tinta">
                  Tirar
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-base text-meta">Nenhuma dupla separada.</p>
      )}
      <NovaDupla jogadores={ativos.map((j) => ({ id: j.id, nome: j.nome }))} />
    </main>
  );
}
