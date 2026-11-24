package app.zaboni.line;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** The three calls the line makes to the Zaboni server (see api-server/src/routes/callBridge.ts). */
final class Api {
    private Api() {}

    static JSONObject post(Context c, String path, JSONObject body) throws Exception {
        HttpURLConnection http = (HttpURLConnection) new URL(Prefs.server(c) + "/api" + path).openConnection();
        try {
            http.setRequestMethod("POST");
            http.setConnectTimeout(8000);
            http.setReadTimeout(10000);
            http.setDoOutput(true);
            http.setRequestProperty("Content-Type", "application/json");
            http.setRequestProperty("x-line-token", Prefs.token(c));
            try (OutputStream os = http.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = http.getResponseCode();
            InputStream in = code >= 400 ? http.getErrorStream() : http.getInputStream();
            String text = in == null ? "" : read(in);
            if (code == 401) throw new Exception("الرمز غلط أو الخط موقوف من لوحة التحكم");
            if (code >= 400) throw new Exception("HTTP " + code);
            return text.isEmpty() ? new JSONObject() : new JSONObject(text);
        } finally {
            http.disconnect();
        }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[4096];
        int n;
        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
        return buf.toString("UTF-8");
    }
}
