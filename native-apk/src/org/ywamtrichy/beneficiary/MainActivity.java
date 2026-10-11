package org.ywamtrichy.beneficiary;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;

/**
 * YWAM - TRICHY Beneficiary phone app.
 * A thin Android shell around the phone web app that is packed inside the APK
 * (assets/www). The web app talks to the office server; this shell adds the
 * Back button, the photo chooser (camera or gallery) and opens links outside.
 */
public class MainActivity extends Activity {

    private static final int REQ_PHOTO = 1001;
    private static final String CAMERA_URI = "content://org.ywamtrichy.beneficiary.camera/photo.jpg";

    private WebView web;
    private ValueCallback<Uri[]> photoCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // The pages come from inside this app and call the office server over the
        // local network, so file:// pages are allowed to make those requests.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) { /* nothing can open it */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (photoCallback != null) photoCallback.onReceiveValue(null);
                photoCallback = callback;

                Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
                gallery.addCategory(Intent.CATEGORY_OPENABLE);
                gallery.setType("image/*");

                File old = CameraProvider.photoFile(MainActivity.this);
                if (old.exists()) old.delete();
                Uri out = Uri.parse(CAMERA_URI);
                Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                camera.putExtra(MediaStore.EXTRA_OUTPUT, out);
                camera.setClipData(ClipData.newRawUri("photo", out));
                camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(gallery, "Take or choose a photo");
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { camera });
                try {
                    startActivityForResult(chooser, REQ_PHOTO);
                } catch (ActivityNotFoundException e) {
                    photoCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_PHOTO) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[] { data.getData() };
            } else if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                result = new Uri[] { data.getClipData().getItemAt(0).getUri() };
            } else {
                File shot = CameraProvider.photoFile(this);   // the camera saved it here
                if (shot.exists() && shot.length() > 0) result = new Uri[] { Uri.parse(CAMERA_URI) };
            }
        }
        if (photoCallback != null) {
            photoCallback.onReceiveValue(result);
            photoCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        // The web app decides first (close a page, go back a step); only if it has
        // nothing to go back to does the Back button leave the app.
        web.evaluateJavascript(
            "(function(){try{return window.ywamBack?window.ywamBack():false}catch(e){return false}})()",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String handled) {
                    if (!"true".equals(handled)) finish();
                }
            });
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }
}
