package com.bridgespots.app.widget

import android.content.Context
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

// 앱이 써 둔 요약 (widgetSnapshot.ts 의 WidgetSnapshot · iOS Snapshot.swift 와 같은 모양)

data class WSnapshot(
    val v: Int,
    val generatedAt: Double,
    val signedIn: Boolean,
    val ink: WInk,
    val quest: WQuest,
    val today: WToday,
    val verse: WVerse,
)

data class WInk(
    val g1: String, val g2: String, val g3: String, val t1: String, val t2: String,
    val g1d: String, val g2d: String, val g3d: String,
    val paper: String, val desk: String, val card: String, val card2: String,
) {
    companion object {
        val fallback = WInk(
            "#c3b5f5", "#ffb3d1", "#a9dfc6", "#5a45b8", "#b8336f",
            "#cbbff7", "#ffbfd8", "#b5e6cf", "#fcf8fb", "#f3ecf3", "#fffdfe", "#f6eff6",
        )
    }
}

data class WQuest(
    val weekStart: String,
    val note: Boolean,
    val apply: Boolean,
    val done: Boolean,
    val earned: Int,
    val total: Int,
    val streakWeeks: Int?,
    val sermon: WSermon?,
    val noteDate: String?,
    val applyAt: Double?,
    val doneAt: Double?,
    val target: WTarget?,
    val bonus: WBonus,
)

data class WSermon(val id: String, val date: String, val title: String, val ref: String?)

data class WTarget(val noteId: String, val thoughtId: String, val text: String, val unlockAt: Double)

data class WBonus(val notes: Int, val notesMax: Int, val done: Int, val doneMax: Int)

data class WToday(val week: String, val cats: List<WCat>, val days: Map<String, List<WTask>>)

data class WCat(val id: String, val name: String, val color: String, val icon: String)

data class WTask(
    val key: String,
    val text: String,
    val cat: String,
    val rep: String,
    val done: Boolean,
    val carry: String?,
    val kind: String,
    val planId: String?,
    val noteId: String?,
    val thoughtId: String?,
    val noteDate: String?,
)

data class WVerse(val week: WVerseWeek?, val lines: Map<String, WLine>, val reading: WReading?)

data class WVerseWeek(
    val text: String, val ref: String, val b: Int, val c: Int, val v: Int,
    val noteId: String, val title: String, val date: String,
)

data class WLine(
    val text: String, val ref: String, val b: Int, val c: Int, val v: Int,
    val memo: String, val at: Double,
)

data class WReading(
    val date: String,
    val planTitle: String,
    val label: String,
    val short: String,
    val chapters: List<WChapter>,
    val late: Int,
    val others: Int,
    val next: String?,
)

data class WChapter(val chapter: String, val done: Boolean)

// MARK: 읽기

private fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k)
private fun JSONObject.num(k: String): Double? = if (isNull(k)) null else optDouble(k)
private fun JSONObject.int(k: String): Int? = if (isNull(k)) null else optInt(k)
private fun JSONObject.obj(k: String): JSONObject? = if (isNull(k)) null else optJSONObject(k)
private fun <T> JSONObject.list(k: String, f: (JSONObject) -> T): List<T> {
    val a = optJSONArray(k) ?: return emptyList()
    return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(f) }
}
private fun <T> JSONObject.map(k: String, f: (JSONObject) -> T): Map<String, T> {
    val o = optJSONObject(k) ?: return emptyMap()
    return o.keys().asSequence().mapNotNull { key -> o.optJSONObject(key)?.let { key to f(it) } }.toMap()
}

object SnapshotParser {
    fun parse(json: String): WSnapshot? = try {
        val o = JSONObject(json)
        WSnapshot(
            v = o.optInt("v"),
            generatedAt = o.optDouble("generated_at", 0.0),
            signedIn = o.optBoolean("signed_in"),
            ink = o.obj("ink")?.let(::ink) ?: WInk.fallback,
            quest = quest(o.getJSONObject("quest")),
            today = today(o.getJSONObject("today")),
            verse = verse(o.getJSONObject("verse")),
        )
    } catch (_: Exception) {
        null
    }

