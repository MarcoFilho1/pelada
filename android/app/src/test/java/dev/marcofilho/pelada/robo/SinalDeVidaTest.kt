package dev.marcofilho.pelada.robo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SinalDeVidaTest {
    @Test
    fun `conta o estado, sem nada de conversa`() {
        val p = Painel(
            ligado = true,
            ajustes = Ajustes(),
            zapgate = EstadoDoFilho(rodando = true, quedas = 1),
            robo = EstadoDoFilho(rodando = true, quedas = 2),
            conta = Conta("connected", "enabled", 0, "5581900000000@s.whatsapp.net", "1@lid"),
            versaoDoRobo = "2026.11.24-abc",
        )
        val j = SinalDeVida.corpo(p, "celular", "0.1.0", 80, true, listOf("24/11 19:00:00 [app] Robô ligado"))
        assertEquals("celular", j.getString("aparelho"))
        assertEquals("connected", j.getString("conta"))
        assertTrue(j.getBoolean("roboRodando"))
        assertEquals(2, j.getInt("quedasDoRobo"))
        assertEquals(1, j.getInt("quedasDaConexao"))
        assertEquals(80, j.getInt("bateria"))
        assertEquals(1, j.getJSONArray("notas").length())
        // O número do robô e o que as pessoas escreveram não fazem parte do sinal.
        assertTrue(!j.toString().contains("5581900000000"))
    }

    @Test
    fun `sem conta e sem bateria conhecida`() {
        val j = SinalDeVida.corpo(Painel(ligado = true), "celular", "0.1.0", null, null, emptyList())
        assertEquals("", j.getString("conta"))
        assertTrue(j.isNull("bateria"))
        assertTrue(j.isNull("carregando"))
    }

    @Test
    fun `das linhas dos registros, so as do proprio app`() {
        val robo = listOf("24/11 19:02:00 [app] Robô parou (código 1); liga de novo em 1 s", "2026-11-24 19:01 respondeu no privado (📋 Notas)")
        val conexao = listOf("24/11 19:00:00 [app] ZapGate ligado", "[2026-11-24T22:00:00Z INFO  zapgate] chat 5581987650001 wrote")
        assertEquals(
            listOf("24/11 19:00:00 [app] ZapGate ligado", "24/11 19:02:00 [app] Robô parou (código 1); liga de novo em 1 s"),
            SinalDeVida.notasDoApp(robo, conexao),
        )
    }
}
