package dev.marcofilho.pelada.robo

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

/** Uma fala da conversa de ensaio. */
data class Fala(val minha: Boolean, val texto: String, val noGrupo: Boolean, val reacao: String = "")

/**
 * A conversa de ensaio: quem testa escreve como se fosse um organizador (no grupo ou no privado
 * do robô) e vê o que o robô responderia. Tudo passa pelo motor simulado do ZapGate, então as
 * regras anti-ban valem como no WhatsApp de verdade, mas nada sai do aparelho.
 */
object Ensaio {
    private val _falas = MutableStateFlow<List<Fala>>(emptyList())
    val falas: StateFlow<List<Fala>> = _falas
    private var vistas = 0
    private var numero = 0

    /** Monta o evento "alguém escreveu" no formato que o motor simulado espera. Pura: dá para testar. */
    fun evento(id: String, texto: String, noGrupo: Boolean, grupo: String, organizador: String, robo: Conta, agoraS: Long): JSONObject {
        val remetente = "$organizador@s.whatsapp.net"
        val marcacao = robo.endereco.substringBefore('@')
        return JSONObject()
            .put("type", "message")
            .put("id", id)
            .put("chat", if (noGrupo) grupo else remetente)
            .put("sender", remetente)
            .put("sender_alt", JSONObject.NULL)
            .put("push_name", "Organizador")
            .put("timestamp", agoraS)
            // No grupo o robô só responde quando é marcado, como no WhatsApp.
            .put("text", if (noGrupo) "@$marcacao $texto" else texto)
            .put("media", JSONObject.NULL)
            .put("mentions", if (noGrupo) JSONArray(listOf(robo.endereco, robo.lid).filter { it.isNotEmpty() }) else JSONArray())
            .put("reply_to", JSONObject.NULL)
            .put("offline", false)
    }

    /** Junta à conversa o que o robô mandou desde a última olhada. Pura sobre a lista recebida. */
    fun juntar(falas: List<Fala>, enviadas: JSONArray, desde: Int, grupo: String): List<Fala> {
        val saida = falas.toMutableList()
        for (i in desde until enviadas.length()) {
            val item = enviadas.getJSONObject(i)
            val conteudo = item.optJSONObject("content") ?: continue
            val noGrupo = item.optString("to") == grupo
            when (conteudo.optString("type")) {
                "text" -> saida.add(Fala(minha = false, texto = conteudo.optString("body"), noGrupo = noGrupo))
                "reaction" -> {
                    // A reação (⏳, ✅, ❌) vai na última mensagem que quem testa mandou naquela conversa.
                    val alvo = saida.indexOfLast { it.minha && it.noGrupo == noGrupo }
                    if (alvo >= 0) saida[alvo] = saida[alvo].copy(reacao = conteudo.optString("emoji"))
                }
            }
        }
        return saida
    }

    /** Devolve a mensagem de erro, ou `null` se foi. */
    fun escrever(texto: String, noGrupo: Boolean): String? {
        val painel = Motor.painel.value
        val a = painel.ajustes ?: return "Falta a configuração."
        val conta = painel.conta
        if (!a.simulado) return "A conversa de ensaio só existe no modo de ensaio."
        if (conta == null || conta.estado != "connected") return "O ensaio ainda está ligando. Tente em alguns segundos."
        val api = Motor.api() ?: return "Falta a configuração."
        val grupo = a.grupoSimulado ?: return "O pacote de ensaio veio sem grupo."
        val organizador = a.organizadorSimulado ?: return "O pacote de ensaio veio sem organizador."
        return try {
            numero++
            api.simularEvento(a.sessao, evento("E${System.currentTimeMillis()}$numero", texto, noGrupo, grupo, organizador, conta, System.currentTimeMillis() / 1000))
            _falas.value = _falas.value + Fala(minha = true, texto = texto, noGrupo = noGrupo)
            null
        } catch (e: Exception) {
            "Não consegui entregar a mensagem ao robô: ${e.message}"
        }
    }

    /** Chamado de tempo em tempo pela tela enquanto ela está aberta. */
    fun olhar() {
        val a = Motor.painel.value.ajustes ?: return
        if (!a.simulado) return
        val api = Motor.api() ?: return
        try {
            val enviadas = api.enviadasNoEnsaio(a.sessao)
            if (enviadas.length() < vistas) vistas = 0 // o ZapGate reiniciou e a lista recomeçou
            if (enviadas.length() > vistas) {
                _falas.value = juntar(_falas.value, enviadas, vistas, a.grupoSimulado ?: "")
                vistas = enviadas.length()
            }
        } catch (_: Exception) {
        }
    }
}
