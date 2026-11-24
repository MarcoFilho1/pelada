package dev.marcofilho.pelada.robo

import java.io.File

/**
 * Se o Android matar o app sem aviso, o ZapGate e o Node podem ficar rodando soltos, segurando a
 * sessão do WhatsApp e as portas. Antes de ligar de novo, o app encerra esses restos.
 * Só enxerga (e só consegue encerrar) processos do próprio app.
 */
object Orfaos {
    fun encerrar(programas: List<File>): Int {
        val meu = android.os.Process.myPid()
        var encerrados = 0
        for (pasta in File("/proc").listFiles().orEmpty()) {
            val pid = pasta.name.toIntOrNull() ?: continue
            if (pid == meu) continue
            val comando = try {
                File(pasta, "cmdline").readText().substringBefore('\u0000')
            } catch (_: Exception) {
                continue
            }
            if (programas.any { it.path == comando }) {
                android.os.Process.killProcess(pid)
                encerrados++
            }
        }
        if (encerrados > 0) Thread.sleep(800) // tempo para soltarem a sessão e as portas
        return encerrados
    }
}
