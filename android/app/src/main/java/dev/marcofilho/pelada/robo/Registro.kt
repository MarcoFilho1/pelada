package dev.marcofilho.pelada.robo

import java.io.File

/**
 * O que um programa escreve vai para um arquivo (para o suporte) e para uma memória curta
 * (para a tela). O arquivo não cresce sem fim: ao passar do limite, vira `.1` e começa outro.
 */
class Registro(private val arquivo: File, private val limiteBytes: Long = 1_000_000, private val linhasNaMemoria: Int = 300) {
    private val ultimas = ArrayDeque<String>()

    @Synchronized
    fun escrever(linha: String) {
        ultimas.addLast(linha)
        while (ultimas.size > linhasNaMemoria) ultimas.removeFirst()
        try {
            arquivo.parentFile?.mkdirs()
            if (arquivo.length() > limiteBytes) {
                val antigo = File(arquivo.path + ".1")
                antigo.delete()
                arquivo.renameTo(antigo)
            }
            arquivo.appendText(linha + "\n")
        } catch (_: Exception) {
            // Sem espaço ou sem permissão: a memória curta continua valendo.
        }
    }

    @Synchronized
    fun linhas(): List<String> = ultimas.toList()

    /** Carrega o fim do arquivo na memória (depois que o app é reaberto). */
    @Synchronized
    fun carregar() {
        if (ultimas.isNotEmpty() || !arquivo.exists()) return
        try {
            arquivo.readLines().takeLast(linhasNaMemoria).forEach { ultimas.addLast(it) }
        } catch (_: Exception) {
        }
    }
}
