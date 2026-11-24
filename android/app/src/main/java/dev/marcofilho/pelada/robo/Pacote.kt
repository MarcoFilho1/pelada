package dev.marcofilho.pelada.robo

import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

/**
 * O pacote de configuração é um .zip montado no computador de quem cuida do robô
 * (android/scripts/montar-pacote.sh). Dentro dele só podem vir estas pastas e arquivos:
 *
 *   app.json                o que o app precisa saber (ver [Ajustes])
 *   zapgate/zapgate.toml    as regras do ZapGate
 *   zapgate/.env            as chaves do ZapGate
 *   zapgate/dados/...       (opcional) a sessão do WhatsApp trazida de outro aparelho
 *   robo/.env               a configuração do robô
 *   robo/estado.json        (opcional) o estado do robô
 *   codigo/node_modules/... (opcional, ensaio) o banco de mentira
 *   ensaio/...              (opcional, ensaio) os dados do banco de mentira
 */
object Pacote {
    private val RAIZES = listOf("zapgate/", "robo/", "codigo/node_modules/", "ensaio/")
    private const val LIMITE = 400L * 1024 * 1024

    class Invalido(mensagem: String) : Exception(mensagem)

    /** Para onde um item do zip vai, ou erro se ele tenta sair das pastas permitidas. */
    fun destino(base: File, nome: String): File {
        val limpo = nome.replace('\\', '/')
        // Vale o que está dentro de uma pasta permitida, e as pastas do caminho até ela ("codigo/").
        val permitido = limpo == "app.json" || RAIZES.any { limpo.startsWith(it) || (limpo.endsWith("/") && it.startsWith(limpo)) }
        if (!permitido || limpo.split('/').any { it == ".." } || limpo.startsWith("/")) {
            throw Invalido("O pacote tem um item fora do lugar: $nome")
        }
        val alvo = File(base, limpo).canonicalFile
        if (!alvo.path.startsWith(base.canonicalPath + File.separator)) throw Invalido("O pacote tem um item fora do lugar: $nome")
        return alvo
    }

    /**
     * Abre o pacote numa pasta provisória, confere, e só então troca a configuração atual pela nova.
     * Um pacote com sessão (`zapgate/dados`) ou com banco de ensaio substitui os que existiam;
     * sem eles, os atuais ficam.
     */
    fun importar(entrada: InputStream, pastas: Pastas): Ajustes {
        val base = pastas.base
        val provisoria = File(base, "pacote.novo")
        provisoria.deleteRecursively()
        provisoria.mkdirs()
        try {
            var total = 0L
            ZipInputStream(entrada.buffered()).use { zip ->
                while (true) {
                    val item = zip.nextEntry ?: break
                    val nome = item.name.removePrefix("./")
                    if (nome.isEmpty() || nome.startsWith("__MACOSX/") || nome.endsWith(".DS_Store")) continue
                    val alvo = destino(provisoria, nome)
                    if (item.isDirectory) {
                        alvo.mkdirs()
                        continue
                    }
                    alvo.parentFile?.mkdirs()
                    alvo.outputStream().use { saida ->
                        val pedaco = ByteArray(64 * 1024)
                        while (true) {
                            val n = zip.read(pedaco)
                            if (n < 0) break
                            total += n
                            if (total > LIMITE) throw Invalido("O pacote é grande demais.")
                            saida.write(pedaco, 0, n)
                        }
                    }
                }
            }
            val app = File(provisoria, "app.json")
            if (!app.exists()) throw Invalido("Este arquivo não é um pacote do robô (falta o app.json).")
            if (!File(provisoria, "zapgate/zapgate.toml").exists()) throw Invalido("O pacote veio sem as regras do ZapGate (zapgate/zapgate.toml).")
            if (!File(provisoria, "robo/.env").exists()) throw Invalido("O pacote veio sem a configuração do robô (robo/.env).")
            val ajustes = try {
                Ajustes.deJson(app.readText())
            } catch (_: Exception) {
                throw Invalido("O app.json do pacote não está num formato válido.")
            }

            // Pastas inteiras que o pacote substitui quando traz.
            for (inteira in listOf("zapgate/dados", "codigo/node_modules", "ensaio")) {
                if (File(provisoria, inteira).exists()) File(base, inteira).deleteRecursively()
            }
            provisoria.walkTopDown().filter { it.isFile }.forEach { arquivo ->
                val alvo = File(base, arquivo.relativeTo(provisoria).path)
                alvo.parentFile?.mkdirs()
                arquivo.copyTo(alvo, overwrite = true)
            }
            // Pastas vazias também contam (o banco de ensaio precisa delas).
            provisoria.walkTopDown().filter { it.isDirectory }.forEach { File(base, it.relativeTo(provisoria).path).mkdirs() }
            listOf(pastas.envZapGate, pastas.envRobo, pastas.configZapGate).forEach {
                it.setReadable(false, false)
                it.setReadable(true, true)
                it.setWritable(false, false)
                it.setWritable(true, true)
            }
            return ajustes
        } finally {
            provisoria.deleteRecursively()
        }
    }
}
