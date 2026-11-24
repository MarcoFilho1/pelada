package dev.marcofilho.pelada.robo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.IBinder
import android.os.PowerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * O serviço que mantém o robô rodando com a tela apagada e o app fechado. Para o Android não
 * encerrá-lo, ele mostra uma notificação fixa ("serviço em primeiro plano") e segura o
 * processador e o Wi-Fi acordados.
 */
class ServicoRobo : Service() {
    private val escopo = CoroutineScope(Dispatchers.Default + Job())
    private var acordado: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Motor.preparar(this)
        val canal = NotificationChannel(CANAL, "Robô ligado", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Mostra que o robô está rodando neste aparelho."
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
        startForeground(ID, notificacao(Motor.painel.value), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)

        acordado = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pelada:robo").apply { acquire() }
        @Suppress("DEPRECATION")
        wifi = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "pelada:robo").apply { acquire() }

        escopo.launch(Dispatchers.IO) { Motor.ligar() }
        escopo.launch {
            Motor.painel.collect { getSystemService(NotificationManager::class.java).notify(ID, notificacao(it)) }
        }
    }

    // Se o Android encerrar o serviço por falta de memória, ele o recria sozinho.
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        escopo.cancel()
        Motor.desligar()
        acordado?.let { if (it.isHeld) it.release() }
        wifi?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun notificacao(p: Painel): Notification {
        val abrir = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle("Robô da Pelada")
            .setContentText(Textos.resumo(p))
            .setContentIntent(abrir)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    companion object {
        private const val CANAL = "robo"
        private const val ID = 1
        private const val PREFS = "robo"
        private const val LIGADO = "ligado"

        /** O dono quer o robô ligado? Guardado para religar sozinho depois de reiniciar o aparelho. */
        fun querLigado(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(LIGADO, false)

        fun ligar(ctx: Context) {
            ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(LIGADO, true).apply()
            ctx.startForegroundService(Intent(ctx, ServicoRobo::class.java))
        }

        fun desligar(ctx: Context) {
            ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(LIGADO, false).apply()
            ctx.stopService(Intent(ctx, ServicoRobo::class.java))
        }
    }
}
