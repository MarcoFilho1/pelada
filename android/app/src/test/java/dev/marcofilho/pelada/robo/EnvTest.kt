package dev.marcofilho.pelada.robo

import org.junit.Assert.assertEquals
import org.junit.Test

class EnvTest {
    @Test
    fun `le nome e valor, ignora comentarios e linhas vazias`() {
        val env = Env.ler("# comentário\n\nA=1\nB = dois \nsem igual\n", "/app")
        assertEquals(mapOf("A" to "1", "B" to "dois"), env)
    }

    @Test
    fun `tira aspas e aceita export`() {
        val env = Env.ler("export A=\"com espaço\"\nB='x=y'\n", "/app")
        assertEquals("com espaço", env["A"])
        assertEquals("x=y", env["B"])
    }

    @Test
    fun `troca APP pela pasta do app`() {
        val env = Env.ler("DATABASE_URL=pglite:\${APP}/ensaio/banco\n", "/data/app")
        assertEquals("pglite:/data/app/ensaio/banco", env["DATABASE_URL"])
    }

    @Test
    fun `nome invalido nao entra`() {
        assertEquals(emptyMap<String, String>(), Env.ler("1A=x\nA-B=y\n=z\n", "/app"))
    }
}
