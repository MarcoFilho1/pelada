package dev.marcofilho.pelada.robo

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** O que a tela de Ajustes mostra sobre a atualização. */
data class EstadoDaAtualizacao(
    val procurando: Boolean = false,
    val mensagem: String = "",
    /** Versão nova do app pronta para instalar (o arquivo já foi baixado e conferido). */
    val appNovo: File? = null,
    val versaoDoAppNovo: String = "",
)

/**
 * Atualização do robô sem reinstalar o app: baixa o arquivo novo, confere a assinatura e o resumo,
 * troca e reinicia só o robô (o WhatsApp continua conectado). Se a versão nova não ficar de pé,
 * volta sozinho para a anterior e não tenta aquela versão de novo.
 */
object Atualizador {
    /** Quantas vezes o robô pode cair, em quanto tempo, antes de a versão nova ser desfeita. */
    const val QUEDAS_PARA_DESFAZER = 3
    const val OBSERVACAO_MS = 3 * 60_000L
    const val DE_PE_MS = 60_000L
    private const val TAMANHO_MAXIMO = 20L * 1024 * 1024
    private const val TAMANHO_MAXIMO_DO_APP = 300L * 1024 * 1024

    /** Decide o que fazer com a versão que está em observação. Pura: dá para testar. */
    enum class Veredito { ESPERAR, FICOU, DESFAZER }

    fun julgar(quedasDesdeATroca: Int, rodando: Boolean, dePeHaMs: Long, emObservacaoHaMs: Long): Veredito = when {
        quedasDesdeATroca >= QUEDAS_PARA_DESFAZER -> Veredito.DESFAZER
        rodando && dePeHaMs >= DE_PE_MS -> Veredito.FICOU
        emObservacaoHaMs >= OBSERVACAO_MS -> Veredito.DESFAZER
        else -> Veredito.ESPERAR
    }

    /** A versão do manifesto serve para este aparelho? Devolve o motivo de não servir, ou `null`. Pura. */
    fun motivoParaNaoTrocar(item: Item, numeroAtual: Long, recusadas: Set<String>, appMinimo: Long, versaoDoApp: Long): String? = when {
        item.numero <= numeroAtual -> "O robô já está na versão mais nova."
        item.versao in recusadas -> "A versão ${item.versao} já foi tentada e não ficou de pé; esperando a próxima."
        appMinimo > versaoDoApp -> "A versão ${item.versao} do robô precisa de um app mais novo."
        !item.versao.matches(Regex("[A-Za-z0-9._+-]{1,64}")) || item.versao.startsWith(".") -> "O nome da versão não é válido."
        else -> null
    }

    private fun baixar(url: String, token: String, limite: Long): ByteArray {
        if (!Manifesto.enderecoAceito(url)) throw IllegalStateException("endereço recusado (só HTTPS): $url")
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000
            c.readTimeout = 30_000
            c.instanceFollowRedirects = true
            if (token.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer $token")
            if (c.responseCode != 200) throw IllegalStateException("o servidor respondeu ${c.responseCode}")
            val saida = java.io.ByteArrayOutputStream()
            c.inputStream.use { entrada ->
                val pedaco = ByteArray(64 * 1024)
                while (true) {
                    val n = entrada.read(pedaco)
                    if (n < 0) break
                    saida.write(pedaco, 0, n)
                    if (saida.size() > limite) throw IllegalStateException("arquivo grande demais")
                }
            }
            return saida.toByteArray()
        } finally {
            c.disconnect()
        }
    }

    private fun recusadas(pastas: Pastas): Set<String> = File(pastas.codigo, "recusadas").let { if (it.exists()) it.readLines().map(String::trim).filter(String::isNotEmpty).toSet() else emptySet() }

    fun numeroAtual(pastas: Pastas): Long = try {
        JSONObject(File(Codigo.pastaAtual(pastas), "versao.json").readText()).optLong("numero")
    } catch (_: Exception) {
        0
    }

