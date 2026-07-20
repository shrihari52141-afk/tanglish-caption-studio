package com.tanglish.captionstudio;

import android.app.DownloadManager;
import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
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
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1;
    private static final int PERMISSION_REQUEST = 2;
    private static final int SAVE_DOC_REQUEST = 3;
    private PermissionRequest pendingPermissionRequest;
    private boolean micPermissionAsked = false;
    private File pendingSaveTemp;
    private String pendingSaveName;
    private String pendingSaveMime;

    private byte[] readAll(File f) {
        try (InputStream is = new java.io.FileInputStream(f);
             java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return bos.toByteArray();
        } catch (Exception e) {
            return new byte[0];
        }
    }

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

        webView.addJavascriptInterface(new MicBridge(), "MicBridge");

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

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                    "(function(){ try { navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){ s.getTracks().forEach(function(t){ t.stop(); }); }).catch(function(){}); } catch(e){} })();",
                    null
                );
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                pendingPermissionRequest = request;
                String[] resources = request.getResources();
                boolean hasMic = false;
                for (String r : resources) {
                    if (r.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        hasMic = true;
                        break;
                    }
                }
                if (hasMic) {
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(resources);
                        pendingPermissionRequest = null;
                    } else {
                        requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, PERMISSION_REQUEST);
                    }
                } else {
                    request.grant(resources);
                    pendingPermissionRequest = null;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                             FileChooserParams fileChooserParams) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent fileIntent = new Intent(Intent.ACTION_GET_CONTENT);
                fileIntent.addCategory(Intent.CATEGORY_OPENABLE);
                fileIntent.setType("*/*");
                fileIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                fileIntent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                    "video/*", "audio/*",
                    "application/octet-stream",
                    "application/x-mpegURL",
                    "application/dash+xml"
                });

                Intent chooserIntent = Intent.createChooser(fileIntent, "Select Video or Audio File");
                startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url != null && url.startsWith("blob:")) {
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                request.addRequestHeader("Cookie", cookie);
                request.addRequestHeader("User-Agent", userAgent);
                request.setMimeType(mimeType);
                request.addRequestHeader("Content-Disposition", contentDisposition);

                String urlFileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                String chars = "abcdefghijklmnopqrstuvwxyz0123456789";
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < 6; i++) {
                    sb.append(chars.charAt((int)(Math.random() * chars.length())));
                }
                String randomSuffix = sb.toString();
                String baseName = urlFileName.contains(".")
                    ? urlFileName.substring(0, urlFileName.lastIndexOf('.'))
                    : urlFileName;
                String ext = urlFileName.contains(".")
                    ? urlFileName.substring(urlFileName.lastIndexOf('.'))
                    : "";
                String finalName = baseName + "_" + randomSuffix + ext;

                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, finalName);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setTitle("Caption Studio Export");
                request.setDescription("Saving " + finalName);

                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                dm.enqueue(request);

                Toast.makeText(this, "Saving " + finalName + " to Downloads", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "Failed to save file: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        requestAllPermissions();
    }

    class MicBridge {
        @JavascriptInterface
        public void requestMicPermission() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    webView.evaluateJavascript("window._micPermissionGranted && window._micPermissionGranted()", null);
                } else {
                    micPermissionAsked = true;
                    requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, PERMISSION_REQUEST);
                }
            });
        }

        @JavascriptInterface
        public boolean hasMicPermission() {
            return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }

        // Accumulates base64 text across many small bridge calls to avoid the
        // WebView JavaScript-interface single-argument size limit that corrupts
        // large strings ("bad base-64").
        private final StringBuilder chunkBuffer = new StringBuilder();

        @JavascriptInterface
        public void saveFileBegin() {
            synchronized (chunkBuffer) { chunkBuffer.setLength(0); }
        }

        @JavascriptInterface
        public void saveFileChunk(String base64Chunk) {
            if (base64Chunk == null) return;
            synchronized (chunkBuffer) { chunkBuffer.append(base64Chunk); }
        }

        @JavascriptInterface
        public void saveFileEnd(String fileName, String mimeType) {
            final String data;
            synchronized (chunkBuffer) { data = chunkBuffer.toString(); chunkBuffer.setLength(0); }
            // Decode to a temp file, then open the system file manager (SAF) so the
            // user picks where to save. Avoids any Gallery/MediaStore quirks.
            new Thread(() -> prepareAndPickLocation(fileName, data, mimeType)).start();
        }

        private void prepareAndPickLocation(String fileName, String base64Data, String mimeType) {
            try {
                if (base64Data != null && base64Data.contains(",")) {
                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                }
                if (base64Data != null) {
                    base64Data = base64Data.replaceAll("\\s+", "");
                }
                byte[] decoded;
                try {
                    decoded = Base64.decode(base64Data, Base64.NO_WRAP);
                } catch (IllegalArgumentException iae) {
                    decoded = Base64.decode(base64Data, Base64.DEFAULT);
                }
                if (decoded == null || decoded.length == 0) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: empty file data", Toast.LENGTH_SHORT).show());
                    return;
                }
                File tmp = new File(getCacheDir(), "export_" + System.currentTimeMillis());
                try (FileOutputStream fos = new FileOutputStream(tmp)) {
                    fos.write(decoded);
                    fos.flush();
                }
                pendingSaveTemp = tmp;
                pendingSaveName = fileName;
                pendingSaveMime = (mimeType != null ? mimeType : "application/octet-stream");
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(pendingSaveMime);
                    intent.putExtra(Intent.EXTRA_TITLE, pendingSaveName);
                    try {
                        startActivityForResult(intent, SAVE_DOC_REQUEST);
                    } catch (Exception ex) {
                        // No file manager available: fall back to direct Gallery save.
                        new Thread(() -> saveFileInternal(pendingSaveName,
                                Base64.encodeToString(readAll(pendingSaveTemp), Base64.NO_WRAP),
                                pendingSaveMime)).start();
                    }
                });
            } catch (Exception e) {
                final String err = e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: " + err, Toast.LENGTH_LONG).show());
            }
        }

        @JavascriptInterface
        public void saveFile(String fileName, String base64Data, String mimeType) {
            // Legacy single-shot path (kept for small files / fallback).
            new Thread(() -> saveFileInternal(fileName, base64Data, mimeType)).start();
        }

        private void saveFileInternal(String fileName, String base64Data, String mimeType) {
            try {
                // Strip a data URI prefix if present ("data:video/mp4;base64,....")
                if (base64Data != null && base64Data.contains(",")) {
                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                }
                // Remove any stray whitespace/newlines that would break strict decoding.
                if (base64Data != null) {
                    base64Data = base64Data.replaceAll("\\s+", "");
                }

                byte[] decoded;
                try {
                    decoded = Base64.decode(base64Data, Base64.NO_WRAP);
                } catch (IllegalArgumentException iae) {
                    // Fall back to the most lenient decoding path.
                    decoded = Base64.decode(base64Data, Base64.DEFAULT);
                }
                if (decoded == null || decoded.length == 0) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: empty file data", Toast.LENGTH_SHORT).show());
                    return;
                }

                final long sizeKB = decoded.length / 1024;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);

                    Uri collectionUri;
                    // Route video -> Movies (Gallery), image -> Pictures, else Downloads.
                    if (mimeType != null && mimeType.startsWith("video/")) {
                        values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES);
                        collectionUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                    } else if (mimeType != null && mimeType.startsWith("image/")) {
                        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES);
                        collectionUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                    } else {
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                        collectionUri = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    }

                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                    Uri uri = getContentResolver().insert(collectionUri, values);
                    if (uri != null) {
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            if (os != null) {
                                os.write(decoded);
                                os.flush();
                            }
                        }
                        values.clear();
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        getContentResolver().update(uri, values, null, null);
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved: " + fileName + " (" + sizeKB + " KB)", Toast.LENGTH_LONG).show());
                    } else {
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: could not create file", Toast.LENGTH_SHORT).show());
                    }
                } else {
                    File targetDir;
                    if (mimeType != null && mimeType.startsWith("video/")) {
                        targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES);
                    } else if (mimeType != null && mimeType.startsWith("image/")) {
                        targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                    } else {
                        targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    }
                    if (!targetDir.exists()) targetDir.mkdirs();

                    File file = new File(targetDir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        fos.write(decoded);
                        fos.flush();
                    }

                    android.media.MediaScannerConnection.scanFile(
                            MainActivity.this,
                            new String[]{file.getAbsolutePath()},
                            new String[]{mimeType},
                            (path, uri) -> { /* indexed into Gallery */ }
                    );
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved: " + fileName + " (" + sizeKB + " KB)", Toast.LENGTH_LONG).show());
                }
            } catch (Exception e) {
                final String err = e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: " + err, Toast.LENGTH_LONG).show());
            }
        }
    }

    private void requestAllPermissions() {
        ArrayList<String> perms = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED)
                perms.add(Manifest.permission.READ_MEDIA_IMAGES);
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED)
                perms.add(Manifest.permission.READ_MEDIA_VIDEO);
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED)
                perms.add(Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
                perms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }
        if (!perms.isEmpty()) {
            requestPermissions(perms.toArray(new String[0]), PERMISSION_REQUEST);
        }
        webView.loadUrl("https://tanglish-caption-studio.pages.dev");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == PERMISSION_REQUEST) {
            boolean micGranted = false;
            for (int i = 0; i < permissions.length; i++) {
                if (permissions[i].equals(Manifest.permission.RECORD_AUDIO) &&
                    grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    micGranted = true;
                }
            }

            if (pendingPermissionRequest != null) {
                if (micGranted) {
                    pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                } else {
                    pendingPermissionRequest.deny();
                }
                pendingPermissionRequest = null;
            }

            if (micGranted) {
                webView.evaluateJavascript("window._micPermissionGranted && window._micPermissionGranted()", null);
            } else if (micPermissionAsked) {
                Toast.makeText(this,
                    "Microphone permission required. Please grant it in Settings.",
                    Toast.LENGTH_LONG).show();
                micPermissionAsked = false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SAVE_DOC_REQUEST) {
            final Uri target = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            final File tmp = pendingSaveTemp;
            final String name = pendingSaveName;
            pendingSaveTemp = null;
            if (target == null || tmp == null) {
                Toast.makeText(this, "Save cancelled", Toast.LENGTH_SHORT).show();
                if (tmp != null) tmp.delete();
                return;
            }
            new Thread(() -> {
                try (InputStream is = new java.io.FileInputStream(tmp);
                     OutputStream os = getContentResolver().openOutputStream(target)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) != -1) os.write(buf, 0, n);
                    os.flush();
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved: " + name, Toast.LENGTH_LONG).show());
                } catch (Exception e) {
                    final String err = e.getMessage();
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: " + err, Toast.LENGTH_LONG).show());
                } finally {
                    tmp.delete();
                }
            }).start();
            return;
        }
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    } else if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
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
