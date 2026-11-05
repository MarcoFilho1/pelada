'use client';

import { useEffect } from 'react';
import { TelaDeErro } from '@/components/tela-de-erro';
import './globals.css';

// Substitui o layout raiz quando o erro é nele: precisa do próprio <html>, <body> e estilos.
export default function ErroGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Algo deu errado · Pelada</title>
        <TelaDeErro retry={retry} />
      </body>
    </html>
  );
}
