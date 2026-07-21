package ph.egov.ssotest;

import android.app.Activity;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;

/** Minimal native host for the official eGovPH staging SSO widget. */
public final class MainActivity extends Activity {
  private static final String WIDGET_ORIGIN = "https://widgets.e.gov.ph/";

  private WebView webView;
  private TextView status;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);

    status = new TextView(this);
    status.setPadding(24, 24, 24, 24);
    status.setText("Use the official widget to sign in.");

    webView = new WebView(this);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(false);

    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(webView, true);

    webView.setWebViewClient(new WebViewClient());
    webView.addJavascriptInterface(new SsoResultBridge(), "AndroidSso");

    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.addView(status, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ));
    layout.addView(webView, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      0,
      1f
    ));
    setContentView(layout);

    if (BuildConfig.EGOV_SSO_CLIENT_ID.isBlank()) {
      status.setText("Missing eGovPH SSO client ID. Build with -PssoClientId=YOUR_CLIENT_ID.");
      return;
    }
    if (BuildConfig.EGOV_SSO_API_BASE_URL.isBlank()) {
      status.setText("Missing SSO backend URL. Build with -PssoApiBaseUrl=https://your-vercel-app.vercel.app.");
      return;
    }

    if (state != null && webView.restoreState(state) != null) {
      return;
    }

    try {
      String html = readAsset("sso.html").replace(
        "__EGOV_SSO_CLIENT_ID__",
        TextUtils.htmlEncode(BuildConfig.EGOV_SSO_CLIENT_ID)
      );
      webView.loadDataWithBaseURL(WIDGET_ORIGIN, html, "text/html", "UTF-8", null);
    } catch (IOException error) {
      status.setText("Unable to load the bundled SSO page.");
    }
  }

  private String readAsset(String name) throws IOException {
    try (InputStream stream = getAssets().open(name)) {
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      byte[] buffer = new byte[4096];
      int count;
      while ((count = stream.read(buffer)) != -1) {
        bytes.write(buffer, 0, count);
      }
      return bytes.toString(StandardCharsets.UTF_8.name());
    }
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    webView.saveState(state);
    super.onSaveInstanceState(state);
  }

  private final class SsoResultBridge {
    @JavascriptInterface
    public void onExchangeCode(String exchangeCode) {
      if (exchangeCode == null || exchangeCode.isBlank()) { runOnUiThread(() -> status.setText("Sign-in did not return an exchange code.")); return; }
      new Thread(() -> exchange(exchangeCode)).start();
    }
  }

  private void exchange(String code) {
    try {
      URL url = new URL(BuildConfig.EGOV_SSO_API_BASE_URL + "/api/auth/egov/exchange");
      HttpURLConnection connection = (HttpURLConnection) url.openConnection();
      connection.setRequestMethod("POST"); connection.setRequestProperty("content-type", "application/json"); connection.setDoOutput(true);
      connection.getOutputStream().write(("{\\\"code\\\":\\\"" + code.replace("\\", "\\\\").replace("\"", "\\\"") + "\\\"}").getBytes(StandardCharsets.UTF_8));
      int statusCode = connection.getResponseCode();
      InputStream stream = statusCode < 400 ? connection.getInputStream() : connection.getErrorStream();
      String response = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
      runOnUiThread(() -> { status.setText(statusCode < 400 ? "eGovPH profile authentication completed." : "The backend exchange failed."); webView.evaluateJavascript("showProfile(" + org.json.JSONObject.quote(response) + ")", null); });
    } catch (Exception error) { runOnUiThread(() -> status.setText("The backend exchange failed.")); }
  }
}
