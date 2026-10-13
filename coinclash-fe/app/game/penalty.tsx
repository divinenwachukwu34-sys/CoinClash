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

const TOTAL_ROUNDS = 5;
type Direction = 'left' | 'center' | 'right';

export default function PenaltyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
  } = useLiveMatch('penalty', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameReady, setGameReady] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [role, setRole] = useState<'kicker' | 'keeper'>('kicker');
  const [animating, setAnimating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const ballRef = useRef<THREE.Mesh | null>(null);
  const keeperRef = useRef<THREE.Group | null>(null);
  const kickerRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const playerScoreRef = useRef(0);
  const oppScoreRef = useRef(0);
  const roundRef = useRef(1);
  const startTimeRef = useRef(Date.now());

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Matchmaking
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
    }
  }, [matchState.status]);

  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      const res = matchState.gameResult;
      finish(res.won, res.playerTimeMs, res.opponentTimeMs, 'goals', {
        playerScore: res.playerScore,
        aiScore: res.opponentScore,
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  // Build Scene
  const buildScene = useCallback((scene: THREE.Scene) => {
    // Pitch / Grass
    const pitchGeo = new THREE.PlaneGeometry(24, 30);
    const pitchMat = new THREE.MeshStandardMaterial({ color: 0x1e7e34, roughness: 0.8 });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    scene.add(pitch);

    // Goal Post Structure
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 16);
    const postLeft = new THREE.Mesh(postGeo, goalMat);
    postLeft.position.set(-2.8, 1.3, -10);
    scene.add(postLeft);

    const postRight = new THREE.Mesh(postGeo, goalMat);
    postRight.position.set(2.8, 1.3, -10);
    scene.add(postRight);

    const crossbarGeo = new THREE.CylinderGeometry(0.08, 0.08, 5.76, 16);
    const crossbar = new THREE.Mesh(crossbarGeo, goalMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 2.6, -10);
    scene.add(crossbar);

    // Net
    const netGeo = new THREE.BoxGeometry(5.6, 2.5, 1.5);
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.4 });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 1.3, -10.8);
    scene.add(net);

    // Goalkeeper
    const keeperGroup = new THREE.Group();
    // Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
    const keeperBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 1.2, 12), bodyMat);
    keeperBody.position.y = 1.0;
    keeperGroup.add(keeperBody);
    // Head
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const keeperHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), headMat);
    keeperHead.position.y = 1.8;
    keeperGroup.add(keeperHead);
    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0x10b981 });
    const keeperArmL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.15), armMat);
    keeperArmL.position.set(-0.5, 1.3, 0);
    keeperGroup.add(keeperArmL);
    const keeperArmR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.15), armMat);
    keeperArmR.position.set(0.5, 1.3, 0);
    keeperGroup.add(keeperArmR);

    keeperGroup.position.set(0, 0, -9.8);
    scene.add(keeperGroup);
    keeperRef.current = keeperGroup;

    // Ball
    const ballGeo = new THREE.SphereGeometry(0.24, 20, 20);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(0, 0.24, -2.5);
    scene.add(ball);
    ballRef.current = ball;

    // Kicker (Player / Opponent Avatar)
    const kickerGroup = new THREE.Group();
    const kBodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const kickerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.2, 12), kBodyMat);
    kickerBody.position.y = 1.0;
    kickerGroup.add(kickerBody);
    const kickerHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), headMat);
    kickerHead.position.y = 1.8;
    kickerGroup.add(kickerHead);
    kickerGroup.position.set(0.6, 0, -1.8);
    scene.add(kickerGroup);
    kickerRef.current = kickerGroup;
  }, []);

  // WebGL Setup
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1427);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 2.2, 3.2);
    camera.lookAt(0, 1.4, -9.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1f2937, 0.8);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(5, 12, 6);
    scene.add(dir);

    buildScene(scene);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

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
  }, [buildScene]);

  // Turn Execution
  const handleAction = (direction: Direction) => {
    if (animating || !gameReady) return;
    setAnimating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // AI choice
    const directions: Direction[] = ['left', 'center', 'right'];
    const aiChoice = directions[Math.floor(Math.random() * directions.length)];

    const ballTargetX = direction === 'left' ? -1.8 : direction === 'right' ? 1.8 : 0;
    const keeperTargetX = (role === 'kicker' ? aiChoice : direction) === 'left' ? -1.8 : (role === 'kicker' ? aiChoice : direction) === 'right' ? 1.8 : 0;

    const isGoal = role === 'kicker' ? direction !== aiChoice : aiChoice !== direction;

    const ball = ballRef.current;
    const keeper = keeperRef.current;
    const kicker = kickerRef.current;
    if (!ball || !keeper) return;

    const startBallPos = ball.position.clone();
    const targetBallPos = new THREE.Vector3(ballTargetX, 1.2, -10.0);
    const startKeeperPos = keeper.position.clone();
    const targetKeeperPos = new THREE.Vector3(keeperTargetX, keeper.position.y, keeper.position.z);

    const startTime = performance.now();
    const duration = 750;

    const animateShot = () => {
      const now = performance.now();
      const p = Math.min(1, (now - startTime) / duration);

      // Move kicker run-up
      if (kicker && p < 0.3) {
        kicker.position.z = -1.8 - p * 1.5;
      }

      // Ball path
      const curPos = new THREE.Vector3().lerpVectors(startBallPos, targetBallPos, p);
      curPos.y += Math.sin(p * Math.PI) * 1.2;
      ball.position.copy(curPos);
      ball.rotation.x += 0.15;

      // Keeper dive
      keeper.position.x = THREE.MathUtils.lerp(startKeeperPos.x, targetKeeperPos.x, p * 1.2);
      if (keeperTargetX !== 0) {
        keeper.rotation.z = THREE.MathUtils.lerp(0, keeperTargetX > 0 ? -0.5 : 0.5, p);
      }

      if (p < 1) {
        requestAnimationFrame(animateShot);
      } else {
        // Outcome
        if (isGoal) {
          if (role === 'kicker') {
            playerScoreRef.current += 1;
            setPlayerScore(playerScoreRef.current);
            setFeedback('GOOOAL! ⚽🔥');
          } else {
            oppScoreRef.current += 1;
            setOpponentScore(oppScoreRef.current);
            setFeedback('OPPONENT SCORED! 😱');
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          if (role === 'kicker') {
            setFeedback('SAVED BY KEEPER! 🧤');
          } else {
            playerScoreRef.current += 1; // bonus for great save
            setPlayerScore(playerScoreRef.current);
            setFeedback('WHAT A SAVE! 🧤🛑');
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }

        // Live match progress
        if (matchState.status === 'playing' && matchState.roomId) {
          sendProgress(roundRef.current, playerScoreRef.current, Date.now() - startTimeRef.current);
        }

        // Reset positions & switch turn
        setTimeout(() => {
          ball.position.set(0, 0.24, -2.5);
          keeper.position.set(0, 0, -9.8);
          keeper.rotation.set(0, 0, 0);
          if (kicker) kicker.position.set(0.6, 0, -1.8);
          setFeedback(null);

          const nextRound = roundRef.current + 1;
          roundRef.current = nextRound;
          setCurrentRound(Math.min(TOTAL_ROUNDS, nextRound));
          setRole(r => (r === 'kicker' ? 'keeper' : 'kicker'));
          setAnimating(false);

          if (nextRound > TOTAL_ROUNDS) {
            // End Match
            const totalTime = Date.now() - startTimeRef.current;
            const pScore = playerScoreRef.current;
            const oScore = oppScoreRef.current;
            setTimeout(() => {
              if (matchState.status === 'playing' && matchState.roomId) {
                submitFinalScore(pScore, totalTime, `${pScore}-${oScore}`);
              } else {
                const won = pScore > oScore || (pScore === oScore && totalTime < 30000);
                finish(won, totalTime, 30000, 'goals', {
                  playerScore: pScore,
                  aiScore: oScore,
                  playerTimeMs: totalTime,
                  aiTimeMs: 30000,
                });
              }
            }, 600);
          }
        }, 1200);
      }
    };
    requestAnimationFrame(animateShot);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0c1427' },
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
    scoreVal: { fontSize: 16, fontWeight: '700', color: '#38BDF8', fontFamily: 'Inter_700Bold' },
    hud: {
      position: 'absolute',
      top: topPad + 60,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      zIndex: 10,
      pointerEvents: 'none',
    },
    hudBox: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      alignItems: 'center',
    },
    hudLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_500Medium' },
    hudVal: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
    canvasWrapper: { flex: 1, width: '100%' },
    feedback: {
      position: 'absolute',
      bottom: 150,
      alignSelf: 'center',
      backgroundColor: '#3B82F6',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 12,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    controls: {
      paddingBottom: insets.bottom + 16,
      paddingHorizontal: 20,
      alignItems: 'center',
      gap: 12,
      zIndex: 10,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
      justifyContent: 'center',
    },
    btn: {
      flex: 1,
      maxWidth: 110,
      backgroundColor: '#2563EB',
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    instruction: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_500Medium' },
  });

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || matchState.status === 'matched'}
        searchSeconds={searchSeconds}
        opponentUsername={matchState.opponentUsername}
        stake={stake}
        gameName="Penalty Shootout 3D"
        isPractice={isPractice}
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
        <Text style={s.title}>⚽ Penalty 3D</Text>
        <View style={s.scorePill}>
          <Text style={s.scoreVal}>{playerScore} - {opponentScore}</Text>
        </View>
      </View>

      {/* HUD */}
      <View style={s.hud}>
        <View style={s.hudBox}>
          <Text style={s.hudLabel}>ROUND</Text>
          <Text style={s.hudVal}>{currentRound} / {TOTAL_ROUNDS}</Text>
        </View>
        <View style={s.hudBox}>
          <Text style={s.hudLabel}>ROLE</Text>
          <Text style={[s.hudVal, { color: role === 'kicker' ? '#38BDF8' : '#F59E0B' }]}>
            {role.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* 3D View */}
      <View style={s.canvasWrapper}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={s.controls}>
        <Text style={s.instruction}>
          {role === 'kicker' ? '🎯 Choose your kick placement:' : '🧤 Choose dive direction to save:'}
        </Text>
        <View style={s.actionRow}>
          <Pressable style={s.btn} onPress={() => handleAction('left')} disabled={animating}>
            <Text style={s.btnText}>👈 LEFT</Text>
          </Pressable>
          <Pressable style={s.btn} onPress={() => handleAction('center')} disabled={animating}>
            <Text style={s.btnText}>🎯 CENTER</Text>
          </Pressable>
          <Pressable style={s.btn} onPress={() => handleAction('right')} disabled={animating}>
            <Text style={s.btnText}>RIGHT 👉</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
