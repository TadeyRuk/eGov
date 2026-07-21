package ph.egov.ssotest;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

/** Thin native shell for an HTTPS-hosted eGov SSO widget. No partner secret belongs here. */
public final class MainActivity extends Activity {
  private WebView webView;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    if (BuildConfig.SSO_CHECKER_URL.isBlank()) {
      TextView message = new TextView(this);
      message.setPadding(48, 56, 48, 48);
      message.setText("No SSO checker URL was configured. Build with -PssoCheckerUrl=https://your-https-host/");
      setContentView(message);
      return;
    }
    webView = new WebView(this);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
    webView.setWebViewClient(new WebViewClient());
    if (state == null) webView.loadUrl(BuildConfig.SSO_CHECKER_URL); else webView.restoreState(state);
    setContentView(webView);
  }

  @Override protected void onSaveInstanceState(Bundle state) {
    if (webView != null) webView.saveState(state);
    super.onSaveInstanceState(state);
  }
}
