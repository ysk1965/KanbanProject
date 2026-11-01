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
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import com.bridgespots.app.R

/** 「이번 주 갈피 퀘스트」 — 말씀에 꽂기 +20 → 적용 남기기 +3 → 삶에 꽂기 +10 → 완주 +20 (iOS QuestWidget.swift) */
class QuestWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(WSizes.all)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = SnapshotStore.load(context)
        val now = System.currentTimeMillis()
        WidgetRefresh.schedule(context)
        provideContent { QuestContent(snap, now) }
    }
}

class QuestWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = QuestWidget()
}

/** 위젯이 그릴 퀘스트 상태 (주가 바뀌었으면 빈 퀘스트) */
class QuestState(snap: WSnapshot, now: Long) {
    private val q = snap.quest
    private val fresh = q.weekStart != WDate.monday(now)
    val steps = if (fresh) listOf(false, false, false) else listOf(q.note, q.apply, q.done)
    val earned = if (fresh) 0 else q.earned
    val total = q.total
    val sermon = if (fresh) null else q.sermon
    val target = q.target
    val unlockAt = q.target?.unlockAt ?: 0.0
    val locked = unlockAt > now
    val noteDate = if (fresh) null else q.noteDate
    val applyAt = if (fresh) null else q.applyAt
    val doneAt = if (fresh) null else q.doneAt
    val streak = q.streakWeeks
    val bonus = if (fresh) null else q.bonus

    val cur: Int? = steps.indexOf(false).takeIf { it >= 0 }
    val complete = steps.all { it }
}

private val stepNames = listOf("말씀", "적용", "삶")

enum class StampKind { DONE, NOW, NEXT, LOCKED }

fun stampKind(st: QuestState, i: Int): StampKind = when {
    st.steps[i] -> StampKind.DONE
    st.cur == i -> if (i == 2 && st.locked && st.target != null) StampKind.LOCKED else StampKind.NOW
    else -> StampKind.NEXT
}

/** 지금 걸음 한 줄 (제목, 부제) */
fun questLine(st: QuestState): Pair<String, String> = when (st.cur) {
    0 -> "이번 주 설교를 꽂아요" to "새 설교 기록 +20"
    1 -> "적용을 하나 남겨요" to "노트에 적용 +3"
    2 -> when {
        st.target == null -> "남긴 적용을 살아 내요" to "실천 +10 · 완주 +20"
        st.locked -> "${WDate.clock(st.unlockAt)}부터" to "살아 낸 뒤 체크해요"
        else -> "삶에 꽂기만 남았어요" to "완주하면 +30"
    }
    else -> "완주" to "+${st.total} 달란트"
}

@Composable
fun QuestContent(snap: WSnapshot?, now: Long) {
    val pal = Palette(snap?.ink ?: WInk.fallback)
    if (snap == null) {
        EmptyHint(pal, "갈피 퀘스트", WLink.challenge)
        return
    }
    val st = QuestState(snap, now)
    when (widgetSize()) {
        WSize.SMALL -> QuestSmall(st, pal)
        WSize.MEDIUM -> WidgetRoot(pal.surface, WLink.challenge) { QuestMedium(st, pal) }
        WSize.LARGE -> WidgetRoot(pal.surface, WLink.challenge) { QuestLarge(st, pal) }
    }
}

@Composable
fun Stamp(kind: StampKind, label: String, pal: Palette, size: Int = 34) {
    val d = size.dp
    when (kind) {
        StampKind.DONE -> Disc(d, R.drawable.w_oval, pal.g2) { Icon(R.drawable.w_check, pal.inkT2, (size * 0.5).dp) }
        StampKind.NOW -> Disc(d, R.drawable.w_ring_dash, pal.t2) { if (label.isNotEmpty()) T(label, 12, pal.t2, FontWeight.Bold) }
        StampKind.NEXT -> Disc(d, R.drawable.w_oval, pal.surface2) { if (label.isNotEmpty()) T(label, 12, pal.muted, FontWeight.Bold) }
        StampKind.LOCKED -> Disc(d, R.drawable.w_oval, pal.surface2) { Icon(R.drawable.w_lock, pal.muted, (size * 0.4).dp) }
    }
}

@Composable
private fun EarnLabel(st: QuestState, pal: Palette, suffix: String = "") {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Coin(13.dp)
        HGap(3)
        T("${st.earned}/${st.total}$suffix", 12, pal.muted, FontWeight.Bold)
    }
}

