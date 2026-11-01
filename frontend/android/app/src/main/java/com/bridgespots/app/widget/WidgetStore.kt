package com.bridgespots.app.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 앱(웹 코드)과 위젯이 같이 쓰는 저장소. iOS 의 WidgetShared.swift 와 같은 키·같은 모양.
 * - 요약(snapshot): 앱이 계산한 JSON 문자열 그대로. 위젯은 읽기만 한다.
 * - 대기열(pending): 위젯에서 누른 체크. 앱이 열릴 때 꺼내서(takePending) 노트·할 일 저장소에 옮긴다.
 * JSON 계약: frontend/src/app/components/personal/sermon/widget/widgetSnapshot.ts, utils/widgetBridge.ts
 */
object WidgetStore {
    private const val PREFS = "bridge_widget"
    private const val SNAPSHOT_KEY = "widget.snapshot.v1"
    private const val PENDING_KEY = "widget.pending.v1"
    private const val VERSE_SOURCE_KEY = "widget.verse.source."

    /** 대기열이 끝없이 쌓이지 않게 (앱을 오래 안 열어도 이만큼이면 충분) */
    private const val PENDING_MAX = 200

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun snapshotJson(context: Context): String? = prefs(context).getString(SNAPSHOT_KEY, null)

    fun writeSnapshot(context: Context, json: String) {
        prefs(context).edit().putString(SNAPSHOT_KEY, json).apply()
    }

    fun clearSnapshot(context: Context) {
        prefs(context).edit().remove(SNAPSHOT_KEY).remove(PENDING_KEY).apply()
    }

    fun pendingOps(context: Context): List<JSONObject> {
        val raw = prefs(context).getString(PENDING_KEY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** 같은 대상(같은 적용 · 같은 할 일의 같은 날)에 대한 예전 체크는 새 체크로 바꾼다 */
    @Synchronized
    fun appendPending(context: Context, op: JSONObject) {
        val target = targetKey(op)
        val list = pendingOps(context).filter { targetKey(it) != target }.toMutableList()
        list.add(op)
        while (list.size > PENDING_MAX) list.removeAt(0)
        prefs(context).edit().putString(PENDING_KEY, JSONArray(list).toString()).apply()
    }

    /** 대기열을 JSON 문자열로 꺼내고 비운다 */
    @Synchronized
    fun takePending(context: Context): String {
        val raw = prefs(context).getString(PENDING_KEY, null) ?: "[]"
        prefs(context).edit().remove(PENDING_KEY).apply()
        return raw
    }

    private fun targetKey(op: JSONObject): String =
        if (op.optString("op") == "apply") {
            "apply|${op.optString("note_id")}|${op.optString("thought_id")}"
        } else {
            "plan|${op.optString("plan_id")}|${op.optString("date")}"
        }

    /** 오늘의 말씀 위젯마다 고른 출처 */
    fun verseSource(context: Context, appWidgetId: Int): VerseSource =
        VerseSource.from(prefs(context).getString(VERSE_SOURCE_KEY + appWidgetId, null))

    fun setVerseSource(context: Context, appWidgetId: Int, source: VerseSource) {
        prefs(context).edit().putString(VERSE_SOURCE_KEY + appWidgetId, source.key).apply()
    }

    fun removeVerseSource(context: Context, appWidgetId: Int) {
        prefs(context).edit().remove(VERSE_SOURCE_KEY + appWidgetId).apply()
    }
}

/** 오늘의 말씀 — 어디서 가져올지 */
enum class VerseSource(val key: String, val label: String) {
    WEEK("week", "이번 주 설교 말씀"),
    LINE("line", "내가 밑줄 친 말씀"),
    READING("reading", "오늘 읽을 곳");

    companion object {
        fun from(key: String?) = entries.firstOrNull { it.key == key } ?: WEEK
    }
}
