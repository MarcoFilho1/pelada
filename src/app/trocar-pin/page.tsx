import type { Metadata } from 'next';
import { Tela, Topo } from '@/components/topo';
import { TrocarPin } from './trocar-pin';

export const metadata: Metadata = { title: 'Crie seu PIN · Pelada' };

export default function TrocarPinPage() {
  return (
    <Tela>
      <Topo />
      <TrocarPin />
    </Tela>
  );
}