    private fun ink(o: JSONObject): WInk {
        val f = WInk.fallback
        fun c(k: String, d: String) = o.str(k) ?: d
        return WInk(
            c("g1", f.g1), c("g2", f.g2), c("g3", f.g3), c("t1", f.t1), c("t2", f.t2),
            c("g1d", f.g1d), c("g2d", f.g2d), c("g3d", f.g3d),
            c("paper", f.paper), c("desk", f.desk), c("card", f.card), c("card2", f.card2),
        )
    }

    private fun quest(o: JSONObject) = WQuest(
        weekStart = o.optString("week_start"),
        note = o.optBoolean("note"),
        apply = o.optBoolean("apply"),
        done = o.optBoolean("done"),
        earned = o.optInt("earned"),
        total = o.optInt("total", 53),
        streakWeeks = o.int("streak_weeks"),
        sermon = o.obj("sermon")?.let {
            WSermon(it.optString("id"), it.optString("date"), it.optString("title"), it.str("ref"))
        },
        noteDate = o.str("note_date"),
        applyAt = o.num("apply_at"),
        doneAt = o.num("done_at"),
        target = o.obj("target")?.let {
            WTarget(it.optString("note_id"), it.optString("thought_id"), it.optString("text"), it.optDouble("unlock_at", 0.0))
        },
        bonus = o.obj("bonus")?.let {
            WBonus(it.optInt("notes"), it.optInt("notes_max"), it.optInt("done"), it.optInt("done_max"))
        } ?: WBonus(0, 0, 0, 0),
    )

    private fun today(o: JSONObject) = WToday(
        week = o.optString("week"),
        cats = o.list("cats") { WCat(it.optString("id"), it.optString("name"), it.optString("color"), it.optString("icon")) },
        days = o.optJSONObject("days")?.let { days ->
            days.keys().asSequence().associateWith { day ->
                val a = days.optJSONArray(day)
                if (a == null) emptyList() else (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(::task) }
            }
        } ?: emptyMap(),
    )

    private fun task(o: JSONObject) = WTask(
        key = o.optString("key"),
        text = o.optString("text"),
        cat = o.optString("cat"),
        rep = o.optString("rep"),
        done = o.optBoolean("done"),
        carry = o.str("carry"),
        kind = o.optString("kind"),
        planId = o.str("plan_id"),
        noteId = o.str("note_id"),
        thoughtId = o.str("thought_id"),
        noteDate = o.str("note_date"),
    )

    private fun verse(o: JSONObject) = WVerse(
        week = o.obj("week")?.let {
            WVerseWeek(
                it.optString("text"), it.optString("ref"), it.optInt("b"), it.optInt("c"), it.optInt("v"),
                it.optString("note_id"), it.optString("title"), it.optString("date"),
            )
        },
        lines = o.map("lines") {
            WLine(it.optString("text"), it.optString("ref"), it.optInt("b"), it.optInt("c"), it.optInt("v"), it.optString("memo"), it.optDouble("at", 0.0))
        },
        reading = o.obj("reading")?.let {
            WReading(
                date = it.optString("date"),
                planTitle = it.optString("plan_title"),
                label = it.optString("label"),
                short = it.optString("short"),
                chapters = it.list("chapters") { c -> WChapter(c.optString("chapter"), c.optBoolean("done")) },
                late = it.optInt("late"),
                others = it.optInt("others"),
                next = it.str("next"),
            )
        },
    )
}

// MARK: 날짜

object WDate {
    private const val WEEKDAYS = "일월화수목금토"

    private fun cal(ms: Long = System.currentTimeMillis()): Calendar =
        Calendar.getInstance().apply { timeInMillis = ms }

