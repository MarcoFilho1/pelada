import { textoWhatsApp } from '@/domain/copiarLista';
import { diaMes } from '@/domain/tempo';
import type { EstadoDaSemana } from '@/server/presencas';
import type { TipoMensagem } from './agenda';
import { juntarNomes, linhasDoCabecalho, mudancas, type FotoDaLista } from './foto';

const juntar = (linhas: string[], lista: EstadoDaSemana, data: string) => [...linhas, '', textoWhatsApp(lista, data)].join('\n');

export function montarMensagem(
  tipo: TipoMensagem,
  estadoDaSemana: EstadoDaSemana,
  foto: FotoDaLista,
  anterior: FotoDaLista | null,
): string {
  const data = estadoDaSemana.data;
  const dia = diaMes(data);
  const cabecalho = (): string[] => (anterior ? linhasDoCabecalho(mudancas(anterior, foto)) : []);

  switch (tipo) {
    case 'abertura':
      return juntar([`A lista de quarta, ${dia} está aberta.`], estadoDaSemana, data);
    case 'primeira':
      return juntar([`Lista de quarta, ${dia}:`], estadoDaSemana, data);
    case 'rodada':
      return juntar(cabecalho(), estadoDaSemana, data);
    case 'lembrete': {
      const pendentes = estadoDaSemana.principal.filter((i) => i.tipo === 'M' && !i.confirmado).map((i) => i.nome);
      const fixo = `Faltam 2 horas para os mensalistas confirmarem. Ainda não confirmaram: ${juntarNomes(pendentes)}.`;
      return juntar([fixo, ...cabecalho()], estadoDaSemana, data);
    }
    case 'prazo': {
      const perderam = anterior
        ? mudancas(anterior, foto).perderamPrazo
        : Object.values(foto.jogadores).filter((j) => j.onde === 'prazo').map((j) => j.nome);
      const resto = anterior ? linhasDoCabecalho({ ...mudancas(anterior, foto), perderamPrazo: [] }) : [];
      const meio = perderam.length ? [`Perderam a vaga: ${juntarNomes(perderam)}.`] : ['Todos os mensalistas confirmaram.'];
      return juntar(['Prazo dos mensalistas encerrado.', ...meio, ...resto], estadoDaSemana, data);
    }
    case 'cancelada':
      return `A pelada de quarta, ${dia} foi cancelada.`;
    case 'voltou':
      return juntar([`A pelada de quarta, ${dia} voltou.`], estadoDaSemana, data);
  }
}
