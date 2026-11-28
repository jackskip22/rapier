#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
compiler="${KOTLINC:-kotlinc}"
if ! command -v "$compiler" >/dev/null 2>&1; then
  echo 'JXL_TEST_TOOLCHAIN: Install Kotlin or set KOTLINC; alternatively run ./gradlew testDebugUnitTest.' >&2
  exit 1
fi
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
stubs="$work/stubs"
mkdir -p "$stubs"

cat > "$stubs/android-app.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER", "DEPRECATION")
package android.app
import android.content.*; import android.content.res.*; import android.os.*; import android.view.*; import java.io.File
open class Activity : Context() {
    val resources: Resources get() = Resources()
    val assets: AssetManager get() = AssetManager()
    val cacheDir: File get() = File(".")
    val contentResolver: ContentResolver get() = ContentResolver()
    var intent: Intent = Intent()
    fun setContentView(v: View) {}
    fun runOnUiThread(r: Runnable) = r.run()
    fun startActivity(i: Intent) {}
    fun startActivityForResult(i: Intent, code: Int) {}
    open fun onCreate(state: Bundle?) {}
    open fun onNewIntent(intent: Intent) {}
    open fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {}
    open fun onSaveInstanceState(state: Bundle) {}
    open fun onDestroy() {}
    companion object { const val RESULT_OK = -1 }
}
EOF

