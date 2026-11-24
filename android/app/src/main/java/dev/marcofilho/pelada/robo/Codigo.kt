package dev.marcofilho.pelada.robo

import org.json.JSONObject
import java.io.File

/**
 * Qual código do robô está valendo. Cada versão fica numa pasta em `codigo/`, com o `robo.mjs`
 * e um `versao.json`. O arquivo `codigo/atual` diz qual usar; sem ele, vale o que veio no APK.
 */
object Codigo {
    fun pastaAtual(pastas: Pastas): File {
        val marca = File(pastas.codigo, "atual")
        val nome = if (marca.exists()) marca.readText().trim() else ""
        val escolhida = File(pastas.codigo, nome)
        return if (nome.isNotEmpty() && File(escolhida, "robo.mjs").exists()) escolhida else File(pastas.codigo, Instalador.EMBUTIDO)
    }

    fun arquivoAtual(pastas: Pastas): File = File(pastaAtual(pastas), "robo.mjs")

    fun versaoAtual(pastas: Pastas): String = versaoDe(pastaAtual(pastas))

    fun versaoDe(pasta: File): String = try {
        JSONObject(File(pasta, "versao.json").readText()).optString("versao")
    } catch (_: Exception) {
        ""
    }
}
