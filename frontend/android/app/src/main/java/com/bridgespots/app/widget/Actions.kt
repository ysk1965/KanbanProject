package com.bridgespots.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.glance.GlanceId
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import com.bridgespots.app.MainActivity
import org.json.JSONObject
import java.util.UUID

/**
 * 위젯 안의 체크 (iOS Intents.swift 와 같은 일). 서버는 못 부르니 대기열에 「이 상태로」를 적고,
 * 앱이 열릴 때 노트·할 일 저장소에 옮긴다 (widgetPending.ts). 화면은 대기열을 덧입혀 바로 바뀐다.
 */
object WAction {
    val kind = ActionParameters.Key<String>("kind")
    val done = ActionParameters.Key<Boolean>("done")
    val noteId = ActionParameters.Key<String>("note_id")
    val thoughtId = ActionParameters.Key<String>("thought_id")
    val planId = ActionParameters.Key<String>("plan_id")
    val rep = ActionParameters.Key<String>("rep")
    val date = ActionParameters.Key<String>("date")
    val week = ActionParameters.Key<String>("week")

    fun toggle(task: WTask, done: Boolean, date: String, week: String): Action =
        actionRunCallback<ToggleTaskAction>(
            actionParametersOf(
                kind to task.kind,
                this.done to done,
                noteId to (task.noteId ?: ""),
                thoughtId to (task.thoughtId ?: ""),
                planId to (task.planId ?: ""),
                rep to task.rep,
                this.date to date,
                this.week to week,
            ),
        )

    /** 갈피 퀘스트 「살아 냈어요」 — 적용 하나를 실천으로 */
    fun liveApply(target: WTarget): Action =
        actionRunCallback<ToggleTaskAction>(
            actionParametersOf(
                kind to "apply",
                done to true,
                noteId to target.noteId,
                thoughtId to target.thoughtId,
            ),
        )

    /** 앱 링크 (deepLinks.ts 가 bridgespots://app/… 를 경로로 바꾼다) */
    fun open(context: Context, link: Uri): Action =
        actionStartActivity(
            Intent(context, MainActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .setData(link)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
}

class ToggleTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val apply = parameters[WAction.kind] == "apply"
        val op = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("op", if (apply) "apply" else "plan")
            .put("done", parameters[WAction.done] ?: true)
            .put("at", System.currentTimeMillis())
        parameters[WAction.date]?.let { op.put("date", it) }
        parameters[WAction.week]?.let { op.put("week", it) }
        if (apply) {
            op.put("note_id", parameters[WAction.noteId] ?: "")
            op.put("thought_id", parameters[WAction.thoughtId] ?: "")
        } else {
            op.put("plan_id", parameters[WAction.planId] ?: "")
            op.put("rep", parameters[WAction.rep] ?: "once")
        }
        WidgetStore.appendPending(context, op)
        WidgetRefresh.update(context.applicationContext)
    }
}

/** 앱 링크 */
object WLink {
    private fun sermon(query: String = ""): Uri =
        Uri.parse("bridgespots://app/sermonnote" + if (query.isEmpty()) "" else "?$query")

    val challenge: Uri get() = sermon("tab=challenge")
    val home: Uri get() = sermon()
    fun note(id: String): Uri = sermon("note=${Uri.encode(id)}")
    fun bible(chapter: String?): Uri = if (chapter == null) sermon("tab=bible") else sermon("tab=bible&wch=$chapter")
}
