package dev.marcofilho.pelada.robo

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteItemColors
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.marcofilho.pelada.robo.ui.AcoesDoInicio
import dev.marcofilho.pelada.robo.ui.AcoesDosAjustes
import dev.marcofilho.pelada.robo.ui.Cores
import dev.marcofilho.pelada.robo.ui.Icones
import dev.marcofilho.pelada.robo.ui.TelaAjustes
import dev.marcofilho.pelada.robo.ui.TelaConectar
import dev.marcofilho.pelada.robo.ui.TelaEnsaio
import dev.marcofilho.pelada.robo.ui.TelaInicio
import dev.marcofilho.pelada.robo.ui.TelaRegistros
import dev.marcofilho.pelada.robo.ui.TemaPelada
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // O app é sempre escuro (o chão preto do site): as barras do sistema acompanham.
        val barra = SystemBarStyle.dark(Color.Transparent.toArgb())
        enableEdgeToEdge(statusBarStyle = barra, navigationBarStyle = barra)
        super.onCreate(savedInstanceState)
        setContent { TemaPelada { Surface(Modifier.fillMaxSize(), color = Cores.chao) { Telas() } } }
    }
}

private enum class Aba(val rotulo: String) { Inicio("Início"), Ensaio("Ensaio"), Registros("Registros"), Ajustes("Ajustes") }

