package com.bridgespots.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** 세 위젯을 다시 그리고, 다음에 다시 그릴 때(적용 잠금이 풀리는 때 · 자정)를 맞춰 둔다 */
object WidgetRefresh {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun all(context: Context) {
        val app = context.applicationContext
        scope.launch { update(app) }
    }

    suspend fun update(context: Context) {
        QuestWidget().updateAll(context)
        TodayWidget().updateAll(context)
        VerseWidget().updateAll(context)
        schedule(context)
    }

    /**
     * 다음에 다시 그릴 때: (오늘 안이면) 적용 잠금이 풀리는 때, 아니면 자정 (날이 바뀌면 오늘 칸·퀘스트 주가 바뀐다).
     * 화면이 꺼져 있을 땐 깨우지 않는다 (RTC) — 켜질 때 바로 돈다.
     */
    fun schedule(context: Context) {
        val now = System.currentTimeMillis()
        val midnight = WDate.nextMidnight(now) + 5_000
        val unlock = SnapshotStore.load(context)?.quest?.target?.unlockAt?.toLong() ?: 0L
        val at = if (unlock in (now + 1) until midnight) unlock + 1_000 else midnight
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        am.set(AlarmManager.RTC, at, tickIntent(context))
    }

    private fun tickIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, WidgetTickReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}

class WidgetTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                WidgetRefresh.update(context.applicationContext)
            } finally {
                pending.finish()
            }
        }
    }
}
