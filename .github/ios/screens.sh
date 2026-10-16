#!/bin/bash
# Installs the built app on an iPhone simulator and takes screenshots of key screens.
# Usage: screens.sh path/to/OneJump.app output-folder [fixtures-folder]
# Live screens (a signed-in coach) use the server's real response shapes from mobile-app/Fixtures,
# copied into the app's Documents folder, so no server or password is needed.
set -u
APP="$1"
OUT="$2"
FIX="${3:-}"
mkdir -p "$OUT"

UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
d = json.load(sys.stdin)["devices"]
phones = [x for k, v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone")]
plain = [x for x in phones if x["name"] in ("iPhone 16", "iPhone 15", "iPhone 17")]
print((plain or phones)[-1]["udid"])')
echo "Simulator: $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4 || true
xcrun simctl install "$UDID" "$APP"
BUNDLE=com.onejumpfit.OneJump
xcrun simctl privacy "$UDID" grant microphone "$BUNDLE" || true
if [ -n "$FIX" ]; then
  DATA=$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)
  mkdir -p "$DATA/Documents/Fixtures" && cp "$FIX"/*.json "$DATA/Documents/Fixtures/" && echo "Fixtures copied to $DATA/Documents/Fixtures"
fi

# shot NAME ROLE LANG APPEARANCE LINK [WAIT] [SCROLL: center|bottom]
shot() {
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1
  local args=(-oj.language "$3" -oj.appearance "$4")
  case "$2" in
    live) args+=(-oj.signedIn YES -oj.coachName "Dani Reyes" -ojFixture Fixtures) ;;
    demo) args+=(-oj.demo YES) ;;
    "") ;;
    *) args+=(-oj.role "$2") ;;
  esac
  if [ -n "$5" ]; then args+=(-ojOpen "$5"); fi
  if [ -n "${7:-}" ]; then args+=(-ojScroll "$7"); fi
  xcrun simctl launch "$UDID" "$BUNDLE" "${args[@]}" >/dev/null
  sleep "${6:-4}"
  xcrun simctl io "$UDID" screenshot "$OUT/$1.png" >/dev/null 2>&1
  sips -Z 900 "$OUT/$1.png" >/dev/null 2>&1
  if ! xcrun simctl spawn "$UDID" launchctl list | grep -q "$BUNDLE"; then echo "CRASH or not running: $1" | tee -a "$OUT/crashes.txt"; fi
  echo "shot $1"
}

shot 00-login "" en light ""
shot 00b-login-es-dark "" es dark ""
shot 00c-demo-picker demo en light ""
shot 01-coach-today coach en light today
shot 01b-coach-today-middle coach en light today 4 center
shot 01c-coach-today-bottom coach en dark today 4 bottom
shot 02-coach-today-es-dark coach es dark today
shot 03-coach-clients coach en light clients
shot 04-coach-client-maya coach en light client:maya
shot 04b-coach-client-maya-bottom coach en light client:maya 4 bottom
shot 05-coach-client-marcus-es coach es light client:marcus
shot 06-coach-assist coach en dark assist
shot 07-coach-inbox coach en light inbox
shot 08-coach-checkins coach es light checkins
shot 09-coach-thread-lucas-es coach es light thread:lucas
shot 10-coach-checkin-maya coach en light checkIn:maya
shot 10b-coach-checkin-maya-bottom coach es light checkIn:maya 4 bottom
shot 11-coach-more coach en light more
shot 12-coach-settings-es coach es light settings
shot 13-coach-payments coach en light payments
shot 14-coach-leads coach en dark leads
shot 15-coach-programs coach en light programs
shot 16-coach-builder coach en light builder
shot 17-coach-library coach en light library
shot 18-coach-nutrition coach en light nutrition
shot 19-coach-automations coach en light automations
shot 20-coach-billing coach en light billing
shot 30-client-today client en light today
shot 30b-client-today-bottom client en light today 4 bottom
shot 31-client-today-es-dark client es dark today
shot 32-client-food client en light food
shot 33-client-progress client en light progress
shot 33b-client-progress-bottom client en dark progress 4 bottom
shot 34-client-coach-es client es light coach
shot 35-client-workout client en light workout 5
shot 36-client-log-photo client en light log:photo 5
shot 37-client-log-search client es light log:search 5
shot 38-client-me-es client es light me
shot 39-client-checkin client en light checkIn
shot 39b-client-checkin-bottom client es light checkIn 4 bottom
shot 40-client-book client en light book
shot 41-client-quick client en light quick 5
# The signed-in coach's real business (shapes from the server's own tests)
if [ -n "$FIX" ]; then
  shot 60-live-today live en light today 6
  shot 60b-live-today-middle live en light today 6 center
  shot 60c-live-today-bottom live en light today 6 bottom
  shot 61-live-today-es-dark live es dark today 6
  shot 62-live-clients live en light clients 6
  shot 63-live-client live en light client:first 7
  shot 64-live-food-plan live en light plan:first 9
  shot 64b-live-food-plan-bottom live en light plan:first 9 bottom
  shot 65-live-inbox live en light inbox 6
  shot 66-live-thread live en light thread:first 7
  shot 67-live-checkin live en light checkIn:first 7
  shot 68-live-payments live en light payments 6
  shot 69-live-settings live es light settings 6
  shot 70-live-assist live en light assist 6
fi

# Last, because talking to Assist triggers the speech-recognition permission prompt.
shot 50-coach-ask coach en light "ask:Who needs me today?" 6
if [ -n "$FIX" ]; then
  shot 71-live-ask-proposal live en light "ask:Message Mike: see you Monday at 6" 10
fi

# Crash reports, if any
cp ~/Library/Logs/DiagnosticReports/OneJump* "$OUT/" 2>/dev/null || true
ls "$OUT"
