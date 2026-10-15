# Empty-emulator integration checks

These checks require an empty Android emulator with the debug APK installed. They refuse to run when an account is saved. They restore the empty settings after completion and do not use school credentials.

1. Start the APK. Find its `webview_devtools_remote_<pid>` socket with `adb shell cat /proc/net/unix`, then forward that socket to local TCP 9229.
2. From the repository root, pass a JSON object containing the absolute `script` path to `node tools/android-ui-probe.cjs` on stdin.
3. `native-probe.js` exercises settings, the custom picker, sensors, and playback of the public MP4 linked in [Media3's official demo list](https://github.com/androidx/media/blob/release/demos/main/src/main/assets/media.exolist.json). It checks JPEG capture and restores the empty account. It does not verify school-video authentication or long playback.
4. To check AI transport, run `node tools/native-integration/model-fixture.cjs`, reverse emulator TCP 4892 to host TCP 4892, and run `ai-probe.js` through the same probe runner. The fixture listens only on localhost. Its `/summary` endpoint returns request counts and flags, not prompts, images or credentials.
5. Remove the forwarding/reverse mappings and stop the fixture when done.

The AI check uses synthetic text and a tiny synthetic image payload. It verifies multimodal request structure, model metadata, automatic context shrinking, rejection by a text-only model, and streamed callbacks. It cannot establish image understanding or the quality of a real provider's answers. Actual video-frame JPEG capture is checked separately by `native-probe.js`.

`calendar-probe.js` schedules one synthetic event whose reminder falls two seconds ahead, keeps the empty-account fixture active for 16 seconds, then cancels its alarms/notifications and restores settings. Observe the calendar notification channel with emulator diagnostics while it runs. It does not fetch a school calendar.
