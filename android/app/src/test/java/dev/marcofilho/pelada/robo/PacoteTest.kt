package dev.marcofilho.pelada.robo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class PacoteTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun zip(vararg itens: Pair<String, String?>): ByteArrayInputStream {
        val bytes = ByteArrayOutputStream()
        ZipOutputStream(bytes).use { z ->
            for ((nome, texto) in itens) {
                z.putNextEntry(ZipEntry(nome))
                if (texto != null) z.write(texto.toByteArray())
                z.closeEntry()
            }
        }
        return ByteArrayInputStream(bytes.toByteArray())
    }

    private fun pastas() = Pastas(tmp.newFolder("app"), tmp.newFolder("nativas")).also { it.criar() }

    private val minimo = arrayOf<Pair<String, String?>>(
        "app.json" to """{"sessao":"pelada","simulado":true}""",
        "zapgate/zapgate.toml" to "data_dir = \"dados\"\n",
        "zapgate/.env" to "ZAPGATE_ADMIN_KEY=abc\n",
        "robo/.env" to "ROBO_MOTOR=zapgate\n",
    )

    @Test
    fun `importa um pacote completo`() {
        val p = pastas()
        val ajustes = Pacote.importar(zip(*minimo, "ensaio/" to null, "ensaio/banco/vazia/" to null, "codigo/" to null, "codigo/node_modules/x/index.js" to "1"), p)
        assertTrue(ajustes.simulado)
        assertEquals("ROBO_MOTOR=zapgate\n", p.envRobo.readText())
        assertTrue(File(p.base, "ensaio/banco/vazia").isDirectory)
        assertTrue(File(p.base, "codigo/node_modules/x/index.js").exists())
        assertFalse(File(p.base, "pacote.novo").exists())
    }

    @Test
    fun `recusa item fora das pastas permitidas e nao mexe em nada`() {
        val p = pastas()
        p.envRobo.writeText("ANTIGO=1\n")
        for (ruim in listOf("../fora.txt", "zapgate/../../fora.txt", "/etc/passwd", "logs/x.log", "codigo/embutido/robo.mjs")) {
            assertThrows(Pacote.Invalido::class.java) { Pacote.importar(zip(*minimo, ruim to "x"), p) }
        }
        assertEquals("ANTIGO=1\n", p.envRobo.readText())
        assertFalse(File(p.base.parentFile, "fora.txt").exists())
    }

    @Test
    fun `recusa pacote sem as partes obrigatorias`() {
        val p = pastas()
        assertThrows(Pacote.Invalido::class.java) { Pacote.importar(zip("zapgate/zapgate.toml" to "", "robo/.env" to ""), p) }
        assertThrows(Pacote.Invalido::class.java) { Pacote.importar(zip("app.json" to "{}", "robo/.env" to ""), p) }
        assertThrows(Pacote.Invalido::class.java) { Pacote.importar(zip("app.json" to "{}", "zapgate/zapgate.toml" to ""), p) }
        assertThrows(Pacote.Invalido::class.java) { Pacote.importar(zip(*minimo.drop(1).toTypedArray(), "app.json" to "isto não é json"), p) }
    }

    @Test
    fun `pacote sem sessao mantem a sessao atual, com sessao substitui`() {
        val p = pastas()
        File(p.zapgate, "dados/sessions/pelada").mkdirs()
        File(p.zapgate, "dados/sessions/pelada/antiga.db").writeText("antiga")
        Pacote.importar(zip(*minimo), p)
        assertTrue(File(p.zapgate, "dados/sessions/pelada/antiga.db").exists())
        Pacote.importar(zip(*minimo, "zapgate/dados/sessions/pelada/nova.db" to "nova"), p)
        assertFalse(File(p.zapgate, "dados/sessions/pelada/antiga.db").exists())
        assertTrue(File(p.zapgate, "dados/sessions/pelada/nova.db").exists())
    }
}
