package dev.marcofilho.pelada.robo

import org.junit.Assert.assertEquals
import org.junit.Test

class EsperaTest {
    @Test
    fun `cresce a cada queda seguida e para no teto`() {
        val e = Espera()
        val vistas = (1..8).map { e.proxima(viveuMs = 500) }
        assertEquals(listOf<Long>(1_000, 2_000, 5_000, 15_000, 30_000, 60_000, 60_000, 60_000), vistas)
    }

    @Test
    fun `volta ao comeco depois de ficar de pe um minuto`() {
        val e = Espera()
        repeat(4) { e.proxima(viveuMs = 500) }
        assertEquals(1_000L, e.proxima(viveuMs = 61_000))
        assertEquals(2_000L, e.proxima(viveuMs = 500))
    }

    @Test
    fun `zerar recomeca`() {
        val e = Espera()
        repeat(3) { e.proxima(0) }
        e.zerar()
        assertEquals(1_000L, e.proxima(0))
    }
}
