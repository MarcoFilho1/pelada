import { rmSync } from 'node:fs';
import { E2E } from './ambiente';

/** Apaga o banco do e2e no fim da rodada (a semente também apaga no começo). */
export default function limpar() {
  rmSync(E2E.banco, { recursive: true, force: true });
}
