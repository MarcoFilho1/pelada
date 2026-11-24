package dev.marcofilho.pelada.robo

/** As frases que explicam o estado, iguais na tela e na notificação. Sem Android aqui: dá para testar. */
object Textos {
    fun conta(p: Painel): String {
        val simulado = p.ajustes?.simulado == true
        if (!p.ligado) return "Desligado"
        if (!p.zapgate.rodando) return if (p.zapgate.quedas > 0) "Reiniciando a conexão" else "Ligando"
        return when (p.conta?.estado) {
            "connected" -> if (simulado) "Ensaio: nada vai para o WhatsApp" else "WhatsApp conectado"
            "unpaired" -> if (simulado) "Ensaio: preparando" else "Falta conectar o WhatsApp"
            "connecting", "reconnecting" -> "Conectando ao WhatsApp"
            "logged_out" -> "O WhatsApp desconectou este aparelho"
            "stopped" -> "Conexão parada por segurança"
            null -> "Ligando"
            else -> "WhatsApp: ${p.conta.estado}"
        }
    }

    fun robo(p: Painel): String = when {
        !p.ligado -> "Desligado"
        p.robo.rodando -> "Rodando"
        p.robo.quedas > 0 -> "Reiniciando"
        else -> "Esperando a conexão"
    }

    /** Uma linha para a notificação. */
    fun resumo(p: Painel): String {
        if (!p.ligado) return "Desligado"
        val conta = conta(p)
        return if (p.robo.rodando) conta else "$conta · robô ${robo(p).lowercase()}"
    }
}
