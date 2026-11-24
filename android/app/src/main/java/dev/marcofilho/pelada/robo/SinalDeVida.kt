package dev.marcofilho.pelada.robo

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * De minuto em minuto, com o robô ligado, o app conta a um servidor como está: conta conectada ou
 * não, robô rodando ou não, versões, bateria e as últimas linhas que o próprio app escreveu
 * (ligou, caiu, atualizou). Nunca vai conversa nem número de ninguém.
 *
 * Quando o sinal para de chegar, quem cuida do robô fica sabendo que o aparelho sumiu
 * (desligou, ficou sem internet, ou o Android matou o app).
 */
object SinalDeVida {
    const val INTERVALO_MS = 60_000L

    /** Monta o que é mandado. Pura: dá para testar. */
    fun corpo(p: Painel, aparelho: String, versaoDoApp: String, bateria: Int?, carregando: Boolean?, notas: List<String>): JSONObject =
        JSONObject()
            .put("aparelho", aparelho)
            .put("conta", p.conta?.estado ?: "")
            .put("envio", p.conta?.envio ?: "")
            .put("roboRodando", p.robo.rodando)
            .put("quedasDoRobo", p.robo.quedas)
            .put("quedasDaConexao", p.zapgate.quedas)
            .put("versaoDoRobo", p.versaoDoRobo)
            .put("versaoDoApp", versaoDoApp)
            .put("simulado", p.ajustes?.simulado == true)
            .put("bateria", bateria ?: JSONObject.NULL)
            .put("carregando", carregando ?: JSONObject.NULL)
            .put("notas", JSONArray(notas))

    /** Só as linhas que o próprio app escreveu nos registros (marcadas com "[app]"), as mais recentes por último. Pura. */
    fun notasDoApp(robo: List<String>, conexao: List<String>, quantas: Int = 10): List<String> =
        (robo + conexao).filter { it.contains(" [app] ") }.sortedBy { it.substringBefore(" [app] ") }.takeLast(quantas)

    fun bateria(ctx: Context): Pair<Int?, Boolean?> {
        val estado = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null to null
        val nivel = estado.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val escala = estado.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val porcento = if (nivel >= 0 && escala > 0) nivel * 100 / escala else null
        return porcento to (estado.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0)
    }

    /** Manda um sinal. Devolve `null` se foi, ou o motivo de não ter ido. */
    fun mandar(ctx: Context, p: Painel, robo: List<String>, conexao: List<String>): String? {
        val a = p.ajustes ?: return "sem configuração"
        if (a.urlDoSinal.isEmpty()) return "sem endereço"
        if (!Manifesto.enderecoAceito(a.urlDoSinal)) return "endereço recusado (só HTTPS)"
        val (nivel, carregando) = bateria(ctx)
        val versaoDoApp = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
        val corpo = corpo(p, a.nomeDoAparelho.ifEmpty { Build.MODEL }, versaoDoApp, nivel, carregando, notasDoApp(robo, conexao))
        return try {
            val c = URL(a.urlDoSinal).openConnection() as HttpURLConnection
            try {
                c.requestMethod = "POST"
                c.connectTimeout = 10_000
                c.readTimeout = 10_000
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                if (a.chaveDoSinal.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer ${a.chaveDoSinal}")
                c.outputStream.use { it.write(corpo.toString().toByteArray()) }
                if (c.responseCode in 200..299) null else "o servidor respondeu ${c.responseCode}"
            } finally {
                c.disconnect()
            }
        } catch (e: Exception) {
            e.message ?: e.javaClass.simpleName
        }
    }
}