// MARK: 작은

@Composable
private fun QuestSmall(st: QuestState, pal: Palette) {
    if (st.complete) {
        WidgetRoot(pal.g2, WLink.challenge) {
            T("갈피 퀘스트", 12, pal.onInk, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Disc(60.dp, R.drawable.w_oval, pal.refChip) {
                    Disc(60.dp, R.drawable.w_ring_bold, pal.inkT2) { T("완주", 18, pal.inkT2, FontWeight.Bold) }
                }
                HGap(8)
                Galpi(pal.paleOnInk, Mood.HAPPY, 38.dp)
            }
            Spacer(GlanceModifier.defaultWeight())
            T("+${st.total} 달란트", 14, pal.onInk, FontWeight.Bold)
            if ((st.streak ?: 0) > 0) T("연속 ${st.streak}주", 12, pal.onInk)
        }
        return
    }
    val line = questLine(st)
    WidgetRoot(pal.surface, WLink.challenge) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T("갈피 퀘스트", 12, pal.t2, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            EarnLabel(st, pal)
        }
        Spacer(GlanceModifier.defaultWeight())
        Row {
            for (i in 0..2) {
                if (i > 0) HGap(6)
                Stamp(stampKind(st, i), stepNames[i], pal)
            }
        }
        Spacer(GlanceModifier.defaultWeight())
        T(line.first, 13, pal.fg, FontWeight.Bold, maxLines = 2)
        Gap(2)
        T(line.second, 12, pal.muted)
    }
}

// MARK: 중간

