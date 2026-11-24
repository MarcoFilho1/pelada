package dev.marcofilho.pelada.robo

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/** O que o aparelho precisa deixar para o robô ficar ligado. */
object Aparelho {
    /** O Android não vai parar o app para economizar bateria? */
    fun bateriaLiberada(ctx: Context): Boolean =
        ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)

    /** Abre a pergunta do sistema "deixar este app rodar sem restrição de bateria?". */
    @SuppressLint("BatteryLife") // é exatamente o caso de uso: uma conexão permanente em segundo plano
    fun pedirBateria(ctx: Context) {
        val pedido = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
        try {
            ctx.startActivity(pedido)
        } catch (_: Exception) {
            ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    fun notificacoesLiberadas(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /**
     * Abre o instalador do Android para o APK baixado (já conferido pela assinatura do manifesto).
     * O Android ainda confere por conta própria que o APK foi assinado por quem assinou o app instalado.
     */
    fun instalar(ctx: Context, apk: java.io.File) {
        val uri = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.arquivos", apk)
        val pedido = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(pedido)
    }

    /** As animações do sistema estão desligadas? (Acessibilidade › Remover animações) */
    fun semAnimacao(ctx: Context): Boolean =
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
}
