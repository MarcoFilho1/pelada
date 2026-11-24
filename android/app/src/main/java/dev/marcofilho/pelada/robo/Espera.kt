package dev.marcofilho.pelada.robo

/**
 * Quanto esperar antes de ligar de novo um programa que caiu. Cresce a cada queda seguida
 * (1 s, 2 s, 5 s, 15 s, 30 s, 60 s) para não ficar martelando; volta ao começo quando o
 * programa fica de pé por pelo menos um minuto.
 *
 * Importa para o ZapGate: muitas reconexões seguidas ao WhatsApp são um sinal de risco para o número.
 */
class Espera(private val degraus: List<Long> = listOf(1_000, 2_000, 5_000, 15_000, 30_000, 60_000), private val estavel: Long = 60_000) {
    private var quedasSeguidas = 0

    /** `viveuMs` = quanto tempo o programa ficou de pé antes de cair. Devolve a espera em ms. */
    fun proxima(viveuMs: Long): Long {
        if (viveuMs >= estavel) quedasSeguidas = 0
        val espera = degraus[minOf(quedasSeguidas, degraus.lastIndex)]
        quedasSeguidas++
        return espera
    }

    fun zerar() {
        quedasSeguidas = 0
    }
}
