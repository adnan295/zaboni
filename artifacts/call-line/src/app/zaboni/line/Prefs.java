package app.zaboni.line;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Settings typed in once (server, line token) and a short activity log for the status screen. */
final class Prefs {
    static final String DEFAULT_SERVER = "https://zaboni.site";
    private static final int LOG_LINES = 40;

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("line", Context.MODE_PRIVATE);
    }

    static String server(Context c) {
        String s = sp(c).getString("server", DEFAULT_SERVER);
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    static String token(Context c) { return sp(c).getString("token", ""); }

    static void save(Context c, String server, String token) {
        sp(c).edit().putString("server", server.trim()).putString("token", token.trim()).apply();
    }

    static long lastHeartbeat(Context c) { return sp(c).getLong("lastHeartbeat", 0); }

    static void heartbeatOk(Context c, String linePhone) {
        sp(c).edit().putLong("lastHeartbeat", System.currentTimeMillis()).putString("linePhone", linePhone).apply();
    }

    static String linePhone(Context c) { return sp(c).getString("linePhone", ""); }

    static synchronized void log(Context c, String msg) {
        String stamp = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
        String old = sp(c).getString("log", "");
        StringBuilder out = new StringBuilder(stamp).append("  ").append(msg);
        String[] lines = old.isEmpty() ? new String[0] : old.split("\n");
        for (int i = 0; i < lines.length && i < LOG_LINES - 1; i++) out.append('\n').append(lines[i]);
        sp(c).edit().putString("log", out.toString()).apply();
    }

    static String log(Context c) { return sp(c).getString("log", ""); }
}
