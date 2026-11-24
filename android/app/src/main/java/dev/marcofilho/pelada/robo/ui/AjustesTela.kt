package dev.marcofilho.pelada.robo.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.marcofilho.pelada.robo.BuildConfig
import dev.marcofilho.pelada.robo.EstadoDaAtualizacao
import dev.marcofilho.pelada.robo.Painel

class AcoesDosAjustes(
    val importar: () -> Unit,
    val liberarBateria: () -> Unit,
    val liberarNotificacoes: () -> Unit,
    val abrirPainel: () -> Unit,
    val procurarAtualizacao: () -> Unit,
    val instalarApp: () -> Unit,
)

@Composable
fun TelaAjustes(p: Painel, bateriaLiberada: Boolean, notificacoesLiberadas: Boolean, importando: Boolean, atualizacao: EstadoDaAtualizacao, acoes: AcoesDosAjustes) {
    Coluna {
        Text("Ajustes", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })

        Secao("Configuração")
        Linha(
            titulo = if (importando) "Abrindo o pacote…" else if (p.configurado) "Trocar o pacote" else "Importar pacote",
            apoio = if (p.configurado) "Substitui as regras e as chaves pelas de um pacote novo. O robô reinicia." else "O arquivo que quem cuida do robô mandou.",
            aoTocar = if (importando) null else acoes.importar,
        )
        if (p.configurado) {
            Linha("Painel de regras", "Abre no navegador o painel do ZapGate deste aparelho. Pede a chave de administrador.", acoes.abrirPainel)
        }

        Secao("Este aparelho")
        Linha(
            titulo = "Bateria",
            apoio = if (bateriaLiberada) "Sem restrição: o Android não para o robô para economizar." else "Com restrição: o Android pode parar o robô. Toque para liberar.",
            aoTocar = if (bateriaLiberada) null else acoes.liberarBateria,
        )
        Linha(
            titulo = "Notificação fixa",
            apoio = if (notificacoesLiberadas) "Liberada: mostra quando o robô está ligado." else "Bloqueada. Toque para liberar.",
            aoTocar = if (notificacoesLiberadas) null else acoes.liberarNotificacoes,
        )

        if (p.ajustes?.urlDaAtualizacao?.isNotEmpty() == true) {
            Secao("Atualização")
            Linha(
                titulo = if (atualizacao.procurando) "Procurando…" else "Procurar atualização",
                apoio = atualizacao.mensagem.ifEmpty { "O app procura sozinho de 6 em 6 horas. O robô novo entra sem reinstalar o app." },
                aoTocar = if (atualizacao.procurando) null else acoes.procurarAtualizacao,
            )
            if (atualizacao.appNovo != null) {
                Spacer(Modifier.height(12.dp))
                BotaoPrimario("Instalar o app ${atualizacao.versaoDoAppNovo}", aoTocar = acoes.instalarApp)
            }
        }

        Secao("Versões")
        Placa {
            Fato("App", BuildConfig.VERSION_NAME)
            Fato("Robô", p.versaoDoRobo.ifEmpty { "sem código" })
        }
    }
}

@Composable
fun Secao(nome: String) {
    Spacer(Modifier.height(32.dp))
    Text(nome, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
    Spacer(Modifier.height(8.dp))
}

/** Uma linha de ajuste: tocável (com seta) quando há o que fazer; só informa quando já está certo. */
@Composable
fun Linha(titulo: String, apoio: String, aoTocar: (() -> Unit)?) {
    val base = Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium)
    Row(
        (if (aoTocar != null) base.clickable(role = Role.Button, onClick = aoTocar) else base).heightIn(min = 56.dp).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(titulo, style = MaterialTheme.typography.titleMedium, color = Cores.tinta)
            Text(apoio, style = MaterialTheme.typography.bodySmall, color = Cores.apagado)
        }
        if (aoTocar != null) {
            Spacer(Modifier.width(12.dp))
            Icon(Icones.Seta, contentDescription = null, tint = Cores.apagado)
        }
    }
}
