import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { SafeAreaView, View, Text, Pressable, Alert, Platform, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

/**
 * Feel-Good Kickstart — super-minimal, local-only
 * Akam's spec:
 * - No backend, store locally (AsyncStorage)
 * - UI shows ONE big button: "Get Challenge"
 * - When pressed, show ONE challenge at a time with two options below: Done | Skip
 * - Max 3 challenges per hour (then disabled until next hour)
 * - No adding custom challenges
 * - Local notifications (~3/hour) handled silently in the background
 */

// ---------------- Utilities ----------------
const HOUR_KEY = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  return `${y}${m}${d}${h}`; // e.g. 2025111113
};

// ---------------- Types & Data ----------------
export type Challenge = { id: string; text: string };

const DEFAULT_POOL: Challenge[] = [
  { id: "c1", text: "Drink a glass of water" },
  { id: "c2", text: "Stand up and stretch for 60 seconds" },
  { id: "c3", text: "Deep-breathe: 10 slow breaths" },
  { id: "c4", text: "1-minute plank or 15 squats" },
  { id: "c5", text: "Write down 1 thing you’re grateful for" },
  { id: "c6", text: "Go outside for 2 minutes" },
  { id: "c7", text: "Tidy one small spot on your desk" },
  { id: "c8", text: "No phone for 3 minutes" },
  { id: "c9", text: "Message a friend something kind" },
  { id: "c10", text: "Smile at yourself in the mirror 😊" },
  { id: "c11", text: "Walk around for 5 minutes" },
  { id: "c12", text: "Listen to one song you love" },
  { id: "c13", text: "Do 25 jumping jacks or high knees" },
  { id: "c14", text: "Eat a piece of fruit or a vegetable" },
  { id: "c15", text: "Think of a future goal and write one small action towards it" },
  { id: "c16", text: "Close your eyes for 60 seconds of complete silence" },
  { id: "c17", text: "Spend 2 minutes reading a book" },
  { id: "c18", text: "Give a compliment to the next person you see or speak to" },
  { id: "c19", text: "Do a 30-second wall sit" },
  { id: "c20", text: "Try to touch your toes (even if you can't!)" },
  { id: "c21", text: "Balance on one foot for 30 seconds (switch sides)" },
  { id: "c22", text: "Jot down 3 tasks to complete today" },
  { id: "c23", text: "Look away from the screen for 2 minutes and focus on a distant object" },
  { id: "c24", text: "Take a sip of water every 30 seconds for 2 minutes" },
  { id: "c25", text: "Do 5 military push-ups or 10 knee push-ups" },
  { id: "c26", text: "Hum or sing a tune for 1 minute" },
  { id: "c27", text: "Write down 3 things you like about yourself" },
  { id: "c28", text: "Water a plant or check on its health" },
  { id: "c29", text: "Practice saying 'No' out loud three times (in a firm but polite voice)" },
  { id: "c30", text: "Spend 2 minutes researching a random topic you know nothing about" },
];
// ---------------- Storage Keys ----------------
const STORAGE = {
  HOUR_PREFIX: "fgk_hour_v2_", // + HOUR_KEY => { served:number, usedIds:string[], currentId:string|null }
};

// ---------------- Notifications ----------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function requestNotifPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return finalStatus === "granted";
}

async function scheduleThreePerHour() {
  const ok = await requestNotifPermissions();
  if (!ok) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
  // Single repeating every 20 min (~3/hour). Keep it dead-simple.
  await Notifications.scheduleNotificationAsync({
    content: { title: "Feel-Good Kickstart", body: "Tap to get your next mini‑challenge." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 20 * 60, repeats: true },
  });
}

// ---------------- Hour state helpers ----------------
type HourState = { served: number; usedIds: string[]; currentId: string | null };

async function readHourState(k: string): Promise<HourState> {
  const raw = await AsyncStorage.getItem(STORAGE.HOUR_PREFIX + k);
  if (!raw) return { served: 0, usedIds: [], currentId: null };
  try {
    const parsed = JSON.parse(raw);
    return { served: 0, usedIds: [], currentId: null, ...parsed } as HourState;
  } catch {
    return { served: 0, usedIds: [], currentId: null };
  }
}

async function writeHourState(k: string, st: HourState) {
  await AsyncStorage.setItem(STORAGE.HOUR_PREFIX + k, JSON.stringify(st));
}

function pickNext(pool: Challenge[], used: string[]): Challenge | null {
  const remaining = pool.filter((c) => !used.includes(c.id));
  if (remaining.length === 0) return null;
  const idx = Math.floor(Math.random() * remaining.length);
  return remaining[idx];
}

// ---------------- UI ----------------
const BigButton = ({ label, onPress, disabled, isRound }: { label: string; onPress: () => void; disabled?: boolean; isRound?: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 8 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  };

  const bgColor = disabled ? "#94d3bc" : isRound ? "#10b981" : "#3b82f6";
  const shadowColor = isRound ? "#065f46" : "#1e40af";

  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: isRound ? "center" : "stretch" }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={{
          backgroundColor: bgColor,
          width: isRound ? 150 : undefined,
          height: isRound ? 150 : 56,
          borderRadius: isRound ? 75 : 14,
          alignItems: "center",
          justifyContent: "center",
          shadowColor,
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
          paddingHorizontal: 16,
        }}
      >
        <Text style={{ color: "#fff", fontSize: isRound ? 18 : 16, fontWeight: "800", textAlign: "center" }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
};

