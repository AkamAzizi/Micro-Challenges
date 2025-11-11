import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { SafeAreaView, View, Text, Pressable, Alert, Platform, Animated, Easing, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Feel-Good Kickstart — super-minimal, local-only
 * V7: Longer, more visible satisfaction burst ("Confetti" feel).
 */

// ---------------- Haptics Utility ----------------
const doHaptic = (type: 'impact' | 'selection' = 'impact') => {
  if (Platform.OS === 'ios') {
    // Use Heavy for a "Loud", satisfying feeling
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); 
  } else if (Platform.OS === 'android') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
};

// ---------------- Utilities ----------------
const HOUR_KEY = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  return `${y}${m}${d}${h}`;
};

// ---------------- Types & Data ----------------
export type Challenge = { id: string; text: string };

const DEFAULT_POOL: Challenge[] = [
  { id: "c1", text: "Drink a glass of water" },
  { id: "c2", text: "Stand up and stretch for 60 seconds" },
  { id: "c3", text: "Deep-breathe: 10 slow breaths" },
  { id: "c4", text: "1-minute plank or 15 squats" },
  { id: "c5", text: "Write down 1 thing you are grateful for" },
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
  { id: "c31", text: "Add Akam Azizi as a contact on LinkedIn" },
  { id: "c32", text: "Write 1 goal for the week" },
];
// ---------------- Storage Keys & Notif setup (omitted for brevity) ----------------
const STORAGE = {
  HOUR_PREFIX: "fgk_hour_v2_",
};

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
  await Notifications.scheduleNotificationAsync({
    content: { title: "Kickstart", body: "Time for a mini-boost!" },
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

// ---------------- UI Components ----------------

// Bubbly Big Button with Spring Animation
const BigButton = ({ label, onPress, disabled, isRound }: { label: string; onPress: () => void; disabled?: boolean; isRound?: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, friction: 3, tension: 80 }).start(); 
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 3, tension: 80 }).start(); 
  };

  const bgColor = disabled ? "#6b7280" : isRound ? "#059669" : "#3b82f6";
  const shadowColor = isRound ? "#065f46" : "#1e40af";

  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: isRound ? "center" : "stretch" }}>
      <Pressable
        onPress={() => { onPress(); doHaptic('impact'); }}
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
          shadowColor: shadowColor,
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
          paddingHorizontal: 16,
        }}
      >
        <Text style={{ 
          color: "#fff", 
          fontSize: isRound ? 18 : 16, 
          fontWeight: "800", 
          textAlign: "center"
        }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
};


// ChallengeCard Component with Animation and Satisfaction Pop
const AnimatedChallengeCard = ({ challenge, finishChallenge, cooldownSeconds }: { challenge: Challenge, finishChallenge: (action: "done" | "skip") => void, cooldownSeconds: number }) => {
  const enterExitAnim = useRef(new Animated.Value(0)).current; 
  const satisfactionAnim = useRef(new Animated.Value(0)).current; 

  useEffect(() => {
    // Animate in
    Animated.spring(enterExitAnim, {
      toValue: 1,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [challenge.id]);
  
  // Confetti-like Pop Style
  const satisfactionPopStyle = {
      // 1. Brighter Flash
      backgroundColor: satisfactionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['#ffffff', '#FFFFFF'], // White -> Pure White Flash
      }),
      // 2. Aggressive Scale (The "burst")
      transform: [{
          scale: satisfactionAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.3] // Scale out aggressively
          })
      }]
  };
  
  const cardStyle = {
    opacity: enterExitAnim,
    transform: [
      {
        translateY: enterExitAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [70, 0], 
        }),
      },
      {
        scale: enterExitAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.85, 1], 
        })
      }
    ],
  };
  
  const handleAction = (action: "done" | "skip") => {
      
      if (action === "done") {
          doHaptic('impact'); // Loud Haptic for Done
          // --- SATISFACTION BURST EFFECT: TIMINGS ADJUSTED FOR VISIBILITY ---
          Animated.sequence([
              // 1. Instant Pop and Flash IN
              Animated.timing(satisfactionAnim, {
                  toValue: 1,
                  duration: 150, // Longer flash in
                  easing: Easing.out(Easing.ease),
                  useNativeDriver: true,
              }),
              // 2. Flash OUT
              Animated.timing(satisfactionAnim, {
                  toValue: 0,
                  duration: 200, // Longer flash out
                  easing: Easing.in(Easing.ease),
                  useNativeDriver: true,
              }),
              // 3. Animate Card Out (Disappear)
              Animated.timing(enterExitAnim, {
                toValue: 0,
                duration: 200, // Quick exit
                easing: Easing.in(Easing.ease),
                useNativeDriver: true,
              }),
          ]).start(() => finishChallenge(action));

      } else {
          doHaptic('selection'); // Subtle Haptic for Skip
          // Animate out quickly on Skip
          Animated.timing(enterExitAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }).start(() => finishChallenge(action));
      }
  }
  
  const isCooldown = cooldownSeconds > 0;
  const doneLabel = isCooldown ? `Wait ${cooldownSeconds}s...` : "✓ Done! (Instant Boost)";
  const skipLabel = isCooldown ? `Wait ${cooldownSeconds}s...` : "Skip, try another";
  
  return (
    <Animated.View style={[cardStyle, { gap: 20 }]}>
      <Animated.View style={[{ padding: 30, borderRadius: 24, 
        // Bubbly Card Shadow
        shadowColor: "#1e293b", 
        shadowOpacity: 0.1, 
        shadowRadius: 20, 
        shadowOffset: { width: 0, height: 12 }, 
        elevation: 12, 
        gap: 16 }, satisfactionPopStyle]}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#059669", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center" }}>Your Micro-Challenge</Text>
        <Text style={{ fontSize: 24, fontWeight: "800", textAlign: "center", color: "#1e293b", lineHeight: 34 }}>{challenge.text}</Text>
      </Animated.View>
      <View style={{ gap: 12 }}>
        <BigButton label={doneLabel} onPress={() => handleAction("done")} disabled={isCooldown} isRound={false} />
        <Pressable
          onPress={() => handleAction("skip")}
          disabled={isCooldown}
          style={{
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "#000000ff", 
            backgroundColor: "#ffffffff",
            opacity: isCooldown ? 0.6 : 1,
            shadowColor: "#000000ff", 
            shadowOpacity: 0.05, 
            shadowRadius: 8, 
            shadowOffset: { width: 0, height: 4 }, 
            elevation: 4, 
          }}
        >
          <Text style={{ color: "#4b5563", fontSize: 16, fontWeight: "600" }}>
            {skipLabel}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};


