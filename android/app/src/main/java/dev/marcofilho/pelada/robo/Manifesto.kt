package dev.marcofilho.pelada.robo

import org.json.JSONObject
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/** Uma coisa que dá para baixar: o robô ou o próprio app. */
data class Item(val versao: String, val numero: Long, val url: String, val sha256: String, val assinatura: String)

/**
 * O manifesto é o arquivo pequeno que o app consulta para saber se há versão nova. Ele diz a versão,
 * de onde baixar, o resumo (SHA-256) do arquivo e uma assinatura.
 *
 * A assinatura é o que impede alguém de empurrar código para o robô: só quem tem a chave privada
 * (guardada no computador de quem cuida do robô) consegue assinar; o app só tem a chave pública,
 * que serve para conferir e não para assinar. Onde o arquivo fica hospedado não precisa ser de
 * confiança.
 */
data class Manifesto(val robo: Item?, val app: Item?, val appMinimo: Long) {
    companion object {
        fun deJson(texto: String): Manifesto {
            val j = JSONObject(texto)
            fun item(nome: String): Item? = j.optJSONObject(nome)?.let {
                Item(it.getString("versao"), it.getLong("numero"), it.getString("url"), it.getString("sha256").lowercase(), it.getString("assinatura"))
            }
            return Manifesto(robo = item("robo"), app = item("app"), appMinimo = j.optLong("app_minimo", 0))
        }

        /**
         * O texto exato que é assinado. Prende o tipo (robô ou app), o número, a versão e o resumo:
         * trocar qualquer um deles, ou apresentar o arquivo de um como se fosse do outro, invalida a assinatura.
         */
        fun textoAssinado(tipo: String, item: Item): String = "pelada-android-v1\n$tipo\n${item.numero}\n${item.versao}\n${item.sha256}\n"

        /** `chavePublica`: ECDSA P-256 no formato X.509, em base64 (o que `publicar-robo.mjs chave` imprime). */
        fun assinaturaConfere(tipo: String, item: Item, chavePublica: String): Boolean = try {
            val chave = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(chavePublica.trim())))
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(chave)
                update(textoAssinado(tipo, item).toByteArray())
                verify(Base64.getDecoder().decode(item.assinatura.trim()))
            }
        } catch (_: Exception) {
            false
        }

        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

        /** Endereço do arquivo: absoluto, ou relativo ao endereço do manifesto. */
        fun resolver(manifesto: String, url: String): String = java.net.URI(manifesto).resolve(url).toString()

        /** Só HTTPS; HTTP simples só para dentro do próprio aparelho (testes pelo cabo). */
        fun enderecoAceito(url: String): Boolean {
            val u = try {
                java.net.URI(url)
            } catch (_: Exception) {
                return false
            }
            return u.scheme == "https" || (u.scheme == "http" && u.host in setOf("127.0.0.1", "localhost"))
        }
    }
}
