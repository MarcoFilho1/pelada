package dev.marcofilho.pelada.robo.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/** Ícones de um traço só (1,75), como no site. Desenhados aqui para não depender de biblioteca. */
object Icones {
    private fun icone(nome: String, desenho: PathBuilder.() -> Unit): ImageVector =
        ImageVector.Builder(name = nome, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f).apply {
            path(
                fill = null,
                stroke = SolidColor(Color.White),
                strokeLineWidth = 1.75f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
                pathBuilder = desenho,
            )
        }.build()

    /** Início: o botão de ligar. */
    val Ligar = icone("Ligar") {
        moveTo(12f, 3.5f); lineTo(12f, 11.5f)
        moveTo(7.2f, 6.6f)
        arcTo(7.5f, 7.5f, 0f, true, false, 16.8f, 6.6f)
    }

    /** Ensaio: um balão de conversa. */
    val Conversa = icone("Conversa") {
        moveTo(4f, 6.5f)
        arcTo(2f, 2f, 0f, false, true, 6f, 4.5f)
        lineTo(18f, 4.5f)
        arcTo(2f, 2f, 0f, false, true, 20f, 6.5f)
        lineTo(20f, 14.5f)
        arcTo(2f, 2f, 0f, false, true, 18f, 16.5f)
        lineTo(10f, 16.5f)
        lineTo(6f, 20f)
        lineTo(6f, 16.5f)
        arcTo(2f, 2f, 0f, false, true, 4f, 14.5f)
        close()
    }

    /** Registros: linhas de texto. */
    val Linhas = icone("Linhas") {
        moveTo(5f, 7f); lineTo(19f, 7f)
        moveTo(5f, 12f); lineTo(19f, 12f)
        moveTo(5f, 17f); lineTo(14f, 17f)
    }

    /** Ajustes: dois controles deslizantes. */
    val Ajustes = icone("Ajustes") {
        moveTo(4f, 8f); lineTo(10f, 8f)
        moveTo(15f, 8f); lineTo(20f, 8f)
        moveTo(15f, 8f)
        arcTo(2.5f, 2.5f, 0f, true, true, 10f, 8f)
        arcTo(2.5f, 2.5f, 0f, true, true, 15f, 8f)
        moveTo(4f, 16f); lineTo(7f, 16f)
        moveTo(12f, 16f); lineTo(20f, 16f)
        moveTo(12f, 16f)
        arcTo(2.5f, 2.5f, 0f, true, true, 7f, 16f)
        arcTo(2.5f, 2.5f, 0f, true, true, 12f, 16f)
    }

    val Voltar = icone("Voltar") {
        moveTo(19f, 12f); lineTo(5f, 12f)
        moveTo(11f, 6f); lineTo(5f, 12f); lineTo(11f, 18f)
    }

    /** A seta das linhas tocáveis. */
    val Seta = icone("Seta") {
        moveTo(9.5f, 6f); lineTo(15.5f, 12f); lineTo(9.5f, 18f)
    }

    val Enviar = icone("Enviar") {
        moveTo(12f, 19f); lineTo(12f, 5f)
        moveTo(6f, 11f); lineTo(12f, 5f); lineTo(18f, 11f)
    }
}
