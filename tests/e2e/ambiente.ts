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
  // Jogadores de PIN padrão (1234) que cada teste de jogador usa só para si.
  novatos: { lista: 'Bruno Lista', perfil: 'Carla Perfil', ranking: 'Diego Ranking' },
} as const;
