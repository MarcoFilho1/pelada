package dev.marcofilho.pelada.robo

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Como a conta do WhatsApp está, segundo o ZapGate. */
data class Conta(val estado: String, val envio: String, val fila: Int, val endereco: String = "", val lid: String = "")

/** Conversa com a API do ZapGate que roda dentro do aparelho (127.0.0.1). */
class ZapGateApi(private val url: String, private val chaveAdmin: String) {
    class Erro(val codigo: Int, mensagem: String) : Exception(mensagem)

    private fun pedir(metodo: String, caminho: String, corpo: String? = null, prazoMs: Int = 4_000): String {
        val c = URL(url.trimEnd('/') + caminho).openConnection() as HttpURLConnection
        try {
            c.requestMethod = metodo
            c.connectTimeout = prazoMs
            c.readTimeout = prazoMs
            if (chaveAdmin.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer $chaveAdmin")
            if (corpo != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(corpo.toByteArray()) }
            }
            val codigo = c.responseCode
            val texto = (if (codigo in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (codigo !in 200..299) throw Erro(codigo, mensagemDeErro(texto, codigo))
            return texto
        } finally {
            c.disconnect()
        }
    }

    private fun mensagemDeErro(texto: String, codigo: Int): String = try {
        val j = JSONObject(texto)
        j.optString("message").ifEmpty { j.optString("error") }.ifEmpty { "HTTP $codigo" }
    } catch (_: Exception) {
        "HTTP $codigo"
    }

    /** A API já responde? (sem chave: só confere se o ZapGate terminou de ligar) */
    fun noAr(): Boolean = try {
        pedir("GET", "/v1/health", prazoMs = 1_500)
        true
    } catch (e: Erro) {
        true // respondeu, mesmo que com erro: está de pé
    } catch (_: Exception) {
        false
    }

    fun conta(sessao: String): Conta? {
        val lista = JSONArray(pedir("GET", "/v1/sessions"))
        for (i in 0 until lista.length()) {
            val s = lista.getJSONObject(i)
            if (s.optString("id") == sessao) return Conta(s.optString("state"), s.optString("sending"), s.optInt("queue_length"), s.optString("own_address"), s.optString("own_lid"))
        }
        return null
    }

    /** Pede um código de 8 letras para conectar o WhatsApp ("Conectar com número de telefone"). */
    fun codigoDePareamento(sessao: String): String =
        JSONObject(pedir("POST", "/v1/sessions/$sessao/pairing", """{"method":"code"}""", prazoMs = 30_000)).getString("code")

    // ---- Só no motor simulado (ensaio): nada disto chega ao WhatsApp ----

    fun simularEvento(sessao: String, evento: JSONObject) {
        pedir("POST", "/v1/_fake/$sessao/event", evento.toString())
    }

    fun simularGrupos(sessao: String, grupos: JSONArray) {
        pedir("PUT", "/v1/_fake/$sessao/groups", grupos.toString())
    }

    /** Tudo o que o robô "mandou" no ensaio, na ordem. */
    fun enviadasNoEnsaio(sessao: String): JSONArray = JSONArray(pedir("GET", "/v1/_fake/$sessao/sent"))

    fun ligarEnvio(sessao: String) {
        pedir("PUT", "/v1/sessions/$sessao/sending", """{"enabled":true}""")
    }
}
