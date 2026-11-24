package app.zaboni.line;

import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.DisconnectCause;
import android.telecom.InCallService;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telecom.VideoProfile;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * The switchboard. As the phone's default dialer, Android hands us every call:
 *
 *   1. A courier (or customer) calls the company SIM. We ask the server who they
 *      should reach — the other side of their order in progress.
 *   2. We answer (microphone muted: this phone never speaks), dial that person
 *      from the same SIM, and once they pick up, merge both calls into one
 *      conference on the operator's network. Neither side sees the other's number.
 *   3. As soon as either side hangs up, we hang up everything, and report the
 *      call to the server for the call log.
 *
 * One call at a time per phone: a second caller while busy gets the busy tone.
 * Add more phones (and SIMs) for more calls at once.
 */
public class BridgeInCallService extends InCallService {
    /** How long the person being called has to answer. */
    private static final long ANSWER_TIMEOUT_MS = 45_000;
    private static final int MERGE_TRIES = 8;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Bridge bridge;

    private static final class Bridge {
        Call incoming;
        Call outgoing;
        Call conference;
        String callId;
        String dial;
        boolean placed;
        boolean merged;
        boolean ended;
        int mergeTries;
    }

    private final Call.Callback callback = new Call.Callback() {
        @Override
        public void onStateChanged(Call call, int state) {
            Bridge b = bridge;
            if (b == null || b.ended) return;
            boolean ours = call == b.incoming || call == b.outgoing || call == b.conference;
            if (!ours) return;
            if (state == Call.STATE_DISCONNECTED) {
                end(b, reasonFor(b, call));
                return;
            }
            if (call == b.incoming && state == Call.STATE_ACTIVE && !b.placed && b.dial != null) placeOutgoing(b);
            if (call == b.outgoing && state == Call.STATE_SELECT_PHONE_ACCOUNT) selectSameSim(b, call);
            if (call == b.outgoing && state == Call.STATE_ACTIVE && !b.merged) tryMerge(b);
        }

        @Override
        public void onConferenceableCallsChanged(Call call, List<Call> conferenceable) {
            Bridge b = bridge;
            if (b != null && !b.merged && !b.ended && b.outgoing != null && b.outgoing.getState() == Call.STATE_ACTIVE) tryMerge(b);
        }

        @Override
        public void onParentChanged(Call call, Call parent) {
            Bridge b = bridge;
            if (b != null && parent != null && (call == b.incoming || call == b.outgoing)) merged(b, parent);
        }
    };

    @Override
    public void onCallAdded(Call call) {
        call.registerCallback(callback);
        Bridge b = bridge;
        if (isConference(call)) {
            if (b != null && !b.ended) merged(b, call);
            return;
        }
        int state = call.getState();
        if (state == Call.STATE_RINGING) {
            onIncoming(call);
        } else if (b != null && b.placed && b.outgoing == null) {
            b.outgoing = call;
            if (state == Call.STATE_SELECT_PHONE_ACCOUNT) selectSameSim(b, call);
        }
        // Anything else is someone dialling by hand from this phone: leave it alone.
    }

    @Override
    public void onCallRemoved(Call call) {
        call.unregisterCallback(callback);
    }

    private void onIncoming(Call call) {
        if (bridge != null) {
            call.reject(false, null); // already connecting someone: busy tone
            Prefs.log(this, "مكالمة ثانية والخط مشغول — رُفضت");
            return;
        }
        final Bridge b = new Bridge();
        b.incoming = call;
        bridge = b;
        final String from = number(call);
        io.execute(() -> {
            JSONObject r;
            try {
                r = Api.post(this, "/bridge/route", new JSONObject().put("from", from));
            } catch (Exception e) {
                Prefs.log(this, "ما قدرت اسأل السيرفر: " + e.getMessage());
                r = null;
            }
            final JSONObject res = r;
            main.post(() -> onRouted(b, res));
        });
    }

    private void onRouted(Bridge b, JSONObject r) {
        String dial = r == null ? "" : r.optString("dial", "");
        b.callId = r == null ? null : r.optString("callId", null);
        if (b.ended) {
            // The caller gave up while we were asking the server.
            report(b.callId, "failed", "caller_hung_up");
            return;
        }
        if (dial.isEmpty()) {
            String why = r == null ? "no_server" : r.optString("reason", "rejected");
            Prefs.log(this, "مكالمة من " + mask(number(b.incoming)) + " ما إلها طلب — رُفضت (" + why + ")");
            b.ended = true;
            b.incoming.reject(false, null);
            if (bridge == b) bridge = null;
            return;
        }
        b.dial = dial;
        Prefs.log(this, "عم وصّل " + mask(number(b.incoming)) + " ← " + mask(dial));
        b.incoming.answer(VideoProfile.STATE_AUDIO_ONLY);
        setMuted(true);
        main.postDelayed(() -> {
            if (!b.merged && !b.ended) end(b, "no_answer");
        }, ANSWER_TIMEOUT_MS);
    }

