package dev.marcofilho.pelada.robo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Tela provisória da fase 1: só o suficiente para ligar, desligar e ver o estado. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val p by Motor.painel.collectAsStateWithLifecycle()
            Column(Modifier.safeDrawingPadding().padding(24.dp)) {
                Text("Robô da Pelada")
                Text("Conta: ${Textos.conta(p)}")
                Text("Robô: ${Textos.robo(p)} ${p.versaoDoRobo}")
                p.aviso?.let { Text(it) }
                Button(onClick = { if (p.ligado) ServicoRobo.desligar(this@MainActivity) else ServicoRobo.ligar(this@MainActivity) }) {
                    Text(if (p.ligado) "Desligar" else "Ligar")
                }
            }
        }
    }
}
