package dev.marcofilho.pelada.robo.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.marcofilho.pelada.robo.Motor
import kotlinx.coroutines.delay

/** O que os dois programas escreveram: serve para quem cuida do robô entender um problema. */
@Composable
fun TelaRegistros() {
    val ctx = LocalContext.current
    var aba by rememberSaveable { mutableIntStateOf(0) }
    var linhas by remember { mutableStateOf(emptyList<String>()) }
    val lista = rememberLazyListState()
    val nomes = listOf("Robô", "Conexão")

    LaunchedEffect(aba) {
        while (true) {
            val novas = (if (aba == 0) Motor.registroRobo else Motor.registroZapGate).linhas()
            val estavaNoFim = !lista.canScrollForward
            if (novas != linhas) {
                linhas = novas
                // Só acompanha o fim se a pessoa não rolou para cima para ler.
                if (estavaNoFim && novas.isNotEmpty()) lista.scrollToItem(novas.lastIndex)
            }
            delay(1_500)
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Registros", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.weight(1f).semantics { heading() })
            TextButton(onClick = { compartilhar(ctx, nomes[aba], linhas) }, enabled = linhas.isNotEmpty(), modifier = Modifier.height(48.dp)) {
                Text("Compartilhar", style = MaterialTheme.typography.titleSmall)
            }
        }
        Spacer(Modifier.height(8.dp))
        // Abas encostadas à esquerda, junto do título: numa tela larga não ficam soltas no meio.
        PrimaryScrollableTabRow(
            selectedTabIndex = aba,
            containerColor = Cores.chao,
            contentColor = Cores.tinta,
            edgePadding = 8.dp,
            divider = {},
            indicator = { TabRowDefaults.PrimaryIndicator(Modifier.tabIndicatorOffset(aba, matchContentSize = true), color = Cores.tinta) },
        ) {
            nomes.forEachIndexed { i, nome ->
                Tab(selected = aba == i, onClick = { aba = i }, selectedContentColor = Cores.tinta, unselectedContentColor = Cores.apagado, text = {
                    Text(nome, style = MaterialTheme.typography.titleSmall)
                })
            }
        }
        if (linhas.isEmpty()) {
            Text(
                "Nada escrito ainda. As linhas aparecem aqui quando o robô estiver ligado.",
                style = MaterialTheme.typography.bodyLarge,
                color = Cores.apagado,
                modifier = Modifier.padding(20.dp),
            )
        } else {
            // Letra de largura fixa: são linhas de programa, com horários e colunas alinhadas.
            val estilo = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, lineHeight = 20.sp, color = Cores.apagado)
            LazyColumn(state = lista, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp), modifier = Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
                items(linhas) { Text(it, style = estilo, softWrap = false) }
            }
        }
    }
}

private fun compartilhar(ctx: Context, nome: String, linhas: List<String>) {
    val envio = Intent(Intent.ACTION_SEND).setType("text/plain")
        .putExtra(Intent.EXTRA_SUBJECT, "Registros do robô ($nome)")
        .putExtra(Intent.EXTRA_TEXT, linhas.joinToString("\n"))
    ctx.startActivity(Intent.createChooser(envio, "Mandar os registros"))
}