// ---------------- Main App (Unchanged functionality) ----------------
export default function App() {
  const [hourKey, setHourKey] = useState<string>(HOUR_KEY());
  const [hourState, setHourState] = useState<HourState>({ served: 0, usedIds: [], currentId: null });
  const [cooldownSeconds, setCooldownSeconds] = useState(0); 

  // On mount: notifications, load state
  useEffect(() => {
    (async () => {
      await scheduleThreePerHour();
      const st = await readHourState(hourKey);
      setHourState(st);
    })();
  }, []);

  // Hour rollover detection
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

  // Cooldown timer (5 seconds)
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setTimeout(() => setCooldownSeconds(cooldownSeconds - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSeconds]);

  const currentChallenge: Challenge | null = useMemo(() => {
    if (!hourState.currentId) return null;
    return DEFAULT_POOL.find((c) => c.id === hourState.currentId) || null;
  }, [hourState]);
  
  const maxReached = hourState.served >= 3;

  const getChallenge = useCallback(async () => {
    if (hourState.currentId) return;
    
    if (maxReached) {
      Alert.alert(
        "You've crushed 3 challenges!",
        "Feeling ambitious? You can do another one this hour, but it's okay to rest!",
        [
          { text: "Cancel", onPress: () => {}, style: "cancel" },
          {
            text: "Yes, another!",
            onPress: async () => {
              const next = pickNext(DEFAULT_POOL, hourState.usedIds);
              if (!next) {
                Alert.alert("Pool Empty", "You've seen all challenges — wait for next hour.");
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
      Alert.alert("Pool Empty", "You've seen all challenges — wait for next hour.");
      return;
    }
    const st = { ...hourState, currentId: next.id } as HourState;
    setHourState(st);
    await writeHourState(hourKey, st);
  }, [hourKey, hourState, maxReached]);

  const finishChallenge = useCallback(async (action: "done" | "skip") => {
    if (!hourState.currentId) return;
    
    const used = [...hourState.usedIds, hourState.currentId];
    const served = action === "done" ? hourState.served + 1 : hourState.served;
    
    // Clear ID immediately to unmount card and start cooldown visual on button
    const st = { served, usedIds: used, currentId: null } as HourState;
    setHourState(st);
    await writeHourState(hourKey, st);
    
    setCooldownSeconds(5); // 5-second cooldown
    
  }, [hourKey, hourState]);

  // Determine the label for the main button
  const mainButtonLabel = useMemo(() => {
    if (cooldownSeconds > 0) return `Cooldown ${cooldownSeconds}s`;
    if (maxReached) return "Extra Challenge";
    return "Get Challenge";
  }, [cooldownSeconds, maxReached]);

  const completedText = `${hourState.served} / 3 Completed`;
  

  return (
    <LinearGradient
        colors={['#e0f7fa', '#f0f9ff', '#e0f7fa']} 
        style={{ flex: 1 }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ padding: 24, gap: 20, flex: 1 }}>
          <Text style={{ fontSize: 32, fontWeight: "900", textAlign: "center", color: "#0f172a", letterSpacing: -0.5, marginTop: 16 }}>
            Kickstart
          </Text>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#4b5563" }}>
                {completedText}
            </Text>
            <Text style={{ color: "#64748b", textAlign: "center", fontSize: 13, fontWeight: "500" }}>
                Hour {hourKey.slice(8, 10)}:00
            </Text>
          </View>
          
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
            {!currentChallenge && (
              <View style={{ gap: 32, alignItems: "center" }}>
                <BigButton 
                    label={mainButtonLabel} 
                    onPress={getChallenge} 
                    isRound 
                    disabled={cooldownSeconds > 0} 
                />
                <Text style={{ 
                  color: cooldownSeconds > 0 ? "#ef4444" : "#94a3b8", 
                  textAlign: "center", 
                  fontSize: 14, 
                  maxWidth: 240,
                  fontWeight: cooldownSeconds > 0 ? "700" : "500"
                }}>
                  {cooldownSeconds > 0 ? 
                    `Take a quick breath. Next available in ${cooldownSeconds}s.` : 
                    maxReached ? 
                    "You hit the 3/hour limit. Tap for an extra boost if you need it!" :
                    "Tap the bubble to unlock a small, feel-good action."
                  }
                </Text>
              </View>
            )}

            {currentChallenge && (
              <AnimatedChallengeCard
                challenge={currentChallenge}
                finishChallenge={finishChallenge}
                cooldownSeconds={cooldownSeconds}
              />
            )}
          </View>

          <Text style={{ color: "#94a3b850", textAlign: "center", fontSize: 12, fontWeight: "500", marginBottom: 8 }}>
            Your data is private.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
