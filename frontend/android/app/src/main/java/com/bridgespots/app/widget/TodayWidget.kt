package com.bridgespots.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
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
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import com.bridgespots.app.R

/** 「오늘 할 일」 — 한 주 동안의 오늘 칸 (예배 갈피 = 설교 적용 + 내 카테고리, 못 한 일은 오늘로 넘어온다) */
class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(WSizes.all)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = SnapshotStore.load(context)
        val now = System.currentTimeMillis()
        WidgetRefresh.schedule(context)
        provideContent { TodayContent(snap, now) }
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = TodayWidget()
}

/** 요약이 오늘을 품지 않으면(앱을 한 주 넘게 안 열었음) null */
class TodayState private constructor(
    val day: String,
    val week: String,
    /** 안 한 일 먼저 (같은 무리 안에선 앱 순서) */
    val tasks: List<WTask>,
    val cats: List<WCat>,
    val now: Long,
) {
    val done = tasks.count { it.done }
    val left = tasks.size - done
    fun cat(id: String): WCat? = cats.firstOrNull { it.id == id }

    companion object {
        fun of(snap: WSnapshot, now: Long): TodayState? {
            val day = WDate.ymd(now)
            val list = snap.today.days[day] ?: return null
            return TodayState(day, snap.today.week, list.filter { !it.done } + list.filter { it.done }, snap.today.cats, now)
        }
    }
}

@Composable
fun TodayContent(snap: WSnapshot?, now: Long) {
    val pal = Palette(snap?.ink ?: WInk.fallback)
    val st = snap?.let { TodayState.of(it, now) }
    if (st == null) {
        EmptyHint(pal, "오늘 할 일", WLink.home)
        return
    }
    when (widgetSize()) {
        WSize.SMALL -> {
            val bg = when {
                st.tasks.isEmpty() -> pal.bg
                st.left == 0 -> pal.g3
                else -> pal.surface
            }
            WidgetRoot(bg, WLink.home) { TodaySmall(st, pal) }
        }
        WSize.MEDIUM -> WidgetRoot(pal.surface, WLink.home) { TodayMedium(st, pal) }
        WSize.LARGE -> WidgetRoot(pal.surface, WLink.home) { TodayLarge(st, pal) }
    }
}

// MARK: 조각

@Composable
fun CatIcon(cat: WCat?, pal: Palette, size: Int = 12) {
    if (cat?.icon == "ribbon" || cat?.id == "galpi") {
        Icon(R.drawable.w_ribbon, if (cat.id == "galpi") pal.g2 else pal.cat(cat.color), (size * 0.75).dp, size.dp)
        return
    }
    val res = when (cat?.icon) {
        "home" -> R.drawable.w_cat_home
        "users" -> R.drawable.w_cat_users
        "book" -> R.drawable.w_cat_book
        "briefcase" -> R.drawable.w_cat_briefcase
        "heart" -> R.drawable.w_cat_heart
        else -> R.drawable.w_cat_tag
    }
    Icon(res, pal.cat(cat?.color ?: "g1"), size.dp)
}

/** 체크 동그라미 — 누르면 대기열에 적고 바로 체크된 모습으로 */
@Composable
private fun TaskCheck(task: WTask, st: TodayState, pal: Palette) {
    val apply = task.kind == "apply"
    val color = if (apply) pal.t2 else pal.cat(st.cat(task.cat)?.color ?: "g1")
    Box(
        modifier = GlanceModifier.size(32.dp).clickable(WAction.toggle(task, !task.done, st.day, st.week)),
        contentAlignment = Alignment.Center,
    ) {
        if (task.done) {
            val fill = if (apply) pal.g2 else color.a(0.35f, 1f)
            val ink = if (apply) pal.inkT2 else Tone(pal.fg.day, pal.onInk.night)
            Disc(24.dp, R.drawable.w_oval, fill) { Icon(R.drawable.w_check, ink, 14.dp) }
        } else {
            Disc(24.dp, R.drawable.w_ring, color)
        }
    }
}

