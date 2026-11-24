package dev.marcofilho.pelada.robo.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.marcofilho.pelada.robo.R

/**
 * O mesmo mundo do site (DESIGN.md, "o placar de várzea à noite"), vestido pelo Material 3:
 * chão preto, placas um degrau de luz acima, tinta branca, lima só para "está vivo".
 */
object Cores {
    val chao = Color(0xFF000000)
    val placa = Color(0xFF111111)
    val placaAlta = Color(0xFF2A2A2A)
    val tinta = Color(0xFFFFFFFF)
    val apagado = Color(0xFFB4B4B4)
    val giz = Color(0xFF949494)
    val lima = Color(0xFFC6F24E)
    val erro = Color(0xFFFF6166)
    val erroFundo = Color(0xFF2C1A1C)
}

private val esquema = darkColorScheme(
    // A Regra da Inversão: a ação primária é branca com texto preto; a cor de destaque nunca enche botão.
    primary = Cores.tinta,
    onPrimary = Cores.chao,
    primaryContainer = Cores.placaAlta,
    onPrimaryContainer = Cores.tinta,
    secondary = Cores.apagado,
    onSecondary = Cores.chao,
    secondaryContainer = Cores.placaAlta,
    onSecondaryContainer = Cores.tinta,
    tertiary = Cores.lima,
    onTertiary = Cores.chao,
    background = Cores.chao,
    onBackground = Cores.tinta,
    surface = Cores.chao,
    onSurface = Cores.tinta,
    surfaceVariant = Cores.placa,
    onSurfaceVariant = Cores.apagado,
    surfaceContainerLowest = Cores.chao,
    surfaceContainerLow = Cores.placa,
    surfaceContainer = Cores.placa,
    surfaceContainerHigh = Cores.placaAlta,
    surfaceContainerHighest = Cores.placaAlta,
    outline = Cores.giz,
    outlineVariant = Cores.placaAlta,
    error = Cores.erro,
    onError = Cores.chao,
    errorContainer = Cores.erroFundo,
    onErrorContainer = Cores.erro,
)

/** Letra de pintor de placa: só títulos e números. */
val Barlow = FontFamily(Font(R.font.barlow_condensed_semibold, FontWeight.SemiBold))

private fun inter(peso: Int) = Font(R.font.inter, FontWeight(peso), variationSettings = FontVariation.Settings(FontVariation.weight(peso)))
val Inter = FontFamily(inter(400), inter(500), inter(600))

private val letras = Typography().let { base ->
    val titulo = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold)
    val frase = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal)
    base.copy(
        displayLarge = titulo.copy(fontSize = 44.sp, lineHeight = 44.sp),
        displayMedium = titulo.copy(fontSize = 44.sp, lineHeight = 44.sp),
        displaySmall = titulo.copy(fontSize = 36.sp, lineHeight = 38.sp),
        headlineLarge = titulo.copy(fontSize = 32.sp, lineHeight = 34.sp, letterSpacing = (-0.01).em),
        headlineMedium = titulo.copy(fontSize = 28.sp, lineHeight = 31.sp),
        headlineSmall = titulo.copy(fontSize = 24.sp, lineHeight = 28.sp),
        titleLarge = titulo.copy(fontSize = 24.sp, lineHeight = 28.sp),
        titleMedium = frase.copy(fontSize = 18.sp, lineHeight = 25.sp, fontWeight = FontWeight.Medium),
        titleSmall = frase.copy(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
        bodyLarge = frase.copy(fontSize = 16.sp, lineHeight = 24.sp),
        bodyMedium = frase.copy(fontSize = 16.sp, lineHeight = 24.sp),
        bodySmall = frase.copy(fontSize = 14.sp, lineHeight = 20.sp),
        labelLarge = frase.copy(fontSize = 18.sp, lineHeight = 25.sp, fontWeight = FontWeight.Medium),
        labelMedium = frase.copy(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
        labelSmall = frase.copy(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    )
}

/** Dois raios, como no site: 10 para placas e campos; pílula para as ações. */
private val formas = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(10.dp),
    extraLarge = RoundedCornerShape(20.dp),
)

@Composable
fun TemaPelada(conteudo: @Composable () -> Unit) {
    MaterialTheme(colorScheme = esquema, typography = letras, shapes = formas, content = conteudo)
}