cat > "$stubs/android-content.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.content
import android.database.Cursor; import android.net.Uri; import java.io.*
open class Context
class ClipData { companion object { fun newRawUri(l: CharSequence?, u: Uri): ClipData = ClipData() } }
class Intent(val action: String? = null) {
    var type: String? = null; var data: Uri? = null; var clipData: ClipData? = null; val flags: Int = 0
    fun addCategory(c: String): Intent = this
    fun addFlags(f: Int): Intent = this
    fun putExtra(k: String, v: String): Intent = this
    fun putExtra(k: String, v: Uri): Intent = this
    fun <T> getParcelableExtra(k: String): T? = null
    companion object {
        const val ACTION_OPEN_DOCUMENT = ""; const val ACTION_CREATE_DOCUMENT = ""; const val ACTION_SEND = ""
        const val CATEGORY_OPENABLE = ""; const val EXTRA_STREAM = ""; const val EXTRA_TITLE = ""
        const val FLAG_GRANT_READ_URI_PERMISSION = 1; const val FLAG_GRANT_WRITE_URI_PERMISSION = 2; const val FLAG_GRANT_PERSISTABLE_URI_PERMISSION = 4
        fun createChooser(target: Intent, title: CharSequence?): Intent = target
    }
}
class ContentResolver {
    fun getType(u: Uri): String? = null
    fun query(u: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? = null
    fun openInputStream(u: Uri): InputStream? = null
    fun openOutputStream(u: Uri, mode: String): OutputStream? = null
    fun takePersistableUriPermission(u: Uri, flags: Int) {}
}
EOF

cat > "$stubs/android-res.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.content.res
import java.io.InputStream
class AssetManager { fun open(p: String): InputStream = "".byteInputStream() }
class DisplayMetrics { val density = 1f }
class Resources { val displayMetrics = DisplayMetrics() }
EOF

cat > "$stubs/android-misc.kt" <<'EOF'
package android.database
interface Cursor : java.io.Closeable { fun moveToFirst(): Boolean; fun getString(i: Int): String }
EOF

cat > "$stubs/android-net.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.net
class Uri {
    val scheme: String? = null; val host: String? = null; val port: Int = -1; val userInfo: String? = null; val path: String? = null
    companion object { fun parse(s: String): Uri = Uri() }
}
EOF

cat > "$stubs/android-os.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.os
class Bundle {
    fun putString(k: String, v: String?) {}
    fun putBoolean(k: String, v: Boolean) {}
    fun getString(k: String): String? = null
    fun getBoolean(k: String): Boolean = false
}
EOF

cat > "$stubs/android-provider.kt" <<'EOF'
package android.provider
object OpenableColumns { const val DISPLAY_NAME = "_display_name" }
EOF

cat > "$stubs/android-r.kt" <<'EOF'
package android
object R { object attr { const val progressBarStyleHorizontal = 0 } }
EOF

cat > "$stubs/android-view.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.view
import android.content.Context
class WindowInsets { val systemWindowInsetLeft = 0; val systemWindowInsetTop = 0; val systemWindowInsetRight = 0; val systemWindowInsetBottom = 0 }
open class View(c: Context) {
    var isEnabled = true; var accessibilityLiveRegion = 0
    fun setPadding(l: Int, t: Int, r: Int, b: Int) {}
    fun setOnClickListener(l: (View) -> Unit) {}
    fun setOnApplyWindowInsetsListener(l: (View, WindowInsets) -> WindowInsets) {}
    companion object { const val ACCESSIBILITY_LIVE_REGION_POLITE = 1 }
}
open class ViewGroup(c: Context) : View(c) { fun addView(v: View) {} }
EOF

cat > "$stubs/android-widget.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.widget
import android.content.Context; import android.view.*
open class LinearLayout(c: Context) : ViewGroup(c) { var orientation = 0; companion object { const val VERTICAL = 1 } }
class ScrollView(c: Context) : ViewGroup(c)
open class TextView(c: Context) : View(c) { var text: CharSequence = ""; var textSize = 14f; fun setTextIsSelectable(b: Boolean) {} }
class Button(c: Context) : TextView(c)
class ProgressBar(c: Context, a: Any?, s: Int) : View(c) { var max = 100; var progress = 0 }
EOF

cat > "$stubs/android-webkit.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package android.webkit
import android.content.Context; import android.net.Uri; import java.io.InputStream
class CookieManager {
    fun setAcceptCookie(b: Boolean) {}
    fun setAcceptThirdPartyCookies(w: WebView, b: Boolean) {}
    companion object { fun getInstance(): CookieManager = CookieManager() }
}
class RenderProcessGoneDetail
class WebResourceError { val description: CharSequence = "" }
interface WebResourceRequest { val url: Uri; val method: String; val isForMainFrame: Boolean }
class WebResourceResponse(var mimeType: String, enc: String, code: Int, reason: String, var responseHeaders: Map<String, String>, data: InputStream)
class WebSettings {
    var javaScriptEnabled = false; var allowFileAccess = false; var allowContentAccess = false; var blockNetworkLoads = false
    var mixedContentMode = 0; var cacheMode = 0; var safeBrowsingEnabled = false; var mediaPlaybackRequiresUserGesture = true
    fun setGeolocationEnabled(b: Boolean) {}
    companion object { const val MIXED_CONTENT_NEVER_ALLOW = 1; const val LOAD_NO_CACHE = 2 }
}
open class WebViewClient {
    open fun shouldInterceptRequest(v: WebView, req: WebResourceRequest): WebResourceResponse? = null
    open fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean = false
    open fun onPageFinished(v: WebView, url: String?) {}
    open fun onReceivedError(v: WebView, req: WebResourceRequest, err: WebResourceError) {}
    open fun onReceivedHttpError(v: WebView, req: WebResourceRequest, res: WebResourceResponse) {}
    open fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean = false
}
class WebView(c: Context) { val settings = WebSettings(); var webViewClient = WebViewClient(); fun loadUrl(u: String) {}; fun destroy() {} }
EOF

cat > "$stubs/androidx-webkit.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package androidx.webkit
import android.content.Context; import android.net.Uri; import android.webkit.*
class WebMessageCompat {
    constructor(data: String, ports: Array<WebMessagePortCompat>? = null)
    constructor(data: ByteArray)
    val type: Int = 0; val data: String? = null; val arrayBuffer: ByteArray = ByteArray(0)
    companion object { const val TYPE_STRING = 0; const val TYPE_ARRAY_BUFFER = 1 }
}
class WebMessagePortCompat {
    open class WebMessageCallbackCompat { open fun onMessage(port: WebMessagePortCompat, message: WebMessageCompat?) {} }
    fun setWebMessageCallback(cb: WebMessageCallbackCompat) {}
    fun postMessage(m: WebMessageCompat) {}
    fun close() {}
}
class WebViewAssetLoader {
    class AssetsPathHandler(c: Context)
    class Builder {
        fun setHttpAllowed(b: Boolean): Builder = this
        fun addPathHandler(p: String, h: AssetsPathHandler): Builder = this
        fun build(): WebViewAssetLoader = WebViewAssetLoader()
    }
    fun shouldInterceptRequest(u: Uri): WebResourceResponse? = null
}
object WebViewCompat {
    fun createWebMessageChannel(v: WebView): Array<WebMessagePortCompat> = arrayOf(WebMessagePortCompat(), WebMessagePortCompat())
    fun postWebMessage(v: WebView, m: WebMessageCompat, target: Uri) {}
}
object WebViewFeature {
    const val WEB_MESSAGE_ARRAY_BUFFER = ""; const val CREATE_WEB_MESSAGE_CHANNEL = ""; const val POST_WEB_MESSAGE = ""
    const val WEB_MESSAGE_PORT_POST_MESSAGE = ""; const val WEB_MESSAGE_PORT_SET_MESSAGE_CALLBACK = ""
    const val WEB_MESSAGE_CALLBACK_ON_MESSAGE = ""; const val WEB_MESSAGE_PORT_CLOSE = ""
    fun isFeatureSupported(f: String): Boolean = true
}
EOF

cat > "$stubs/org-json.kt" <<'EOF'
@file:Suppress("UNUSED_PARAMETER")
package org.json
class JSONObject(text: String = "{}") {
    fun keys(): MutableIterator<String> = mutableListOf<String>().iterator()
    fun getString(k: String): String = ""
    fun get(k: String): Any = ""
    fun isNull(k: String): Boolean = false
    fun put(k: String, v: Any?): JSONObject = this
}
EOF

"$compiler" -J-Xmx256m \
  "$stubs"/*.kt \
  app/src/main/java/app/rapier/jxlexample/MainActivity.kt \
  app/src/test/java/app/rapier/jxlexample/BridgeProtocolChecks.kt \
  -include-runtime -d "$work/bridge-checks.jar"
java -Xmx256m -jar "$work/bridge-checks.jar"
