import { useAuth } from '@/context/AuthContext';
import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { useLiveMatch } from '@/hooks/useLiveMatch';
import { MatchmakingModal } from '@/components/MatchmakingModal';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';

const TOTAL_ARROWS = 5;

// Ring scores based on distance from center
const RING_SCORES = [
  { radius: 0.15, score: 10, label: 'BULLSEYE 10!' },
  { radius: 0.35, score: 8, label: 'GREAT 8' },
  { radius: 0.6, score: 6, label: 'GOOD 6' },
  { radius: 0.85, score: 4, label: 'HIT 4' },
  { radius: 1.15, score: 2, label: 'OUTER 2' },
];

export default function ArcheryScreen() {
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
  } = useLiveMatch('archery', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gameplay state
  const [gameReady, setGameReady] = useState(false);
  const [arrowsLeft, setArrowsLeft] = useState(TOTAL_ARROWS);
  const [playerScore, setPlayerScore] = useState(0);
  const [hitFeedback, setHitFeedback] = useState<string | null>(null);
  const [wind, setWind] = useState({ x: 0, y: 0 }); // wind offset drift per round
  const [isAiming, setIsAiming] = useState(false);

  // Canvas & Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const bowGroupRef = useRef<THREE.Group | null>(null);
  const currentArrowRef = useRef<THREE.Group | null>(null);
  const arrowsGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Aiming coordinates (-1 to 1)
  const aimRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isFlyingRef = useRef(false);
  const startTime = useRef(Date.now());

  // Calibrated AI opponent score (typically 26-44 out of 50)
  const aiScore = useRef(isPractice ? Math.floor(24 + Math.random() * 16) : Math.floor(32 + Math.random() * 15));
  const aiTime = useRef(TOTAL_ARROWS * 3500 + Math.random() * 4000);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // New random wind each arrow
  const generateWind = useCallback(() => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;
    const wx = Math.cos(angle) * speed;
    const wy = Math.sin(angle) * speed * 0.5;
    setWind({ x: parseFloat(wx.toFixed(1)), y: parseFloat(wy.toFixed(1)) });
  }, []);

  // 1. Start matchmaking on mount
  useEffect(() => {
    startSearching();
  }, [startSearching]);

  // 2. Opponent display 4 seconds handshake
  useEffect(() => {
    if (matchState.status === 'matched' && !hasSentStart.current) {
      hasSentStart.current = true;
      displayTimerRef.current = setTimeout(() => {
        sendGameStart();
      }, 4000);
      return () => {
        if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
      };
    }
  }, [matchState.status, sendGameStart]);

  // 3. When game begins
  useEffect(() => {
    if (matchState.status === 'playing' || matchState.status === 'offline_ai') {
      setGameReady(true);
      startTime.current = Date.now();
      generateWind();
    }
  }, [matchState.status, generateWind]);

  // 4. Handle authoritative GAME_OVER in multiplayer
  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      const res = matchState.gameResult;
      finish(res.won, res.playerTimeMs, res.opponentTimeMs, 'pts', {
        playerScore: res.playerScore,
        aiScore: res.opponentScore,
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  // Helper: Create 3D Arrow
  const createArrow = () => {
    const group = new THREE.Group();

    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8);
    shaftGeo.rotateX(Math.PI / 2);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.6 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    group.add(shaft);

    // Tip
    const tipGeo = new THREE.ConeGeometry(0.035, 0.12, 8);
    tipGeo.rotateX(Math.PI / 2);
    tipGeo.translate(0, 0, 0.65);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, metalness: 0.8, roughness: 0.2 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    group.add(tip);

    // Fletching (feathers)
    const featherGeo = new THREE.BoxGeometry(0.01, 0.08, 0.18);
    featherGeo.translate(0, 0, -0.5);
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xEF4444 });
    const f1 = new THREE.Mesh(featherGeo, featherMat);
    const f2 = f1.clone();
    f2.rotateZ(Math.PI / 2);
    group.add(f1);
    group.add(f2);

    return group;
  };

  // Helper: Create 3D Bow
  const createBow = () => {
    const group = new THREE.Group();

    // Bow stave (curved tube / segmented cylinder)
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, -0.7, 0),
      new THREE.Vector3(0.15, 0, -0.15),
      new THREE.Vector3(0, 0.7, 0)
    );
    const staveGeo = new THREE.TubeGeometry(curve, 20, 0.025, 8, false);
    const staveMat = new THREE.MeshStandardMaterial({ color: 0x4A2E12, roughness: 0.5 });
    const stave = new THREE.Mesh(staveGeo, staveMat);
    group.add(stave);

    // Bowstring
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.7, 0),
      new THREE.Vector3(0, 0, 0.02),
      new THREE.Vector3(0, 0.7, 0),
    ]);
    const stringMat = new THREE.LineBasicMaterial({ color: 0xE5E7EB, linewidth: 2 });
    const stringLine = new THREE.Line(stringGeo, stringMat);
    group.add(stringLine);

    return group;
  };

  // Helper: Create 3D Archery Target with rings
  const createTarget = () => {
    const group = new THREE.Group();

    // Stand legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5C3A21 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.5, 0.5, -0.2);
    legL.rotation.z = 0.25;
    legL.rotation.x = -0.15;
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.5, 0.5, -0.2);
    legR.rotation.z = -0.25;
    legR.rotation.x = -0.15;
    const legBack = new THREE.Mesh(legGeo, legMat);
    legBack.position.set(0, 0.5, 0.4);
    legBack.rotation.x = 0.35;
    group.add(legL);
    group.add(legR);
    group.add(legBack);

    // Target boss backing (straw circle)
    const backGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.15, 32);
    backGeo.rotateX(Math.PI / 2);
    const backMat = new THREE.MeshStandardMaterial({ color: 0xD4A373, roughness: 0.9 });
    const backing = new THREE.Mesh(backGeo, backMat);
    backing.position.set(0, 1.5, 0);
    group.add(backing);

    // Scoring Rings (facing Z = -0.08)
    const rings = [
      { r: 1.15, color: 0xF3F4F6 }, // White (1-2)
      { r: 0.85, color: 0x1F2937 }, // Black (3-4)
      { r: 0.6, color: 0x3B82F6 },  // Blue (5-6)
      { r: 0.35, color: 0xEF4444 }, // Red (7-8)
      { r: 0.15, color: 0xFBBF24 }, // Gold (9-10)
    ];

    rings.forEach(({ r, color }, i) => {
      const ringGeo = new THREE.CylinderGeometry(r, r, 0.01, 32);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.position.set(0, 1.5, -0.08 - i * 0.005);
      group.add(mesh);
    });

    return group;
  };

  // 5. Setup WebGL 3D Scene
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a051b);
    scene.fog = new THREE.FogExp2(0x0a051b, 0.035);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 6.2);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e1533, 0.9);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Ground grass field
    const groundGeo = new THREE.PlaneGeometry(30, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x14532D, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Archery range distance markers
    for (let z = 0; z < 5; z++) {
      const lineGeo = new THREE.PlaneGeometry(12, 0.08);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x22C55E, transparent: true, opacity: 0.35 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, -0.09, z * -2.5 + 4);
      scene.add(line);
    }

    // 2x2 Grid of 4 Archery Targets as in reference screenshot
    const tPositions = [
      { x: -1.4, y: 1.0 }, // Top-Left
      { x: 1.4, y: 1.0 },  // Top-Right
      { x: -1.4, y: -1.4 }, // Bottom-Left
      { x: 1.4, y: -1.4 },  // Bottom-Right
    ];

    tPositions.forEach((pos) => {
      const target = createTarget();
      target.position.set(pos.x, pos.y, -6);
      scene.add(target);
    });

    // Bow placed near player view
    const bow = createBow();
    bow.position.set(0.35, 1.25, 4.8);
    bow.rotation.y = -0.15;
    scene.add(bow);
    bowGroupRef.current = bow;

    // Current active nocked arrow
    const currentArrow = createArrow();
    currentArrow.position.set(0.35, 1.25, 4.8);
    scene.add(currentArrow);
    currentArrowRef.current = currentArrow;

    // Arrows stuck in target group
    const stuckArrows = new THREE.Group();
    scene.add(stuckArrows);
    arrowsGroupRef.current = stuckArrows;

    // Animation Loop
    let lastTime = performance.now();
    const animate = (time: number) => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Gentle idle sway of bow when aiming
      if (bowGroupRef.current && !isFlyingRef.current) {
        const aim = aimRef.current;
        bowGroupRef.current.position.x = 0.35 + aim.x * 0.4;
        bowGroupRef.current.position.y = 1.25 + aim.y * 0.35;
        if (currentArrowRef.current) {
          currentArrowRef.current.position.copy(bowGroupRef.current.position);
          currentArrowRef.current.rotation.y = aim.x * -0.12;
          currentArrowRef.current.rotation.x = aim.y * 0.12;
        }
      }

      renderer.render(scene, camera);
    };
    animate(performance.now());

    // Window resize handler
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
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      renderer.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Fire Arrow with 3D Ballistic Trajectory & Wind Drift
  const fireArrow = useCallback(() => {
    if (isFlyingRef.current || arrowsLeft <= 0 || !gameReady) return;

    isFlyingRef.current = true;
    setIsAiming(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const arrow = currentArrowRef.current;
    if (!arrow || !sceneRef.current) return;

    // Start position (at bow)
    const startPos = arrow.position.clone();
    // Calculate final impact target on target face (Z = -6)
    // Wind drift influences horizontal & vertical landing
    const aim = aimRef.current;
    const impactX = aim.x * 1.35 + wind.x * 0.35;
    const impactY = 1.5 + aim.y * 1.35 + wind.y * 0.25;
    const targetPos = new THREE.Vector3(impactX, impactY, -6);

    const flightDuration = 0.65; // 650ms flight
    const startTimeFlight = performance.now();

    const animateFlight = () => {
      const now = performance.now();
      const progress = Math.min(1, (now - startTimeFlight) / (flightDuration * 1000));

      // Quadratic bezier arc in Y
      const currentPos = new THREE.Vector3().lerpVectors(startPos, targetPos, progress);
      currentPos.y += Math.sin(progress * Math.PI) * 0.35; // ballistic arc rise
      arrow.position.copy(currentPos);

      // Rotate arrow along velocity direction
      const dx = targetPos.x - startPos.x;
      const dy = (targetPos.y - startPos.y) + Math.cos(progress * Math.PI) * 0.35;
      const dz = targetPos.z - startPos.z;
      arrow.rotation.x = Math.atan2(dy, -dz);
      arrow.rotation.y = Math.atan2(dx, -dz);

      if (progress < 1) {
        requestAnimationFrame(animateFlight);
      } else {
        // Impact on target!
        arrow.position.copy(targetPos);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Calculate score from center of target (X=0, Y=1.5)
        const dist = Math.sqrt(impactX * impactX + (impactY - 1.5) * (impactY - 1.5));
        let points = 0;
        let label = 'MISS 0';

        for (const ring of RING_SCORES) {
          if (dist <= ring.radius) {
            points = ring.score;
            label = ring.label;
            break;
          }
        }

        setHitFeedback(label);
        setTimeout(() => setHitFeedback(null), 1200);

        const newScore = playerScore + points;
        const newArrows = arrowsLeft - 1;
        setPlayerScore(newScore);
        setArrowsLeft(newArrows);

        // Broadcast progress in live match
        if (matchState.status === 'matched' && matchState.roomId) {
          sendProgress(TOTAL_ARROWS - newArrows, newScore, Date.now() - startTime.current);
        }

        // Leave arrow stuck in target & spawn fresh nocked arrow
        if (arrowsGroupRef.current) {
          const stuck = createArrow();
          stuck.position.copy(targetPos);
          stuck.rotation.copy(arrow.rotation);
          arrowsGroupRef.current.add(stuck);
        }

        // Check if finished
        if (newArrows <= 0) {
          const totalTime = Date.now() - startTime.current;
          setTimeout(() => {
            if (matchState.status === 'matched' && matchState.roomId) {
              submitFinalScore(newScore, totalTime, `${newScore}/${TOTAL_ARROWS * 10}`);
            } else {
              // Practice / Offline bot resolution
              const won = newScore > aiScore.current || (newScore === aiScore.current && totalTime < aiTime.current);
              finish(won, totalTime, aiTime.current, 'pts', {
                playerScore: newScore,
                aiScore: aiScore.current,
                playerTimeMs: totalTime,
                aiTimeMs: aiTime.current,
              });
            }
          }, 800);
        } else {
          // Reset nocked arrow for next round
          setTimeout(() => {
            if (bowGroupRef.current && arrow) {
              arrow.position.copy(bowGroupRef.current.position);
              arrow.rotation.set(0, 0, 0);
              generateWind();
              isFlyingRef.current = false;
            }
          }, 400);
        }
      }
    };

    requestAnimationFrame(animateFlight);
  }, [arrowsLeft, gameReady, playerScore, wind, matchState.status, matchState.roomId, sendProgress, submitFinalScore, finish, generateWind]);

  // Touch & Pointer Aim Controls
  const handlePointerDown = (e: any) => {
    if (isFlyingRef.current || arrowsLeft <= 0 || !gameReady) return;
    isDraggingRef.current = true;
    setIsAiming(true);
  };

  const handlePointerMove = (e: any) => {
    if (!isDraggingRef.current || isFlyingRef.current) return;
    const nativeEvent = e.nativeEvent || e;
    const clientX = nativeEvent.touches ? nativeEvent.touches[0].clientX : nativeEvent.clientX;
    const clientY = nativeEvent.touches ? nativeEvent.touches[0].clientY : nativeEvent.clientY;

    if (mountRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      const normX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      aimRef.current = {
        x: Math.max(-1, Math.min(1, normX)),
        y: Math.max(-1, Math.min(1, normY)),
      };
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    fireArrow();
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#090514' },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 10,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    scorePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scoreVal: { fontSize: 16, fontWeight: '700', color: colors.gold, fontFamily: 'Inter_700Bold' },
    hudOverlay: {
      position: 'absolute',
      top: topPad + 60,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 10,
      pointerEvents: 'none',
    },
    windBox: {
      backgroundColor: 'rgba(17, 24, 39, 0.85)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    windText: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    arrowsLeftRow: { flexDirection: 'row', gap: 6 },
    arrowPip: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.muted },
    arrowPipActive: { backgroundColor: colors.primary },
    canvasWrapper: {
      flex: 1,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    crosshairContainer: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2.5,
      borderColor: '#ef4444', // Bright red tactical reticle as in reference screenshot
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 5,
    },
    crosshairDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
    feedbackBanner: {
      position: 'absolute',
      bottom: 120,
      alignSelf: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 24,
      zIndex: 12,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    bottomGuide: {
      paddingBottom: insets.bottom + 16,
      alignItems: 'center',
      gap: 4,
      zIndex: 10,
    },
    guideText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
  });

  return (
    <View style={s.container}>
      {/* Matchmaking Modal */}
      <MatchmakingModal
        visible={matchState.status === 'searching' || matchState.status === 'matched'}
        searchSeconds={searchSeconds}
        opponentUsername={matchState.opponentUsername}
        stake={stake}
        gameName="Archery Challenge 3D"
        isPractice={isPractice}
        onCancel={() => {
          cancelSearch();
          router.back();
        }}
        onPlayBot={switchToBotMatch}
      />

      {/* Top Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>🎯 Archery 3D</Text>
        <View style={s.scorePill}>
          <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Score</Text>
          <Text style={s.scoreVal}>{playerScore}</Text>
        </View>
      </View>

      {/* HUD Info: Wind & Arrows Left */}
      <View style={s.hudOverlay}>
        <View style={s.windBox}>
          <Text style={s.windText}>💨 Wind: {wind.x > 0 ? `+${wind.x}` : wind.x} X | {wind.y > 0 ? `+${wind.y}` : wind.y} Y</Text>
          <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Aim offset accounts for wind</Text>
        </View>

        <View style={s.arrowsLeftRow}>
          {Array.from({ length: TOTAL_ARROWS }).map((_, i) => (
            <View key={i} style={[s.arrowPip, i < arrowsLeft && s.arrowPipActive]} />
          ))}
        </View>
      </View>

      {/* 3D WebGL Canvas Layer */}
      <View
        style={s.canvasWrapper}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div ref={mountRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

        {/* Dynamic Aim Crosshair */}
        <View style={s.crosshairContainer}>
          <View style={s.crosshairDot} />
        </View>
      </View>

      {/* Impact Score Feedback Banner */}
      {hitFeedback && (
        <View style={s.feedbackBanner}>
          <Text style={s.feedbackText}>{hitFeedback}</Text>
        </View>
      )}

      {/* Bottom Instructions */}
      <View style={s.bottomGuide}>
        <Text style={s.guideText}>
          {isAiming ? '🎯 Aiming... Release to shoot!' : '👆 Drag on screen to aim, release to shoot'}
        </Text>
      </View>
    </View>
  );
}
