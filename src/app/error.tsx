'use client';

import { useEffect } from 'react';
import { TelaDeErro } from '@/components/tela-de-erro';

// Erro inesperado numa tela: o detalhe fica no console (no servidor, no log); a pessoa vê só a saída.
export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <TelaDeErro retry={retry} />;
}
