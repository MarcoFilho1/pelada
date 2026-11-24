package dev.marcofilho.pelada.robo.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.marcofilho.pelada.robo.Ensaio
import dev.marcofilho.pelada.robo.Fala
import dev.marcofilho.pelada.robo.Painel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Conversa de mentira com o robô: quem testa escreve como um organizador, no grupo ou no privado. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TelaEnsaio(p: Painel) {
    val todas by Ensaio.falas.collectAsStateWithLifecycle()
    var noGrupo by rememberSaveable { mutableStateOf(true) }
    var texto by rememberSaveable { mutableStateOf("") }
    var erro by remember { mutableStateOf<String?>(null) }
    val escopo = rememberCoroutineScope()
    val falas = todas.filter { it.noGrupo == noGrupo }
    val lista = rememberLazyListState()
    val pronto = p.ligado && p.conta?.estado == "connected" && p.robo.rodando

    // Enquanto a tela está aberta, olha de segundo em segundo se o robô respondeu.
    LaunchedEffect(Unit) {
        while (true) {
            withContext(Dispatchers.IO) { Ensaio.olhar() }
            delay(1_000)
        }
    }
    LaunchedEffect(falas.size) { if (falas.isNotEmpty()) lista.animateScrollToItem(falas.lastIndex) }

    fun mandar(o: String) {
        val limpo = o.trim()
        if (limpo.isEmpty()) return
        texto = ""
        escopo.launch { erro = withContext(Dispatchers.IO) { Ensaio.escrever(limpo, noGrupo) } }
    }

    Column(Modifier.fillMaxHeight().widthIn(max = 680.dp).imePadding().padding(horizontal = 20.dp)) {
        Spacer(Modifier.height(8.dp))
        Text("Ensaio", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(8.dp))
        Text(
            "Escreva como se fosse um organizador. Nada sai deste aparelho: a conta e os jogadores são de mentira.",
            style = MaterialTheme.typography.bodyLarge,
            color = Cores.apagado,
        )
        Spacer(Modifier.height(16.dp))
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            val cores = SegmentedButtonDefaults.colors(
                activeContainerColor = Cores.placaAlta,
                activeContentColor = Cores.tinta,
                activeBorderColor = Cores.placaAlta,
                inactiveContainerColor = Color.Transparent,
                inactiveContentColor = Cores.apagado,
                inactiveBorderColor = Cores.placaAlta,
            )
            listOf(true to "No grupo", false to "No privado").forEachIndexed { i, (valor, rotulo) ->
                SegmentedButton(
                    selected = noGrupo == valor,
                    onClick = { noGrupo = valor },
                    shape = SegmentedButtonDefaults.itemShape(i, 2),
                    colors = cores,
                    icon = {},
                    modifier = Modifier.height(48.dp),
                ) { Text(rotulo, style = MaterialTheme.typography.titleSmall) }
            }
        }

        Spacer(Modifier.height(8.dp))
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (falas.isEmpty()) {
                Column(Modifier.padding(top = 24.dp)) {
                    Text(
                        if (!pronto) "O ensaio ainda está ligando. Ligue o robô na aba Início e espere alguns segundos."
                        else if (noGrupo) "No grupo o robô só responde quando é marcado. Aqui toda mensagem já vai marcando ele. Experimente:"
                        else "No privado o robô atende só os organizadores. Experimente:",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Cores.apagado,
                    )
                    if (pronto) {
                        Spacer(Modifier.height(12.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val ideias = if (noGrupo) listOf("lista", "falta confirmar", "adicionar Bento", "ranking", "ajuda") else listOf("notas", "ajuda", "sortear", "site")
                            ideias.forEach { ideia ->
                                SuggestionChip(
                                    onClick = { mandar(ideia) },
                                    label = { Text(ideia, style = MaterialTheme.typography.titleSmall) },
                                    shape = CircleShape,
                                    border = null,
                                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = Cores.placaAlta, labelColor = Cores.tinta),
                                    modifier = Modifier.height(48.dp),
                                )
                            }
                        }
                    }
                }
            } else {
                LazyColumn(
                    state = lista,
                    contentPadding = PaddingValues(top = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    itemsIndexed(falas) { _, fala -> Balao(fala) }
                }
            }
        }

        erro?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Cores.erro, modifier = Modifier.padding(bottom = 8.dp)) }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 16.dp)) {
            TextField(
                value = texto,
                onValueChange = { texto = it },
                placeholder = { Text(if (noGrupo) "Mensagem no grupo" else "Mensagem no privado", color = Cores.giz) },
                singleLine = true,
                enabled = pronto,
                textStyle = MaterialTheme.typography.titleMedium,
                shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { mandar(texto) }),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Cores.placa,
                    unfocusedContainerColor = Cores.placa,
                    disabledContainerColor = Cores.placa,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                    cursorColor = Cores.lima,
                ),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            FilledIconButton(
                onClick = { mandar(texto) },
                enabled = pronto && texto.isNotBlank(),
                modifier = Modifier.size(56.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = Cores.tinta,
                    contentColor = Cores.chao,
                    disabledContainerColor = Cores.placaAlta,
                    disabledContentColor = Cores.giz,
                ),
            ) { Icon(Icones.Enviar, contentDescription = "Enviar") }
        }
    }
}

@Composable
private fun Balao(fala: Fala) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (fala.minha) Arrangement.End else Arrangement.Start) {
        Column(horizontalAlignment = if (fala.minha) Alignment.End else Alignment.Start, modifier = Modifier.widthIn(max = 480.dp)) {
            Text(
                fala.texto,
                style = MaterialTheme.typography.bodyLarge,
                color = Cores.tinta,
                modifier = Modifier
                    .clip(MaterialTheme.shapes.medium)
                    .background(if (fala.minha) Cores.placaAlta else Cores.placa)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
            // A reação do robô à mensagem (⏳ pensando, ✅ feito, ❌ recusado) é conteúdo do WhatsApp, não ícone do app.
            if (fala.reacao.isNotEmpty()) Text(fala.reacao, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp, end = 4.dp))
        }
    }
}
