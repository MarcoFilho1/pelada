package dev.marcofilho.pelada.robo

import org.junit.Assert.assertEquals
import org.junit.Test

class TextosTest {
    private val real = Ajustes()
    private val ensaio = Ajustes(simulado = true)
    private val dePe = EstadoDoFilho(rodando = true)

    @Test
    fun `desligado`() {
        assertEquals("Desligado", Textos.resumo(Painel()))
    }

    @Test
    fun `conectado de verdade e no ensaio`() {
        val base = Painel(ligado = true, zapgate = dePe, robo = dePe, conta = Conta("connected", "enabled", 0))
        assertEquals("WhatsApp conectado", Textos.resumo(base.copy(ajustes = real)))
        assertEquals("Ensaio: nada vai para o WhatsApp", Textos.resumo(base.copy(ajustes = ensaio)))
    }

    @Test
    fun `falta parear`() {
        val p = Painel(ligado = true, ajustes = real, zapgate = dePe, robo = dePe, conta = Conta("unpaired", "disabled", 0))
        assertEquals("Falta conectar o WhatsApp", Textos.conta(p))
    }

    @Test
    fun `robo caido aparece no resumo`() {
        val p = Painel(ligado = true, ajustes = real, zapgate = dePe, robo = EstadoDoFilho(quedas = 2), conta = Conta("connected", "enabled", 0))
        assertEquals("WhatsApp conectado · robô reiniciando", Textos.resumo(p))
    }

    @Test
    fun `zapgate caindo`() {
        val p = Painel(ligado = true, ajustes = real, zapgate = EstadoDoFilho(quedas = 1))
        assertEquals("Reiniciando a conexão", Textos.conta(p))
    }
}
