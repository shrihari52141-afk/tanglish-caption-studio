package com.tanglish.captionstudio;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1;
    private static final int PERMISSION_REQUEST = 2;
    private boolean permissionsAsked = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("whatsapp:")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                             FileChooserParams fileChooserParams) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent fileIntent = new Intent(Intent.ACTION_GET_CONTENT);
                fileIntent.addCategory(Intent.CATEGORY_OPENABLE);
                fileIntent.setType("video/*");
                fileIntent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
                fileIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);

                Intent audioIntent = new Intent(Intent.ACTION_GET_CONTENT);
                audioIntent.addCategory(Intent.CATEGORY_OPENABLE);
                audioIntent.setType("audio/*");

                Intent chooserIntent = Intent.createChooser(fileIntent, "Select Video or Audio File");
                chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{audioIntent});
                startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse(url));
                startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show();
            }
        });

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.loadUrl("https://tanglish-caption-studio.pages.dev");

        requestPermissionsLoop();
    }

    private void requestPermissionsLoop() {
        String[] perms;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms = new String[]{
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.RECORD_AUDIO
            };
        } else {
            perms = new String[]{
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.RECORD_AUDIO
            };
        }

        boolean allGranted = true;
        for (String p : perms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (!allGranted) {
            permissionsAsked = true;
            requestPermissions(perms, PERMISSION_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == PERMISSION_REQUEST) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            if (!allGranted) {
                Toast.makeText(this,
                    "Permissions are required for this app to work. Please grant all permissions.",
                    Toast.LENGTH_LONG).show();
                requestPermissionsLoop();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        Uri uri = Uri.parse(dataString);
                        String type = getContentResolver().getType(uri);
                        if (type != null && (type.startsWith("video/") || type.startsWith("audio/"))) {
                            results = new Uri[]{uri};
                        } else {
                            Toast.makeText(this,
                                "Only video and audio files are supported.",
                                Toast.LENGTH_SHORT).show();
                        }
                    } else if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            Uri uri = data.getClipData().getItemAt(i).getUri();
                            String type = getContentResolver().getType(uri);
                            if (type != null && (type.startsWith("video/") || type.startsWith("audio/"))) {
                                results[i] = uri;
                            } else {
                                Toast.makeText(this,
                                    "Only video and audio files are supported.",
                                    Toast.LENGTH_SHORT).show();
                                results = null;
                                break;
                            }
                        }
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
