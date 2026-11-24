package dev.marcofilho.pelada.robo

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Como um programa está agora (para a tela e a notificação). */
data class EstadoDoFilho(
    val rodando: Boolean = false,
    val desde: Long = 0,
    val quedas: Int = 0,
    val ultimaSaida: Int? = null,
    val proximaTentativa: Long = 0,
)

/**
 * Liga um programa (o ZapGate ou o Node com o robô) como processo separado do app e o mantém
 * de pé: se cair, espera um pouco (ver [Espera]) e liga de novo, até mandarem parar.
 */
class Filho(
    val nome: String,
    private val comando: () -> List<String>,
    private val ambiente: () -> Map<String, String>,
    private val pasta: File,
    val registro: Registro,
    private val aoMudar: () -> Unit = {},
    /** Roda antes de cada partida; devolver `false` adia a partida (ex.: o robô espera o ZapGate). */
    private val pronto: () -> Boolean = { true },
) {
    @Volatile var estado = EstadoDoFilho()
        private set
    @Volatile private var parar = false
    @Volatile private var processo: Process? = null
    private var fio: Thread? = null
    private val espera = Espera()
    private val hora = SimpleDateFormat("dd/MM HH:mm:ss", Locale.ROOT)

    private fun nota(texto: String) = registro.escrever("${hora.format(Date())} [app] $texto")

    @Synchronized
    fun ligar() {
        if (fio?.isAlive == true) return
        parar = false
        espera.zerar()
        fio = thread(name = "filho-$nome", isDaemon = true) { laco() }
    }

    private fun laco() {
        while (!parar) {
            if (!pronto()) {
                dormir(2_000)
                continue
            }
            val inicio = System.currentTimeMillis()
            var saida: Int? = null
            try {
                val pb = ProcessBuilder(comando()).directory(pasta).redirectErrorStream(true)
                pb.environment().putAll(ambiente())
                val p = pb.start()
                processo = p
                estado = estado.copy(rodando = true, desde = inicio, proximaTentativa = 0)
                nota("$nome ligado")
                aoMudar()
                p.inputStream.bufferedReader().useLines { linhas -> linhas.forEach { registro.escrever(it) } }
                saida = p.waitFor()
            } catch (e: Exception) {
                nota("$nome não ligou: ${e.message}")
            } finally {
                processo = null
            }
            if (parar) break
            val pausa = espera.proxima(System.currentTimeMillis() - inicio)
            estado = estado.copy(rodando = false, quedas = estado.quedas + 1, ultimaSaida = saida, proximaTentativa = System.currentTimeMillis() + pausa)
            nota("$nome parou (código ${saida ?: "?"}); liga de novo em ${pausa / 1000} s")
            aoMudar()
            dormir(pausa)
        }
        estado = estado.copy(rodando = false, proximaTentativa = 0)
        aoMudar()
    }

    private fun dormir(ms: Long) {
        try {
            Thread.sleep(ms)
        } catch (_: InterruptedException) {
        }
    }

    /** Pede para o programa sair (SIGTERM) e, se ele não sair em 5 s, encerra à força. */
    fun desligar() {
        parar = true
        val p = processo
        if (p != null) {
            p.destroy()
            try {
                if (!p.waitFor(5, TimeUnit.SECONDS)) p.destroyForcibly()
            } catch (_: InterruptedException) {
            }
            nota("$nome desligado")
        }
        fio?.interrupt()
        fio?.join(2_000)
        fio = null
    }

    /** Derruba o programa para ele voltar com configuração ou código novo (o laço religa). */
    fun reiniciar() {
        espera.zerar()
        processo?.destroy()
    }
}
