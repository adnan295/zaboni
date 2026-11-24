package app.zaboni.line;

import android.Manifest;
import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

/**
 * Setup and status for the office phone. Three things must be green:
 * the line token, "default phone app", and the permissions. After that the
 * phone just sits on its charger.
 */
public class MainActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView status;
    private TextView log;
    private EditText server;
    private EditText token;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        int pad = dp(16);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, pad, pad, pad);
        col.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        TextView title = text("خط زبوني", 24, true);
        title.setTextColor(Color.rgb(220, 38, 38));
        col.addView(title);
        col.addView(text("هالتلفون بيوصّل المندوب بالزبون من شريحة الشركة، بدون ما حدا يشوف رقم التاني. خليه عالشاحن والواي فاي، وخلّي الرنين صامت.", 14, false));

        status = text("", 16, true);
        status.setPadding(0, dp(12), 0, dp(12));
        col.addView(status);

        server = new EditText(this);
        server.setHint("عنوان السيرفر");
        server.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        server.setText(Prefs.server(this));
        col.addView(label("السيرفر"));
        col.addView(server);

        token = new EditText(this);
        token.setHint("الرمز من لوحة التحكم ← هاتف الإدارة");
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        token.setText(Prefs.token(this));
        col.addView(label("رمز الخط"));
        col.addView(token);

        col.addView(button("١. احفظ وشغّل الخط", v -> {
            Prefs.save(this, server.getText().toString(), token.getText().toString());
            LineService.start(this);
            Toast.makeText(this, "انحفظ", Toast.LENGTH_SHORT).show();
        }));
        col.addView(button("٢. اقبل الصلاحيات", v -> askPermissions()));
        col.addView(button("٣. خلّيه تطبيق الاتصال الأساسي", v -> askDefaultDialer()));
        col.addView(button("٤. استثنيه من توفير البطارية", v -> askBatteryExemption()));

        col.addView(label("آخر الأحداث"));
        log = text("", 13, false);
        log.setTypeface(Typeface.MONOSPACE);
        col.addView(log);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(col);
        setContentView(scroll);

        if (!Prefs.token(this).isEmpty()) LineService.start(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override
    protected void onPause() {
        super.onPause();
        ui.removeCallbacksAndMessages(null);
    }

    private void refresh() {
        boolean dialer = isDefaultDialer();
        boolean perms = missingPermissions().isEmpty();
        long last = Prefs.lastHeartbeat(this);
        boolean online = last > 0 && System.currentTimeMillis() - last < 90_000;
        StringBuilder s = new StringBuilder();
        s.append(online ? "🟢 متصل بالسيرفر" : "🔴 مو متصل بالسيرفر").append('\n');
        if (!Prefs.linePhone(this).isEmpty()) s.append("رقم الخط: ").append(Prefs.linePhone(this)).append('\n');
        s.append(dialer ? "🟢 تطبيق الاتصال الأساسي" : "🔴 لسا مو تطبيق الاتصال الأساسي (الخطوة ٣)").append('\n');
        s.append(perms ? "🟢 الصلاحيات" : "🔴 في صلاحيات ناقصة (الخطوة ٢)");
        status.setText(s.toString());
        log.setText(Prefs.log(this));
        ui.postDelayed(this::refresh, 2000);
    }

    private boolean isDefaultDialer() {
        TelecomManager tm = (TelecomManager) getSystemService(TELECOM_SERVICE);
        return getPackageName().equals(tm.getDefaultDialerPackage());
    }

    private void askDefaultDialer() {
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = getSystemService(RoleManager.class);
            startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_DIALER), 1);
        } else {
            startActivityForResult(new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
                    .putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, getPackageName()), 1);
        }
    }

    private List<String> missingPermissions() {
        List<String> want = new ArrayList<>();
        want.add(Manifest.permission.CALL_PHONE);
        want.add(Manifest.permission.READ_PHONE_STATE);
        if (Build.VERSION.SDK_INT >= 26) want.add(Manifest.permission.ANSWER_PHONE_CALLS);
        if (Build.VERSION.SDK_INT >= 33) want.add(Manifest.permission.POST_NOTIFICATIONS);
        List<String> missing = new ArrayList<>();
        for (String p : want) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        return missing;
    }

    private void askPermissions() {
        List<String> missing = missingPermissions();
        if (missing.isEmpty()) Toast.makeText(this, "كل الصلاحيات موجودة", Toast.LENGTH_SHORT).show();
        else requestPermissions(missing.toArray(new String[0]), 2);
    }

    private void askBatteryExemption() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm.isIgnoringBatteryOptimizations(getPackageName())) {
            Toast.makeText(this, "مستثنى من قبل", Toast.LENGTH_SHORT).show();
            return;
        }
        startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setGravity(Gravity.START);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView label(String s) {
        TextView t = text(s, 13, true);
        t.setPadding(0, dp(14), 0, 0);
        return t;
    }

    private Button button(String s, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(s);
        b.setOnClickListener(l);
        b.setAllCaps(false);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
