package dev.marcofilho.pelada.robo

import android.content.Context
import java.io.File

/**
 * Tira de dentro do APK o que os programas precisam achar como arquivo de verdade:
 * as bibliotecas do Node e o código do robô que veio com o app.
 * Só copia de novo quando a versão muda (as bibliotecas têm ~45 MB).
 */
object Instalador {
    /** Nome da pasta, em `codigo/`, do robô que veio dentro do APK. */
    const val EMBUTIDO = "embutido"

    fun preparar(ctx: Context, pastas: Pastas) {
        pastas.criar()
        copiarSeMudou(ctx, "no/versao", "no/lib", pastas.noLib, File(pastas.no, "versao"))
        copiarSeMudou(ctx, "robo/versao.json", "robo", File(pastas.codigo, EMBUTIDO), File(pastas.codigo, "$EMBUTIDO.versao"))
    }

    private fun copiarSeMudou(ctx: Context, marcaNoApk: String, origem: String, destino: File, marcaInstalada: File) {
        val nova = try {
            ctx.assets.open(marcaNoApk).use { it.readBytes().decodeToString().trim() }
        } catch (_: Exception) {
            return // este APK veio sem essa parte (build de desenvolvimento)
        }
        if (marcaInstalada.exists() && marcaInstalada.readText().trim() == nova && destino.isDirectory) return
        destino.deleteRecursively()
        destino.mkdirs()
        for (nome in ctx.assets.list(origem).orEmpty()) {
            ctx.assets.open("$origem/$nome").use { entrada ->
                File(destino, nome).outputStream().use { entrada.copyTo(it) }
            }
        }
        marcaInstalada.writeText(nova)
    }
}
