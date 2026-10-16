package com.michaelyeh.mybudgetplanner

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.util.Currency
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var storage: BudgetStorage
    private var pageReady = false
    private var importId: String? = null
    private var exportId: String? = null
    private var importBudgetId: String? = null
    private var exportBudgetId: String? = null

    private val openDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val id = importId ?: return@registerForActivityResult
        importId = null
        val budgetId = importBudgetId
        importBudgetId = null
        writer.execute {
            val response = result(id, "import").put("budgetId", budgetId ?: "")
            try {
                response.put("value", uri?.let { readDocument(it) } ?: JSONObject.NULL)
            } catch (error: Exception) {
                response.put("error", "Could not read the selected file: ${error.message}")
            }
            cacheDocument(response)
        }
    }

    private val createDocument = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val id = exportId ?: return@registerForActivityResult
        exportId = null
        val budgetId = exportBudgetId
        exportBudgetId = null
        writer.execute {
            val response = result(id, "export").put("budgetId", budgetId ?: "")
            try {
                if (uri != null) {
                    contentResolver.openOutputStream(uri, "wt")?.use { output ->
                        File(cacheDir, "export.json").inputStream().use { it.copyTo(output) }
                    } ?: error("The selected destination is not writable")
                }
                response.put("value", uri != null)
            } catch (error: Exception) {
                response.put("error", "Could not export the budget: ${error.message}")
            } finally {
                File(cacheDir, "export.json").delete()
            }
            cacheDocument(response)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        storage = BudgetStorage(filesDir)
        importId = savedInstanceState?.getString("importId")
        exportId = savedInstanceState?.getString("exportId")
        importBudgetId = savedInstanceState?.getString("importBudgetId")
        exportBudgetId = savedInstanceState?.getString("exportBudgetId")
        if (!supportsWebView()) {
            setContentView(TextView(this).apply {
                text = getString(R.string.update_webview)
                textSize = 18f
                setPadding(32, 48, 32, 32)
            })
            return
        }
        web = WebView(this)
        web.setBackgroundColor(Color.rgb(11, 41, 69))
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        val container = android.widget.FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(11, 41, 69))
            addView(web, android.widget.FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            ))
        }
        setContentView(container)
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            WindowInsetsCompat.CONSUMED
        }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            textZoom = (resources.configuration.fontScale * 100).toInt()
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(false)
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                return assets.shouldInterceptRequest(request.url)
                    ?: WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(byteArrayOf()))
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.toString() == APP_URL) return false
                if (request.isForMainFrame && request.url.scheme in setOf("https", "http")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    } catch (_: android.content.ActivityNotFoundException) {
                        showMessage("No browser is available to open this link.")
                    }
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) android.util.Log.d("BudgetWeb", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }

            override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton("OK") { _, _ -> result.confirm() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }

            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton("Continue") { _, _ -> result.confirm() }
                    .setNegativeButton("Cancel") { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "AndroidBudget", setOf(ORIGIN)) { _, message, origin, mainFrame, _ ->
                if (!mainFrame || origin.toString().trimEnd('/') != ORIGIN) return@addWebMessageListener
                val request = try {
                    JSONObject(message.data ?: return@addWebMessageListener)
                } catch (_: Exception) {
                    showMessage("The app could not process a storage request.")
                    return@addWebMessageListener
                }
                try {
                    handleRequest(request)
                } catch (error: Exception) {
                    reply(result(request.optString("id"), request.optString("operation")).put("error", error.message ?: "Invalid storage request"))
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (ViewCompat.getRootWindowInsets(web)?.isVisible(WindowInsetsCompat.Type.ime()) == true) {
                    androidx.core.view.WindowCompat.getInsetsController(window, web).hide(WindowInsetsCompat.Type.ime())
                    return
                }
                web.evaluateJavascript("window.budgetMobile?.handleBack() || false") { handled ->
                    if (handled != "true") {
                        web.evaluateJavascript("window.budgetMobile?.checkpoint()") { finish() }
                    }
                }
            }
        })
        web.loadUrl(APP_URL)
    }

    private fun handleRequest(request: JSONObject) {
        val id = request.getString("id")
        val operation = request.getString("operation")
        when (operation) {
            "displayCurrency" -> {
                val locale = resources.configuration.locales[0]
                val currency = runCatching { Currency.getInstance(locale)?.currencyCode }.getOrNull() ?: "USD"
                val display = JSONObject().put("locale", locale.toLanguageTag()).put("currency", currency)
                reply(result(id, operation).put("value", display))
            }
            "ready" -> {
                pageReady = true
                reply(result(id, operation).put("value", true))
                writer.execute {
                    val file = File(cacheDir, "picker-result.json")
                    if (file.exists()) {
                        try {
                            val response = JSONObject(file.readText(Charsets.UTF_8))
                            runOnUiThread { deliverDocument(response) }
                        } catch (_: Exception) {
                            file.delete()
                            runOnUiThread { showMessage("The file selection could not be recovered. Select the file again; your budget has not been replaced.") }
                        }
                    }
                }
            }
            "import" -> {
                if (importId != null || exportId != null) {
                    reply(result(id, operation).put("error", "A file picker is already open."))
                } else {
                    importId = id
                    importBudgetId = request.optString("budgetId")
                    openDocument.launch(arrayOf("application/json", "text/plain", "application/octet-stream"))
                }
            }
            "export" -> {
                if (importId != null || exportId != null) {
                    reply(result(id, operation).put("error", "A file picker is already open."))
                    return
                }
                val value = request.getString("value")
                validateBudget(value)
                exportId = id
                exportBudgetId = request.optString("budgetId")
                writer.execute {
                    try {
                        File(cacheDir, "export.json").writeText(value, Charsets.UTF_8)
                        runOnUiThread { createDocument.launch("MyBudgeter-save.json") }
                    } catch (error: Exception) {
                        runOnUiThread {
                            exportId = null
                            reply(result(id, operation).put("error", error.message))
                        }
                    }
                }
            }
            "load", "save", "loadSession", "session" -> writer.execute {
                val response = result(id, operation)
                try {
                    val value = when (operation) {
                        "load" -> storage.load()
                        "loadSession" -> storage.loadSession()
                        "save" -> {
                            val json = request.getString("value")
                            validateLibrary(json)
                            storage.save(json)
                            true
                        }
                        else -> {
                            val json = request.getString("value")
                            JSONObject(json)
                            storage.saveSession(json)
                            true
                        }
                    }
                    response.put("value", value ?: JSONObject.NULL)
                } catch (error: Exception) {
                    response.put("error", "Local storage failed: ${error.message}")
                }
                runOnUiThread { reply(response) }
            }
            else -> reply(result(id, operation).put("error", "Unsupported operation"))
        }
    }

    private fun validateBudget(value: String) {
        val json = JSONObject(value)
        require(json.getString("schema").equals("MyBudgeter-budget-v1", ignoreCase = true))
        for (key in listOf("incomes", "categories", "expenses")) json.getJSONArray(key)
    }

    private fun validateLibrary(value: String) {
        val json = JSONObject(value)
        if (json.optString("schema").equals("MyBudgeter-budget-v1", ignoreCase = true)) {
            validateBudget(value)
            return
        }
        require(json.getString("schema") == "MyBudgeter-library-v1")
        val budgets = json.getJSONArray("budgets")
        val ids = mutableSetOf<String>()
        val names = mutableSetOf<String>()
        for (index in 0 until budgets.length()) {
            val entry = budgets.getJSONObject(index)
            val id = entry.getString("id")
            val name = entry.getString("name")
            require(id.matches(Regex("[a-zA-Z0-9_-]+")) && ids.add(id))
            require(id !in setOf("__proto__", "constructor", "prototype"))
            require(name.isNotBlank() && name == name.trim() && name.length <= 100)
            require(names.add(name.lowercase(java.util.Locale.ROOT)))
            validateBudget(entry.getJSONObject("data").toString())
        }
        val active = json.getString("activeBudgetId")
        require(if (budgets.length() == 0) active.isEmpty() else active in ids)
    }

    private fun readDocument(uri: Uri): String {
        return contentResolver.openInputStream(uri)?.use { stream ->
            // shortcut: backups are capped at 16 MiB; stream larger budgets if this limit becomes practical.
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            var count = stream.read(buffer)
            while (count != -1) {
                require(output.size() + count <= 16 * 1024 * 1024) { "Save files must be smaller than 16 MiB" }
                output.write(buffer, 0, count)
                count = stream.read(buffer)
            }
            output.toString("UTF-8")
        } ?: error("The selected file is not readable")
    }

    private fun result(id: String, operation: String) = JSONObject().put("id", id).put("operation", operation)

    private fun reply(response: JSONObject) {
        if (!isDestroyed && ::web.isInitialized) {
            web.evaluateJavascript("window.budgetPlatform.receive(${response});", null)
        }
    }

    private fun deliverDocument(response: JSONObject) {
        if (pageReady && !isDestroyed) {
            reply(response)
            File(cacheDir, "picker-result.json").delete()
        }
    }

    private fun cacheDocument(response: JSONObject) {
        try {
            File(cacheDir, "picker-result.json").writeText(response.toString(), Charsets.UTF_8)
        } catch (error: Exception) {
            response.put("error", "Could not preserve the file-picker result: ${error.message}")
        }
        runOnUiThread { deliverDocument(response) }
    }

    private fun showMessage(message: String) {
        if (!isFinishing && !isDestroyed) AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK", null).show()
    }

    override fun onPause() {
        if (::web.isInitialized) web.evaluateJavascript("window.budgetMobile?.checkpoint()", null)
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("importId", importId)
        outState.putString("exportId", exportId)
        outState.putString("importBudgetId", importBudgetId)
        outState.putString("exportBudgetId", exportBudgetId)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    companion object {
        // One queue spans recreation so an old activity cannot overwrite a newer save.
        private val writer = Executors.newSingleThreadExecutor()
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val APP_URL = "$ORIGIN/assets/index.html?android=1"

        fun supportsWebView(): Boolean {
            val major = WebView.getCurrentWebViewPackage()?.versionName?.substringBefore('.')?.toIntOrNull() ?: 0
            return major >= 100 && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        }
    }
}
