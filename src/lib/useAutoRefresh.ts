'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Busca a página de novo no servidor (`router.refresh()`) a cada `intervaloMs`, só enquanto a aba
 * está visível. Ao voltar para a aba, atualiza na hora. O estado dos componentes cliente fica.
 */
export function useAutoRefresh(intervaloMs = 5000): void {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const parar = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const ligar = () => {
      if (!timer) timer = setInterval(() => router.refresh(), intervaloMs);
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        ligar();
      } else {
        parar();
      }
    };
    if (document.visibilityState === 'visible') ligar();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [router, intervaloMs]);
}