@Composable
private fun QuestMedium(st: QuestState, pal: Palette) {
    Row(modifier = GlanceModifier.fillMaxSize()) {
        Column(modifier = GlanceModifier.width(118.dp).fillMaxHeight()) {
            T("갈피 퀘스트", 12, pal.t2, FontWeight.Bold)
            Gap(2)
            T("${st.earned} / ${st.total} 달란트", 12, pal.muted)
            Spacer(GlanceModifier.defaultWeight())
            Row {
                for (i in 0..2) {
                    if (i > 0) HGap(6)
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Stamp(stampKind(st, i), "", pal, 32)
                        Gap(3)
                        T(
                            stepNames[i], 12, if (st.cur == i) pal.t2 else pal.muted,
                            if (st.cur == i) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
        HGap(12)
        QuestNowCard(st, pal, GlanceModifier.defaultWeight().fillMaxHeight())
    }
}

/** 지금 걸음 카드 — 삶에 꽂기면 위젯 안 버튼으로 바로 체크 */
@Composable
private fun QuestNowCard(st: QuestState, pal: Palette, modifier: GlanceModifier) {
    val context = LocalContext.current
    val tg = st.target
    Column(modifier = modifier.background(pal.surface2.c).cornerRadius(16.dp).padding(12.dp)) {
        when {
            st.complete -> {
                T("이번 주 완주", 12, pal.muted)
                Gap(4)
                T("+${st.total} 달란트", 20, pal.t2, FontWeight.Bold)
                if ((st.streak ?: 0) > 0) {
                    Gap(4)
                    T("연속 ${st.streak}주 기록", 12, pal.fg, FontWeight.Medium)
                }
            }
            st.cur == 2 && tg != null -> {
                st.sermon?.let { T("${WDate.short(it.date)} · ${it.title}", 12, pal.muted) }
                Gap(4)
                T("“${tg.text}”", 15, pal.fg, FontWeight.Bold, serif = true, maxLines = 2)
                Spacer(GlanceModifier.defaultWeight())
                if (st.locked) {
                    Pill("${WDate.clock(st.unlockAt)}부터", pal.line, pal.muted, R.drawable.w_lock, GlanceModifier.fillMaxWidth())
                } else {
                    Pill(
                        "살아 냈어요 +10", pal.t2, pal.onButton, R.drawable.w_check,
                        GlanceModifier.fillMaxWidth().clickable(WAction.liveApply(tg)),
                    )
                }
            }
            st.cur == 1 -> {
                T(st.sermon?.let { "${WDate.short(it.date)} · ${it.title}" } ?: "이번 주 노트", 12, pal.muted)
                Gap(4)
                T("노트에 「적용」을\n10자 이상 남겨요", 15, pal.fg, FontWeight.Bold, maxLines = 2)
                Spacer(GlanceModifier.defaultWeight())
                Pill(
                    "적용 남기기 +3", pal.t2, pal.onButton,
                    modifier = GlanceModifier.fillMaxWidth()
                        .clickable(WAction.open(context, st.sermon?.let { WLink.note(it.id) } ?: WLink.home)),
                )
            }
            else -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Galpi(pal.g2, Mood.SLEEP, 34.dp)
                    HGap(10)
                    T("이번 주 설교를\n아직 안 꽂았어요", 14, pal.fg, FontWeight.Bold, maxLines = 2)
                }
                Spacer(GlanceModifier.defaultWeight())
                Pill(
                    "새 설교 기록 +20", pal.t2, pal.onButton,
                    modifier = GlanceModifier.fillMaxWidth().clickable(WAction.open(context, WLink.challenge)),
                )
            }
        }
    }
}

// MARK: 큰

@Composable
private fun ColumnScope.QuestLarge(st: QuestState, pal: Palette) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        T("이번 주 갈피 퀘스트", 14, pal.t2, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
        EarnLabel(st, pal, st.streak?.let { if (it > 0) " · 연속 ${it}주" else "" } ?: "")
    }
    Gap(10)
    st.sermon?.let { s ->
        Column(
            modifier = GlanceModifier.fillMaxWidth().background(pal.g1.c).cornerRadius(16.dp)
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .clickable(WAction.open(context, WLink.note(s.id))),
        ) {
            T(WDate.short(s.date), 12, pal.onInk)
            T(s.title, 16, pal.onInk, FontWeight.Bold)
            s.ref?.let {
                Gap(4)
                Chip(it, pal.inkT1, pal.refChip)
            }
        }
        Gap(10)
    }
    // Glance 는 한 칸에 자식 10개까지라 세 걸음을 묶는다
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        StepRow(st, pal, 0, "말씀에 꽂기", st.noteDate?.let { "${WDate.short(it)} · +20" } ?: "+20")
        Gap(6)
        StepRow(st, pal, 1, "적용 남기기", st.applyAt?.let { "${WDate.shortMs(it)} · +3" } ?: "+3")
        Gap(6)
        StepRow(st, pal, 2, "삶에 꽂기", st.doneAt?.let { "${WDate.shortMs(it)} · +10" } ?: "+10 · 완주 +20")
    }
    Gap(10)
    val tg = st.target
    if (!st.complete && st.cur == 2 && tg != null) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().background(pal.surface2.c).cornerRadius(16.dp)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            T("“${tg.text}”", 14, pal.fg, FontWeight.Bold, serif = true, maxLines = 2, modifier = GlanceModifier.defaultWeight())
            HGap(8)
            if (st.locked) {
                Pill(WDate.clock(st.unlockAt), pal.line, pal.muted, R.drawable.w_lock)
            } else {
                Pill("살아 냈어요", pal.t2, pal.onButton, modifier = GlanceModifier.clickable(WAction.liveApply(tg)))
            }
        }
    } else if (st.cur == 0) {
        Pill(
            "새 설교 기록 +20", pal.t2, pal.onButton,
            modifier = GlanceModifier.fillMaxWidth().clickable(WAction.open(context, WLink.challenge)),
        )
    }
    Spacer(GlanceModifier.defaultWeight())
    st.bonus?.let { b ->
        Row {
            Chip("보너스 · 노트 ${b.notes}/${b.notesMax}", pal.t1, pal.g1.a(0.3f))
            HGap(8)
            Chip("실천 ${b.done}/${b.doneMax}", pal.t1, pal.g1.a(0.3f))
        }
    }
}

@Composable
private fun StepRow(st: QuestState, pal: Palette, i: Int, name: String, meta: String) {
    val k = stampKind(st, i)
    val now = k == StampKind.NOW
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Stamp(k, "", pal, 26)
        HGap(10)
        T(
            name, 14, if (now) pal.t2 else pal.fg,
            if (now || k == StampKind.LOCKED) FontWeight.Bold else FontWeight.Medium,
            modifier = GlanceModifier.defaultWeight(),
        )
        T(meta, 12, if (now) pal.t2 else pal.muted, if (now) FontWeight.Bold else FontWeight.Normal)
    }
}
