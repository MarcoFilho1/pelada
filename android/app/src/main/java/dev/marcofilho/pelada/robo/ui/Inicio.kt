package dev.marcofilho.pelada.robo.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.marcofilho.pelada.robo.Painel
import dev.marcofilho.pelada.robo.Textos
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** O que a tela de Início precisa do aparelho e o que ela pode pedir. */
class AcoesDoInicio(
    val ligar: () -> Unit,
    val desligar: () -> Unit,
    val importar: () -> Unit,
    val conectar: () -> Unit,
    val liberarBateria: () -> Unit,
    val liberarNotificacoes: () -> Unit,
)

@Composable
fun TelaInicio(p: Painel, bateriaLiberada: Boolean, notificacoesLiberadas: Boolean, importando: Boolean, atividade: List<Pair<String, String>>, largo: Boolean, acoes: AcoesDoInicio) {
    // Na tela larga (tablet) o que o robô fez por último fica ao lado; no celular, um resumo embaixo.
    if (largo) {
        Row {
            Estado(p, bateriaLiberada, notificacoesLiberadas, importando, atividade, true, acoes)
            if (p.configurado) {
                Column(Modifier.padding(start = 28.dp, end = 20.dp, top = 8.dp, bottom = 32.dp).weight(1f)) {
                    Atividade(atividade)
                }
            }
        }
    } else {
        Estado(p, bateriaLiberada, notificacoesLiberadas, importando, atividade, false, acoes)
    }
}

/** O que o robô fez por último: hora à esquerda, o que foi à direita. */
@Composable
private fun Atividade(itens: List<Pair<String, String>>) {
    Text("O que o robô fez", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
    Spacer(Modifier.height(8.dp))
    if (itens.isEmpty()) {
        Text("Nada ainda. Quando o robô mandar a lista ou responder alguém, aparece aqui.", style = MaterialTheme.typography.bodyLarge, color = Cores.apagado)
        return
    }
    itens.forEach { (hora, texto) ->
        Row(Modifier.padding(vertical = 6.dp)) {
            Text(hora, style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum"), color = Cores.giz, modifier = Modifier.width(64.dp))
            Text(texto.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodyLarge, color = Cores.tinta, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Estado(p: Painel, bateriaLiberada: Boolean, notificacoesLiberadas: Boolean, importando: Boolean, atividade: List<Pair<String, String>>, largo: Boolean, acoes: AcoesDoInicio) {
    val simulado = p.ajustes?.simulado == true
    val faltaParear = p.ligado && !simulado && p.conta?.estado in setOf("unpaired", "logged_out")
    val vivo = p.ligado && p.robo.rodando && p.conta?.estado == "connected"
    val comProblema = p.ligado && (p.zapgate.quedas > 2 || p.robo.quedas > 2 || p.conta?.estado in setOf("logged_out", "stopped"))

    Coluna {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Bolinha(if (vivo) Cores.lima else if (comProblema) Cores.erro else Cores.giz)
            Spacer(Modifier.width(12.dp))
            Text(
                if (!p.configurado) "Falta a configuração" else Textos.conta(p),
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.semantics { heading() },
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(Textos.explicacao(p), style = MaterialTheme.typography.bodyLarge, color = Cores.apagado)

        p.aviso?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, style = MaterialTheme.typography.bodyLarge, color = Cores.erro)
        }

        if (p.configurado) {
            Spacer(Modifier.height(24.dp))
            Placa {
                Fato("Robô", Textos.robo(p) + desde(p.robo.rodando, p.robo.desde))
                Fato("Conexão", if (p.zapgate.rodando) "De pé" + desde(true, p.zapgate.desde) else if (p.ligado) "Reiniciando" else "Desligada")
                // Aqui só a data (cabe em qualquer tela); a versão inteira está em Ajustes.
                if (p.versaoDoRobo.isNotEmpty()) Fato("Versão do robô", p.versaoDoRobo.substringBefore('-'))
            }
        }

        if (p.configurado && !bateriaLiberada) {
            Spacer(Modifier.height(16.dp))
            Aviso("O Android pode parar o robô para economizar bateria. Permita que este app rode sem restrição.", "Permitir", acoes.liberarBateria)
        }
        if (p.configurado && !notificacoesLiberadas) {
            Spacer(Modifier.height(16.dp))
            Aviso("Sem a notificação fixa, você não vê se o robô está ligado.", "Permitir notificações", acoes.liberarNotificacoes)
        }

        if (atividade.isNotEmpty() && !largo) {
            Spacer(Modifier.height(24.dp))
            Atividade(atividade.takeLast(3))
        }

        Spacer(Modifier.height(32.dp))
        when {
            !p.configurado -> BotaoPrimario(if (importando) "Abrindo o pacote…" else "Importar pacote", ativo = !importando, aoTocar = acoes.importar)
            !p.ligado -> BotaoPrimario("Ligar", aoTocar = acoes.ligar)
            faltaParear -> {
                BotaoPrimario("Conectar o WhatsApp", aoTocar = acoes.conectar)
                Spacer(Modifier.height(12.dp))
                BotaoSecundario("Desligar", aoTocar = acoes.desligar)
            }
            else -> BotaoSecundario("Desligar", aoTocar = acoes.desligar)
        }
    }
}

private val hora = SimpleDateFormat("HH:mm", Locale.ROOT)

private fun desde(rodando: Boolean, quando: Long): String = if (rodando && quando > 0) " desde ${hora.format(Date(quando))}" else ""

/** A coluna das telas: até 448 de largura, margem de 20, como no site. */
@Composable
fun Coluna(conteudo: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 32.dp).width(448.dp)) { conteudo() }
}
