package dev.marcofilho.pelada.robo

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import kotlin.concurrent.thread

/** Tudo o que a tela e a notificação mostram, numa foto só. */
data class Painel(
    val ligado: Boolean = false,
    val configurado: Boolean = false,
    val ajustes: Ajustes? = null,
    val zapgate: EstadoDoFilho = EstadoDoFilho(),
    val robo: EstadoDoFilho = EstadoDoFilho(),
    val conta: Conta? = null,
    val versaoDoRobo: String = "",
    val aviso: String? = null,
)

/**
 * O coração do app: liga o ZapGate, espera ele responder, liga o robô e vigia os dois.
 * Vive enquanto o processo do app vive; quem o mantém vivo é o [ServicoRobo].
 */
object Motor {
    private val _painel = MutableStateFlow(Painel())
    val painel: StateFlow<Painel> = _painel

    lateinit var pastas: Pastas
        private set
    lateinit var registroZapGate: Registro
        private set
    lateinit var registroRobo: Registro
        private set
    private var zapgate: Filho? = null
    private var robo: Filho? = null
    private var vigia: Thread? = null
    private var cache: File? = null

    @Synchronized
    fun preparar(ctx: Context) {
        if (::pastas.isInitialized) return
        pastas = Pastas(ctx)
        cache = ctx.cacheDir
        versaoDoApp = ctx.packageManager.getPackageInfo(ctx.packageName, 0).longVersionCode
        Instalador.preparar(ctx, pastas)
        registroZapGate = Registro(File(pastas.logs, "zapgate.log")).also { it.carregar() }
        registroRobo = Registro(File(pastas.logs, "robo.log")).also { it.carregar() }
        recarregar()
        importarPendente()
    }

    /**
     * Pacote deixado na pasta do app (`pacote.zip`): a tela de importar copia o arquivo escolhido
     * para lá, e no desenvolvimento dá para pôr direto pelo cabo. Importado ou recusado, é apagado.
     */
    @Synchronized
    fun importarPendente(): String? {
        val pendente = File(pastas.base, "pacote.zip")
        if (!pendente.exists()) return null
        val estavaLigado = _painel.value.ligado
        if (estavaLigado) desligar()
        val erro = try {
            pendente.inputStream().use { Pacote.importar(it, pastas) }
            null
        } catch (e: Pacote.Invalido) {
            e.message
        } catch (e: Exception) {
            "Não consegui abrir o pacote: ${e.message}"
        } finally {
            pendente.delete()
        }
        recarregar()
        _painel.value = _painel.value.copy(aviso = erro)
        if (estavaLigado && erro == null) ligar()
        return erro
    }

    /** Relê a configuração do disco (depois de importar um pacote ou trocar o código). */
    fun recarregar() {
        val ajustes = Ajustes.ler(pastas.appJson)
        val configurado = ajustes != null && pastas.configZapGate.exists() && pastas.envRobo.exists()
        _painel.value = _painel.value.copy(ajustes = ajustes, configurado = configurado, versaoDoRobo = Codigo.versaoAtual(pastas))
    }

    fun api(): ZapGateApi? {
        val a = _painel.value.ajustes ?: return null
        val chaves = if (pastas.envZapGate.exists()) Env.ler(pastas.envZapGate.readText(), pastas.base.path) else emptyMap()
        return ZapGateApi(a.urlZapGate, chaves[a.envDaChaveAdmin] ?: "")
    }

    private val hora = java.text.SimpleDateFormat("dd/MM HH:mm:ss", java.util.Locale.ROOT)

    /** Uma linha do próprio app nos registros, com a hora, como as do [Filho]. */
    private fun nota(registro: Registro, texto: String) = registro.escrever("${hora.format(java.util.Date())} [app] $texto")

    private fun ambienteComum(casa: File): Map<String, String> = mapOf(
        "HOME" to casa.path,
        "TMPDIR" to (cache ?: casa).path,
    )

