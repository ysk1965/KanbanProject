package com.bridgespots.app.widget

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.glance.appwidget.GlanceAppWidgetManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** 오늘의 말씀 위젯 — 어디서 가져올지 고르기 (위젯을 놓을 때 · 길게 눌러 다시 설정) */
class VerseConfigActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        // 고르지 않고 닫아도 위젯은 놓이게 (기본은 이번 주 설교 말씀)
        val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        setResult(RESULT_OK, result)

        val sources = VerseSource.entries
        val current = sources.indexOf(WidgetStore.verseSource(this, id))
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val theme = if (night) android.R.style.Theme_DeviceDefault_Dialog_Alert else android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
        AlertDialog.Builder(this, theme)
            .setTitle("말씀 출처")
            .setSingleChoiceItems(sources.map { it.label }.toTypedArray(), current) { dialog, which ->
                WidgetStore.setVerseSource(this, id, sources[which])
                val app = applicationContext
                CoroutineScope(Dispatchers.Default).launch {
                    val glanceId = GlanceAppWidgetManager(app).getGlanceIdBy(id)
                    VerseWidget().update(app, glanceId)
                }
                dialog.dismiss()
            }
            .setOnDismissListener { finish() }
            .show()
    }
}
