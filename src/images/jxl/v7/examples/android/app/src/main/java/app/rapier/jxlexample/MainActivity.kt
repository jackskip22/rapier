package app.rapier.jxlexample

import android.app.Activity
import android.content.*
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.webkit.*
import org.json.JSONObject
import java.io.*
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

/** One activity with native controls. A hidden offline WebView runs the encoder in a worker. */
@Suppress("DEPRECATION")
class MainActivity : Activity() {
    private data class Job(val id: String, val mode: BridgeProtocol.Mode, val mime: String, val name: String, val bytes: ByteArray, val sha: ByteArray)
    private data class ResultFile(val file: File, val name: String, val summary: String)

    private val io = Executors.newSingleThreadExecutor()
    private val protocol = BridgeProtocol()
    private var webView: WebView? = null
    private var port: WebMessagePortCompat? = null
    private var queued: Job? = null
    private var result: ResultFile? = null
    private var savedUri: Uri? = null
    private var picking: BridgeProtocol.Mode? = null
    private var busy = false
    private var closed = false
    private var broken = false
    private var runId = 0L
    private var activeName = "image.jxl"
    private var inputSize = 0
    private lateinit var status: TextView
    private lateinit var bar: ProgressBar
    private lateinit var btns: List<Button>

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            setOnApplyWindowInsetsListener { v, i ->
                v.setPadding(pad + i.systemWindowInsetLeft, pad + i.systemWindowInsetTop, pad + i.systemWindowInsetRight, pad + i.systemWindowInsetBottom)
                i
            }
        }
        col.addView(TextView(this).apply { text = "rapier-jxl"; textSize = 24f })
        col.addView(TextView(this).apply { text = "Convert a photo or video offline on this device." })
        fun button(label: String, run: () -> Unit) = Button(this).also { it.text = label; it.setOnClickListener { run() }; col.addView(it) }
        btns = listOf(
            button("Choose photo") { pick(BridgeProtocol.Mode.ENCODE) },
            button("Restore a JPEG exactly") { pick(BridgeProtocol.Mode.JPEG) },
            button("Choose video") { pick(BridgeProtocol.Mode.VIDEO) },
            button("Save .jxl") { save() },
            button("Share saved file") { share() },
        )
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).also { it.max = 1000; col.addView(it) }
        status = TextView(this).apply { text = "Starting the encoder…"; setTextIsSelectable(true); accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        col.addView(status)
        setContentView(ScrollView(this).apply { addView(col) })
        restoreState(state)
        startWebView()
        if (state == null) handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        this.intent = intent
        handleShare(intent)
    }

    private fun startWebView() {
        val needed = arrayOf(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER, WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL, WebViewFeature.POST_WEB_MESSAGE)
        if (needed.any { !WebViewFeature.isFeatureSupported(it) }) return failBridge("JXL_WEBVIEW_BINARY_UNAVAILABLE", "Needs WebView 116+ with binary web messages")
        try {
            val json = JSONObject(assets.open("headers.json").bufferedReader().use { it.readText() })
            val headers = json.keys().asSequence().associateWith { json.getString(it) }
            val loader = WebViewAssetLoader.Builder().setHttpAllowed(false).addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
            val view = WebView(this).also { webView = it }
            view.settings.apply {
                javaScriptEnabled = true; allowFileAccess = false; allowContentAccess = false; blockNetworkLoads = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW; cacheMode = WebSettings.LOAD_NO_CACHE
                safeBrowsingEnabled = false; setGeolocationEnabled(false); mediaPlaybackRequiresUserGesture = false
            }
            CookieManager.getInstance().apply { setAcceptCookie(false); setAcceptThirdPartyCookies(view, false) }
            view.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(v: WebView, req: WebResourceRequest): WebResourceResponse {
                    val u = req.url
                    val ok = u.scheme == "https" && u.host == HOST && u.port == -1 && u.userInfo == null &&
                        u.path?.startsWith("/assets/") == true && req.method == "GET" && (!req.isForMainFrame || u.toString() == PAGE)
                    val res = (if (ok) loader.shouldInterceptRequest(u) else null)
                        ?: return WebResourceResponse("text/plain", "UTF-8", 403, "Local asset only", headers, "JXL_ASSET_REFUSED".byteInputStream())
                    if (u.path?.endsWith(".mjs") == true || u.path?.endsWith(".js") == true) res.mimeType = "application/javascript"
                    return res.apply { responseHeaders = headers }
                }
                override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest) = true
                override fun onPageFinished(v: WebView, url: String?) { if (!closed && !broken && url == PAGE && port == null) connectPort(v) }
                override fun onReceivedError(v: WebView, req: WebResourceRequest, err: WebResourceError) =
                    runOnUiThread { if (!closed) failBridge("JXL_ASSET_LOAD", err.description.toString()) }
                override fun onReceivedHttpError(v: WebView, req: WebResourceRequest, res: WebResourceResponse) =
                    runOnUiThread { if (!closed) failBridge("JXL_ASSET_LOAD", "Could not load ${req.url.path}") }
                override fun onRenderProcessGone(v: WebView, d: RenderProcessGoneDetail): Boolean {
                    failBridge("JXL_WEBVIEW_RENDERER", "Encoder process stopped. Reopen the app."); webView = null; v.destroy(); return true
                }
            }
            view.loadUrl(PAGE)
        } catch (e: Exception) { failBridge("JXL_WEBVIEW_START", e.message ?: "Could not start encoder") }
    }

    private fun connectPort(view: WebView) = try {
        val pair = WebViewCompat.createWebMessageChannel(view)
        port = pair[0]
        pair[0].setWebMessageCallback(object : WebMessagePortCompat.WebMessageCallbackCompat() {
            override fun onMessage(p: WebMessagePortCompat, msg: WebMessageCompat?) {
                if (closed || port !== pair[0]) return
                val frame = when (msg?.type) {
                    WebMessageCompat.TYPE_ARRAY_BUFFER -> BridgeProtocol.Frame.Binary(msg.arrayBuffer)
                    WebMessageCompat.TYPE_STRING -> parseFrame(msg.data)
                    else -> BridgeProtocol.Frame.Malformed("Missing payload")
                }
                onEvent(protocol.receive(frame))
            }
        })
        WebViewCompat.postWebMessage(view, WebMessageCompat("connect", arrayOf(pair[1])), Uri.parse(ORIGIN))
    } catch (e: Exception) { failBridge("JXL_BRIDGE_CONNECT", e.message ?: "Could not connect encoder") }

    private fun parseFrame(text: String?): BridgeProtocol.Frame = try {
        val j = JSONObject(text ?: error("Missing text"))
        fun s(k: String) = j.get(k) as? String ?: error("Invalid $k")
        fun n(k: String) = (j.get(k) as? Number)?.toDouble() ?: error("Invalid $k")
        fun len() = n("byteLength").also { require(it.isFinite() && it > 0 && it <= Int.MAX_VALUE && it == it.toInt().toDouble()) }.toInt()
        when (s("type")) {
            "ready" -> BridgeProtocol.Frame.Ready
            "progress" -> BridgeProtocol.Frame.Progress(s("id"), s("stage"), n("progress"))
            "result" -> BridgeProtocol.Frame.Result(s("id"), len())
            "restored" -> BridgeProtocol.Frame.Restored(s("id"), len())
            "error" -> BridgeProtocol.Frame.Error(if (j.isNull("id")) "" else s("id"), s("code"), s("message"))
            else -> BridgeProtocol.Frame.Malformed("Unknown message type")
        }
    } catch (e: Exception) { BridgeProtocol.Frame.Malformed(e.message ?: "Invalid message") }

    private fun onEvent(event: BridgeProtocol.Event) {
        when (event) {
            BridgeProtocol.Event.Ready -> { if (!busy && result == null) status.text = "Choose a photo or share one from another app."; dispatch() }
            BridgeProtocol.Event.None -> Unit
            is BridgeProtocol.Event.Progress -> { status.text = event.stage; bar.progress = (event.progress * 1000).toInt() }
            is BridgeProtocol.Event.Verify -> {
                status.text = "Comparing JPEG SHA-256…"
                bg("JXL_VERIFY") { val d = BridgeProtocol.sha256(event.restored); { onEvent(protocol.verified(event.id, d)) } }
            }
            is BridgeProtocol.Event.Complete -> {
                val name = activeName
                val summary = "$inputSize input bytes → ${event.jxl.size} JXL bytes" + (event.restoredSha256?.let { "\nJPEG SHA-256 matches:\n$it" } ?: "")
                bg("JXL_OUTPUT_CACHE") {
                    val f = File.createTempFile("jxl-", ".jxl", cacheDir)
                    try { FileOutputStream(f).use { it.write(event.jxl); it.fd.sync() } } catch (e: Exception) { f.delete(); throw e }
                    ({ val old = result; result = ResultFile(f, name, summary); savedUri = null; busy = false; bar.progress = 1000; status.text = summary; updateUi(); io.execute { old?.file?.delete() } })
                }
            }
            is BridgeProtocol.Event.Failed -> if (event.fatal) failBridge(event.code, event.message) else failJob(event.code, event.message)
        }
        updateUi()
    }

    private fun bg(code: String, advance: Boolean = false, work: () -> () -> Unit) {
        val tok = if (advance) ++runId else runId
        io.execute {
            try { val apply = work(); runOnUiThread { if (!closed && tok == runId) apply() } }
            catch (e: Exception) { runOnUiThread { if (!closed && tok == runId) failJob(code, e.message ?: "Operation failed") } }
        }
    }

    private fun pick(mode: BridgeProtocol.Mode) {
        if (busy || !protocol.ready) return
        picking = mode; busy = true; updateUi()
        val mime = when (mode) { BridgeProtocol.Mode.JPEG -> "image/jpeg"; BridgeProtocol.Mode.VIDEO -> "video/*"; BridgeProtocol.Mode.ENCODE -> "image/*" }
        try { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply { type = mime }, PICK) }
        catch (e: Exception) { picking = null; failJob("JXL_PICKER_UNAVAILABLE", e.message ?: "Could not open picker") }
    }

    private fun handleShare(intent: Intent) {
        if (intent.action != Intent.ACTION_SEND) return
        if (busy) { status.text = "JXL_BUSY: Finish the current action first"; return }
        val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        val video = intent.type?.startsWith("video/") == true
        if (uri == null || (!video && intent.type?.startsWith("image/") != true)) return failJob("JXL_INPUT_URI", "Share one image or video file")
        loadUri(uri, if (video) BridgeProtocol.Mode.VIDEO else BridgeProtocol.Mode.ENCODE)
    }

    private fun loadUri(uri: Uri, mode: BridgeProtocol.Mode) {
        if (broken) { busy = false; updateUi(); return }
        if (uri.scheme != "content") return failJob("JXL_INPUT_URI", "Choose a file through the system picker")
        busy = true; bar.progress = 0; status.text = "Reading file…"; updateUi()
        bg("JXL_INPUT_READ", advance = true) {
            val mime = contentResolver.getType(uri) ?: error("Selected file has no type")
            require(mime.startsWith(if (mode == BridgeProtocol.Mode.VIDEO) "video/" else "image/")) { "Unexpected file type: $mime" }
            require(mode != BridgeProtocol.Mode.JPEG || mime == "image/jpeg") { "Choose a JPEG to restore exactly" }
            val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } ?: "image"
            val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Could not open file")
            require(bytes.isNotEmpty()) { "Selected file is empty" }
            val job = Job(UUID.randomUUID().toString(), mode, mime, name, bytes, BridgeProtocol.sha256(bytes))
            ({ queued = job; dispatch() })
        }
    }

    private fun dispatch() {
        val job = queued ?: return; val ch = port ?: return
        if (!protocol.ready) return
        queued = null; inputSize = job.bytes.size
        val base = job.name.substringAfterLast('/').substringAfterLast('\\')
        activeName = base.substringBeforeLast('.', base).ifBlank { "image" } + ".jxl"
        try {
            protocol.begin(job.id, job.mode, job.sha)
            ch.postMessage(WebMessageCompat(JSONObject().put("type", job.mode.wireName).put("id", job.id).put("mime", job.mime).toString()))
            ch.postMessage(WebMessageCompat(job.bytes))
            status.text = "Encoding…"
        } catch (e: Exception) { failBridge("JXL_BRIDGE_SEND", e.message ?: "Could not send file") }
    }

    private fun save() {
        val res = result ?: return
        if (busy) return
        busy = true; updateUi()
        try {
            startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .putExtra(Intent.EXTRA_TITLE, res.name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
                .apply { type = "image/jxl" }, SAVE)
        } catch (e: Exception) { failJob("JXL_PICKER_UNAVAILABLE", e.message ?: "Could not open save picker") }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        if (requestCode == PICK) {
            val mode = picking; picking = null
            if (resultCode != RESULT_OK) { busy = false; status.text = result?.summary ?: "Canceled."; updateUi(); return }
            if (mode == null || uri == null) return failJob("JXL_PICKER_RESULT", "Picker returned no file")
            loadUri(uri, mode)
        } else if (requestCode == SAVE) {
            val res = result
            if (resultCode != RESULT_OK) { busy = false; status.text = res?.summary ?: "Canceled."; updateUi(); return }
            if (res == null || uri?.scheme != "content") return failJob("JXL_PICKER_RESULT", "Picker returned no save location")
            if (data.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION != 0) {
                try { contentResolver.takePersistableUriPermission(uri, data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) }
                catch (e: SecurityException) { return failJob("JXL_OUTPUT_GRANT", e.message ?: "Could not retain save access") }
            }
            status.text = "Saving…"
            bg("JXL_OUTPUT_WRITE", advance = true) {
                contentResolver.openOutputStream(uri, "w")?.use { out -> res.file.inputStream().use { it.copyTo(out) } } ?: error("Could not open save location")
                ({ savedUri = uri; busy = false; status.text = "Saved ${res.name}\n${res.summary}"; updateUi() })
            }
        }
    }

    private fun share() {
        val uri = savedUri ?: return
        if (busy) return
        try {
            val send = Intent(Intent.ACTION_SEND).apply { type = "image/jxl"; putExtra(Intent.EXTRA_STREAM, uri); clipData = ClipData.newRawUri(result?.name ?: "image.jxl", uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            startActivity(Intent.createChooser(send, "Share JPEG XL"))
        } catch (e: Exception) { status.text = "JXL_SHARE_UNAVAILABLE: ${e.message ?: "Could not share file"}" }
    }

    private fun failJob(code: String, message: String) { runId++; queued = null; busy = false; status.text = "$code: $message"; updateUi() }
    private fun failBridge(code: String, message: String) { broken = true; protocol.reset(); try { port?.close() } catch (_: Exception) {}; port = null; failJob(code, message) }
    private fun updateUi() {
        val ok = !busy && protocol.ready
        btns[0].isEnabled = ok; btns[1].isEnabled = ok; btns[2].isEnabled = ok; btns[3].isEnabled = !busy && result != null; btns[4].isEnabled = !busy && savedUri != null
    }

    override fun onSaveInstanceState(state: Bundle) {
        super.onSaveInstanceState(state)
        result?.let { state.putString("f", it.file.name); state.putString("n", it.name); state.putString("s", it.summary) }
        state.putString("u", savedUri?.toString())
    }

    private fun restoreState(state: Bundle?) {
        val fn = state?.getString("f") ?: return
        if (fn == File(fn).name) File(cacheDir, fn).takeIf { it.isFile }?.let {
            result = ResultFile(it, state.getString("n") ?: "image.jxl", state.getString("s") ?: "JPEG XL ready")
        }
        savedUri = state.getString("u")?.let(Uri::parse)?.takeIf { it.scheme == "content" }
        result?.let { status.text = it.summary }
        updateUi()
    }

    override fun onDestroy() {
        closed = true; runId++; queued = null; protocol.reset()
        try { port?.close() } catch (_: Exception) {}; port = null; webView?.destroy(); webView = null; io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val ORIGIN = "https://$HOST"
        private const val PAGE = "$ORIGIN/assets/encoder.html"
        private const val PICK = 1; private const val SAVE = 2
    }
}

/** Framed message protocol between MainActivity and the WebView worker. */
internal class BridgeProtocol {
    enum class Mode(val wireName: String) { ENCODE("encode"), JPEG("jpeg"), VIDEO("video") }
    sealed interface Frame {
        data object Ready : Frame
        data class Progress(val id: String, val stage: String, val progress: Double) : Frame
        data class Result(val id: String, val byteLength: Int) : Frame
        data class Restored(val id: String, val byteLength: Int) : Frame
        data class Error(val id: String, val code: String, val message: String) : Frame
        data class Binary(val bytes: ByteArray) : Frame
        data class Malformed(val message: String) : Frame
    }
    sealed interface Event {
        data object Ready : Event
        data object None : Event
        data class Progress(val stage: String, val progress: Double) : Event
        data class Verify(val id: String, val restored: ByteArray) : Event
        data class Complete(val id: String, val jxl: ByteArray, val restoredSha256: String?) : Event
        data class Failed(val code: String, val message: String, val fatal: Boolean) : Event
    }

    private enum class Phase { RESULT_HEADER, RESULT_BYTES, RESTORED_HEADER, RESTORED_BYTES, VERIFY }
    private data class Pending(val id: String, val mode: Mode, val sha: ByteArray, var phase: Phase = Phase.RESULT_HEADER, var len: Int = 0, var jxl: ByteArray? = null)
    var ready = false; private set
    private var pending: Pending? = null

    fun begin(id: String, mode: Mode, originalSha256: ByteArray) {
        check(ready && pending == null) { "The encoder is not ready" }
        require(id.isNotBlank() && originalSha256.size == 32)
        pending = Pending(id, mode, originalSha256.copyOf())
    }
    fun reset() { ready = false; pending = null }

    fun receive(frame: Frame): Event {
        if (frame is Frame.Malformed) return broken(frame.message)
        if (frame == Frame.Ready) return if (ready || pending != null) broken("Unexpected ready") else { ready = true; Event.Ready }
        if (frame is Frame.Error && frame.id.isEmpty()) { reset(); return Event.Failed(validCode(frame.code), frame.message.ifBlank { "Invalid error" }, true) }
        val cur = pending ?: return if (ready) broken("Response without active request") else Event.None
        val id = when (frame) { is Frame.Progress -> frame.id; is Frame.Result -> frame.id; is Frame.Restored -> frame.id; is Frame.Error -> frame.id; else -> cur.id }
        if (id != cur.id) return broken("Response for another request")
        return when (frame) {
            is Frame.Progress -> if (cur.phase !in setOf(Phase.RESULT_HEADER, Phase.RESTORED_HEADER) || frame.stage.isBlank() || !frame.progress.isFinite() || frame.progress !in 0.0..1.0)
                broken("Invalid progress") else Event.Progress(frame.stage, frame.progress)
            is Frame.Result -> header(cur, frame.byteLength, Phase.RESULT_HEADER, Phase.RESULT_BYTES)
            is Frame.Restored -> if (cur.mode != Mode.JPEG) broken("Unexpected restored JPEG") else header(cur, frame.byteLength, Phase.RESTORED_HEADER, Phase.RESTORED_BYTES)
            is Frame.Binary -> when {
                cur.phase !in setOf(Phase.RESULT_BYTES, Phase.RESTORED_BYTES) -> broken("Bytes without header")
                frame.bytes.size != cur.len -> broken("Byte length mismatch")
                cur.phase == Phase.RESTORED_BYTES -> { cur.phase = Phase.VERIFY; Event.Verify(cur.id, frame.bytes) }
                cur.mode == Mode.JPEG -> { cur.jxl = frame.bytes; cur.phase = Phase.RESTORED_HEADER; Event.None }
                else -> { pending = null; Event.Complete(cur.id, frame.bytes, null) }
            }
            is Frame.Error -> {
                pending = null
                val code = validCode(frame.code); val fatal = code != frame.code || frame.message.isBlank() || code == "JXL_WORKER"
                if (fatal) ready = false
                Event.Failed(code, frame.message.ifBlank { "Invalid error" }, fatal)
            }
            else -> broken("Unexpected message")
        }
    }

    fun verified(id: String, restoredSha256: ByteArray): Event {
        val cur = pending ?: return Event.None
        if (cur.id != id || cur.phase != Phase.VERIFY) return broken("Unexpected JPEG verification")
        pending = null
        return if (MessageDigest.isEqual(cur.sha, restoredSha256)) Event.Complete(cur.id, checkNotNull(cur.jxl), hex(restoredSha256))
        else Event.Failed("JXL_JPEG_RESTORE_MISMATCH", "Restored JPEG SHA-256 mismatch", false)
    }

    private fun header(cur: Pending, len: Int, expect: Phase, next: Phase): Event =
        if (cur.phase != expect || len <= 0) broken("Invalid header") else { cur.phase = next; cur.len = len; Event.None }
    private fun broken(msg: String): Event.Failed { reset(); return Event.Failed("JXL_BRIDGE_PROTOCOL", msg, true) }
    private fun validCode(code: String) = if (code.matches(Regex("JXL_[A-Z0-9_]+"))) code else "JXL_BRIDGE_PROTOCOL"

    companion object {
        fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)
        fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
    }
}
