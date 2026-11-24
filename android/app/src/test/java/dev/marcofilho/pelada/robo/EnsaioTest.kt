package dev.marcofilho.pelada.robo

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EnsaioTest {
    private val robo = Conta("connected", "enabled", 0, "5581900000000@s.whatsapp.net", "100000000000001@lid")
    private val grupo = "120363000000000001@g.us"

    @Test
    fun `no grupo a mensagem marca o robo`() {
        val e = Ensaio.evento("E1", "lista", true, grupo, "5581987650001", robo, 100)
        assertEquals(grupo, e.getString("chat"))
        assertEquals("@5581900000000 lista", e.getString("text"))
        assertEquals(listOf("5581900000000@s.whatsapp.net", "100000000000001@lid"), (0 until e.getJSONArray("mentions").length()).map { e.getJSONArray("mentions").getString(it) })
        assertTrue(e.isNull("media"))
    }

    @Test
    fun `no privado a conversa e com o organizador, sem marcacao`() {
        val e = Ensaio.evento("E2", "notas", false, grupo, "5581987650001", robo, 100)
        assertEquals("5581987650001@s.whatsapp.net", e.getString("chat"))
        assertEquals("notas", e.getString("text"))
        assertEquals(0, e.getJSONArray("mentions").length())
    }

    @Test
    fun `junta textos e poe a reacao na ultima mensagem daquela conversa`() {
        val falas = listOf(Fala(true, "lista", noGrupo = true), Fala(true, "notas", noGrupo = false))
        val enviadas = JSONArray(
            """[
              {"to":"antiga","content":{"type":"text","body":"já vista"}},
              {"to":"5581987650001@s.whatsapp.net","content":{"type":"reaction","emoji":"⏳"}},
              {"to":"$grupo","content":{"type":"text","body":"Lista de quarta"}},
              {"to":"5581987650001@s.whatsapp.net","content":{"type":"text","body":"Notas"}}
            ]""",
        )
        val depois = Ensaio.juntar(falas, enviadas, 1, grupo)
        assertEquals(4, depois.size)
        assertEquals("", depois[0].reacao)
        assertEquals("⏳", depois[1].reacao)
        assertEquals(Fala(false, "Lista de quarta", noGrupo = true), depois[2])
        assertEquals(Fala(false, "Notas", noGrupo = false), depois[3])
    }
}