    @Synchronized
    fun ligar() {
        if (_painel.value.ligado) return
        if (!_painel.value.configurado) {
            _painel.value = _painel.value.copy(aviso = "Falta a configuração: importe o pacote do robô.")
            return
        }
        val orfaos = Orfaos.encerrar(listOf(pastas.programaZapGate, pastas.programaNode))
        if (orfaos > 0) nota(registroZapGate, "encerrados $orfaos programa(s) que tinham ficado de uma execução anterior")

        val z = Filho(
            nome = "ZapGate",
            comando = { listOf(pastas.programaZapGate.path, "--config", pastas.configZapGate.path, "run") },
            ambiente = { ambienteComum(pastas.zapgate) },
            pasta = pastas.zapgate,
            registro = registroZapGate,
            aoMudar = ::fotografar,
        )
        val r = Filho(
            nome = "Robô",
            comando = { listOf(pastas.programaNode.path, "--use-bundled-ca", Codigo.arquivoAtual(pastas).path) },
            ambiente = {
                ambienteComum(pastas.robo) + mapOf(
                    "LD_LIBRARY_PATH" to pastas.noLib.path,
                    "PELADA_ROBO_DIR" to pastas.robo.path,
                ) + Env.ler(pastas.envRobo.readText(), pastas.base.path)
            },
            pasta = pastas.robo,
            registro = registroRobo,
            aoMudar = ::fotografar,
            // O robô desiste se o ZapGate ainda não responde: espera ele ficar de pé antes de ligar.
            pronto = { z.estado.rodando && (api()?.noAr() ?: false) },
        )
        zapgate = z
        robo = r
        _painel.value = _painel.value.copy(ligado = true, aviso = null, versaoDoRobo = Codigo.versaoAtual(pastas))
        z.ligar()
        r.ligar()
        vigia = thread(name = "vigia", isDaemon = true) { vigiar() }
    }

    @Synchronized
    fun desligar() {
        if (!_painel.value.ligado) return
        _painel.value = _painel.value.copy(ligado = false)
        vigia?.interrupt()
        vigia = null
        // O robô primeiro: assim ele não fica tentando falar com um ZapGate que já saiu.
        robo?.desligar()
        zapgate?.desligar()
        robo = null
        zapgate = null
        _painel.value = _painel.value.copy(zapgate = EstadoDoFilho(), robo = EstadoDoFilho(), conta = null)
    }

    private val _atualizacao = MutableStateFlow(EstadoDaAtualizacao())
    val atualizacao: StateFlow<EstadoDaAtualizacao> = _atualizacao
    private var versaoDoApp = 0L
    private var ultimaProcura = 0L
    private var observandoDesde = 0L
    private var quedasNaTroca = 0

    /** Procura atualização agora (botão dos Ajustes, e sozinho de 6 em 6 horas com o robô ligado). */
    fun procurarAtualizacao() {
        val a = _painel.value.ajustes ?: return
        if (!procurando.compareAndSet(false, true)) return
        try {
            procurarDeFato(a)
        } finally {
            procurando.set(false)
            _atualizacao.value = _atualizacao.value.copy(procurando = false)
        }
    }

    private val procurando = java.util.concurrent.atomic.AtomicBoolean(false)

    private fun procurarDeFato(a: Ajustes) {
        _atualizacao.value = _atualizacao.value.copy(procurando = true)
        ultimaProcura = System.currentTimeMillis()
        val antes = Codigo.versaoAtual(pastas)
        val resultado = Atualizador.procurar(pastas, a, versaoDoApp, cache ?: pastas.base)
        _atualizacao.value = resultado
        if (Codigo.versaoAtual(pastas) != antes) {
            nota(registroRobo, "atualização: de $antes para ${Codigo.versaoAtual(pastas)}")
            observandoDesde = System.currentTimeMillis()
            quedasNaTroca = robo?.quedas ?: 0
            reiniciarRobo()
        }
    }

