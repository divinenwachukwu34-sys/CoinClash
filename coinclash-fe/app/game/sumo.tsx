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
  const _colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const _isPractice = stake === 0;
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

  const topPad = Platform.OS === 'web' ? 50 : insets.top;

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

  // Create Authentic 3D Sumo Wrestler Mesh
  const createWrestler = (beltColor: number) => {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xedc4a2,
      roughness: 0.5,
      metalness: 0.05,
    });
    const beltMat = new THREE.MeshStandardMaterial({
      color: beltColor,
      roughness: 0.35,
      metalness: 0.2,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });

    // Chunky Torso & Muscular Belly
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 20), skinMat);
    torso.position.y = 1.05;
    torso.scale.set(1.15, 1.25, 1.05);
    group.add(torso);

    // Mawashi (Sumo belt) with front knot and hanging apron
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.38, 20), beltMat);
    belt.position.y = 0.92;
    group.add(belt);

    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.42, 0.18), beltMat);
    knot.position.set(0, 0.9, 0.88);
    group.add(knot);

    // Head with Chonmage Samurai Topknot
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 18), skinMat);
    head.position.y = 2.05;
    group.add(head);

    const hairBase = new THREE.Mesh(new THREE.SphereGeometry(0.37, 16, 16), hairMat);
    hairBase.position.set(0, 2.12, -0.06);
    hairBase.scale.set(0.95, 0.7, 0.95);
    group.add(hairBase);

    const topknot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.32, 10), hairMat);
    topknot.rotation.x = Math.PI / 4;
    topknot.position.set(0, 2.38, -0.15);
    group.add(topknot);

    // Muscular Arms in pushing stance
    const armGeo = new THREE.CylinderGeometry(0.22, 0.18, 0.85, 12);
    armGeo.rotateZ(Math.PI / 3.2);

    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.7, 1.35, 0.45);
    group.add(armL);

    const armR = armL.clone();
    armR.rotation.z = -Math.PI / 3.2;
    armR.position.set(0.7, 1.35, 0.45);
    group.add(armR);

    // Chunky Stomping Legs
    const legGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.75, 14);
    const legL = new THREE.Mesh(legGeo, skinMat);
    legL.position.set(-0.42, 0.38, 0);
    group.add(legL);

    const legR = new THREE.Mesh(legGeo, skinMat);
    legR.position.set(0.42, 0.38, 0);
    group.add(legR);

    return group;
  };

  const buildScene = useCallback((scene: THREE.Scene) => {
    // 1. Dohyo (Clay Elevated Ring)
    const dohyoBase = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.8, 0.65, 36),
      new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.9 })
    );
    dohyoBase.position.y = -0.32;
    scene.add(dohyoBase);

    // 2. Ring Border (Straw Rice Bales - Shobu-dawara)
    const strawRing = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.15, 14, 48),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.85 })
    );
    strawRing.rotation.x = Math.PI / 2;
    strawRing.position.y = 0.02;
    scene.add(strawRing);

    // 3. Traditional Japanese Shikiri-sen (White Starting Lines)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.1), lineMat);
    line1.rotation.x = -Math.PI / 2;
    line1.position.set(0, 0.03, 0.6);
    scene.add(line1);

    const line2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.1), lineMat);
    line2.rotation.x = -Math.PI / 2;
    line2.position.set(0, 0.03, -0.6);
    scene.add(line2);

    // 4. Arena Floor
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.65;
    scene.add(ground);

    // 5. Player Wrestler (Blue Mawashi)
    const playerWrestler = createWrestler(0x2563eb);
    playerWrestler.position.set(0, 0, 1.2);
    scene.add(playerWrestler);
    playerWrestlerRef.current = playerWrestler;

    // 6. Opponent Wrestler (Red Mawashi)
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
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 4.4, 6.4);
    camera.lookAt(0, 0.9, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffedd5, 0.7);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    dirLight.position.set(4, 10, 5);
    scene.add(dirLight);

    const spot = new THREE.SpotLight(0xffffff, 2.5, 20, Math.PI / 3, 0.4);
    spot.position.set(0, 8, 0);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);

    buildScene(scene);

    const animate = (time: number) => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (playerWrestlerRef.current && oppWrestlerRef.current && !winner) {
        const shake = Math.sin(time * 0.035) * 0.025;
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateBalance(3.8);
  };

  const handleMatchOver = (winSide: 'player' | 'opponent') => {
    setWinner(winSide);
    if (aiPushIntervalRef.current) clearInterval(aiPushIntervalRef.current);

    if (winSide === 'player' && oppWrestlerRef.current) {
      oppWrestlerRef.current.position.y = -1.1;
      oppWrestlerRef.current.rotation.x = -Math.PI / 4;
      setFeedback('🏆 RING OUT! YOU WIN!');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (playerWrestlerRef.current) {
      playerWrestlerRef.current.position.y = -1.1;
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
    container: { flex: 1, backgroundColor: '#0f172a' },
    topBar: {
      paddingTop: topPad + 4,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 20,
    },
    topIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    canvasWrapper: { flex: 1, width: '100%' },
    meterContainer: {
      position: 'absolute',
      top: topPad + 50,
      left: 20,
      right: 20,
      zIndex: 15,
      gap: 6,
    },
    meterBg: {
      height: 18,
      backgroundColor: 'rgba(220, 38, 38, 0.85)',
      borderRadius: 9,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    meterFill: {
      height: '100%',
      backgroundColor: '#2563eb',
      borderRadius: 7,
    },
    meterLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    meterText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
    feedback: {
      position: 'absolute',
      bottom: 180,
      alignSelf: 'center',
      backgroundColor: '#f59e0b',
      paddingHorizontal: 26,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 25,
      shadowColor: '#000',
      shadowOpacity: 0.6,
      shadowRadius: 10,
      elevation: 8,
    },
    feedbackText: { color: '#000000', fontSize: 20, fontWeight: '900', fontFamily: 'Inter_700Bold' },
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

      {/* Top Header Icons matching Snapchat AR camera interface */}
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.topIconBtn}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={s.topIconBtn}>
            <Ionicons name="musical-notes" size={20} color="#FFFFFF" />
          </View>
          <View style={s.topIconBtn}>
            <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
          </View>
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

      {/* 3D WebGL Canvas Layer */}
      <View style={s.canvasWrapper}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Snapchat Lens Rapid-Tap Shutter Button at Bottom */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 16,
          alignSelf: 'center',
          alignItems: 'center',
          zIndex: 20,
        }}
      >
        <Pressable
          onPress={handlePlayerTap}
          style={({ pressed }) => [
            {
              width: 86,
              height: 86,
              borderRadius: 43,
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              borderWidth: 4,
              borderColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#2563eb',
              shadowOpacity: 0.7,
              shadowRadius: 14,
              elevation: 10,
            },
            pressed && { transform: [{ scale: 0.92 }] },
          ]}
          disabled={!gameReady || !!winner}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: '#2563eb',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 32 }}>🥋</Text>
          </View>
        </Pressable>
        <Text
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: '900',
            color: '#FFFFFF',
            letterSpacing: 1,
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowRadius: 4,
          }}
        >
          TAP RAPIDLY TO PUSH! 💥
        </Text>
      </View>
    </View>
  );
}
