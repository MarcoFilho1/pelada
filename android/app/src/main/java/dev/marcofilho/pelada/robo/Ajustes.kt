package dev.marcofilho.pelada.robo

import org.json.JSONObject
import java.io.File

/**
 * O pouco que o app precisa saber da configuração (o resto é do ZapGate e do robô, nos
 * arquivos deles). Vem do `app.json` do pacote de configuração.
 */
data class Ajustes(
    /** Nome da conta no zapgate.toml (`[[sessions]] id`). */
    val sessao: String = "pelada",
    /** Endereço da API do ZapGate dentro do aparelho. */
    val urlZapGate: String = "http://127.0.0.1:8787",
    /** Nome, no `.env` do ZapGate, da chave de administrador (o app usa para ver o estado e parear). */
    val envDaChaveAdmin: String = "ZAPGATE_ADMIN_KEY",
    /** Verdadeiro quando a conta usa o motor simulado: nada chega ao WhatsApp. */
    val simulado: Boolean = false,
    /** Nome do grupo de ensaio (só no simulado), para a tela de teste. */
    val grupoSimulado: String? = null,
    val nomeDoGrupoSimulado: String = "Grupo de ensaio",
    /** Quem "escreve" no ensaio: o número de um organizador do `.env` do robô. */
    val organizadorSimulado: String? = null,
    /** Onde procurar versão nova do robô (vazio = não procura). */
    val urlDaAtualizacao: String = "",
    /** Chave pública (Ed25519, base64) que confere a assinatura das atualizações. */
    val chaveDaAtualizacao: String = "",
    /** (Opcional) senha que o servidor das atualizações pede, mandada como "Authorization: Bearer". */
    val tokenDaAtualizacao: String = "",
    /** Para onde mandar o sinal de vida (vazio = não manda). */
    val urlDoSinal: String = "",
    val chaveDoSinal: String = "",
) {
    companion object {
        fun ler(arquivo: File): Ajustes? = try {
            if (arquivo.exists()) deJson(arquivo.readText()) else null
        } catch (_: Exception) {
            null
        }

        fun deJson(texto: String): Ajustes {
            val j = JSONObject(texto)
            val padrao = Ajustes()
            return Ajustes(
                sessao = j.optString("sessao", padrao.sessao),
                urlZapGate = j.optString("zapgate_url", padrao.urlZapGate),
                envDaChaveAdmin = j.optString("chave_admin_env", padrao.envDaChaveAdmin),
                simulado = j.optBoolean("simulado", false),
                grupoSimulado = j.optString("grupo_simulado").ifEmpty { null },
                nomeDoGrupoSimulado = j.optString("grupo_simulado_nome", padrao.nomeDoGrupoSimulado),
                organizadorSimulado = j.optString("organizador_simulado").ifEmpty { null },
                urlDaAtualizacao = j.optString("atualizacao_url"),
                chaveDaAtualizacao = j.optString("atualizacao_chave"),
                tokenDaAtualizacao = j.optString("atualizacao_token"),
                urlDoSinal = j.optString("sinal_url"),
                chaveDoSinal = j.optString("sinal_chave"),
            )
        }
    }
}
