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
  const ballRef = useRef<THREE.Group | null>(null);
  const net1Ref = useRef<THREE.Mesh | null>(null);
  const net2Ref = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isFlyingRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const matchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerScoreRef = useRef(0);

  // AI score
  const aiScore = useRef(Math.floor(18 + Math.random() * 24));
  const aiTime = useRef(MATCH_DURATION * 1000);

  const topPad = Platform.OS === 'web' ? 50 : insets.top;

  // 1. Start matchmaking
  useEffect(() => {
    startSearching();
  }, [startSearching]);

  // 2. 4s opponent display → send GAME_START
  useEffect(() => {
    if (matchState.status === 'matched' && !hasSentStart.current) {
      hasSentStart.current = true;
      displayTimerRef.current = setTimeout(() => sendGameStart(), 4000);
      return () => {
        if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
      };
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
        setTimeLeft((t) => {
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

  // Helper: Create Realistic Textured Basketball
  const createBasketballMesh = (radius: number) => {
    const group = new THREE.Group();

    // High quality orange rubber sphere with specular sheen
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xeb6418,
      roughness: 0.45,
      metalness: 0.08,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 28), ballMat);
    group.add(sphere);

    // Realistic black rubber seam ribs
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

    // Equator seam
    const equator = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.002, radius * 0.024, 8, 36), seamMat);
    group.add(equator);

    // Meridian seam
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.002, radius * 0.024, 8, 36), seamMat);
    meridian.rotation.y = Math.PI / 2;
    group.add(meridian);

    // Curved side seams
    const sideCurve1 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.88, radius * 0.02, 8, 32), seamMat);
    sideCurve1.position.set(radius * 0.48, 0, 0);
    sideCurve1.rotation.y = Math.PI / 2;
    group.add(sideCurve1);

    const sideCurve2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.88, radius * 0.02, 8, 32), seamMat);
    sideCurve2.position.set(-radius * 0.48, 0, 0);
    sideCurve2.rotation.y = Math.PI / 2;
    group.add(sideCurve2);

    return group;
  };

  // Helper: Create Chalkboard Texture with "GO!" Watermark
  const createChalkboardTexture = () => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Dark grey-blue gradient chalkboard background
    const grad = ctx.createRadialGradient(512, 450, 80, 512, 512, 700);
    grad.addColorStop(0, '#2c3540');
    grad.addColorStop(0.5, '#1e252e');
    grad.addColorStop(1, '#11161d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Faint embossed "GO!" watermark in center (matching reference screenshot)
    ctx.font = '900 italic 280px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fillText('GO!', 512, 480);

    // Chalk noise speckles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 4000; i++) {
      const rx = Math.random() * 1024;
      const ry = Math.random() * 1024;
      ctx.fillRect(rx, ry, 1.5, 1.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  // Helper: Create Parquet Court Floor Texture
  const createCourtTexture = () => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Rich honey oak parquet floor
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, 0, 1024, 1024);

    // Wood planks
    const plankHeight = 32;
    for (let y = 0; y < 1024; y += plankHeight) {
      const shade = (y / plankHeight) % 2 === 0 ? '#d97706' : '#c2410c';
      ctx.fillStyle = shade;
      ctx.fillRect(0, y, 1024, plankHeight - 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, y + plankHeight - 2, 1024, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };

  // Create court, dual hoops, and basketball rack
  const buildScene = useCallback((scene: THREE.Scene) => {
    // 1. Dark Chalkboard / Arena Back Wall with GO! watermark
    const wallTex = createChalkboardTexture();
    const wallGeo = new THREE.PlaneGeometry(32, 26);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex || undefined,
      color: wallTex ? 0xffffff : 0x1e252e,
      roughness: 0.9,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 5, -12.5);
    scene.add(wall);

    // 2. Hardwood Parquet Floor at bottom foreground
    const floorTex = createCourtTexture();
    const floorGeo = new THREE.PlaneGeometry(20, 14);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex || undefined,
      color: floorTex ? 0xffffff : 0xd97706,
      roughness: 0.35,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.2, 0);
    scene.add(floor);

    // Wooden trim border separating wall and court
    const borderGeo = new THREE.BoxGeometry(20, 0.25, 0.4);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(0, -1.1, -6.5);
    scene.add(border);

    // 3. Primary Upper-Right Hoop (matching screenshot)
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.2,
      metalness: 0.3,
    });
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });

    const rimGeo = new THREE.TorusGeometry(0.58, 0.045, 14, 36);

    // Upper-Right Hoop
    const rim1 = new THREE.Mesh(rimGeo, rimMat);
    rim1.rotation.x = Math.PI / 2;
    rim1.position.set(1.4, 3.5, -8.0);
    scene.add(rim1);

    const net1Geo = new THREE.CylinderGeometry(0.58, 0.36, 1.25, 16, 5, true);
    const net1 = new THREE.Mesh(net1Geo, netMat);
    net1.position.set(1.4, 2.9, -8.0);
    scene.add(net1);
    net1Ref.current = net1;

    // Upper rim bracket mount
    const bracket1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xef4444 })
    );
    bracket1.rotation.x = Math.PI / 2;
    bracket1.position.set(1.4, 3.5, -8.6);
    scene.add(bracket1);

    // 4. Secondary Lower-Left Hoop (matching screenshot)
    const rim2 = new THREE.Mesh(rimGeo, rimMat);
    rim2.rotation.x = Math.PI / 2;
    rim2.position.set(-1.35, 1.15, -7.0);
    scene.add(rim2);

    const net2Geo = new THREE.CylinderGeometry(0.58, 0.36, 1.25, 16, 5, true);
    const net2 = new THREE.Mesh(net2Geo, netMat);
    net2.position.set(-1.35, 0.55, -7.0);
    scene.add(net2);
    net2Ref.current = net2;

    const bracket2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xef4444 })
    );
    bracket2.rotation.x = Math.PI / 2;
    bracket2.position.set(-1.35, 1.15, -7.6);
    scene.add(bracket2);

    // 5. Foreground Cluster of 4 Large Basketballs (matching the bottom ball rack in screenshot)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
    });
    const shadowGeo = new THREE.CircleGeometry(0.55, 16);

    const addRackBall = (x: number, y: number, z: number, scale: number = 1.0) => {
      const b = createBasketballMesh(0.68 * scale);
      b.position.set(x, y, z);
      scene.add(b);

      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(x, -1.18, z);
      scene.add(shadow);
    };

    addRackBall(-1.85, -0.65, 1.9, 0.95);
    addRackBall(-0.65, -0.52, 2.3, 1.05);
    addRackBall(0.95, -0.52, 2.1, 1.05);
    addRackBall(2.05, -0.65, 1.7, 0.95);

    // 6. Active Shooting Basketball (in flight / ready to shoot)
    const activeBall = createBasketballMesh(0.52);
    activeBall.position.set(0, 0.8, -3.0);
    scene.add(activeBall);
    ballRef.current = activeBall;
  }, []);

  // WebGL Scene Initialization
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(56, width / height, 0.1, 100);
    camera.position.set(0, 1.7, 8.4);
    camera.lookAt(0, 2.6, -10.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Dramatic Lighting for depth and specular gloss
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.8);
    keyLight.position.set(4, 10, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.8);
    fillLight.position.set(-4, 6, 4);
    scene.add(fillLight);

    // Spotlights on each hoop
    const spotRight = new THREE.SpotLight(0xffffff, 2.0, 20, Math.PI / 4, 0.4);
    spotRight.position.set(2, 8, -4);
    spotRight.target.position.set(1.4, 3.5, -8.0);
    scene.add(spotRight);
    scene.add(spotRight.target);

    const spotLeft = new THREE.SpotLight(0xffffff, 2.0, 20, Math.PI / 4, 0.4);
    spotLeft.position.set(-2, 6, -3);
    spotLeft.target.position.set(-1.35, 1.15, -7.0);
    scene.add(spotLeft);
    scene.add(spotLeft.target);

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
  const shootBall = useCallback(
    (swipeDx: number, swipeDy: number) => {
      if (isFlyingRef.current || !gameReady || timeLeft <= 0) return;
      const ball = ballRef.current;
      const scene = sceneRef.current;
      if (!ball || !scene) return;

      isFlyingRef.current = true;
      setIsShooting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const power = Math.min(1.3, Math.max(0.4, -swipeDy / 130));
      const lateralBias = swipeDx / 160;

      // Aim towards top-right or lower-left hoop based on swipe
      const targetHoop =
        lateralBias >= 0
          ? new THREE.Vector3(1.4, 3.5, -8.0) // Upper right hoop
          : new THREE.Vector3(-1.35, 1.15, -7.0); // Lower left hoop

      const startPos = ball.position.clone();
      const flightDuration = 0.75;
      const startFlight = performance.now();

      const isGoodShot = power >= 0.65 && power <= 1.25;

      const animateBall = () => {
        const t = Math.min(1, (performance.now() - startFlight) / (flightDuration * 1000));
        const pos = new THREE.Vector3().lerpVectors(startPos, targetHoop, t);
        // Parabolic arc
        pos.y += Math.sin(t * Math.PI) * (2.9 * power);
        ball.position.copy(pos);
        // Realistic ball forward spin
        ball.rotation.x -= 0.12;

        if (t < 1) {
          requestAnimationFrame(animateBall);
        } else {
          if (isGoodShot) {
            const points = power > 1.05 ? 3 : 2;
            playerScoreRef.current += points;
            setPlayerScore(playerScoreRef.current);
            setFeedback(points === 3 ? '🎯 +3 SWISH!' : '🏀 +2 BASKET!');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Jiggle net
            const activeNet = lateralBias >= 0 ? net1Ref.current : net2Ref.current;
            if (activeNet) {
              activeNet.scale.set(1.2, 0.85, 1.2);
              setTimeout(() => activeNet.scale.set(1.0, 1.0, 1.0), 200);
            }
          } else {
            setFeedback('MISS! 😬');
            ball.position.set(
              targetHoop.x + (Math.random() - 0.5) * 0.9,
              targetHoop.y - 0.5,
              targetHoop.z + 0.6
            );
          }

          setTimeout(() => setFeedback(null), 800);

          if (matchState.status === 'playing' && matchState.roomId) {
            sendProgress(playerScoreRef.current, playerScoreRef.current, Date.now() - startTimeRef.current);
          }

          // Rapid reload for arcade shooting
          setTimeout(() => {
            if (ballRef.current) {
              ballRef.current.position.set(0, 0.8, -3.0);
              ballRef.current.rotation.set(0, 0, 0);
            }
            isFlyingRef.current = false;
            setIsShooting(false);
          }, 320);
        }
      };
      requestAnimationFrame(animateBall);
    },
    [gameReady, matchState.status, matchState.roomId, sendProgress, timeLeft]
  );

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
    if (dy < -20) {
      shootBall(dx, dy);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#11161d' },
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
      bottom: 210,
      alignSelf: 'center',
      backgroundColor: '#f97316',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 25,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 8,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', fontFamily: 'Inter_700Bold' },
    arrow: {
      position: 'absolute',
      backgroundColor: 'rgba(249,115,22,0.6)',
      width: 4,
      borderRadius: 2,
      bottom: 0,
      zIndex: 15,
      pointerEvents: 'none',
    },
  });

  const swipeArrowHeight = isDragging ? Math.max(0, dragStart.y - dragCurrent.y) : 0;

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || (matchState.status === 'matched' && !gameReady)}
        gameTitle="🏀 Basketball Shootout"
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

      {/* Top Digital Timer Box matching Snapchat format */}
      <View
        style={{
          position: 'absolute',
          top: topPad + 40,
          alignSelf: 'center',
          backgroundColor: '#1e242b',
          borderWidth: 2,
          borderColor: '#374151',
          borderRadius: 14,
          paddingHorizontal: 22,
          paddingVertical: 6,
          alignItems: 'center',
          zIndex: 15,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 10,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }}>
          TIME
        </Text>
        <Text
          style={{
            fontSize: 38,
            fontWeight: '900',
            color: '#FFFFFF',
            fontFamily: 'monospace',
            letterSpacing: 2,
          }}
        >
          {timeLeft}
        </Text>
      </View>

      {/* Red Points Banner on the right matching Snapchat format */}
      <View
        style={{
          position: 'absolute',
          top: topPad + 180,
          right: 0,
          backgroundColor: '#dc2626',
          borderBottomWidth: 4,
          borderBottomColor: '#991b1b',
          paddingHorizontal: 22,
          paddingVertical: 10,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 6,
          zIndex: 15,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 8,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>
          {playerScore}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 }}>PTS</Text>
      </View>

      {/* Left Trophy Pill matching Snapchat reference */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: '46%',
          backgroundColor: '#000000',
          borderTopRightRadius: 28,
          borderBottomRightRadius: 28,
          padding: 6,
          zIndex: 15,
          elevation: 6,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="trophy" size={24} color="#000000" />
        </View>
      </View>

      {/* 3D WebGL Canvas Layer */}
      <View
        style={s.canvasWrapper}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div ref={mountRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

        {/* Swipe trajectory guide indicator */}
        {isDragging && swipeArrowHeight > 10 && (
          <View
            style={[
              s.arrow,
              {
                left: dragStart.x - 2,
                height: swipeArrowHeight,
                bottom: undefined,
                top: dragCurrent.y,
              },
            ]}
          />
        )}
      </View>

      {/* Impact/Score Feedback Banner */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Snapchat Filter Lens Bottom Carousel & Shutter Trigger */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 8,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 20,
          pointerEvents: 'box-none',
        }}
      >
        {/* Shutter Button with basketball mini icon */}
        <View
          style={{
            width: 78,
            height: 78,
            borderRadius: 39,
            borderWidth: 4,
            borderColor: '#FFFFFF',
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.6,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: '#ea580c',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#111827',
            }}
          >
            <Ionicons name="basketball" size={32} color="#FFFFFF" />
          </View>
        </View>

        {/* Category Carousel Tabs */}
        <View
          style={{
            flexDirection: 'row',
            gap: 18,
            alignItems: 'center',
            marginTop: 10,
          }}
        >
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>Favorites</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>For you</Text>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.25)',
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 14,
            }}
          >
            <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '800' }}>Games</Text>
          </View>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>Appearance</Text>
        </View>
      </View>
    </View>
  );
}
