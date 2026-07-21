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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectFileReaderPatch(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectFileReaderPatch(view);
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

    private void injectFileReaderPatch(WebView view) {
        String js = "(function() {\n" +
                "    if (window.__fileReaderPatched) return;\n" +
                "    try {\n" +
                "        const originalDescriptor = Object.getOwnPropertyDescriptor(FileReader.prototype, 'result');\n" +
                "        if (originalDescriptor) {\n" +
                "            window.__fileReaderPatched = true;\n" +
                "            Object.defineProperty(FileReader.prototype, 'result', {\n" +
                "                get: function() {\n" +
                "                    const val = originalDescriptor.get.call(this);\n" +
                "                    if (typeof val === 'string' && val.startsWith('data:')) {\n" +
                "                        const lastCommaIdx = val.lastIndexOf(',');\n" +
                "                        if (lastCommaIdx !== -1) {\n" +
                "                            const header = val.substring(0, lastCommaIdx);\n" +
                "                            const data = val.substring(lastCommaIdx + 1);\n" +
                "                            const cleanHeader = header.replace(/,/g, ';');\n" +
                "                            return cleanHeader + ',' + data;\n" +
                "                        }\n" +
                "                    }\n" +
                "                    return val;\n" +
                "                }\n" +
                "            });\n" +
                "        }\n" +
                "    } catch (e) {\n" +
                "        console.error('FileReader patch error:', e);\n" +
                "    }\n" +
                "})();";
        view.evaluateJavascript(js, null);
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

        private File chunkTempFile = null;
        private final Object chunkLock = new Object();

        @JavascriptInterface
        public void saveFileBegin() {
            synchronized (chunkLock) {
                try {
                    if (chunkTempFile != null && chunkTempFile.exists()) {
                        chunkTempFile.delete();
                    }
                    chunkTempFile = new File(getCacheDir(), "chunk_base64.tmp");
                    if (chunkTempFile.exists()) {
                        chunkTempFile.delete();
                    }
                    chunkTempFile.createNewFile();
                    android.util.Log.d("SaveDebug", "saveFileBegin: Created temp file at " + chunkTempFile.getAbsolutePath());
                } catch (Exception e) {
                    android.util.Log.e("SaveDebug", "Error in saveFileBegin: " + e.getMessage(), e);
                }
            }
        }

        @JavascriptInterface
        public void saveFileChunk(String base64Chunk) {
            if (base64Chunk == null) return;
            synchronized (chunkLock) {
                if (chunkTempFile == null) {
                    chunkTempFile = new File(getCacheDir(), "chunk_base64.tmp");
                }
                try (FileOutputStream fos = new FileOutputStream(chunkTempFile, true);
                     java.io.OutputStreamWriter osw = new java.io.OutputStreamWriter(fos, java.nio.charset.StandardCharsets.UTF_8)) {
                    osw.write(base64Chunk);
                } catch (Exception e) {
                    android.util.Log.e("SaveDebug", "Error in saveFileChunk: " + e.getMessage(), e);
                }
            }
        }

        @JavascriptInterface
        public void saveFileEnd(String fileName, String mimeType) {
            synchronized (chunkLock) {
                if (chunkTempFile == null || !chunkTempFile.exists()) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: No active chunk download", Toast.LENGTH_SHORT).show());
                    return;
                }
                final File base64File = chunkTempFile;
                chunkTempFile = null;
                new Thread(() -> processAndSaveBase64File(fileName, base64File, mimeType)).start();
            }
        }

        @JavascriptInterface
        public void saveFile(String fileName, String base64Data, String mimeType) {
            new Thread(() -> {
                try {
                    File tempBase64File = new File(getCacheDir(), "legacy_base64_" + System.currentTimeMillis() + ".tmp");
                    if (tempBase64File.exists()) {
                        tempBase64File.delete();
                    }
                    try (FileOutputStream fos = new FileOutputStream(tempBase64File);
                         java.io.OutputStreamWriter osw = new java.io.OutputStreamWriter(fos, java.nio.charset.StandardCharsets.UTF_8)) {
                        if (base64Data != null) {
                            osw.write(base64Data);
                        }
                    }
                    processAndSaveBase64File(fileName, tempBase64File, mimeType);
                } catch (Exception e) {
                    android.util.Log.e("SaveDebug", "Error in saveFile legacy: " + e.getMessage(), e);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: " + e.getMessage(), Toast.LENGTH_LONG).show());
                }
            }).start();
        }

        private String cleanBase64File(File file, long[] outOriginalLength) throws Exception {
            long originalLength = file.length();
            outOriginalLength[0] = originalLength;

            int prefixSkipLength = 0;
            try (java.io.InputStream is = new java.io.FileInputStream(file);
                 java.io.InputStreamReader isr = new java.io.InputStreamReader(is, java.nio.charset.StandardCharsets.UTF_8)) {
                char[] firstChars = new char[512];
                int read = isr.read(firstChars, 0, 512);
                if (read > 0) {
                    String sample = new String(firstChars, 0, read);
                    if (sample.startsWith("data:")) {
                        int commaIdx = sample.indexOf(',');
                        if (commaIdx != -1) {
                            prefixSkipLength = commaIdx + 1;
                        }
                    }
                }
            }

            StringBuilder sb = new StringBuilder((int) (originalLength - prefixSkipLength + 4));
            try (java.io.InputStream is = new java.io.FileInputStream(file);
                 java.io.InputStreamReader isr = new java.io.InputStreamReader(is, java.nio.charset.StandardCharsets.UTF_8);
                 java.io.BufferedReader reader = new java.io.BufferedReader(isr)) {
                
                int skipped = 0;
                while (skipped < prefixSkipLength) {
                    int c = reader.read();
                    if (c == -1) break;
                    skipped++;
                }

                char[] buffer = new char[16384];
                int numRead;
                while ((numRead = reader.read(buffer)) != -1) {
                    for (int i = 0; i < numRead; i++) {
                        char c = buffer[i];
                        if ((c >= 'A' && c <= 'Z') ||
                            (c >= 'a' && c <= 'z') ||
                            (c >= '0' && c <= '9') ||
                            c == '+' || c == '/' || c == '=') {
                            sb.append(c);
                        }
                    }
                }
            }

            int len = sb.length();
            int mod = len % 4;
            if (mod > 0) {
                int padCount = 4 - mod;
                for (int i = 0; i < padCount; i++) {
                    sb.append('=');
                }
            }
            return sb.toString();
        }

        private void processAndSaveBase64File(String fileName, File base64File, String mimeType) {
            try {
                long[] originalLength = new long[1];
                String cleanBase64 = cleanBase64File(base64File, originalLength);
                int cleanedLength = cleanBase64.length();

                byte[] decoded = null;
                String decodeMethod = "";
                Exception decodeException = null;

                try {
                    decoded = Base64.decode(cleanBase64, Base64.NO_WRAP | Base64.NO_PADDING);
                    decodeMethod = "NO_WRAP | NO_PADDING";
                } catch (IllegalArgumentException e1) {
                    try {
                        decoded = Base64.decode(cleanBase64, Base64.DEFAULT);
                        decodeMethod = "DEFAULT";
                    } catch (IllegalArgumentException e2) {
                        try {
                            decoded = Base64.decode(cleanBase64, Base64.URL_SAFE);
                            decodeMethod = "URL_SAFE";
                        } catch (IllegalArgumentException e3) {
                            decodeException = e3;
                        }
                    }
                }

                if (decoded == null) {
                    String sample = cleanBase64;
                    if (sample.length() > 100) {
                        sample = sample.substring(0, 100) + "...";
                    }
                    String errorMsg = "Decode failed. Received: " + originalLength[0] 
                            + " chars, Cleaned: " + cleanedLength + " chars. Content: [" + sample + "]";
                    if (decodeException != null) {
                        errorMsg += " Exception: " + decodeException.getMessage();
                    } else {
                        errorMsg += " Unknown decode failure.";
                    }
                    final String toastMsg = errorMsg;
                    android.util.Log.e("SaveDebug", toastMsg, decodeException);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, toastMsg, Toast.LENGTH_LONG).show());
                    return;
                }

                int decodedLength = decoded.length;
                android.util.Log.i("SaveDebug", "Decode success. Method: " + decodeMethod 
                        + ", Received chars: " + originalLength[0] 
                        + ", Cleaned chars: " + cleanedLength 
                        + ", Decoded bytes: " + decodedLength);

                if (decodedLength == 0) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: empty file data", Toast.LENGTH_SHORT).show());
                    return;
                }

                File tmp = new File(getCacheDir(), "export_" + System.currentTimeMillis() + ".dat");
                try (FileOutputStream fos = new FileOutputStream(tmp)) {
                    fos.write(decoded);
                    fos.flush();
                }

                saveToGalleryAutomatically(fileName, tmp, mimeType);

            } catch (Exception e) {
                final String err = e.getMessage();
                android.util.Log.e("SaveDebug", "Error processing file: " + err, e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: " + err, Toast.LENGTH_LONG).show());
            } finally {
                if (base64File != null && base64File.exists()) {
                    base64File.delete();
                }
            }
        }

        private void saveToGalleryAutomatically(String fileName, File tmp, String mimeType) {
            if (tmp == null || !tmp.exists()) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save failed: temporary file missing", Toast.LENGTH_SHORT).show());
                return;
            }

            final long sizeKB = tmp.length() / 1024;
            String resolvedMime = (mimeType != null ? mimeType : "application/octet-stream");
            boolean autoSaveSucceeded = false;

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, resolvedMime);

                    Uri collectionUri;
                    String relativePath;
                    String destinationFolder;

                    if (resolvedMime.startsWith("video/")) {
                        relativePath = Environment.DIRECTORY_MOVIES;
                        collectionUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                        destinationFolder = "Gallery/Movies";
                    } else if (resolvedMime.startsWith("image/")) {
                        relativePath = Environment.DIRECTORY_PICTURES;
                        collectionUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                        destinationFolder = "Gallery/Pictures";
                    } else {
                        relativePath = Environment.DIRECTORY_DOWNLOADS;
                        collectionUri = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                        destinationFolder = "Downloads";
                    }

                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                    Uri uri = getContentResolver().insert(collectionUri, values);
                    if (uri != null) {
                        try (InputStream is = new java.io.FileInputStream(tmp);
                             OutputStream os = getContentResolver().openOutputStream(uri)) {
                            byte[] buf = new byte[8192];
                            int n;
                            while ((n = is.read(buf)) != -1) {
                                os.write(buf, 0, n);
                            }
                            os.flush();
                        }
                        
                        values.clear();
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        getContentResolver().update(uri, values, null, null);
                        
                        android.util.Log.i("SaveDebug", "Saved automatically via MediaStore: " + fileName + " (" + sizeKB + " KB)");
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to " + destinationFolder + ": " + fileName + " (" + sizeKB + " KB)", Toast.LENGTH_LONG).show());
                        autoSaveSucceeded = true;
                    } else {
                        throw new Exception("Could not insert MediaStore entry");
                    }
                } else {
                    File targetDir;
                    String destinationFolder;
                    if (resolvedMime.startsWith("video/")) {
                        targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES);
                        destinationFolder = "Movies";
                    } else if (resolvedMime.startsWith("image/")) {
                        targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                        destinationFolder = "Pictures";
                    } else {
                        targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        destinationFolder = "Downloads";
                    }

                    if (!targetDir.exists()) {
                        targetDir.mkdirs();
                    }

                    File targetFile = new File(targetDir, fileName);
                    try (InputStream is = new java.io.FileInputStream(tmp);
                         FileOutputStream fos = new FileOutputStream(targetFile)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) != -1) {
                            fos.write(buf, 0, n);
                        }
                        fos.flush();
                    }

                    android.media.MediaScannerConnection.scanFile(
                            MainActivity.this,
                            new String[]{targetFile.getAbsolutePath()},
                            new String[]{resolvedMime},
                            (path, uri) -> {
                                android.util.Log.i("SaveDebug", "Media scanner indexed file: " + path + " Uri: " + uri);
                            }
                    );

                    android.util.Log.i("SaveDebug", "Saved automatically to storage: " + targetFile.getAbsolutePath() + " (" + sizeKB + " KB)");
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to " + destinationFolder + ": " + fileName + " (" + sizeKB + " KB)", Toast.LENGTH_LONG).show());
                    autoSaveSucceeded = true;
                }
            } catch (Exception e) {
                android.util.Log.w("SaveDebug", "Automatic save failed, falling back to SAF Document Picker. Error: " + e.getMessage(), e);
            }

            if (autoSaveSucceeded) {
                if (tmp.exists()) {
                    tmp.delete();
                }
            } else {
                pendingSaveTemp = tmp;
                pendingSaveName = fileName;
                pendingSaveMime = resolvedMime;

                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Auto-save unavailable. Please select save location.", Toast.LENGTH_LONG).show();
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(pendingSaveMime);
                    intent.putExtra(Intent.EXTRA_TITLE, pendingSaveName);
                    try {
                        startActivityForResult(intent, SAVE_DOC_REQUEST);
                    } catch (Exception ex) {
                        android.util.Log.e("SaveDebug", "Error starting SAF picker fallback: " + ex.getMessage(), ex);
                        Toast.makeText(MainActivity.this, "Error saving: No file manager app found", Toast.LENGTH_LONG).show();
                        if (tmp.exists()) {
                            tmp.delete();
                        }
                    }
                });
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
