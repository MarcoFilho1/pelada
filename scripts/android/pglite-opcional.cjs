// O PGlite (banco de mentira, para ensaio) não vai dentro do arquivo do robô. Se existir uma pasta
// node_modules ao lado (o pacote de ensaio traz), ele é carregado de lá; sem ela, fica vazio, e o
// robô só funciona com o banco de verdade (DATABASE_URL do Postgres).
let pglite = {};
try {
  // O nome é montado em pedaços para o empacotador não tentar embutir a biblioteca.
  pglite = require(['@electric-sql', 'pglite'].join('/'));
} catch {
  pglite = {};
}
module.exports = pglite;