    fun ymd(ms: Long): String {
        val c = cal(ms)
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    private fun startOfDay(ms: Long): Calendar = cal(ms).apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }

    /** 퀘스트 주 시작 (월요일) */
    fun monday(ms: Long): String {
        val c = startOfDay(ms)
        val wd = c.get(Calendar.DAY_OF_WEEK) // 일=1 … 토=7
        c.add(Calendar.DAY_OF_MONTH, -((wd + 5) % 7))
        return ymd(c.timeInMillis)
    }

    fun nextMidnight(ms: Long): Long = startOfDay(ms).apply { add(Calendar.DAY_OF_MONTH, 1) }.timeInMillis

    fun yesterday(ms: Long): String = ymd(startOfDay(ms).apply { add(Calendar.DAY_OF_MONTH, -1) }.timeInMillis)

    fun weekday(ms: Long): String = WEEKDAYS[(cal(ms).get(Calendar.DAY_OF_WEEK) - 1) % 7].toString()

    /** "10.29 (목)" */
    fun label(ms: Long): String {
        val c = cal(ms)
        return "${c.get(Calendar.MONTH) + 1}.${c.get(Calendar.DAY_OF_MONTH)} (${weekday(ms)})"
    }

    /** "yyyy-MM-dd" → "10.25" */
    fun short(s: String?): String {
        if (s == null || s.length != 10) return ""
        val p = s.split("-").mapNotNull { it.toIntOrNull() }
        return if (p.size == 3) "${p[1]}.${p[2]}" else ""
    }

    fun shortMs(ms: Double): String = short(ymd(ms.toLong()))

    /** 오후 9:40 같은 시각 */
    fun clock(ms: Double): String {
        val c = cal(ms.toLong())
        val h = c.get(Calendar.HOUR_OF_DAY)
        val h12 = if (h % 12 == 0) 12 else h % 12
        return String.format(Locale.US, "%s %d:%02d", if (h < 12) "오전" else "오후", h12, c.get(Calendar.MINUTE))
    }
}

// MARK: 읽기 + 위젯에서 누른 체크 덧입히기

object SnapshotStore {
    fun load(context: Context): WSnapshot? {
        val snap = WidgetStore.snapshotJson(context)?.let(SnapshotParser::parse) ?: return null
        return overlay(snap, WidgetStore.pendingOps(context))
    }

    /** 앱이 아직 옮기지 않은 위젯 체크를 화면에 미리 반영한다 (앱이 옮기고 나면 새 요약이 덮어쓴다) */
    fun overlay(snap: WSnapshot, ops: List<JSONObject>): WSnapshot {
        var s = snap
        for (op in ops) {
            if (!op.has("done")) continue
            val done = op.optBoolean("done")
            when (op.optString("op")) {
                "apply" -> {
                    val nid = op.optString("note_id")
                    val tid = op.optString("thought_id")
                    val days = s.today.days.mapValues { (_, list) ->
                        list.map { if (it.noteId == nid && it.thoughtId == tid) it.copy(done = done) else it }
                    }
                    var q = s.quest
                    val tg = q.target
                    if (done && tg != null && tg.noteId == nid && tg.thoughtId == tid && !q.done) {
                        q = q.copy(
                            done = true,
                            apply = true,
                            doneAt = op.optDouble("at"),
                            bonus = q.bonus.copy(done = minOf(q.bonus.done + 1, q.bonus.doneMax)),
                            earned = (if (q.note) 20 else 0) + 3 + 10 + (if (q.note) 20 else 0),
                        )
                    }
                    s = s.copy(today = s.today.copy(days = days), quest = q)
                }
                "plan" -> {
                    val pid = op.optString("plan_id")
                    val date = op.optString("date")
                    val list = s.today.days[date] ?: continue
                    val next = list.map { if (it.planId == pid) it.copy(done = done) else it }
                    s = s.copy(today = s.today.copy(days = s.today.days + (date to next)))
                }
            }
        }
        return s
    }
}
