package dev.marcofilho.pelada.robo

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Quando o aparelho liga (ou o app é atualizado), religa o robô se ele estava ligado. */
class AoIniciar : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val acoes = setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, "android.intent.action.QUICKBOOT_POWERON")
        if (intent.action in acoes && ServicoRobo.querLigado(ctx)) ServicoRobo.ligar(ctx)
    }
}
