package app.zaboni.line;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import org.json.JSONObject;

/**
 * Keeps telling the server "this line is on" every 30 seconds. The server only
 * hides numbers while at least one line has checked in recently, so a phone with
 * no power or no Wi-Fi simply hands customers and couriers their real numbers back.
 */
public class LineService extends Service {
    private static final long EVERY_MS = 30_000;
    private static final String CHANNEL = "line";
    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock wake;
    private boolean lastOk = true;

    static void start(Context c) {
        Intent i = new Intent(c, LineService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Notification n = notification("الخط شغال — خليه عالشاحن");
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zaboni:line");
        wake.setReferenceCounted(false);
        wake.acquire();
        thread = new HandlerThread("heartbeat");
        thread.start();
        handler = new Handler(thread.getLooper());
        handler.post(this::beat);
    }

    private void beat() {
        try {
            JSONObject r = Api.post(this, "/bridge/heartbeat", new JSONObject());
            Prefs.heartbeatOk(this, r.optString("phone"));
            if (!lastOk) Prefs.log(this, "رجع الاتصال بالسيرفر");
            lastOk = true;
        } catch (Exception e) {
            if (lastOk) Prefs.log(this, "ما في اتصال بالسيرفر: " + e.getMessage());
            lastOk = false;
        }
        handler.postDelayed(this::beat, EVERY_MS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private Notification notification(String text) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "خط زبوني", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        return b.setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("خط زبوني")
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .build();
    }
}
