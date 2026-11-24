package dev.marcofilho.pelada.robo.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.marcofilho.pelada.robo.Aparelho
import dev.marcofilho.pelada.robo.Motor
import dev.marcofilho.pelada.robo.Painel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Quanto tempo o código do WhatsApp vale (o ZapGate informa 160 s). */
private const val VALIDADE_S = 160

/**
 * Conectar o WhatsApp pelo código de 8 letras. O QR não serve aqui: o WhatsApp está neste mesmo
 * aparelho, e não dá para apontar a câmera para a própria tela.
 */
@Composable
fun TelaConectar(p: Painel, aoTerminar: () -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var codigo by remember { mutableStateOf("") }
    var pedindo by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    var resta by remember { mutableIntStateOf(0) }
    var copiado by remember { mutableStateOf(false) }
    val conectado = p.conta?.estado == "connected"

    LaunchedEffect(codigo) {
        if (codigo.isEmpty()) return@LaunchedEffect
        resta = VALIDADE_S
        while (resta > 0) {
            delay(1_000)
            resta--
        }
        codigo = ""
    }

    fun pedir() {
        pedindo = true
        erro = null
        copiado = false
        escopo.launch {
            val resposta = withContext(Dispatchers.IO) {
                try {
                    val a = Motor.painel.value.ajustes
                    val api = Motor.api()
                    if (a == null || api == null) Result.failure(IllegalStateException("Falta a configuração."))
                    else Result.success(api.codigoDePareamento(a.sessao))
                } catch (e: Exception) {
                    Result.failure(e)
                }
            }
            pedindo = false
            resposta.onSuccess { codigo = it.filter(Char::isLetterOrDigit).uppercase() }
                .onFailure { erro = "Não consegui gerar o código agora. Espere um minuto e tente de novo. (${it.message})" }
        }
    }

    Coluna {
        Text(
            if (conectado) "WhatsApp conectado" else "Conectar o WhatsApp",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(8.dp))
        if (conectado) {
            Text("Este aparelho já está ligado ao número do robô.", style = MaterialTheme.typography.bodyLarge, color = Cores.apagado)
            Spacer(Modifier.height(32.dp))
            BotaoPrimario("Voltar", aoTocar = aoTerminar)
            return@Coluna
        }
        Text(
            "No WhatsApp do número do robô, neste aparelho: toque nos três pontinhos, Aparelhos conectados, " +
                "Conectar um aparelho, e escolha Conectar com número de telefone. Depois digite o código abaixo.",
            style = MaterialTheme.typography.bodyLarge,
            color = Cores.apagado,
        )
        Spacer(Modifier.height(32.dp))
        PlacasDoCodigo(codigo, semAnimacao = Aparelho.semAnimacao(ctx))
        Spacer(Modifier.height(16.dp))
        Text(
            when {
                codigo.isNotEmpty() -> "Vale por mais ${resta / 60}:${(resta % 60).toString().padStart(2, '0')}. Deixe o WhatsApp terminar de sincronizar antes de fechar."
                pedindo -> "Pedindo o código ao WhatsApp…"
                else -> "O código aparece aqui."
            },
            style = MaterialTheme.typography.bodySmall,
            color = Cores.giz,
        )
        erro?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, style = MaterialTheme.typography.bodyLarge, color = Cores.erro)
        }
        Spacer(Modifier.height(32.dp))
        if (codigo.isEmpty()) {
            BotaoPrimario(if (pedindo) "Gerando…" else "Gerar código", ativo = !pedindo, aoTocar = ::pedir)
        } else {
            BotaoPrimario(if (copiado) "Código copiado" else "Copiar código") {
                val area = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                area.setPrimaryClip(ClipData.newPlainText("Código do WhatsApp", codigo))
                copiado = true
            }
            Spacer(Modifier.height(12.dp))
            BotaoSecundario("Gerar outro", ativo = !pedindo, aoTocar = ::pedir)
        }
    }
}

/**
 * O gesto do site: pendurar a placa. Oito células fixas; cada letra entra na sua, uma por vez.
 * Com as animações do sistema desligadas, entram todas de uma vez.
 */
@Composable
private fun PlacasDoCodigo(codigo: String, semAnimacao: Boolean) {
    var penduradas by remember { mutableIntStateOf(0) }
    LaunchedEffect(codigo) {
        if (semAnimacao) {
            penduradas = codigo.length
            return@LaunchedEffect
        }
        penduradas = 0
        while (penduradas < codigo.length) {
            delay(70)
            penduradas++
        }
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics(mergeDescendants = true) {
            contentDescription = if (codigo.isEmpty()) "Código ainda não gerado" else "Código: " + codigo.toList().joinToString(" ")
        },
    ) {
        for (i in 0 until 8) {
            if (i == 4) Spacer(Modifier.width(8.dp))
            val letra = if (i < penduradas) codigo.getOrNull(i) else null
            Box(
                Modifier.weight(1f).height(64.dp).clip(MaterialTheme.shapes.medium).background(if (letra != null) Cores.placaAlta else Cores.placa),
                contentAlignment = Alignment.Center,
            ) {
                if (letra != null) {
                    Text(letra.toString(), style = MaterialTheme.typography.displayMedium.copy(fontSize = 40.sp), modifier = Modifier.clearAndSetSemantics { })
                } else {
                    Box(Modifier.size(6.dp).clip(MaterialTheme.shapes.extraLarge).background(Cores.placaAlta))
                }
            }
        }
    }
}
