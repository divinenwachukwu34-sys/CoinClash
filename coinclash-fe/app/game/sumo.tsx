import { useAuth } from '@/context/AuthContext';
import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { useLiveMatch } from '@/hooks/useLiveMatch';
import { MatchmakingModal } from '@/components/MatchmakingModal';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';

const RING_RADIUS = 3.2;

export default function SumoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const isPractice = stake === 0;
  const finish = useGameFinish(stake);

  const {
    matchState,
    searchSeconds,
    startSearching,
    sendGameStart,
    sendProgress,
    submitFinalScore,
    switchToBotMatch,
    cancelSearch,
  } = useLiveMatch('sumo', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameReady, setGameReady] = useState(false);
  const [playerScore, setPlayerScore] = useState(50); // Meter: 0 = pushed out, 100 = opponent pushed out
  const [feedback, setFeedback] = useState<string | null>(null);
  const [winner, setWinner] = useState<'player' | 'opponent' | null>(null);

  // Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const playerWrestlerRef = useRef<THREE.Group | null>(null);
  const oppWrestlerRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const scoreRef = useRef(50);
  const startTimeRef = useRef(Date.now());
  const aiPushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    startSearching();
  }, [startSearching]);

  useEffect(() => {
    if (matchState.status === 'matched' && !hasSentStart.current) {
      hasSentStart.current = true;
      displayTimerRef.current = setTimeout(() => sendGameStart(), 4000);
      return () => {
        if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
      };
    }
  }, [matchState.status, sendGameStart]);

  useEffect(() => {
    if (matchState.status === 'playing' || matchState.status === 'offline_ai') {
      setGameReady(true);
      startTimeRef.current = Date.now();
      scoreRef.current = 50;
      setPlayerScore(50);

      // AI constant pushing rhythm
      aiPushIntervalRef.current = setInterval(() => {
        if (winner) return;
        const aiEffort = Math.random() * 2.8 + 1.2;
        updateBalance(-aiEffort);
      }, 350);
    }
    return () => {
      if (aiPushIntervalRef.current) clearInterval(aiPushIntervalRef.current);
    };
  }, [matchState.status, winner]);

  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      const res = matchState.gameResult;
      finish(res.won, res.playerScore, res.opponentScore, 'pts', {
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  // Create Sumo Wrestler Mesh Group
  const createWrestler = (beltColor: number) => {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xefd1b8, roughness: 0.6 });
    const beltMat = new THREE.MeshStandardMaterial({ color: beltColor, roughness: 0.4 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x111827 });

    // Chunky Torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 16), skinMat);
    torso.position.y = 1.0;
    torso.scale.set(1.1, 1.2, 1.0);
    group.add(torso);

    // Mawashi (Sumo belt)
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.35, 16), beltMat);
    belt.position.y = 0.9;
    group.add(belt);

    // Head with topknot
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), skinMat);
    head.position.y = 1.9;
    group.add(head);

    const topknot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 8), hairMat);
    topknot.position.set(0, 2.3, -0.05);
    group.add(topknot);

    // Arms in pushing stance
    const armGeo = new THREE.CylinderGeometry(0.2, 0.18, 0.8, 12);
    armGeo.rotateZ(Math.PI / 3);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.65, 1.3, 0.4);
    group.add(armL);

    const armR = armL.clone();
    armR.rotation.z = -Math.PI / 3;
    armR.position.set(0.65, 1.3, 0.4);
    group.add(armR);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.7, 12);
    const legL = new THREE.Mesh(legGeo, skinMat);
    legL.position.set(-0.4, 0.35, 0);
    group.add(legL);

    const legR = new THREE.Mesh(legGeo, skinMat);
    legR.position.set(0.4, 0.35, 0);
    group.add(legR);

    return group;
  };

  const buildScene = useCallback((scene: THREE.Scene) => {
    // Dohyo (Clay Elevated Ring)
    const dohyoBase = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.5, 0.6, 32),
      new THREE.MeshStandardMaterial({ color: 0xb5804c, roughness: 0.9 })
    );
    dohyoBase.position.y = -0.3;
    scene.add(dohyoBase);

    // Ring Border (Straw Rice Bales - Shobu-dawara)
    const strawRing = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.14, 12, 36),
      new THREE.MeshStandardMaterial({ color: 0xecd19b, roughness: 0.8 })
    );
    strawRing.rotation.x = Math.PI / 2;
    strawRing.position.y = 0.01;
    scene.add(strawRing);

    // Arena Floor
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    scene.add(ground);

    // Player (Blue Belt)
    const playerWrestler = createWrestler(0x2563eb);
    playerWrestler.position.set(0, 0, 1.2);
    scene.add(playerWrestler);
    playerWrestlerRef.current = playerWrestler;

    // Opponent (Red Belt)
    const oppWrestler = createWrestler(0xdc2626);
    oppWrestler.position.set(0, 0, -1.2);
    oppWrestler.rotation.y = Math.PI;
    scene.add(oppWrestler);
    oppWrestlerRef.current = oppWrestler;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 4.2, 6.2);
    camera.lookAt(0, 0.8, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemi = new THREE.HemisphereLight(0xffeedd, 0x111827, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(4, 10, 5);
    scene.add(dir);

    buildScene(scene);

    let lastTime = performance.now();
    const animate = (time: number) => {
      animFrameRef.current = requestAnimationFrame(animate);
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Subtle breathing / clash rumble
      if (playerWrestlerRef.current && oppWrestlerRef.current && !winner) {
        const shake = Math.sin(time * 0.03) * 0.02;
        playerWrestlerRef.current.position.x = shake;
        oppWrestlerRef.current.position.x = -shake;
      }

      renderer.render(scene, camera);
    };
    animate(performance.now());

    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, [buildScene, winner]);

  // Update Push Equilibrium
  const updateBalance = (delta: number) => {
    if (winner || !gameReady) return;
    const current = Math.min(100, Math.max(0, scoreRef.current + delta));
    scoreRef.current = current;
    setPlayerScore(Math.round(current));

    // Shift 3D character positions based on balance
    // 50 = Center, 100 = Opponent pushed completely out (+RING_RADIUS Z), 0 = Player out (-RING_RADIUS Z)
    const offsetZ = ((current - 50) / 50) * RING_RADIUS;
    if (playerWrestlerRef.current && oppWrestlerRef.current) {
      playerWrestlerRef.current.position.z = 1.2 - offsetZ;
      oppWrestlerRef.current.position.z = -1.2 - offsetZ;
    }

    if (current >= 100) {
      handleMatchOver('player');
    } else if (current <= 0) {
      handleMatchOver('opponent');
    }
  };

  const handlePlayerTap = () => {
    if (winner || !gameReady) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateBalance(3.6); // player push impulse
  };

  const handleMatchOver = (winSide: 'player' | 'opponent') => {
    setWinner(winSide);
    if (aiPushIntervalRef.current) clearInterval(aiPushIntervalRef.current);

    // Fall animation for loser
    if (winSide === 'player' && oppWrestlerRef.current) {
      oppWrestlerRef.current.position.y = -1.0;
      oppWrestlerRef.current.rotation.x = -Math.PI / 4;
      setFeedback('🏆 RING OUT! YOU WIN!');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (playerWrestlerRef.current) {
      playerWrestlerRef.current.position.y = -1.0;
      playerWrestlerRef.current.rotation.x = Math.PI / 4;
      setFeedback('PUSHED OUT! OPPONENT WINS!');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    const totalTime = Date.now() - startTimeRef.current;
    const finalScore = winSide === 'player' ? 100 : 0;

    setTimeout(() => {
      if (matchState.status === 'playing' && matchState.roomId) {
        submitFinalScore(finalScore, totalTime, winSide === 'player' ? 'RING_OUT' : 'DEFEAT');
      } else {
        finish(winSide === 'player', finalScore, winSide === 'player' ? 0 : 100, 'pts', {
          playerTimeMs: totalTime,
          aiTimeMs: totalTime + 2000,
        });
      }
    }, 1200);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0f1d' },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 10,
    },
    title: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
    scorePill: {
      backgroundColor: 'rgba(255,255,255,0.1)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    scoreVal: { fontSize: 16, fontWeight: '700', color: '#F59E0B', fontFamily: 'Inter_700Bold' },
    canvasWrapper: { flex: 1, width: '100%' },
    meterContainer: {
      position: 'absolute',
      top: topPad + 60,
      left: 20,
      right: 20,
      zIndex: 10,
      gap: 6,
    },
    meterBg: {
      height: 16,
      backgroundColor: 'rgba(220, 38, 38, 0.8)',
      borderRadius: 8,
      overflow: 'hidden',
    },
    meterFill: {
      height: '100%',
      backgroundColor: '#2563EB',
      borderRadius: 8,
    },
    meterLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    meterText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_600SemiBold' },
    feedback: {
      position: 'absolute',
      bottom: 160,
      alignSelf: 'center',
      backgroundColor: '#F59E0B',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 12,
    },
    feedbackText: { color: '#000000', fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    tapZone: {
      paddingBottom: insets.bottom + 20,
      paddingHorizontal: 20,
      alignItems: 'center',
      zIndex: 10,
    },
    pushBtn: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: '#2563EB',
      paddingVertical: 20,
      borderRadius: 20,
      alignItems: 'center',
      elevation: 4,
    },
    pushBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', fontFamily: 'Inter_700Bold' },
    tapHint: { marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_500Medium' },
  });

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || (matchState.status === 'matched' && !gameReady)}
        gameTitle="🥋 Sumo Clash 3D"
        stake={stake}
        searchSeconds={searchSeconds}
        playerUsername={user?.username || 'You'}
        opponentUsername={matchState.opponentUsername || 'Challenger'}
        isMatched={matchState.status === 'matched'}
        onCancel={() => {
          cancelSearch();
          router.back();
        }}
        onPlayBot={switchToBotMatch}
      />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={s.title}>🥋 Sumo Clash 3D</Text>
        <View style={s.scorePill}>
          <Text style={s.scoreVal}>{playerScore}% DOMINANCE</Text>
        </View>
      </View>

      {/* Dominance Meter */}
      <View style={s.meterContainer}>
        <View style={s.meterLabels}>
          <Text style={s.meterText}>YOU (BLUE)</Text>
          <Text style={s.meterText}>OPPONENT (RED)</Text>
        </View>
        <View style={s.meterBg}>
          <View style={[s.meterFill, { width: `${playerScore}%` }]} />
        </View>
      </View>

      {/* 3D WebGL Canvas */}
      <View style={s.canvasWrapper}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </View>

      {/* Outcome Feedback */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Push Tap Area */}
      <View style={s.tapZone}>
        <Pressable
          style={({ pressed }) => [s.pushBtn, pressed && { transform: [{ scale: 0.97 }] }]}
          onPress={handlePlayerTap}
          disabled={!gameReady || !!winner}
        >
          <Text style={s.pushBtnText}>💥 PUSH / TAP FAST!</Text>
        </Pressable>
        <Text style={s.tapHint}>Tap rapidly to overpower your opponent and push them off the ring!</Text>
      </View>
    </View>
  );
}