@Composable
private fun Telas() {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val p by Motor.painel.collectAsStateWithLifecycle()
    val atualizacao by Motor.atualizacao.collectAsStateWithLifecycle()
    val sinal by Motor.sinal.collectAsStateWithLifecycle()
    var aba by rememberSaveable { mutableStateOf(Aba.Inicio) }
    var conectando by rememberSaveable { mutableStateOf(false) }
    var importando by remember { mutableStateOf(false) }
    var bateria by remember { mutableStateOf(Aparelho.bateriaLiberada(ctx)) }
    var notificacoes by remember { mutableStateOf(Aparelho.notificacoesLiberadas(ctx)) }
    var atividade by remember { mutableStateOf(emptyList<Pair<String, String>>()) }
    LaunchedEffect(Unit) {
        while (true) {
            atividade = Textos.atividade(Motor.registroRobo.linhas(), 12)
            delay(2_000)
        }
    }

    // Ao voltar para o app (por exemplo, da tela de bateria do sistema), confere de novo.
    LifecycleResumeEffect(Unit) {
        bateria = Aparelho.bateriaLiberada(ctx)
        notificacoes = Aparelho.notificacoesLiberadas(ctx)
        onPauseOrDispose { }
    }

    val pedirNotificacao = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { notificacoes = it }
    val escolherPacote = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        importando = true
        escopo.launch {
            withContext(Dispatchers.IO) {
                try {
                    ctx.contentResolver.openInputStream(uri)?.use { entrada ->
                        File(Motor.pastas.base, "pacote.zip").outputStream().use { entrada.copyTo(it) }
                    }
                    Motor.importarPendente()
                } catch (e: Exception) {
                    File(Motor.pastas.base, "pacote.zip").delete()
                }
            }
            importando = false
            aba = Aba.Inicio
        }
    }
    val importar = { escolherPacote.launch(arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream")) }
    val liberarNotificacoes = { if (Build.VERSION.SDK_INT >= 33) pedirNotificacao.launch(Manifest.permission.POST_NOTIFICATIONS) }
    val ligar = {
        if (!notificacoes) liberarNotificacoes()
        ServicoRobo.ligar(ctx)
    }

    val abas = Aba.entries.filter { it != Aba.Ensaio || p.ajustes?.simulado == true }
    if (aba !in abas) aba = Aba.Inicio
    BackHandler(enabled = conectando || aba != Aba.Inicio) { if (conectando) conectando = false else aba = Aba.Inicio }

    // Barra embaixo no celular, trilho ao lado no tablet: o Material escolhe pela largura.
    val coresDoItem = NavigationSuiteItemColors(
        navigationBarItemColors = NavigationBarItemDefaults.colors(
            selectedIconColor = Cores.tinta, selectedTextColor = Cores.tinta, indicatorColor = Cores.placaAlta,
            unselectedIconColor = Cores.apagado, unselectedTextColor = Cores.apagado,
        ),
        navigationRailItemColors = NavigationRailItemDefaults.colors(
            selectedIconColor = Cores.tinta, selectedTextColor = Cores.tinta, indicatorColor = Cores.placaAlta,
            unselectedIconColor = Cores.apagado, unselectedTextColor = Cores.apagado,
        ),
        navigationDrawerItemColors = androidx.compose.material3.NavigationDrawerItemDefaults.colors(),
    )
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            abas.forEach { a ->
                item(
                    selected = aba == a,
                    onClick = { aba = a; conectando = false },
                    icon = {
                        Icon(
                            when (a) { Aba.Inicio -> Icones.Ligar; Aba.Ensaio -> Icones.Conversa; Aba.Registros -> Icones.Linhas; Aba.Ajustes -> Icones.Ajustes },
                            contentDescription = null,
                        )
                    },
                    label = { Text(a.rotulo, style = MaterialTheme.typography.labelMedium) },
                    colors = coresDoItem,
                )
            }
        },
        navigationSuiteColors = NavigationSuiteDefaults.colors(
            navigationBarContainerColor = Cores.chao,
            navigationRailContainerColor = Cores.chao,
        ),
        containerColor = Cores.chao,
        contentColor = Cores.tinta,
    ) {
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
            val largo = maxWidth >= 840.dp
            Column(Modifier.fillMaxSize()) {
            Marca()
            when (aba) {
                Aba.Inicio -> if (conectando) {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        IconButton(onClick = { conectando = false }, modifier = Modifier.padding(start = 8.dp, top = 8.dp).size(48.dp)) {
                            Icon(Icones.Voltar, contentDescription = "Voltar")
                        }
                        TelaConectar(p, aoTerminar = { conectando = false })
                    }
                } else {
                    Rolavel {
                        TelaInicio(
                            p, bateria, notificacoes, importando, atividade, largo,
                            AcoesDoInicio(
                                ligar = ligar,
                                desligar = { ServicoRobo.desligar(ctx) },
                                importar = importar,
                                conectar = { conectando = true },
                                liberarBateria = { Aparelho.pedirBateria(ctx) },
                                liberarNotificacoes = liberarNotificacoes,
                            ),
                        )
                    }
                }
                Aba.Ensaio -> TelaEnsaio(p)
                Aba.Registros -> TelaRegistros()
                Aba.Ajustes -> Rolavel {
                    TelaAjustes(
                        p, bateria, notificacoes, importando, atualizacao, sinal,
                        AcoesDosAjustes(
                            procurarAtualizacao = { escopo.launch(Dispatchers.IO) { Motor.procurarAtualizacao() } },
                            instalarApp = { atualizacao.appNovo?.let { Aparelho.instalar(ctx, it) } },
                            importar = importar,
                            liberarBateria = { Aparelho.pedirBateria(ctx) },
                            liberarNotificacoes = liberarNotificacoes,
                            abrirPainel = {
                                val url = (p.ajustes?.urlZapGate ?: "http://127.0.0.1:8787").trimEnd('/') + "/panel/"
                                try {
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                } catch (_: Exception) {
                                }
                            },
                        ),
                    )
                }
            }
            }
        }
    }
}

/** O nome do produto no topo de toda tela, como a marca "Pelada" no topo do site. */
@Composable
private fun Marca() {
    Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
        // A mesma marca do site: a placa do placar com a bola.
        Box(Modifier.size(width = 20.dp, height = 24.dp).clip(RoundedCornerShape(4.dp)).background(Cores.placaAlta), contentAlignment = Alignment.Center) {
            Box(Modifier.size(9.dp).clip(CircleShape).background(Cores.tinta))
        }
        Spacer(Modifier.width(10.dp))
        Text("Robô da Pelada", style = MaterialTheme.typography.titleLarge, color = Cores.tinta)
    }
}

@Composable
private fun Rolavel(conteudo: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { conteudo() }
}