export default function App() {
  const [hourKey, setHourKey] = useState<string>(HOUR_KEY());
  const [hourState, setHourState] = useState<HourState>({ served: 0, usedIds: [], currentId: null });
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // On mount: ensure notifications, load hour state
  useEffect(() => {
    (async () => {
      await scheduleThreePerHour();
      const st = await readHourState(hourKey);
      setHourState(st);
    })();
  }, []);

  // Each minute: detect hour rollover
  useEffect(() => {
    const t = setInterval(async () => {
      const k = HOUR_KEY();
      if (k !== hourKey) {
        setHourKey(k);
        const fresh = await readHourState(k);
        setHourState(fresh);
      }
    }, 60000);
    return () => clearInterval(t);
  }, [hourKey]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setTimeout(() => setCooldownSeconds(cooldownSeconds - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSeconds]);

  const currentChallenge: Challenge | null = useMemo(() => {
    if (!hourState.currentId) return null;
    return DEFAULT_POOL.find((c) => c.id === hourState.currentId) || null;
  }, [hourState]);

  const canServeMore = hourState.served < 3;

  const getChallenge = useCallback(async () => {
    if (hourState.currentId) return; // already showing one
    
    // If already done 3, ask for confirmation
    if (hourState.served >= 3) {
      Alert.alert(
        "You've done 3 already!",
        "Are you sure you want to do another one this hour?",
        [
          { text: "Cancel", onPress: () => {}, style: "cancel" },
          {
            text: "Yes, more!",
            onPress: async () => {
              const next = pickNext(DEFAULT_POOL, hourState.usedIds);
              if (!next) {
                Alert.alert("No more in pool", "You've seen all challenges — wait for next hour.");
                return;
              }
              const st = { ...hourState, currentId: next.id } as HourState;
              setHourState(st);
              await writeHourState(hourKey, st);
            },
          },
        ]
      );
      return;
    }
    
    const next = pickNext(DEFAULT_POOL, hourState.usedIds);
    if (!next) {
      Alert.alert("No more in pool", "You've seen all challenges — wait for next hour.");
      return;
    }
    const st = { ...hourState, currentId: next.id } as HourState;
    setHourState(st);
    await writeHourState(hourKey, st);
  }, [hourKey, hourState]);

  const finishChallenge = useCallback(async (action: "done" | "skip") => {
    if (!hourState.currentId || cooldownSeconds > 0) return;
    const used = [...hourState.usedIds, hourState.currentId];
    // Only increment served count if "done", not if "skip"
    const served = action === "done" ? hourState.served + 1 : hourState.served;
    const st = { served, usedIds: used, currentId: null } as HourState;
    setHourState(st);
    await writeHourState(hourKey, st);
    
    // Start 10-second cooldown
    setCooldownSeconds(10);
    
  }, [hourKey, hourState, cooldownSeconds]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f0f9ff" }}>
      <View style={{ padding: 24, gap: 20, flex: 1, justifyContent: "center" }}>
        <Text style={{ fontSize: 36, fontWeight: "900", textAlign: "center", color: "#0f172a", letterSpacing: -0.5 }}>Feel-Good Kickstart</Text>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ color: "#64748b", textAlign: "center", fontSize: 15, fontWeight: "500" }}>
            ✓ {hourState.served} completed
          </Text>
          <Text style={{ color: "#cbd5e1", textAlign: "center", fontSize: 13 }}>
            {hourKey.slice(0, 4)}-{hourKey.slice(4, 6)}-{hourKey.slice(6, 8)} {hourKey.slice(8, 10)}:00
          </Text>
        </View>

        {!currentChallenge && (
          <View style={{ gap: 24, alignItems: "center" }}>
            <BigButton label="Get Challenge" onPress={getChallenge} isRound />
            <Text style={{ color: "#94a3b8", textAlign: "center", fontSize: 13, maxWidth: 200 }}>Tap to unlock your next feel-good moment</Text>
          </View>
        )}

        {currentChallenge && (
          <View style={{ gap: 24 }}>
            <View style={{ backgroundColor: "#fff", padding: 28, borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, gap: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#10b981", letterSpacing: 0.5, textTransform: "uppercase" }}>Today's Challenge</Text>
              <Text style={{ fontSize: 22, fontWeight: "700", textAlign: "center", color: "#1e293b", lineHeight: 32 }}>{currentChallenge.text}</Text>
            </View>
            <View style={{ gap: 12 }}>
              <BigButton label="✓ I did it!" onPress={() => finishChallenge("done")} disabled={cooldownSeconds > 0} />
              <Pressable
                onPress={() => finishChallenge("skip")}
                disabled={cooldownSeconds > 0}
                style={{
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: "#e2e8f0",
                  backgroundColor: "#f8fafc",
                  opacity: cooldownSeconds > 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "#64748b", fontSize: 16, fontWeight: "600" }}>
                  {cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s...` : "Try another one"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
        <Text style={{ color: "#cbd5e1", textAlign: "center", fontSize: 12, fontWeight: "500" }}>Your data stays private • No accounts • No tracking</Text>
      </View>
    </SafeAreaView>
  );
}
