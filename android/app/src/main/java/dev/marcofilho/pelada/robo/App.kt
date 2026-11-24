package dev.marcofilho.pelada.robo

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Motor.preparar(this)
    }
}