    private void placeOutgoing(Bridge b) {
        b.placed = true;
        TelecomManager tm = (TelecomManager) getSystemService(TELECOM_SERVICE);
        Bundle extras = new Bundle();
        PhoneAccountHandle sim = b.incoming.getDetails().getAccountHandle();
        if (sim != null) extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, sim);
        try {
            // Telecom puts the caller on hold while this one rings.
            tm.placeCall(Uri.fromParts("tel", b.dial, null), extras);
        } catch (SecurityException e) {
            Prefs.log(this, "ما في صلاحية اتصال — افتح التطبيق واقبل الصلاحيات");
            end(b, "no_call_permission");
        }
    }

    private void selectSameSim(Bridge b, Call call) {
        PhoneAccountHandle sim = b.incoming.getDetails().getAccountHandle();
        if (sim != null) call.phoneAccountSelected(sim, false);
    }

    private void tryMerge(Bridge b) {
        if (b.merged || b.ended || b.outgoing == null) return;
        Call o = b.outgoing, i = b.incoming;
        if (o.getConferenceableCalls().contains(i)) o.conference(i);
        else if (o.getDetails().can(Call.Details.CAPABILITY_MERGE_CONFERENCE)) o.mergeConference();
        else if (i.getConferenceableCalls().contains(o)) i.conference(o);
        else if (i.getDetails().can(Call.Details.CAPABILITY_MERGE_CONFERENCE)) i.mergeConference();
        // The network can take a moment to allow it, and to confirm it: check again.
        main.postDelayed(() -> {
            if (b.merged || b.ended) return;
            if (++b.mergeTries < MERGE_TRIES) tryMerge(b);
            else end(b, "merge_failed");
        }, 1200);
    }

    private void merged(Bridge b, Call conference) {
        if (b.merged) return;
        b.merged = true;
        b.conference = conference;
        setMuted(true);
        Prefs.log(this, "✓ تم الوصل");
        report(b.callId, "merged", null);
    }

    private void end(Bridge b, String reason) {
        if (b.ended) return;
        b.ended = true;
        for (Call c : getCalls()) {
            try { c.disconnect(); } catch (Exception ignored) { }
        }
        if (b.callId != null) report(b.callId, b.merged ? "ended" : "failed", reason);
        Prefs.log(this, b.merged ? "انتهت المكالمة" : "ما تم الوصل: " + reason);
        if (bridge == b) bridge = null;
        main.postDelayed(() -> setMuted(false), 1000);
    }

    private String reasonFor(Bridge b, Call call) {
        int code = call.getDetails().getDisconnectCause() == null ? DisconnectCause.UNKNOWN : call.getDetails().getDisconnectCause().getCode();
        if (call == b.outgoing && !b.merged) {
            if (code == DisconnectCause.BUSY) return "busy";
            if (code == DisconnectCause.REJECTED) return "rejected";
            if (code == DisconnectCause.ERROR) return "dial_error";
            return "no_answer";
        }
        if (call == b.incoming && !b.merged) return "caller_hung_up";
        return "hung_up";
    }

    private void report(String callId, String event, String reason) {
        if (callId == null || callId.isEmpty()) return;
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("event", event);
                if (reason != null) body.put("reason", reason);
                Api.post(this, "/bridge/calls/" + callId + "/event", body);
            } catch (Exception e) {
                Prefs.log(this, "ما انبعت سجل المكالمة: " + e.getMessage());
            }
        });
    }

    private static boolean isConference(Call call) {
        return call.getDetails().hasProperty(Call.Details.PROPERTY_CONFERENCE) || !call.getChildren().isEmpty();
    }

    private static String number(Call call) {
        Uri h = call.getDetails().getHandle();
        return h == null ? "" : h.getSchemeSpecificPart();
    }

    /** Numbers never appear in full on the office phone's screen either. */
    private static String mask(String n) {
        if (n == null || n.length() < 4) return "مخفي";
        return "…" + n.substring(n.length() - 3);
    }
}
