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

    /** A frase de apoio da tela de Início: o que está acontecendo e o que a pessoa pode fazer. */
    fun explicacao(p: Painel): String {
        val simulado = p.ajustes?.simulado == true
        if (!p.configurado) return "Quem cuida do robô manda um arquivo com a configuração (o pacote). Toque em Importar pacote e escolha esse arquivo."
        if (!p.ligado) return "O robô não está respondendo. Toque em Ligar para ele voltar."
        if (!p.zapgate.rodando) return "A conexão caiu e está sendo ligada de novo sozinha."
        return when (p.conta?.estado) {
            "connected" -> when {
                !p.robo.rodando -> "A conexão está de pé. O robô está ligando."
                simulado -> "O robô está rodando com uma conta de mentira. Use a aba Ensaio para conversar com ele."
                else -> "O robô está respondendo. Pode fechar o app e usar o aparelho normalmente."
            }
            "unpaired" -> if (simulado) "Preparando a conta de mentira." else "Este aparelho ainda não está ligado ao número do robô. Toque em Conectar o WhatsApp."
            "logged_out" -> "O WhatsApp tirou este aparelho da lista de aparelhos conectados. Conecte de novo."
            "stopped" -> "A conexão parou sozinha por um sinal de risco para o número. Fale com quem cuida do robô antes de ligar de novo."
            else -> "Aguarde alguns segundos."
        }
    }

    /** Linhas de quando o robô liga ou confere o relógio: úteis nos Registros, ruído no Início. */
    private val ROTINA = listOf("ZapGate", "Robô ligado", "Respostas:", "janela aberta", "fora da janela")

    private val comData = Regex("""^\d{4}-\d{2}-\d{2} (\d{2}:\d{2}) (.+)$""")

    /**
     * As últimas coisas que o robô fez, para a tela de Início: tira as linhas do próprio app, as de
     * rotina e as voltas em que não havia nada a enviar, e deixa só a hora na frente ("18:54 respondeu no privado").
     */
    fun atividade(linhas: List<String>, quantas: Int): List<Pair<String, String>> =
        linhas.asSequence()
            .mapNotNull { comData.find(it) }
            .map { it.groupValues[1] to it.groupValues[2] }
            .filter { (_, texto) -> texto != "nada a enviar" && ROTINA.none { texto.startsWith(it) } }
            .toList()
            .takeLast(quantas)

    /** Uma linha para a notificação. */
    fun resumo(p: Painel): String {
        if (!p.ligado) return "Desligado"
        val conta = conta(p)
        return if (p.robo.rodando) conta else "$conta · robô ${robo(p).lowercase()}"
    }
}
