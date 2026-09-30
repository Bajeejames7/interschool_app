package org.ambassadorsfootball.interschool;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * The Ambassadors Football app: a full-screen window onto the web app, like
 * the Base44 APK was. Everything — sign-in, sessions, tally, Creator Control —
 * lives in the web app, so a change there reaches every phone without a new
 * APK. This screen only adds what a browser tab lacks: an app icon, the back
 * button, a proper loading screen, and a retry when there is no connection.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = BuildConfig.APP_URL;
    private static final Uri APP = Uri.parse(APP_URL);

    private WebView web;
    private View splash;
    private ProgressBar spinner;
    private TextView message;
    private Button retry;
    private boolean firstPageShown = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    // Render's free servers sleep when idle; say so if loading takes a while.
    private final Runnable slowNotice = () -> {
        if (!firstPageShown) message.setText("Waking up the server…\nThis can take up to a minute.");
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        web = findViewById(R.id.web);
        splash = findViewById(R.id.splash);
        spinner = findViewById(R.id.spinner);
        message = findViewById(R.id.message);
        retry = findViewById(R.id.retry);
        retry.setOnClickListener(v -> load());

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // keeps coaches signed in
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " AmbassadorsFootballApp/1.0");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppPage(uri)) return false; // stay in the app
                openOutside(uri);                 // e.g. "Add to my calendar"
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!firstPageShown) showLoading();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (retry.getVisibility() == View.VISIBLE) return; // the error screen stays
                firstPageShown = true;
                handler.removeCallbacks(slowNotice);
                splash.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
            firstPageShown = true;
            splash.setVisibility(View.GONE);
        } else {
            load();
        }
    }

    private void load() {
        showLoading();
        web.loadUrl(web.getUrl() != null && isAppPage(Uri.parse(web.getUrl())) ? web.getUrl() : APP_URL);
    }

    private void showLoading() {
        splash.setVisibility(View.VISIBLE);
        spinner.setVisibility(View.VISIBLE);
        retry.setVisibility(View.GONE);
        message.setText("Loading…");
        handler.removeCallbacks(slowNotice);
        handler.postDelayed(slowNotice, 6000);
    }

    private void showOffline() {
        handler.removeCallbacks(slowNotice);
        splash.setVisibility(View.VISIBLE);
        spinner.setVisibility(View.GONE);
        message.setText("Can't reach Ambassadors Football.\nCheck your internet connection.");
        retry.setVisibility(View.VISIBLE);
    }

    private static boolean isAppPage(Uri uri) {
        return "https".equals(uri.getScheme())
                && APP.getHost().equals(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith(APP.getPath());
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // No app can open it; nothing sensible to do.
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // Pausing and resuming the page lets the web app notice the phone came back
    // to it, and fetch the latest sessions and tallies at once.
    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
