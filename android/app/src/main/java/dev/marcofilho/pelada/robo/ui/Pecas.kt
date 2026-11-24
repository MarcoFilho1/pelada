package dev.marcofilho.pelada.robo.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** A única ação principal da tela: pílula branca, texto preto, 56 de altura. */
@Composable
fun BotaoPrimario(texto: String, modifier: Modifier = Modifier, ativo: Boolean = true, aoTocar: () -> Unit) {
    Button(
        onClick = aoTocar,
        enabled = ativo,
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = Cores.tinta,
            contentColor = Cores.chao,
            disabledContainerColor = Cores.placaAlta,
            disabledContentColor = Cores.apagado,
        ),
    ) { Text(texto, style = MaterialTheme.typography.labelLarge) }
}

/** Ação de apoio: a mesma pílula, um degrau de luz acima do chão. */
@Composable
fun BotaoSecundario(texto: String, modifier: Modifier = Modifier, ativo: Boolean = true, aoTocar: () -> Unit) {
    Button(
        onClick = aoTocar,
        enabled = ativo,
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = Cores.placaAlta,
            contentColor = Cores.tinta,
            disabledContainerColor = Cores.placa,
            disabledContentColor = Cores.giz,
        ),
    ) { Text(texto, style = MaterialTheme.typography.labelLarge) }
}

/** Uma placa: superfície um degrau acima do chão, sem borda e sem sombra. */
@Composable
fun Placa(modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(Cores.placa).padding(horizontal = 16.dp, vertical = 6.dp),
    ) { conteudo() }
}

/** "Robô ........ Rodando": o nome do fato à esquerda, o valor à direita. */
@Composable
fun Fato(nome: String, valor: String, corDoValor: Color = Cores.tinta) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(nome, style = MaterialTheme.typography.bodyLarge, color = Cores.apagado)
        Spacer(Modifier.width(16.dp))
        Text(valor, style = MaterialTheme.typography.titleSmall, color = corDoValor, textAlign = TextAlign.End)
    }
}

/** A bolinha de estado: lima quando está vivo, giz quando parado, vermelha com problema. */
@Composable
fun Bolinha(cor: Color, modifier: Modifier = Modifier) {
    Box(modifier.size(12.dp).clip(CircleShape).background(cor).clearAndSetSemantics { })
}

/** Um aviso com uma saída: diz o problema e oferece o botão que resolve. */
@Composable
fun Aviso(texto: String, acao: String?, aoTocar: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(Cores.placa).padding(16.dp)) {
        Text(texto, style = MaterialTheme.typography.bodyLarge, color = Cores.tinta)
        if (acao != null) {
            Spacer(Modifier.size(12.dp))
            BotaoSecundario(acao, aoTocar = aoTocar)
        }
    }
}
