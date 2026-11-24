package dev.marcofilho.pelada.robo

/**
 * Lê um arquivo `.env` (linhas NOME=valor) do jeito que o ZapGate e o robô leem: ignora linhas
 * vazias e comentários, tira aspas em volta do valor e troca `${APP}` pela pasta do app
 * (no celular os caminhos só são conhecidos depois de instalar).
 */
object Env {
    fun ler(texto: String, pastaDoApp: String): Map<String, String> {
        val saida = LinkedHashMap<String, String>()
        for (bruta in texto.lines()) {
            val linha = bruta.trim()
            if (linha.isEmpty() || linha.startsWith("#")) continue
            val igual = linha.indexOf('=')
            if (igual <= 0) continue
            val nome = linha.substring(0, igual).trim().removePrefix("export ").trim()
            var valor = linha.substring(igual + 1).trim()
            if (valor.length >= 2 && (valor.first() == '"' && valor.last() == '"' || valor.first() == '\'' && valor.last() == '\'')) {
                valor = valor.substring(1, valor.length - 1)
            }
            if (nome.matches(Regex("[A-Za-z_][A-Za-z0-9_]*"))) saida[nome] = valor.replace("\${APP}", pastaDoApp)
        }
        return saida
    }
}
