package com.bridgespots.app.widget

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import com.bridgespots.app.R

/**
 * 「오늘의 말씀」 — A 이번 주 설교 말씀 · B 내가 밑줄 친 말씀(날마다 하나) · C 오늘 읽을 곳 (iOS VerseWidget.swift).
 * 출처는 위젯마다 고른다 (VerseConfigActivity). 고른 출처가 비어 있으면 있는 것을 보여 준다.
 */
class VerseWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(WSizes.SMALL, WSizes.MEDIUM))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = SnapshotStore.load(context)
        val now = System.currentTimeMillis()
        val source = try {
            WidgetStore.verseSource(context, GlanceAppWidgetManager(context).getAppWidgetId(id))
        } catch (_: Exception) {
            VerseSource.WEEK
        }
        WidgetRefresh.schedule(context)
        provideContent { VerseContentView(resolveVerse(snap, source, now), Palette(snap?.ink ?: WInk.fallback)) }
    }
}

class VerseWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = VerseWidget()

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        appWidgetIds.forEach { WidgetStore.removeVerseSource(context, it) }
    }
}

sealed class VerseContent {
    data class Week(val w: WVerseWeek) : VerseContent()
    data class Line(val l: WLine) : VerseContent()
    data class Reading(val r: WReading) : VerseContent()
}

fun resolveVerse(snap: WSnapshot?, source: VerseSource, now: Long): VerseContent? {
    val v = snap?.verse ?: return null
    val today = WDate.ymd(now)
    val week = v.week?.let { VerseContent.Week(it) }
    val line = v.lines[today]?.let { VerseContent.Line(it) }
    // 읽을 곳은 그날 받은 것만 (다음 날은 앱이 새로 받아야 안다)
    val reading = v.reading?.takeIf { it.date == today }?.let { VerseContent.Reading(it) }
    return when (source) {
        VerseSource.WEEK -> week ?: line ?: reading
        VerseSource.LINE -> line ?: week ?: reading
        VerseSource.READING -> reading ?: week ?: line
    }
}

private fun link(c: VerseContent?): Uri = when (c) {
    is VerseContent.Week -> WLink.note(c.w.noteId)
    is VerseContent.Line -> WLink.bible("${c.l.b}:${c.l.c}")
    is VerseContent.Reading -> WLink.bible(c.r.next)
    null -> WLink.home
}

@Composable
fun VerseContentView(content: VerseContent?, pal: Palette) {
    val wide = widgetSize() != WSize.SMALL
    val bg = when (content) {
        is VerseContent.Week -> if (wide) pal.surface else pal.g1
        is VerseContent.Reading -> if (!wide && content.r.next == null) pal.g3 else pal.bg
        else -> pal.bg
    }
    WidgetRoot(bg, link(content)) {
        when (content) {
            is VerseContent.Week -> WeekVerse(content.w, pal, wide)
            is VerseContent.Line -> LineVerse(content.l, pal, wide)
            is VerseContent.Reading -> ReadingView(content.r, pal, wide)
            null -> {
                T("오늘의 말씀", 12, pal.t1, FontWeight.Bold)
                Spacer(GlanceModifier.defaultWeight())
                T("설교 노트에 말씀을 꽂거나 성경에 형광펜을 칠하면 여기에 떠요", 13, pal.fg, FontWeight.Medium, maxLines = 4)
            }
        }
    }
}

// MARK: A 이번 주 설교 말씀

@Composable
private fun ColumnScope.WeekVerse(w: WVerseWeek, pal: Palette, wide: Boolean) {
    if (wide) {
        Row(modifier = GlanceModifier.fillMaxSize()) {
            Box(modifier = GlanceModifier.width(10.dp).fillMaxHeight().background(pal.g2.c).cornerRadius(4.dp)) {}
            HGap(14)
            Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight()) {
                T("이번 주 말씀 · ${w.ref}", 12, pal.t2, FontWeight.Bold)
                Spacer(GlanceModifier.defaultWeight())
                T(w.text, 15, pal.fg, FontWeight.Medium, serif = true, maxLines = 3)
                Spacer(GlanceModifier.defaultWeight())
                T("${WDate.short(w.date)} · ${w.title}", 12, pal.muted)
            }
        }
        return
    }
    T("이번 주 말씀", 12, pal.inkT1, FontWeight.Bold)
    Spacer(GlanceModifier.defaultWeight())
    T(w.text, 14, pal.onInk, FontWeight.Medium, serif = true, maxLines = 4)
    Spacer(GlanceModifier.defaultWeight())
    Chip(w.ref, pal.inkT1, pal.refChip)
}

