package dev.marcofilho.pelada.robo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class AtualizadorTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val par = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val publica = Base64.getEncoder().encodeToString(par.public.encoded)

    private fun assinar(tipo: String, item: Item): Item {
        val assinatura = Signature.getInstance("SHA256withECDSA").run {
            initSign(par.private)
            update(Manifesto.textoAssinado(tipo, item).toByteArray())
            Base64.getEncoder().encodeToString(sign())
        }
        return item.copy(assinatura = assinatura)
    }

    private val conteudo = "console.log('robô novo')".toByteArray()
    private val item = Item("2026.12.01-abc1234", 2_000, "robo.mjs", Manifesto.sha256(conteudo), "")

    @Test
    fun `assinatura certa confere`() {
        assertTrue(Manifesto.assinaturaConfere("robo", assinar("robo", item), publica))
    }

    @Test
    fun `mexer em qualquer campo assinado invalida`() {
        val bom = assinar("robo", item)
        assertFalse(Manifesto.assinaturaConfere("robo", bom.copy(numero = 3_000), publica))
        assertFalse(Manifesto.assinaturaConfere("robo", bom.copy(versao = "outra"), publica))
        assertFalse(Manifesto.assinaturaConfere("robo", bom.copy(sha256 = Manifesto.sha256("outro".toByteArray())), publica))
        // O arquivo do robô não passa por arquivo do app, nem o contrário.
        assertFalse(Manifesto.assinaturaConfere("app", bom, publica))
    }

    @Test
    fun `assinatura de outra chave, vazia ou lixo nao confere`() {
        val outra = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        assertFalse(Manifesto.assinaturaConfere("robo", assinar("robo", item), Base64.getEncoder().encodeToString(outra.public.encoded)))
        assertFalse(Manifesto.assinaturaConfere("robo", item, publica))
        assertFalse(Manifesto.assinaturaConfere("robo", item.copy(assinatura = "não é base64!"), publica))
        assertFalse(Manifesto.assinaturaConfere("robo", assinar("robo", item), "chave quebrada"))
    }

    @Test
    fun `le o manifesto`() {
        val m = Manifesto.deJson("""{"app_minimo":2,"robo":{"versao":"v","numero":5,"url":"r.mjs","sha256":"ABCD","assinatura":"x"}}""")
        assertEquals(Item("v", 5, "r.mjs", "abcd", "x"), m.robo)
        assertNull(m.app)
        assertEquals(2, m.appMinimo)
    }

    @Test
    fun `so https, ou http dentro do aparelho`() {
        assertTrue(Manifesto.enderecoAceito("https://exemplo.com/m.json"))
        assertTrue(Manifesto.enderecoAceito("http://127.0.0.1:8799/m.json"))
        assertFalse(Manifesto.enderecoAceito("http://exemplo.com/m.json"))
        assertFalse(Manifesto.enderecoAceito("file:///sdcard/m.json"))
        assertEquals("https://exemplo.com/pasta/robo.mjs", Manifesto.resolver("https://exemplo.com/pasta/manifesto.json", "robo.mjs"))
    }

    @Test
    fun `quando nao trocar`() {
        assertNull(Atualizador.motivoParaNaoTrocar(item, 1_000, emptySet(), 0, 1))
        assertEquals("O robô já está na versão mais nova.", Atualizador.motivoParaNaoTrocar(item, 2_000, emptySet(), 0, 1))
        assertTrue(Atualizador.motivoParaNaoTrocar(item, 1_000, setOf(item.versao), 0, 1)!!.contains("não ficou de pé"))
        assertTrue(Atualizador.motivoParaNaoTrocar(item, 1_000, emptySet(), 5, 1)!!.contains("app mais novo"))
        assertEquals("O nome da versão não é válido.", Atualizador.motivoParaNaoTrocar(item.copy(versao = "../fora"), 1_000, emptySet(), 0, 1))
    }

    @Test
    fun `julga a versao em observacao`() {
        assertEquals(Atualizador.Veredito.ESPERAR, Atualizador.julgar(0, true, 10_000, 10_000))
        assertEquals(Atualizador.Veredito.FICOU, Atualizador.julgar(1, true, 60_000, 90_000))
        assertEquals(Atualizador.Veredito.DESFAZER, Atualizador.julgar(3, false, 0, 20_000))
        // Nunca ficou um minuto de pé e o prazo acabou.
        assertEquals(Atualizador.Veredito.DESFAZER, Atualizador.julgar(1, true, 5_000, 180_000))
    }

    @Test
    fun `troca, e desfazer volta para a anterior e anota a recusada`() {
        val p = Pastas(tmp.newFolder("app"), tmp.newFolder("nativas")).also { it.criar() }
        File(p.codigo, "embutido").mkdirs()
        File(p.codigo, "embutido/robo.mjs").writeText("antigo")
        File(p.codigo, "embutido/versao.json").writeText("""{"versao":"embutida","numero":1000}""")
        assertEquals(1_000, Atualizador.numeroAtual(p))

        Atualizador.trocar(p, item, conteudo)
        assertEquals(item.versao, Codigo.versaoAtual(p))
        assertEquals(2_000, Atualizador.numeroAtual(p))
        assertTrue(Atualizador.emObservacao(p))
        assertEquals("console.log('robô novo')", Codigo.arquivoAtual(p).readText())

        assertEquals(item.versao, Atualizador.desfazer(p))
        assertEquals("embutida", Codigo.versaoAtual(p))
        assertFalse(Atualizador.emObservacao(p))
        assertTrue(Atualizador.motivoParaNaoTrocar(item, 1_000, File(p.codigo, "recusadas").readLines().toSet(), 0, 1)!!.contains("não ficou de pé"))
    }

    @Test
    fun `confirmar encerra a observacao e mantem a versao nova`() {
        val p = Pastas(tmp.newFolder("app2"), tmp.newFolder("nativas2")).also { it.criar() }
        Atualizador.trocar(p, item, conteudo)
        Atualizador.confirmar(p)
        assertFalse(Atualizador.emObservacao(p))
        assertEquals(item.versao, Codigo.versaoAtual(p))
    }
}