    /** Se a versão recém-instalada não fica de pé, volta para a anterior. */
    private fun observarVersaoNova() {
        if (!Atualizador.emObservacao(pastas)) return
        val r = robo ?: return
        val agora = System.currentTimeMillis()
        if (observandoDesde == 0L) { // o app reiniciou no meio da observação: recomeça a contar
            observandoDesde = agora
            quedasNaTroca = r.quedas
        }
        val e = r.estado
        // A primeira "queda" depois da troca é o próprio reinício pedido pelo app: não conta.
        val quedas = (r.quedas - quedasNaTroca - 1).coerceAtLeast(0)
        when (Atualizador.julgar(quedas, e.rodando, if (e.rodando) agora - e.desde else 0, agora - observandoDesde)) {
            Atualizador.Veredito.ESPERAR -> return
            Atualizador.Veredito.FICOU -> {
                Atualizador.confirmar(pastas)
                nota(registroRobo, "atualização: a versão ${Codigo.versaoAtual(pastas)} ficou de pé")
            }
            Atualizador.Veredito.DESFAZER -> {
                val ruim = Atualizador.desfazer(pastas)
                nota(registroRobo, "atualização: a versão $ruim não ficou de pé; voltando para ${Codigo.versaoAtual(pastas)}")
                _atualizacao.value = EstadoDaAtualizacao(mensagem = "A versão $ruim não ficou de pé. O robô voltou para a anterior.")
                reiniciarRobo()
            }
        }
        observandoDesde = 0
    }

    /** Reinicia só o robô (código ou configuração dele mudou); o WhatsApp continua conectado. */
    fun reiniciarRobo() {
        _painel.value = _painel.value.copy(versaoDoRobo = Codigo.versaoAtual(pastas))
        robo?.reiniciar()
    }

    private fun fotografar() {
        _painel.value = _painel.value.copy(
            zapgate = zapgate?.estado ?: EstadoDoFilho(),
            robo = robo?.estado ?: EstadoDoFilho(),
        )
    }

    /**
     * No ensaio a conta de mentira começa "sem parear": o app a põe num grupo, marca como
     * conectada e libera o envio, para o robô se comportar como no WhatsApp de verdade.
     */
    private fun prepararEnsaio() {
        val a = _painel.value.ajustes ?: return
        if (!a.simulado) return
        val api = api() ?: return
        try {
            a.grupoSimulado?.let { grupo ->
                api.simularGrupos(a.sessao, org.json.JSONArray().put(org.json.JSONObject().put("address", grupo).put("name", a.nomeDoGrupoSimulado).put("participants", 16)))
            }
            api.simularEvento(a.sessao, org.json.JSONObject().put("type", "connected").put("own", "5581900000000@s.whatsapp.net"))
            api.ligarEnvio(a.sessao)
        } catch (e: Exception) {
            nota(registroZapGate, "ensaio: não consegui preparar a conta de mentira: ${e.message}")
        }
    }

    /** De 5 em 5 segundos pergunta ao ZapGate como a conta está. */
    private fun vigiar() {
        while (_painel.value.ligado) {
            val conta = try {
                val a = _painel.value.ajustes
                if (a != null && zapgate?.estado?.rodando == true) api()?.conta(a.sessao) else null
            } catch (_: Exception) {
                null
            }
            if (conta != _painel.value.conta) _painel.value = _painel.value.copy(conta = conta)
            if (conta?.estado == "unpaired") prepararEnsaio()
            observarVersaoNova()
            // De 6 em 6 horas (e uma vez logo depois de ligar) procura versão nova do robô.
            if (System.currentTimeMillis() - ultimaProcura > 6 * 3_600_000L && _painel.value.ajustes?.urlDaAtualizacao?.isNotEmpty() == true) {
                try {
                    procurarAtualizacao()
                } catch (e: Exception) {
                    nota(registroRobo, "atualização: ${e.message}")
                }
            }
            try {
                Thread.sleep(5_000)
            } catch (_: InterruptedException) {
                return
            }
        }
    }
}
