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
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Standalone Java host for the official eGovPH staging SSO widget. */
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

    if (state != null && webView.restoreState(state) != null) return;

    try {
      String html = readStream(getAssets().open("sso.html")).replace(
        "__EGOV_SSO_CLIENT_ID__",
        TextUtils.htmlEncode(BuildConfig.EGOV_SSO_CLIENT_ID)
      );
      webView.loadDataWithBaseURL(WIDGET_ORIGIN, html, "text/html", "UTF-8", null);
    } catch (IOException error) {
      status.setText("Unable to load the bundled SSO page.");
    }
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    webView.saveState(state);
    super.onSaveInstanceState(state);
  }

  private static String readStream(InputStream input) throws IOException {
    try (InputStream stream = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[4096];
      int count;
      while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
      return bytes.toString(StandardCharsets.UTF_8.name());
    }
  }

  private final class SsoResultBridge {
    @JavascriptInterface
    public void onExchangeCode(String exchangeCode) {
      if (exchangeCode == null || exchangeCode.isBlank()) {
        runOnUiThread(() -> status.setText("Sign-in did not return an exchange code."));
        return;
      }
      if (BuildConfig.EGOV_SSO_API_BASE_URL.isBlank()) {
        runOnUiThread(() -> status.setText(
          "Sign-in succeeded and returned an exchange code. Configure the backend URL to retrieve the profile."
        ));
        return;
      }
      new Thread(() -> exchangeCodeServerSide(exchangeCode)).start();
    }
  }

  private void exchangeCodeServerSide(String exchangeCode) {
    HttpURLConnection connection = null;
    try {
      String base = BuildConfig.EGOV_SSO_API_BASE_URL.replaceAll("/+$", "");
      connection = (HttpURLConnection) new URL(base + "/api/auth/egov/exchange").openConnection();
      connection.setConnectTimeout(15_000);
      connection.setReadTimeout(30_000);
      connection.setRequestMethod("POST");
      connection.setRequestProperty("content-type", "application/json");
      connection.setRequestProperty("accept", "application/json");
      connection.setDoOutput(true);

      byte[] request = new JSONObject()
        .put("code", exchangeCode)
        .toString()
        .getBytes(StandardCharsets.UTF_8);
      connection.getOutputStream().write(request);

      int statusCode = connection.getResponseCode();
      InputStream responseStream = statusCode < 400
        ? connection.getInputStream()
        : connection.getErrorStream();
      String response = responseStream == null ? "" : readStream(responseStream);
      boolean authenticated =
        statusCode >= 200 &&
        statusCode < 300 &&
        !response.isBlank() &&
        new JSONObject(response).optBoolean("authenticated", false);
      runOnUiThread(() -> status.setText(
        authenticated
          ? "eGovPH profile authentication completed."
          : "The backend exchange failed."
      ));
    } catch (Exception error) {
      runOnUiThread(() -> status.setText("The backend exchange failed."));
    } finally {
      if (connection != null) connection.disconnect();
    }
  }
}
