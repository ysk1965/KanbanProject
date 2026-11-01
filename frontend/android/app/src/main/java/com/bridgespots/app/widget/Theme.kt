package com.bridgespots.app.widget

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.bridgespots.app.R
import androidx.glance.color.ColorProvider as DayNight

/** 낮(라이트) · 밤(다크) 두 색. 위젯은 시스템 다크 모드에 따라 저절로 바뀐다 */
class Tone(val day: Color, val night: Color) {
    val c: ColorProvider get() = DayNight(day = day, night = night)
    fun a(alpha: Float) = Tone(day.copy(alpha = alpha), night.copy(alpha = alpha))
    fun a(day: Float, night: Float) = Tone(this.day.copy(alpha = day), this.night.copy(alpha = night))
}

fun hex(s: String): Color {
    val v = s.trim().removePrefix("#").toLongOrNull(16) ?: 0L
    return Color(0xFF000000 or (v and 0xFFFFFF))
}

private fun tone(day: String, night: String) = Tone(hex(day), hex(night))

/**
 * 설교 노트 「스티커 다이어리」 토큰 (iOS Theme.swift Palette 와 같은 값).
 * 라이트 = 종이, 다크 = 밤 종이(면은 진한 회보라, 잉크는 밝은 쪽 g1d·g2d 를 글자에도 쓴다).
 */
class Palette(i: WInk) {
    val g1 = tone(i.g1, i.g1d)
    val g2 = tone(i.g2, i.g2d)
    val g3 = tone(i.g3, i.g3d)
    /** 글자용 진한 잉크 (라이트) · 밝은 잉크 (다크) */
    val t1 = tone(i.t1, i.g1d)
    val t2 = tone(i.t2, i.g2d)
    val bg = tone(i.paper, "#16151c")
    val surface = tone(i.card, "#1e1d26")
    val surface2 = tone(i.card2, "#272632")
    val fg = tone("#1d1b24", "#eeedf3")
    val muted = tone("#625e6d", "#aaa6b6")
    /** 잉크 면 위 글자 */
    val onInk = tone("#1d1b24", "#1b1a1f")
    /** 잉크 버튼 위 글자 (라이트 흰 글자 · 다크 진한 글자) */
    val onButton = tone("#ffffff", "#1b1a1f")
    /** 연한 잉크 면 위 진한 잉크 글자 (라이트 t1·t2 · 다크 onInk) */
    val inkT1 = Tone(hex(i.t1), hex("#1b1a1f"))
    val inkT2 = Tone(hex(i.t2), hex("#1b1a1f"))
    val line = Tone(Color.Black.copy(alpha = 0.1f), Color.White.copy(alpha = 0.1f))
    /** 민트 면(오늘 읽을 곳·다 한 날) 위 진한 초록 글자 */
    val mintInk = tone("#12513f", "#0f3f31")
    val carryInk = tone("#8a4b00", "#ffd29a")
    val carryBg = tone("#ffe2b8", "#4a3418")
    /** 잉크 면(g1) 위 말씀 위치 알약 — 다크에선 진한 면 대신 밝은 반투명 (진한 글자가 보이게) */
    val refChip = Tone(hex(i.card), Color.White.copy(alpha = 0.55f))
    /** 잉크 면(완주 · 다 한 날) 위 갈피 · 도장 바탕 — 다크에서도 밝게 */
    val paleOnInk = Tone(hex(i.card), Color.White.copy(alpha = 0.85f))

    /** 한 주 동안 카테고리 색 (weekPlan CatColor) */
    fun cat(token: String?): Tone = when (token) {
        "g1" -> t1
        "g2" -> t2
        "g3" -> Tone(hex("#2d6a45"), g3.night)
        "purple" -> tone("#5f3d9c", "#c3a8ef")
        "orange" -> tone("#9a5410", "#e7aa6b")
        "green" -> tone("#2d6a45", "#8fcca5")
        "red" -> tone("#a3271f", "#f09a90")
        else -> t1
    }
}

// MARK: 크기

enum class WSize { SMALL, MEDIUM, LARGE }

object WSizes {
    val SMALL = DpSize(110.dp, 110.dp)
    val MEDIUM = DpSize(250.dp, 110.dp)
    val LARGE = DpSize(250.dp, 250.dp)
    val all = setOf(SMALL, MEDIUM, LARGE)
}

@Composable
fun widgetSize(): WSize {
    val s = LocalSize.current
    return when {
        s.width >= 200.dp && s.height >= 200.dp -> WSize.LARGE
        s.width >= 200.dp -> WSize.MEDIUM
        else -> WSize.SMALL
    }
}