    /**
     * Procura versão nova e, se houver, instala a do robô. Devolve o estado para a tela.
     * `versaoDoApp` é o número de versão do app instalado; `cache` é onde o APK baixado fica.
     */
    fun procurar(pastas: Pastas, ajustes: Ajustes, versaoDoApp: Long, cache: File): EstadoDaAtualizacao {
        if (ajustes.urlDaAtualizacao.isEmpty() || ajustes.chaveDaAtualizacao.isEmpty()) return EstadoDaAtualizacao(mensagem = "Este pacote não diz onde procurar atualizações.")
        val manifesto = try {
            Manifesto.deJson(baixar(ajustes.urlDaAtualizacao, ajustes.tokenDaAtualizacao, 64 * 1024).decodeToString())
        } catch (e: Exception) {
            return EstadoDaAtualizacao(mensagem = "Não consegui consultar as atualizações: ${e.message}")
        }
        var mensagem = "O robô já está na versão mais nova."
        manifesto.robo?.let { item ->
            val motivo = motivoParaNaoTrocar(item, numeroAtual(pastas), recusadas(pastas), manifesto.appMinimo, versaoDoApp)
            mensagem = motivo ?: try {
                instalarRobo(pastas, ajustes, item)
                "Robô atualizado para ${item.versao}. Se ele não ficar de pé, a versão anterior volta sozinha."
            } catch (e: Exception) {
                "A atualização para ${item.versao} não foi instalada: ${e.message}"
            }
        }
        var appNovo: File? = null
        var versaoDoAppNovo = ""
        manifesto.app?.let { item ->
            if (item.numero > versaoDoApp) {
                try {
                    if (!Manifesto.assinaturaConfere("app", item, ajustes.chaveDaAtualizacao)) throw IllegalStateException("a assinatura não confere")
                    val bytes = baixar(Manifesto.resolver(ajustes.urlDaAtualizacao, item.url), ajustes.tokenDaAtualizacao, TAMANHO_MAXIMO_DO_APP)
                    if (Manifesto.sha256(bytes) != item.sha256) throw IllegalStateException("o arquivo baixado não é o que foi assinado")
                    val pasta = File(cache, "atualizacao").apply { deleteRecursively(); mkdirs() }
                    appNovo = File(pasta, "robo-da-pelada.apk").apply { writeBytes(bytes) }
                    versaoDoAppNovo = item.versao
                } catch (e: Exception) {
                    mensagem += " Há um app novo (${item.versao}), mas não consegui baixá-lo: ${e.message}"
                }
            }
        }
        return EstadoDaAtualizacao(mensagem = mensagem, appNovo = appNovo, versaoDoAppNovo = versaoDoAppNovo)
    }

    /** Baixa, confere e troca. Qualquer falha deixa tudo como estava. */
    private fun instalarRobo(pastas: Pastas, ajustes: Ajustes, item: Item) {
        if (!Manifesto.assinaturaConfere("robo", item, ajustes.chaveDaAtualizacao)) throw IllegalStateException("a assinatura não confere")
        val bytes = baixar(Manifesto.resolver(ajustes.urlDaAtualizacao, item.url), ajustes.tokenDaAtualizacao, TAMANHO_MAXIMO)
        if (Manifesto.sha256(bytes) != item.sha256) throw IllegalStateException("o arquivo baixado não é o que foi assinado")
        trocar(pastas, item, bytes)
    }

    /** Grava a versão nova numa pasta própria e aponta `atual` para ela, lembrando qual era a anterior. */
    fun trocar(pastas: Pastas, item: Item, bytes: ByteArray) {
        val nova = File(pastas.codigo, item.versao)
        val provisoria = File(pastas.codigo, "${item.versao}.baixando")
        provisoria.deleteRecursively()
        provisoria.mkdirs()
        File(provisoria, "robo.mjs").writeBytes(bytes)
        File(provisoria, "versao.json").writeText(JSONObject().put("versao", item.versao).put("numero", item.numero).toString())
        nova.deleteRecursively()
        if (!provisoria.renameTo(nova)) throw IllegalStateException("não consegui gravar a versão nova")
        val anterior = Codigo.pastaAtual(pastas).name
        File(pastas.codigo, "anterior").writeText(anterior)
        File(pastas.codigo, "em-observacao").writeText(item.versao)
        File(pastas.codigo, "atual").writeText(item.versao)
        limpar(pastas, manter = setOf(item.versao, anterior))
    }

    /** A versão nova ficou de pé: deixa de ser observada. */
    fun confirmar(pastas: Pastas) {
        File(pastas.codigo, "em-observacao").delete()
    }

    /** A versão nova não ficou de pé: volta para a anterior e anota para não tentar de novo. Devolve a recusada. */
    fun desfazer(pastas: Pastas): String {
        val ruim = File(pastas.codigo, "em-observacao").let { if (it.exists()) it.readText().trim() else "" }
        val anterior = File(pastas.codigo, "anterior").let { if (it.exists()) it.readText().trim() else Instalador.EMBUTIDO }
        File(pastas.codigo, "atual").writeText(anterior)
        File(pastas.codigo, "em-observacao").delete()
        if (ruim.isNotEmpty()) File(pastas.codigo, "recusadas").appendText("$ruim\n")
        return ruim
    }

    fun emObservacao(pastas: Pastas): Boolean = File(pastas.codigo, "em-observacao").exists()

    /** Apaga versões antigas: ficam só a atual, a anterior e a que veio no APK. */
    private fun limpar(pastas: Pastas, manter: Set<String>) {
        pastas.codigo.listFiles().orEmpty()
            .filter { it.isDirectory && it.name != Instalador.EMBUTIDO && it.name != "node_modules" && it.name !in manter }
            .forEach { it.deleteRecursively() }
    }
}
