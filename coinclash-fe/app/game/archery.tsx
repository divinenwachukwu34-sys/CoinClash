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

const TOTAL_ARROWS = 5;

// Ring scores based on distance from center
const RING_SCORES = [
  { radius: 0.18, score: 10, label: 'BULLSEYE 10! 🎯' },
  { radius: 0.38, score: 8, label: 'GREAT 8! 🔥' },
  { radius: 0.62, score: 6, label: 'GOOD 6 👍' },
  { radius: 0.88, score: 4, label: 'HIT 4 🏹' },
  { radius: 1.18, score: 2, label: 'OUTER 2 ⚪' },
];

export default function ArcheryScreen() {
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
  } = useLiveMatch('archery', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gameplay state
  const [gameReady, setGameReady] = useState(false);
  const [arrowsLeft, setArrowsLeft] = useState(TOTAL_ARROWS);
  const [playerScore, setPlayerScore] = useState(0);
  const [hitFeedback, setHitFeedback] = useState<string | null>(null);
  const [wind, setWind] = useState({ x: 0, y: 0 });
  const [crosshairPos, setCrosshairPos] = useState({ x: 0, y: 0 });
  const [clearedTargets, setClearedTargets] = useState<number[]>([]);

  // Canvas & Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const currentArrowRef = useRef<THREE.Group | null>(null);
  const arrowsGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Aiming coordinates (-1 to 1)
  const aimRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isFlyingRef = useRef(false);
  const startTime = useRef(Date.now());

  const aiScore = useRef(_isPractice ? Math.floor(26 + Math.random() * 16) : Math.floor(34 + Math.random() * 14));
  const aiTime = useRef(TOTAL_ARROWS * 3500 + Math.random() * 4000);

  const topPad = Platform.OS === 'web' ? 50 : insets.top;

  const generateWind = useCallback(() => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 1.2;
    const wx = Math.cos(angle) * speed;
    const wy = Math.sin(angle) * speed * 0.5;
    setWind({ x: parseFloat(wx.toFixed(1)), y: parseFloat(wy.toFixed(1)) });
  }, []);

  useEffect(() => {
    startSearching();
  }, [startSearching]);

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

  useEffect(() => {
    if (matchState.status === 'playing' || matchState.status === 'offline_ai') {
      setGameReady(true);
      startTime.current = Date.now();
      generateWind();
    }
  }, [matchState.status, generateWind]);

  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      const res = matchState.gameResult;
      finish(res.won, res.playerScore, res.opponentScore, 'pts', {
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  // Helper: Create 3D Arrow
  const createArrow = () => {
    const group = new THREE.Group();

    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.016, 0.016, 1.3, 8);
    shaftGeo.rotateX(Math.PI / 2);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.6 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    group.add(shaft);

    // Steel Tip
    const tipGeo = new THREE.ConeGeometry(0.04, 0.14, 8);
    tipGeo.rotateX(Math.PI / 2);
    tipGeo.translate(0, 0, 0.72);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    group.add(tip);

    // Red Feathers (fletching)
    const featherGeo = new THREE.BoxGeometry(0.01, 0.09, 0.2);
    featherGeo.translate(0, 0, -0.55);
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const f1 = new THREE.Mesh(featherGeo, featherMat);
    const f2 = f1.clone();
    f2.rotateZ(Math.PI / 2);
    group.add(f1);
    group.add(f2);

    return group;
  };

  // Helper: Create Authentic Olympic Archery Target (concentric colored rings)
  const createOlympicTarget = () => {
    const group = new THREE.Group();

    // White Outer Boss / Backing with bevel
    const backGeo = new THREE.CylinderGeometry(1.22, 1.22, 0.08, 36);
    backGeo.rotateX(Math.PI / 2);
    const backMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    group.add(backMesh);

    // Olympic Rings from outside to inside: White, Black, Cyan-Blue, Red, Yellow (Gold)
    const rings = [
      { r: 1.18, color: 0xffffff }, // White outer rim
      { r: 0.88, color: 0x111827 }, // Black
      { r: 0.62, color: 0x0284c7 }, // Cyan Blue
      { r: 0.38, color: 0xdc2626 }, // Red
      { r: 0.18, color: 0xfacc15 }, // Yellow Gold (Bullseye)
    ];

    rings.forEach(({ r, color }, i) => {
      const ringGeo = new THREE.CylinderGeometry(r, r, 0.012, 36);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.position.set(0, 0, 0.045 + i * 0.005);
      group.add(mesh);
    });

    // Inner cross mark on bullseye
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.01), crossMat);
    crossH.position.set(0, 0, 0.075);
    group.add(crossH);

    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.01), crossMat);
    crossV.position.set(0, 0, 0.075);
    group.add(crossV);

    return group;
  };

  // 5. Setup WebGL 3D Scene
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0e); // Dark room background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(54, width / height, 0.1, 100);
    camera.position.set(0, 0, 6.4);
    camera.lookAt(0, 0, -6.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Dark Room Ambient Light
    const ambient = new THREE.AmbientLight(0x222233, 0.4);
    scene.add(ambient);

    // Camera Flashlight Beam Spotlight focused on the targets
    const flashLight = new THREE.SpotLight(0xffffff, 4.5, 30, Math.PI / 4, 0.5);
    flashLight.position.set(0, 0, 6.2);
    flashLight.target.position.set(0, 0, -6.0);
    scene.add(flashLight);
    scene.add(flashLight.target);

    // Dark Wall behind targets
    const wallGeo = new THREE.PlaneGeometry(30, 24);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.95 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 0, -6.2);
    scene.add(wall);

    // 2x2 Grid of 4 Archery Targets exactly as in Snapchat screenshot
    const targetSpacing = 1.35;
    const tPositions = [
      { x: -targetSpacing, y: targetSpacing }, // 0: Top-Left
      { x: targetSpacing, y: targetSpacing },  // 1: Top-Right
      { x: -targetSpacing, y: -targetSpacing }, // 2: Bottom-Left
      { x: targetSpacing, y: -targetSpacing },  // 3: Bottom-Right
    ];

    tPositions.forEach((pos) => {
      const target = createOlympicTarget();
      target.position.set(pos.x, pos.y, -6.0);
      scene.add(target);
    });

    // Arrow ready at bow/shutter position
    const arrow = createArrow();
    arrow.position.set(0, -1.8, 4.2);
    scene.add(arrow);
    currentArrowRef.current = arrow;

    // Group for stuck arrows
    const stuckGroup = new THREE.Group();
    scene.add(stuckGroup);
    arrowsGroupRef.current = stuckGroup;

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
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
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      renderer.dispose();
    };
  }, []);

  // Fire Arrow with Ballistic trajectory into the aimed target
  const fireArrow = useCallback(() => {
    if (isFlyingRef.current || arrowsLeft <= 0 || !gameReady) return;

    isFlyingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const arrow = currentArrowRef.current;
    if (!arrow || !sceneRef.current) return;

    const startPos = new THREE.Vector3(0, -1.8, 4.2);

    // Target aimed position with slight wind deflection
    const targetX = aimRef.current.x * 2.8 + wind.x * 0.12;
    const targetY = aimRef.current.y * 2.8 + wind.y * 0.12;
    const targetPos = new THREE.Vector3(targetX, targetY, -5.9);

    const startTimeFlight = performance.now();
    const flightDuration = 450; // fast snappy arrow flight

    const animateFlight = () => {
      const now = performance.now();
      const p = Math.min(1, (now - startTimeFlight) / flightDuration);

      const pos = new THREE.Vector3().lerpVectors(startPos, targetPos, p);
      pos.y += Math.sin(p * Math.PI) * 0.35;
      arrow.position.copy(pos);
      arrow.lookAt(targetPos);

      if (p < 1) {
        requestAnimationFrame(animateFlight);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Determine which of the 4 targets was closest
        const targetSpacing = 1.35;
        const targets = [
          { id: 0, x: -targetSpacing, y: targetSpacing },
          { id: 1, x: targetSpacing, y: targetSpacing },
          { id: 2, x: -targetSpacing, y: -targetSpacing },
          { id: 3, x: targetSpacing, y: -targetSpacing },
        ];

        let closestTarget = targets[0];
        let minDist = 999;
        targets.forEach((t) => {
          const d = Math.hypot(targetX - t.x, targetY - t.y);
          if (d < minDist) {
            minDist = d;
            closestTarget = t;
          }
        });

        // Calculate score from center of closest target
        let roundScore = 0;
        let scoreLabel = 'MISS 😬';
        for (const ring of RING_SCORES) {
          if (minDist <= ring.radius) {
            roundScore = ring.score;
            scoreLabel = ring.label;
            break;
          }
        }

        const newScore = playerScore + roundScore;
        setPlayerScore(newScore);
        setHitFeedback(scoreLabel);

        if (roundScore >= 6) {
          setClearedTargets((prev) => (prev.includes(closestTarget.id) ? prev : [...prev, closestTarget.id]));
        }

        setTimeout(() => setHitFeedback(null), 900);

        // Leave arrow stuck in wall/target
        const stuckArrow = createArrow();
        stuckArrow.position.copy(targetPos);
        stuckArrow.position.z += 0.4;
        stuckArrow.lookAt(targetPos);
        if (arrowsGroupRef.current) {
          arrowsGroupRef.current.add(stuckArrow);
        }

        const remaining = arrowsLeft - 1;
        setArrowsLeft(remaining);

        if (matchState.status === 'playing' && matchState.roomId) {
          sendProgress(TOTAL_ARROWS - remaining, newScore, Date.now() - startTime.current);
        }

        if (remaining <= 0) {
          // Game Over
          const totalTime = Date.now() - startTime.current;
          setTimeout(() => {
            if (matchState.status === 'playing' && matchState.roomId) {
              submitFinalScore(newScore, totalTime, `${newScore} PTS`);
            } else {
              const won = newScore > aiScore.current;
              finish(won, newScore, aiScore.current, 'pts', {
                playerTimeMs: totalTime,
                aiTimeMs: aiTime.current,
              });
            }
          }, 800);
        } else {
          // Reload next arrow
          generateWind();
          setTimeout(() => {
            if (currentArrowRef.current) {
              currentArrowRef.current.position.set(0, -1.8, 4.2);
              currentArrowRef.current.rotation.set(0, 0, 0);
            }
            isFlyingRef.current = false;
          }, 350);
        }
      }
    };
    requestAnimationFrame(animateFlight);
  }, [arrowsLeft, gameReady, generateWind, matchState.status, matchState.roomId, playerScore, sendProgress, submitFinalScore, finish, wind]);

  // Pointer drag to aim reticle
  const handlePointerDown = (e: any) => {
    if (isFlyingRef.current || !gameReady) return;
    isDraggingRef.current = true;
    updateAim(e);
  };

  const handlePointerMove = (e: any) => {
    if (!isDraggingRef.current) return;
    updateAim(e);
  };

  const updateAim = (e: any) => {
    const ne = e.nativeEvent || e;
    const clientX = ne.clientX ?? (ne.touches ? ne.touches[0].clientX : 0);
    const clientY = ne.clientY ?? (ne.touches ? ne.touches[0].clientY : 0);

    const w = window.innerWidth || 360;
    const h = window.innerHeight || 600;

    const normX = Math.max(-1, Math.min(1, (clientX / w - 0.5) * 2));
    const normY = Math.max(-1, Math.min(1, -(clientY / h - 0.5) * 2));

    aimRef.current = { x: normX, y: normY };
    setCrosshairPos({ x: clientX, y: clientY });
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0e' },
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
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    canvasWrapper: { flex: 1, width: '100%' },
    feedback: {
      position: 'absolute',
      bottom: 180,
      alignSelf: 'center',
      backgroundColor: '#ef4444',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 25,
      shadowColor: '#000',
      shadowOpacity: 0.6,
      shadowRadius: 10,
      elevation: 8,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontFamily: 'Inter_700Bold' },
  });

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || (matchState.status === 'matched' && !gameReady)}
        gameTitle="🎯 Archery Target Rush"
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

      {/* Top 4 Target Indicator Glassmorphic Cards matching Snapchat reference */}
      <View
        style={{
          position: 'absolute',
          top: topPad + 45,
          left: 20,
          right: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          zIndex: 15,
          pointerEvents: 'none',
        }}
      >
        {[0, 1, 2, 3].map((idx) => {
          const isCleared = clearedTargets.includes(idx);
          return (
            <View
              key={idx}
              style={{
                width: 66,
                height: 94,
                borderRadius: 16,
                backgroundColor: isCleared ? 'rgba(34, 197, 94, 0.35)' : 'rgba(30, 41, 59, 0.65)',
                borderWidth: 2,
                borderColor: isCleared ? '#22c55e' : 'rgba(255, 255, 255, 0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: isCleared ? '#22c55e' : '#000',
                shadowOpacity: 0.5,
                shadowRadius: 8,
              }}
            >
              <Text style={{ fontSize: 26 }}>{isCleared ? '🎯' : ''}</Text>
            </View>
          );
        })}
      </View>

      {/* 3D WebGL Canvas Layer */}
      <View
        style={s.canvasWrapper}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div ref={mountRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

        {/* Dynamic Red Tactical Aim Crosshair matching reference */}
        {crosshairPos.x > 0 && (
          <View
            style={{
              position: 'absolute',
              left: crosshairPos.x - 28,
              top: crosshairPos.y - 28,
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 3,
              borderColor: '#ef4444',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 18,
            }}
          >
            {/* Center tick dot */}
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
            {/* Horizontal & vertical tick marks */}
            <View
              style={{
                position: 'absolute',
                width: 50,
                height: 2,
                backgroundColor: 'rgba(239, 68, 68, 0.75)',
              }}
            />
            <View
              style={{
                position: 'absolute',
                height: 50,
                width: 2,
                backgroundColor: 'rgba(239, 68, 68, 0.75)',
              }}
            />
          </View>
        )}
      </View>

      {/* Feedback Banner */}
      {hitFeedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{hitFeedback}</Text>
        </View>
      )}

      {/* Bottom Shutter Trigger Button matching Snapchat camera interface */}
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
          onPress={fireArrow}
          style={({ pressed }) => [
            {
              width: 82,
              height: 82,
              borderRadius: 41,
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              borderWidth: 4,
              borderColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.6,
              shadowRadius: 10,
              elevation: 10,
            },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
          disabled={isFlyingRef.current || arrowsLeft <= 0}
        >
          {/* Olympic Target Shutter Icon */}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#0284c7',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#111827',
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: '#dc2626',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#facc15' }} />
            </View>
          </View>
        </Pressable>
        <Text
          style={{
            marginTop: 8,
            fontSize: 12,
            fontWeight: '800',
            color: 'rgba(255, 255, 255, 0.8)',
            letterSpacing: 1,
          }}
        >
          {arrowsLeft > 0 ? `DRAG TO AIM • TAP TO SHOOT (${arrowsLeft} LEFT)` : 'MATCH FINISHED'}
        </Text>
      </View>
    </View>
  );
}
