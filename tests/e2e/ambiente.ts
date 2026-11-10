// Valores do e2e, divididos entre a configuração do Playwright, a semente e os testes.
const porta = 3217;

export const E2E = {
  porta,
  url: `http://localhost:${porta}`,
  banco: './.pglite-e2e',
  usuario: 'admin-e2e',
  senha: 'senha-do-e2e-123',
  azul: ['Pepe', 'Rafa', 'Tonho', 'Zé'],
  laranja: ['Biel', 'Duda', 'Igor', 'Lucas'],
  // Sem time e fora da lista: o sorteio com COMPLETE marca os 8 dos times + estes 6 (14), e `semTime`
  // entra no lugar de um COMPLETE.
  sorteio: ['Caio', 'Enzo', 'Fábio', 'Gui', 'Hugo', 'Ivo'],
  semTime: 'Juca',
  // Jogadores de PIN padrão (1234) que cada teste de jogador usa só para si.
  novatos: { lista: 'Bruno Lista', perfil: 'Carla Perfil', ranking: 'Diego Ranking', adminPc: 'Elias AdminPc', jogadorPc: 'Flora JogadorPc' },
} as const;
