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

const MATCH_DURATION = 45; // 45-second arcade shootout matching Snapchat reference

export default function BasketballScreen() {
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
  } = useLiveMatch('basketball', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameReady, setGameReady] = useState(false);
  const [playerScore, setPlayerScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MATCH_DURATION);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isShooting, setIsShooting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });

  // Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const ballRef = useRef<THREE.Mesh | null>(null);
  const rimRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isFlyingRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const matchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerScoreRef = useRef(0);

  // AI score
  const aiScore = useRef(Math.floor(18 + Math.random() * 24));
  const aiTime = useRef(MATCH_DURATION * 1000);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // 1. Start matchmaking
  useEffect(() => {
    startSearching();
  }, [startSearching]);

  // 2. 4s opponent display → send GAME_START
  useEffect(() => {
    if (matchState.status === 'matched' && !hasSentStart.current) {
      hasSentStart.current = true;
      displayTimerRef.current = setTimeout(() => sendGameStart(), 4000);
      return () => { if (displayTimerRef.current) clearTimeout(displayTimerRef.current); };
    }
  }, [matchState.status, sendGameStart]);

  // 3. Game begins (starts 45s match countdown)
  useEffect(() => {
    if (matchState.status === 'playing' || matchState.status === 'offline_ai') {
      setGameReady(true);
      startTimeRef.current = Date.now();
      setTimeLeft(MATCH_DURATION);
      playerScoreRef.current = 0;
      setPlayerScore(0);

      if (matchTimerRef.current) clearInterval(matchTimerRef.current);
      matchTimerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            if (matchTimerRef.current) clearInterval(matchTimerRef.current);
            endGame();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => {
      if (matchTimerRef.current) clearInterval(matchTimerRef.current);
    };
  }, [matchState.status]);

  // 4. Authoritative game-over (multiplayer)
  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      if (matchTimerRef.current) clearInterval(matchTimerRef.current);
      const res = matchState.gameResult;
      finish(res.won, res.playerScore, res.opponentScore, 'pts', {
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  const endGame = useCallback(() => {
    if (matchTimerRef.current) clearInterval(matchTimerRef.current);
    const totalTime = Date.now() - startTimeRef.current;
    const score = playerScoreRef.current;
    setTimeout(() => {
      if (matchState.status === 'playing' && matchState.roomId) {
        submitFinalScore(score, totalTime, `${score} PTS`);
      } else {
        const won = score > aiScore.current;
        finish(won, score, aiScore.current, 'pts', {
          playerTimeMs: totalTime,
          aiTimeMs: aiTime.current,
        });
      }
    }, 600);
  }, [matchState.status, matchState.roomId, submitFinalScore, finish]);

  // Create court, hoop, backboard
  const buildScene = useCallback((scene: THREE.Scene) => {
    // Dark Chalkboard / Arena Back Wall as in reference screenshot
    const wallGeo = new THREE.PlaneGeometry(30, 24);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.9 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 5, -12.5);
    scene.add(wall);

    // Hardwood Floor at bottom foreground (as in screenshot)
    const floorGeo = new THREE.PlaneGeometry(16, 12);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.2, 0);
    scene.add(floor);

    // Primary Hoop (Top-Right as in screenshot)
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.3 }); // Red rim
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.75 });

    const rimGeo = new THREE.TorusGeometry(0.55, 0.04, 12, 32);
    const rim1 = new THREE.Mesh(rimGeo, rimMat);
    rim1.rotation.x = Math.PI / 2;
    rim1.position.set(1.4, 3.6, -8.0);
    scene.add(rim1);
    rimRef.current = rim1;

    const netGeo = new THREE.CylinderGeometry(0.55, 0.35, 1.1, 16, 3, true);
    const net1 = new THREE.Mesh(netGeo, netMat);
    net1.position.set(1.4, 3.05, -8.0);
    scene.add(net1);

    // Secondary Hoop (Lower-Left as in screenshot)
    const rim2 = new THREE.Mesh(rimGeo, rimMat);
    rim2.rotation.x = Math.PI / 2;
    rim2.position.set(-1.3, 1.2, -7.0);
    scene.add(rim2);

    const net2 = new THREE.Mesh(netGeo, netMat);
    net2.position.set(-1.3, 0.65, -7.0);
    scene.add(net2);

    // Foreground Stack of Basketballs (matching the bottom ball rack in the screenshot)
    const ballGeo = new THREE.SphereGeometry(0.65, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xe85d04, roughness: 0.65 });

    const createRackBall = (x: number, y: number, z: number) => {
      const b = new THREE.Mesh(ballGeo, ballMat);
      // Seam ring
      const seam = new THREE.Mesh(
        new THREE.TorusGeometry(0.652, 0.015, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x111827 })
      );
      b.add(seam);
      b.position.set(x, y, z);
      scene.add(b);
      return b;
    };

    createRackBall(-1.8, -0.6, 1.8);
    createRackBall(-0.6, -0.5, 2.2);
    createRackBall(1.1, -0.5, 2.0);
    createRackBall(2.0, -0.6, 1.6);

    // Active Shooting Ball (in flight / ready to shoot)
    const activeBall = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 24), ballMat);
    const activeSeam = new THREE.Mesh(
      new THREE.TorusGeometry(0.482, 0.012, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x111827 })
    );
    activeBall.add(activeSeam);
    activeBall.position.set(0, 0.8, -3.0);
    scene.add(activeBall);
    ballRef.current = activeBall;
  }, []);

  // 6. Setup Three.js scene
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 1.7, 8.5);
    camera.lookAt(0, 3.0, -11.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffeeff, 0x222244, 0.6));
    const spotA = new THREE.SpotLight(0xFFFFFF, 2.5, 30, Math.PI / 5, 0.4);
    spotA.position.set(-5, 12, -5);
    scene.add(spotA);
    const spotB = new THREE.SpotLight(0xFFFFFF, 2.5, 30, Math.PI / 5, 0.4);
    spotB.position.set(5, 12, -5);
    scene.add(spotB);

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

  // Shoot the ball
  const shootBall = useCallback((swipeDx: number, swipeDy: number) => {
    if (isFlyingRef.current || !gameReady || timeLeft <= 0) return;
    const ball = ballRef.current;
    const scene = sceneRef.current;
    if (!ball || !scene) return;

    isFlyingRef.current = true;
    setIsShooting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Normalise swipe into shot power/direction
    const power = Math.min(1.3, Math.max(0.4, -swipeDy / 130));
    const lateralBias = swipeDx / 180; // horizontal swipe offset

    // Choose target hoop: if swiping right, aim for upper right hoop; if swiping left, aim for lower left hoop
    const targetHoop = lateralBias >= 0
      ? new THREE.Vector3(1.4, 3.6, -8.0) // Upper right hoop
      : new THREE.Vector3(-1.3, 1.2, -7.0); // Lower left hoop

    const startPos = ball.position.clone();
    const flightDuration = 0.75;
    const startFlight = performance.now();

    // Accuracy condition
    const isGoodShot = power >= 0.65 && power <= 1.2;

    const animateBall = () => {
      const t = Math.min(1, (performance.now() - startFlight) / (flightDuration * 1000));
      const pos = new THREE.Vector3().lerpVectors(startPos, targetHoop, t);
      // Arc height
      pos.y += Math.sin(t * Math.PI) * (2.8 * power);
      ball.position.copy(pos);
      // Spin
      ball.rotation.x -= 0.1;

      if (t < 1) {
        requestAnimationFrame(animateBall);
      } else {
        if (isGoodShot) {
          const points = power > 1.0 ? 3 : 2;
          playerScoreRef.current += points;
          setPlayerScore(playerScoreRef.current);
          setFeedback(points === 3 ? '🎯 +3 SWISH!' : '🏀 +2 BASKET!');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setFeedback('MISS! 😬');
          ball.position.set(targetHoop.x + (Math.random() - 0.5) * 0.8, targetHoop.y - 0.4, targetHoop.z + 0.5);
        }

        setTimeout(() => setFeedback(null), 800);

        if (matchState.status === 'playing' && matchState.roomId) {
          sendProgress(playerScoreRef.current, playerScoreRef.current, Date.now() - startTimeRef.current);
        }

        // Fast reset for continuous rapid-fire shooting during 45s
        setTimeout(() => {
          if (ballRef.current) {
            ballRef.current.position.set(0, 0.8, -3.0);
            ballRef.current.rotation.set(0, 0, 0);
          }
          isFlyingRef.current = false;
          setIsShooting(false);
        }, 350);
      }
    };
    requestAnimationFrame(animateBall);
  }, [gameReady, matchState.status, matchState.roomId, sendProgress]);

  // Pointer/touch handlers
  const onPointerDown = (e: any) => {
    if (!gameReady || isFlyingRef.current || timeLeft <= 0) return;
    const ne = e.nativeEvent || e;
    const x = ne.touches ? ne.touches[0].clientX : ne.clientX;
    const y = ne.touches ? ne.touches[0].clientY : ne.clientY;
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    setIsDragging(true);
  };

  const onPointerMove = (e: any) => {
    if (!isDragging) return;
    const ne = e.nativeEvent || e;
    const x = ne.touches ? ne.touches[0].clientX : ne.clientX;
    const y = ne.touches ? ne.touches[0].clientY : ne.clientY;
    setDragCurrent({ x, y });
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const dx = dragCurrent.x - dragStart.x;
    const dy = dragCurrent.y - dragStart.y;
    // Only register if player swiped upward
    if (dy < -20) {
      shootBall(dx, dy);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a1a' },
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.1)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    scoreVal: { fontSize: 16, fontWeight: '700', color: '#FFB347', fontFamily: 'Inter_700Bold' },
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
    hudVal: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
    canvasWrapper: { flex: 1, width: '100%' },
    feedback: {
      position: 'absolute',
      bottom: 130,
      alignSelf: 'center',
      backgroundColor: '#FF6B00',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 12,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    swipeGuide: {
      paddingBottom: insets.bottom + 16,
      alignItems: 'center',
      zIndex: 10,
    },
    guideText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_500Medium' },
    arrow: {
      position: 'absolute',
      backgroundColor: 'rgba(255,107,0,0.4)',
      width: 4,
      borderRadius: 2,
      bottom: 0,
      zIndex: 5,
      pointerEvents: 'none',
    },
  });

  // Swipe arrow indicator height
  const swipeArrowHeight = isDragging ? Math.max(0, dragStart.y - dragCurrent.y) : 0;

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || (matchState.status === 'matched' && !gameReady)}
        gameTitle="🏀 Basketball 3D"
        stake={stake}
        searchSeconds={searchSeconds}
        playerUsername={user?.username || 'You'}
        opponentUsername={matchState.opponentUsername || 'Challenger'}
        isMatched={matchState.status === 'matched'}
        onCancel={() => { cancelSearch(); router.back(); }}
        onPlayBot={switchToBotMatch}
      />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={s.title}>🏀 Basketball 3D</Text>
        <View style={s.scorePill}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Score</Text>
          <Text style={s.scoreVal}>{playerScore}</Text>
        </View>
      </View>

      {/* Top Digital Timer Box matching Snapchat format */}
      <View style={{
        position: 'absolute',
        top: topPad + 45,
        alignSelf: 'center',
        backgroundColor: '#1e242b',
        borderWidth: 2,
        borderColor: '#374151',
        borderRadius: 14,
        paddingHorizontal: 20,
        paddingVertical: 8,
        alignItems: 'center',
        zIndex: 10,
        elevation: 6,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }}>TIME</Text>
        <Text style={{ fontSize: 36, fontWeight: '900', color: '#FFFFFF', fontFamily: 'monospace' }}>{timeLeft}</Text>
      </View>

      {/* Red Points Banner on the right matching Snapchat format */}
      <View style={{
        position: 'absolute',
        top: topPad + 180,
        right: 0,
        backgroundColor: '#dc2626',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderTopLeftRadius: 10,
        borderBottomLeftRadius: 10,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        zIndex: 10,
        elevation: 6,
      }}>
        <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{playerScore}</Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 }}>PTS</Text>
      </View>

      {/* 3D Canvas */}
      <View
        style={s.canvasWrapper}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div ref={mountRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

        {/* Swipe arrow indicator */}
        {isDragging && swipeArrowHeight > 10 && (
          <View style={[s.arrow, {
            left: dragStart.x - 2,
            height: swipeArrowHeight,
            bottom: undefined,
            top: dragCurrent.y,
          }]} />
        )}
      </View>

      {/* Feedback */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Bottom guide */}
      <View style={s.swipeGuide}>
        <Text style={s.guideText}>
          {isShooting ? '🏀 Shot in flight...' : '👆 Swipe UP to shoot!'}
        </Text>
      </View>
    </View>
  );
}