// MARK: B 내가 밑줄 친 말씀

@Composable
private fun ColumnScope.LineVerse(l: WLine, pal: Palette, wide: Boolean) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        T(if (wide) "오늘의 한 줄 · ${l.ref}" else "오늘의 한 줄", 12, pal.cat("g3"), FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
        if (wide && l.at > 0) T("${WDate.shortMs(l.at)} 밑줄", 12, pal.muted)
    }
    Spacer(GlanceModifier.defaultWeight())
    // 형광펜 — 글자 뒤 띠 대신 연한 면으로
    T(
        l.text, if (wide) 16 else 15, pal.fg, FontWeight.Bold, serif = true, maxLines = if (wide) 2 else 4,
        modifier = GlanceModifier.background(pal.g3.a(0.45f, 0.3f).c).cornerRadius(6.dp).padding(horizontal = 4.dp, vertical = 2.dp),
    )
    Spacer(GlanceModifier.defaultWeight())
    if (wide && l.memo.isNotEmpty()) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().background(pal.surface2.c).cornerRadius(12.dp)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(R.drawable.w_ribbon, pal.g2, 9.dp, 12.dp)
            HGap(8)
            T("내 생각 — ${l.memo}", 12, pal.fg)
        }
    } else {
        T(if (wide) "눌러서 성경에서 이어 읽기" else l.ref, 12, pal.muted)
    }
}

// MARK: C 오늘 읽을 곳

@Composable
private fun BookSticker(short: String, pal: Palette, big: Boolean = false) {
    val parts = short.split(" ", limit = 2)
    Column(
        modifier = GlanceModifier.size(if (big) 88.dp else 50.dp, if (big) 110.dp else 60.dp)
            .background(pal.g3.c).cornerRadius(if (big) 18.dp else 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        T(parts.first(), if (big) 28 else 20, pal.mintInk, FontWeight.Bold)
        if (big && parts.size > 1) T(parts[1], 20, pal.mintInk, FontWeight.Bold)
    }
}

@Composable
private fun ReadingDots(r: WReading, pal: Palette) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        // 사이 띄우개를 자식으로 넣으면 Glance 의 자식 10개 한도를 넘는다
        r.chapters.take(6).forEachIndexed { i, c ->
            Box(modifier = GlanceModifier.padding(start = if (i > 0) 5.dp else 0.dp)) {
                Icon(if (c.done) R.drawable.w_oval else R.drawable.w_ring, pal.t1, 9.dp)
            }
        }
    }
}

fun readingLeft(r: WReading): String {
    val left = r.chapters.count { !it.done } + r.late
    if (left == 0) return "다 읽었어요"
    return if (r.late > 0) "밀린 장 ${r.late} · ${left}장 남음" else "${left}장 남음"
}

@Composable
private fun ColumnScope.ReadingView(r: WReading, pal: Palette, wide: Boolean) {
    when {
        wide -> Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            BookSticker(r.short, pal, big = true)
            HGap(16)
            Column(modifier = GlanceModifier.defaultWeight()) {
                T("오늘 읽을 곳 · ${r.planTitle}", 12, pal.t1, FontWeight.Bold)
                Gap(4)
                T(r.label, 18, pal.fg, FontWeight.Bold)
                Gap(4)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ReadingDots(r, pal)
                    HGap(6)
                    T(readingLeft(r) + if (r.others > 0) " · 외 ${r.others}길" else "", 12, pal.muted)
                }
                if (r.next != null) {
                    Gap(6)
                    Pill("이어 읽기", pal.t1, pal.onButton)
                }
            }
        }
        r.next == null -> {
            T("오늘 읽을 곳", 12, pal.mintInk, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            Box(modifier = GlanceModifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Disc(72.dp, R.drawable.w_ring_bold, pal.mintInk) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        T("다 읽음", 16, pal.mintInk, FontWeight.Bold)
                        T(r.short, 12, pal.mintInk, FontWeight.Bold)
                    }
                }
            }
            Spacer(GlanceModifier.defaultWeight())
            T(r.planTitle, 12, pal.mintInk)
        }
        else -> {
            T("오늘 읽을 곳", 12, pal.t1, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            Row(verticalAlignment = Alignment.CenterVertically) {
                BookSticker(r.short, pal)
                HGap(10)
                T(r.short.split(" ").drop(1).joinToString(" "), 22, pal.fg, FontWeight.Bold)
            }
            Spacer(GlanceModifier.defaultWeight())
            Row(verticalAlignment = Alignment.CenterVertically) {
                ReadingDots(r, pal)
                HGap(5)
                T(readingLeft(r), 12, pal.muted)
            }
        }
    }
}
