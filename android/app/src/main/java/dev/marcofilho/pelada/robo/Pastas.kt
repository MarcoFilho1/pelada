package dev.marcofilho.pelada.robo

import android.content.Context
import java.io.File

/**
 * Onde cada coisa mora dentro do app. Tudo fica na área privada do app (só ele lê).
 *
 *   zapgate/   zapgate.toml, .env (chaves) e dados/ (a sessão do WhatsApp)
 *   robo/      a "casa" do robô: .env, estado.json, diário e registros dele
 *   codigo/    o código do robô, uma pasta por versão (a atualização baixa só isto)
 *   no/lib/    as bibliotecas que o Node carrega
 *   logs/      o que os dois programas escrevem
 */
class Pastas(val base: File, nativas: File) {
    constructor(ctx: Context) : this(ctx.filesDir, File(ctx.applicationInfo.nativeLibraryDir))

    /** Os dois programas vêm no APK como "bibliotecas": o Android só deixa executar o que está aqui. */
    val programaZapGate = File(nativas, "libzapgate.so")
    val programaNode = File(nativas, "libnode.so")

    val zapgate = File(base, "zapgate")
    val configZapGate = File(zapgate, "zapgate.toml")
    val envZapGate = File(zapgate, ".env")
    val robo = File(base, "robo")
    val envRobo = File(robo, ".env")
    val codigo = File(base, "codigo")
    val no = File(base, "no")
    val noLib = File(no, "lib")
    val logs = File(base, "logs")
    val appJson = File(base, "app.json")
    val ensaio = File(base, "ensaio")

    fun criar() {
        listOf(zapgate, robo, codigo, noLib, logs).forEach { it.mkdirs() }
    }
}