// MARK: 조각

@Composable
fun T(
    text: String,
    size: Int,
    color: Tone,
    weight: FontWeight = FontWeight.Normal,
    serif: Boolean = false,
    maxLines: Int = 1,
    modifier: GlanceModifier = GlanceModifier,
) {
    Text(
        text = text,
        modifier = modifier,
        maxLines = maxLines,
        style = TextStyle(
            color = color.c,
            fontSize = size.sp,
            fontWeight = weight,
            fontFamily = if (serif) FontFamily.Serif else null,
        ),
    )
}

/** 색을 입힌 그림 */
@Composable
fun Icon(res: Int, tint: Tone, w: Dp, h: Dp = w, modifier: GlanceModifier = GlanceModifier) {
    Image(
        provider = ImageProvider(res),
        contentDescription = null,
        modifier = modifier.size(w, h),
        colorFilter = ColorFilter.tint(tint.c),
    )
}

/** 동그라미 위에 무언가 (도장 · 체크) */
@Composable
fun Disc(
    size: Dp,
    shape: Int,
    tint: Tone,
    modifier: GlanceModifier = GlanceModifier,
    content: @Composable () -> Unit = {},
) {
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        Icon(shape, tint, size)
        content()
    }
}

enum class Mood { IDLE, HAPPY, SLEEP }

/** 마스코트 「갈피」 — 몸에 색을 입히고 눈은 고정색 */
@Composable
fun Galpi(fill: Tone, mood: Mood = Mood.IDLE, width: Dp = 40.dp) {
    val h = width * 124f / 112f
    Box(modifier = GlanceModifier.size(width, h)) {
        Icon(R.drawable.w_galpi_body, fill, width, h)
        Image(
            provider = ImageProvider(
                when (mood) {
                    Mood.IDLE -> R.drawable.w_galpi_idle
                    Mood.HAPPY -> R.drawable.w_galpi_happy
                    Mood.SLEEP -> R.drawable.w_galpi_sleep
                },
            ),
            contentDescription = null,
            modifier = GlanceModifier.size(width, h),
        )
    }
}

@Composable
fun Coin(size: Dp = 13.dp) {
    Image(provider = ImageProvider(R.drawable.w_coin), contentDescription = null, modifier = GlanceModifier.size(size))
}

/** 알약 버튼 모양 */
@Composable
fun Pill(
    text: String,
    fill: Tone,
    ink: Tone,
    icon: Int? = null,
    modifier: GlanceModifier = GlanceModifier,
) {
    Row(
        modifier = modifier.height(34.dp).background(fill.c).cornerRadius(17.dp).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (icon != null) {
            Icon(icon, ink, 12.dp)
            Spacer(GlanceModifier.width(4.dp))
        }
        T(text, 13, ink, FontWeight.Bold)
    }
}

/** 작은 알약 글자 (매일 · 어제 · 보너스) */
@Composable
fun Chip(text: String, ink: Tone, fill: Tone) {
    T(
        text, 12, ink, FontWeight.Bold,
        modifier = GlanceModifier.background(fill.c).cornerRadius(10.dp).padding(horizontal = 7.dp, vertical = 1.dp),
    )
}

/** 위젯 바탕 — 누르면 앱의 그 화면으로 */
@Composable
fun WidgetRoot(bg: Tone, link: Uri, content: @Composable ColumnScope.() -> Unit) {
    val context = LocalContext.current
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(bg.c)
            .cornerRadius(22.dp)
            .padding(14.dp)
            .clickable(WAction.open(context, link)),
        content = content,
    )
}

/** 앱에서 아직 요약을 안 보냈을 때 */
@Composable
fun EmptyHint(pal: Palette, title: String, link: Uri) {
    WidgetRoot(pal.surface, link) {
        T(title, 12, pal.t2, FontWeight.Bold)
        Spacer(GlanceModifier.defaultWeight())
        Galpi(pal.g2, Mood.SLEEP, 34.dp)
        Spacer(GlanceModifier.height(6.dp))
        T("앱에서 설교 노트를 한 번 열면 여기에 보여요", 13, pal.fg, FontWeight.Medium, maxLines = 3)
    }
}

@Composable
fun Gap(h: Int) = Spacer(GlanceModifier.height(h.dp))

@Composable
fun HGap(w: Int) = Spacer(GlanceModifier.width(w.dp))

@Composable
fun FullWidth(content: @Composable () -> Unit) {
    Box(modifier = GlanceModifier.fillMaxWidth()) { content() }
}
