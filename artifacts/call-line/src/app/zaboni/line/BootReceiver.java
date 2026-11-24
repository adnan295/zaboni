package app.zaboni.line;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a power cut the phone boots by itself; the line goes back online without anyone touching it. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!Prefs.token(c).isEmpty()) LineService.start(c);
    }
}