@Composable
private fun TaskRow(task: WTask, st: TodayState, pal: Palette, showCat: Boolean = true, showNote: Boolean = false) {
    Row(modifier = GlanceModifier.fillMaxWidth().height(32.dp), verticalAlignment = Alignment.CenterVertically) {
        TaskCheck(task, st, pal)
        HGap(4)
        T(task.text, 14, if (task.done) pal.muted else pal.fg, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
        HGap(2)
        val carry = task.carry
        when {
            carry != null && !task.done ->
                Chip(if (carry == WDate.yesterday(st.now)) "어제" else WDate.short(carry), pal.carryInk, pal.carryBg)
            task.rep == "daily" -> Chip("매일", pal.t1, pal.g1.a(0.3f, 0.18f))
            showNote && task.noteDate != null -> T("${WDate.short(task.noteDate)} 설교", 12, pal.muted)
            showCat && task.cat == "galpi" -> CatIcon(st.cat(task.cat), pal)
        }
    }
}

// MARK: 작은

@Composable
private fun ColumnScope.TodaySmall(st: TodayState, pal: Palette) {
    when {
        st.tasks.isEmpty() -> {
            T("오늘 할 일", 12, pal.t1, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            T("오늘은 비어 있어요", 14, pal.fg, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            Pill("할 일 적기", pal.t1, pal.onButton, R.drawable.w_plus)
        }
        st.left == 0 -> {
            T("오늘 할 일", 12, pal.mintInk, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            Galpi(pal.paleOnInk, Mood.HAPPY, 46.dp)
            Spacer(GlanceModifier.defaultWeight())
            T("오늘 다 했어요", 14, pal.onInk, FontWeight.Bold)
            Gap(2)
            T("${st.tasks.size}개 모두", 12, pal.mintInk)
        }
        else -> {
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                T("오늘 할 일", 12, pal.t1, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                T(WDate.weekday(st.now), 12, pal.muted)
            }
            Spacer(GlanceModifier.defaultWeight())
            Row(verticalAlignment = Alignment.CenterVertically) {
                T("${st.done}/${st.tasks.size}", 26, pal.fg, FontWeight.Bold)
                HGap(10)
                T("${st.left}개\n남았어요", 12, pal.muted, maxLines = 2)
            }
            Gap(4)
            Progress(st, pal)
            Spacer(GlanceModifier.defaultWeight())
            st.tasks.firstOrNull()?.let { next ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CatIcon(st.cat(next.cat), pal)
                    HGap(6)
                    T(next.text, 13, pal.fg, FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun Progress(st: TodayState, pal: Palette) {
    LinearProgressIndicator(
        progress = st.done.toFloat() / maxOf(1, st.tasks.size),
        modifier = GlanceModifier.fillMaxWidth().height(6.dp).cornerRadius(3.dp),
        color = pal.g1.c,
        backgroundColor = pal.surface2.c,
    )
}

// MARK: 중간

@Composable
private fun TodayMedium(st: TodayState, pal: Palette) {
    Row(modifier = GlanceModifier.fillMaxSize()) {
        Column(modifier = GlanceModifier.width(88.dp).fillMaxHeight()) {
            T("오늘 할 일", 12, pal.t1, FontWeight.Bold)
            Gap(2)
            T(WDate.label(st.now), 12, pal.muted)
            Spacer(GlanceModifier.defaultWeight())
            Row(verticalAlignment = Alignment.Bottom) {
                T("${st.done}", 34, pal.fg, FontWeight.Bold)
                T("/${st.tasks.size}", 18, pal.muted, FontWeight.Bold)
            }
            Spacer(GlanceModifier.defaultWeight())
            Progress(st, pal)
        }
        HGap(12)
        Column(
            modifier = GlanceModifier.defaultWeight().fillMaxHeight(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                st.tasks.isEmpty() -> {
                    T("오늘은 비어 있어요", 14, pal.fg, FontWeight.Bold)
                    Gap(2)
                    T("눌러서 할 일을 적어요", 12, pal.muted)
                }
                st.left == 0 -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Galpi(pal.g2, Mood.HAPPY, 36.dp)
                    HGap(10)
                    T("오늘 다 했어요", 15, pal.fg, FontWeight.Bold)
                }
                else -> {
                    st.tasks.take(3).forEach { TaskRow(it, st, pal) }
                    if (st.left > 3) {
                        T("외 ${st.left - 3}개", 12, pal.muted, modifier = GlanceModifier.padding(start = 36.dp))
                    }
                }
            }
        }
    }
}

// MARK: 큰

private const val MAX_ROWS = 7

@Composable
private fun ColumnScope.TodayLarge(st: TodayState, pal: Palette) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        T("오늘 할 일", 14, pal.t1, FontWeight.Bold)
        HGap(6)
        T(WDate.label(st.now), 12, pal.muted, modifier = GlanceModifier.defaultWeight())
        T("${st.done}", 18, pal.fg, FontWeight.Bold)
        T("/${st.tasks.size}", 18, pal.muted, FontWeight.Bold)
    }
    Gap(6)
    if (st.tasks.isEmpty()) {
        Spacer(GlanceModifier.defaultWeight())
        Column(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Galpi(pal.g2, Mood.SLEEP, 48.dp)
            Gap(6)
            T("오늘은 비어 있어요", 15, pal.fg, FontWeight.Bold)
        }
        Spacer(GlanceModifier.defaultWeight())
    } else {
        // Glance 는 한 줄·한 칸에 자식 10개까지라 카테고리마다 묶는다
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            groups(st).forEach { (id, list) ->
                val cat = st.cat(id)
                Column(modifier = GlanceModifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.padding(top = 4.dp)) {
                        CatIcon(cat, pal)
                        HGap(6)
                        T(cat?.name ?: "할 일", 12, if (id == "galpi") pal.t2 else pal.cat(cat?.color ?: "g1"), FontWeight.Bold)
                    }
                    list.forEach { TaskRow(it, st, pal, showCat = false, showNote = true) }
                }
            }
        }
        Spacer(GlanceModifier.defaultWeight())
    }
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(34.dp).background(pal.t1.a(0.12f).c).cornerRadius(12.dp)
            .clickable(WAction.open(context, WLink.home)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(R.drawable.w_plus, pal.t1, 12.dp)
        HGap(4)
        T("할 일 적기", 13, pal.t1, FontWeight.Bold)
    }
}

/** 카테고리 순서대로 묶되, 넘치면 안 한 일 먼저 잘라 담는다 */
private fun groups(st: TodayState): List<Pair<String, List<WTask>>> {
    val shown = st.tasks.take(MAX_ROWS)
    val order = st.cats.map { it.id }
    val ids = shown.map { it.cat }.distinct().sortedBy { order.indexOf(it).let { i -> if (i < 0) 99 else i } }
    return ids.map { id -> id to shown.filter { it.cat == id } }
}
