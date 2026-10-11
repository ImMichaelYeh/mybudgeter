package com.michaelyeh.mybudgetplanner

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class WebViewCompatibilityTest {
    @Test fun unsupportedWebViewShowsUpdateInstructionsWithoutChangingBudget() {
        if (MainActivity.supportsWebView()) return
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.filesDir, "budget.json")
        file.writeText("preserved budget")
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                fun findText(view: View): String {
                    if (view is TextView) return view.text.toString()
                    if (view is ViewGroup) return (0 until view.childCount).joinToString(" ") { findText(view.getChildAt(it)) }
                    return ""
                }
                assertTrue(findText(activity.window.decorView).contains("Update Android System WebView"))
                assertEquals("preserved budget", file.readText())
            }
        }
    }
}
