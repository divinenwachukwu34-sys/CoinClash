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
  const ballRef = useRef<THREE.Group | null>(null);
  const keeperRef = useRef<THREE.Group | null>(null);
  const kickerRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const playerScoreRef = useRef(0);
  const oppScoreRef = useRef(0);
  const roundRef = useRef(1);
  const startTimeRef = useRef(Date.now());

  const topPad = Platform.OS === 'web' ? 50 : insets.top;

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
      finish(res.won, res.playerScore, res.opponentScore, 'goals', {
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  // Helper: Create Soccer Ball with Black Pentagons
  const createSoccerBall = () => {
    const group = new THREE.Group();
    const ballGeo = new THREE.SphereGeometry(0.28, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.05,
    });
    const sphere = new THREE.Mesh(ballGeo, ballMat);
    group.add(sphere);

    // Black pentagonal patches
    const patchMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const patchAngles = [
      [0, 0, 0.27],
      [0, 0, -0.27],
      [0.24, 0.12, 0],
      [-0.24, 0.12, 0],
      [0, 0.26, 0.08],
      [0.15, -0.22, 0.1],
      [-0.15, -0.22, 0.1],
    ];

    patchAngles.forEach(([x, y, z]) => {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.08, 5), patchMat);
      p.position.set(x, y, z);
      p.lookAt(x * 2, y * 2, z * 2);
      group.add(p);
    });

    return group;
  };

  // Helper: Create Cartoon Stadium Clouds
  const createCloud = (x: number, y: number, z: number, scale: number = 1.0) => {
    const group = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      transparent: true,
      opacity: 0.9,
    });

    const c1 = new THREE.Mesh(new THREE.SphereGeometry(1.4 * scale, 16, 16), cloudMat);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(1.0 * scale, 16, 16), cloudMat);
    c2.position.set(1.2 * scale, -0.2 * scale, 0);
    const c3 = new THREE.Mesh(new THREE.SphereGeometry(1.1 * scale, 16, 16), cloudMat);
    c3.position.set(-1.1 * scale, -0.2 * scale, 0);

    group.add(c1);
    group.add(c2);
    group.add(c3);
    group.position.set(x, y, z);
    return group;
  };

  // Helper: Create Mowed Turf Texture
  const createPitchTexture = () => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Alternating lawn mow stripes
    const stripeH = 64;
    for (let y = 0; y < 1024; y += stripeH) {
      ctx.fillStyle = (y / stripeH) % 2 === 0 ? '#4ade80' : '#22c55e';
      ctx.fillRect(0, y, 1024, stripeH);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    return tex;
  };

  // Build Scene
  const buildScene = useCallback((scene: THREE.Scene) => {
    // 1. Clouds in blue sky
    scene.add(createCloud(-8, 9, -15, 1.4));
    scene.add(createCloud(7, 10, -16, 1.2));
    scene.add(createCloud(0, 11, -18, 1.6));

    // 2. Red Curved Stadium Stands (as in screenshot)
    const stadiumGeo = new THREE.CylinderGeometry(20, 20, 9.5, 36, 1, true, -Math.PI * 0.75, Math.PI * 1.5);
    const stadiumMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      side: THREE.BackSide,
      roughness: 0.75,
    });
    const stadium = new THREE.Mesh(stadiumGeo, stadiumMat);
    stadium.position.set(0, 3.8, -12);
    scene.add(stadium);

    // Stadium upper tier white trim
    const trimGeo = new THREE.TorusGeometry(20.1, 0.45, 8, 36, Math.PI * 1.5);
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, 8.5, -12);
    scene.add(trim);

    // 3. Floodlight tower in distance (grid of glowing yellow bulbs)
    const lightTower = new THREE.Group();
    const lightBox = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 2.0, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.4 })
    );
    lightBox.position.set(0, 9.8, -13.5);
    lightTower.add(lightBox);

    // 3 rows x 5 columns = 15 yellow floodlight bulbs
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const bulb = new THREE.Mesh(
          new THREE.CircleGeometry(0.18, 14),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        bulb.position.set(-1.2 + c * 0.6, 10.3 - r * 0.5, -13.3);
        lightTower.add(bulb);
      }
    }
    scene.add(lightTower);

    // 4. Bright Green Pitch / Grass with mow stripes
    const pitchTex = createPitchTexture();
    const pitchGeo = new THREE.PlaneGeometry(40, 44);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: pitchTex || undefined,
      color: pitchTex ? 0xffffff : 0x22c55e,
      roughness: 0.55,
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    scene.add(pitch);

    // Field Markings (Penalty Box & Penalty Arc Circle)
    const penArcGeo = new THREE.RingGeometry(3.6, 3.75, 48);
    const penArcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const penArc = new THREE.Mesh(penArcGeo, penArcMat);
    penArc.rotation.x = -Math.PI / 2;
    penArc.position.set(0, 0.02, -5.2);
    scene.add(penArc);

    const penBoxLine = new THREE.Mesh(
      new THREE.PlaneGeometry(11.0, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    penBoxLine.rotation.x = -Math.PI / 2;
    penBoxLine.position.set(0, 0.02, -4.5);
    scene.add(penBoxLine);

    // Penalty Spot Dot
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.025, -2.5);
    scene.add(spot);

    // 5. Goal Post Structure (white with black accent joints as in screenshot)
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });

    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.7, 16);
    const postLeft = new THREE.Mesh(postGeo, goalMat);
    postLeft.position.set(-2.8, 1.35, -10);
    scene.add(postLeft);

    const postRight = new THREE.Mesh(postGeo, goalMat);
    postRight.position.set(2.8, 1.35, -10);
    scene.add(postRight);

    const crossbarGeo = new THREE.CylinderGeometry(0.1, 0.1, 5.8, 16);
    const crossbar = new THREE.Mesh(crossbarGeo, goalMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 2.7, -10);
    scene.add(crossbar);

    // Black connector elbow brackets
    const bracketGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.38, 16);
    const bracketL = new THREE.Mesh(bracketGeo, jointMat);
    bracketL.position.set(-2.8, 2.65, -10);
    scene.add(bracketL);
    const bracketR = new THREE.Mesh(bracketGeo, jointMat);
    bracketR.position.set(2.8, 2.65, -10);
    scene.add(bracketR);

    // Bottom Base Frame
    const baseL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 16), goalMat);
    baseL.rotation.x = Math.PI / 2;
    baseL.position.set(-2.8, 0.09, -11.1);
    scene.add(baseL);

    const baseR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 16), goalMat);
    baseR.rotation.x = Math.PI / 2;
    baseR.position.set(2.8, 0.09, -11.1);
    scene.add(baseR);

    // Goal Net
    const netGeo = new THREE.BoxGeometry(5.6, 2.6, 2.2);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 1.35, -11.1);
    scene.add(net);

    // 6. Goalkeeper (Avatar in keffiyeh headdress, sparkly jacket, white pants)
    const keeperGroup = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x935b34, roughness: 0.6 });
    const keeperJacketMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.35,
      roughness: 0.3,
    });
    const whitePantsMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const keffiyehMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
    const agalMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

    // Torso
    const keeperBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 1.15, 16), keeperJacketMat);
    keeperBody.position.y = 1.25;
    keeperGroup.add(keeperBody);

    // Head
    const keeperHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), skinMat);
    keeperHead.position.y = 2.05;
    keeperGroup.add(keeperHead);

    // Keffiyeh / Shemagh
    const headdress = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.45, 16), keffiyehMat);
    headdress.position.y = 2.22;
    keeperGroup.add(headdress);

    // Black Agal band
    const agal = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 24), agalMat);
    agal.rotation.x = Math.PI / 2;
    agal.position.y = 2.3;
    keeperGroup.add(agal);

    // White Pants
    const legGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.85, 12);
    const legL = new THREE.Mesh(legGeo, whitePantsMat);
    legL.position.set(-0.2, 0.45, 0);
    keeperGroup.add(legL);

    const legR = new THREE.Mesh(legGeo, whitePantsMat);
    legR.position.set(0.2, 0.45, 0);
    keeperGroup.add(legR);

    // Arms in athletic diving ready pose
    const keeperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.72, 12), keeperJacketMat);
    keeperArmL.rotation.z = Math.PI / 3;
    keeperArmL.position.set(-0.55, 1.45, 0);
    keeperGroup.add(keeperArmL);

    const keeperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.72, 12), keeperJacketMat);
    keeperArmR.rotation.z = -Math.PI / 3;
    keeperArmR.position.set(0.55, 1.45, 0);
    keeperGroup.add(keeperArmR);

    keeperGroup.position.set(0, 0, -9.8);
    scene.add(keeperGroup);
    keeperRef.current = keeperGroup;

    // 7. Soccer Ball
    const ball = createSoccerBall();
    ball.position.set(0, 0.28, -2.5);
    scene.add(ball);
    ballRef.current = ball;

    // 8. Kicker (Avatar viewed from behind in blue jeans & dark beanie as in screenshot)
    const kickerGroup = new THREE.Group();
    const kickerJacket = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const jeansMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.6 });
    const beanieMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });

    const kickerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 1.15, 14), kickerJacket);
    kickerBody.position.y = 1.15;
    kickerGroup.add(kickerBody);

    const kickerHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    kickerHead.position.y = 1.95;
    kickerGroup.add(kickerHead);

    const beanie = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.32, 16), beanieMat);
    beanie.position.y = 2.15;
    kickerGroup.add(beanie);

    // Blue Jeans
    const kLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.85, 12), jeansMat);
    kLegL.position.set(-0.18, 0.45, 0);
    kickerGroup.add(kLegL);

    const kLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.85, 12), jeansMat);
    kLegR.position.set(0.18, 0.45, 0);
    kickerGroup.add(kLegR);

    kickerGroup.position.set(0.5, 0, -1.8);
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
    scene.background = new THREE.Color(0x38bdf8); // Bright blue sky as in screenshot
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(54, width / height, 0.1, 100);
    camera.position.set(0, 2.1, 3.5);
    camera.lookAt(0, 1.45, -9.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1e3a8a, 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.8);
    sun.position.set(8, 16, 8);
    scene.add(sun);

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

    const directions: Direction[] = ['left', 'center', 'right'];
    const aiChoice = directions[Math.floor(Math.random() * directions.length)];

    const ballTargetX = direction === 'left' ? -1.8 : direction === 'right' ? 1.8 : 0;
    const keeperTargetX =
      (role === 'kicker' ? aiChoice : direction) === 'left'
        ? -1.8
        : (role === 'kicker' ? aiChoice : direction) === 'right'
        ? 1.8
        : 0;

    const isGoal = role === 'kicker' ? direction !== aiChoice : aiChoice !== direction;

    const ball = ballRef.current;
    const keeper = keeperRef.current;
    const kicker = kickerRef.current;
    if (!ball || !keeper) return;

    const startBallPos = ball.position.clone();
    const targetBallPos = new THREE.Vector3(ballTargetX, 1.3, -10.0);
    const startKeeperPos = keeper.position.clone();
    const targetKeeperPos = new THREE.Vector3(keeperTargetX, keeper.position.y, keeper.position.z);

    const startTime = performance.now();
    const duration = 750;

    const animateShot = () => {
      const now = performance.now();
      const p = Math.min(1, (now - startTime) / duration);

      // Kicker run-up
      if (kicker && p < 0.3) {
        kicker.position.z = -1.8 - p * 1.6;
      }

      // Ball path
      const curPos = new THREE.Vector3().lerpVectors(startBallPos, targetBallPos, p);
      curPos.y += Math.sin(p * Math.PI) * 1.3;
      ball.position.copy(curPos);
      ball.rotation.x += 0.2;

      // Keeper dive
      keeper.position.x = THREE.MathUtils.lerp(startKeeperPos.x, targetKeeperPos.x, p * 1.25);
      if (keeperTargetX !== 0) {
        keeper.rotation.z = THREE.MathUtils.lerp(0, keeperTargetX > 0 ? -0.55 : 0.55, p);
      }

      if (p < 1) {
        requestAnimationFrame(animateShot);
      } else {
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
            playerScoreRef.current += 1;
            setPlayerScore(playerScoreRef.current);
            setFeedback('WHAT A SAVE! 🧤🛑');
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }

        if (matchState.status === 'playing' && matchState.roomId) {
          sendProgress(roundRef.current, playerScoreRef.current, Date.now() - startTimeRef.current);
        }

        setTimeout(() => {
          ball.position.set(0, 0.28, -2.5);
          keeper.position.set(0, 0, -9.8);
          keeper.rotation.set(0, 0, 0);
          if (kicker) kicker.position.set(0.5, 0, -1.8);
          setFeedback(null);

          const nextRound = roundRef.current + 1;
          roundRef.current = nextRound;
          setCurrentRound(Math.min(TOTAL_ROUNDS, nextRound));
          setRole((r) => (r === 'kicker' ? 'keeper' : 'kicker'));
          setAnimating(false);

          if (nextRound > TOTAL_ROUNDS) {
            const totalTime = Date.now() - startTimeRef.current;
            const pScore = playerScoreRef.current;
            const oScore = oppScoreRef.current;
            setTimeout(() => {
              if (matchState.status === 'playing' && matchState.roomId) {
                submitFinalScore(pScore, totalTime, `${pScore}-${oScore}`);
              } else {
                const won = pScore > oScore || (pScore === oScore && totalTime < 30000);
                finish(won, pScore, oScore, 'goals', {
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
    container: { flex: 1, backgroundColor: '#38bdf8' },
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
    feedback: {
      position: 'absolute',
      bottom: 180,
      alignSelf: 'center',
      backgroundColor: '#2563eb',
      paddingHorizontal: 26,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 25,
      shadowColor: '#000',
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 8,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontFamily: 'Inter_700Bold' },
  });

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || (matchState.status === 'matched' && !gameReady)}
        gameTitle="⚽ Penalty Shootout 3D"
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

      {/* Top Score Pill */}
      <View
        style={{
          position: 'absolute',
          top: topPad + 45,
          alignSelf: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)',
          paddingHorizontal: 20,
          paddingVertical: 8,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.3)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          zIndex: 15,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#38bdf8' }}>
          ROUND {currentRound}/{TOTAL_ROUNDS}
        </Text>
        <View style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.3)' }} />
        <Text style={{ fontSize: 16, fontWeight: '900', color: '#FFFFFF' }}>
          {playerScore} - {opponentScore}
        </Text>
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

      {/* Bottom Lens Controls matching Snapchat AR HUD */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 8,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 20,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '800',
            color: '#FFFFFF',
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowRadius: 4,
            marginBottom: 10,
            letterSpacing: 1,
          }}
        >
          {role === 'kicker' ? '⚽ CHOOSE SHOT DIRECTION:' : '🧤 CHOOSE DIVE DIRECTION:'}
        </Text>

        {/* 3 Lens Direction Buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Pressable
            style={({ pressed }) => [
              {
                width: 66,
                height: 66,
                borderRadius: 33,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                borderWidth: 3,
                borderColor: '#38bdf8',
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 6,
              },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
            onPress={() => handleAction('left')}
            disabled={animating}
          >
            <Text style={{ fontSize: 24 }}>👈</Text>
            <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFFFFF' }}>LEFT</Text>
          </Pressable>

          {/* Central Camera Shutter Style Trigger */}
          <Pressable
            style={({ pressed }) => [
              {
                width: 82,
                height: 82,
                borderRadius: 41,
                borderWidth: 4,
                borderColor: '#FFFFFF',
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 10,
                shadowColor: '#000',
                shadowOpacity: 0.6,
                shadowRadius: 10,
              },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
            onPress={() => handleAction('center')}
            disabled={animating}
          >
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                backgroundColor: '#2563eb',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28 }}>⚽</Text>
              <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFFFFF' }}>CENTER</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              {
                width: 66,
                height: 66,
                borderRadius: 33,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                borderWidth: 3,
                borderColor: '#38bdf8',
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 6,
              },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
            onPress={() => handleAction('right')}
            disabled={animating}
          >
            <Text style={{ fontSize: 24 }}>👉</Text>
            <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFFFFF' }}>RIGHT</Text>
          </Pressable>
        </View>

        {/* Category Carousel Tabs */}
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', marginTop: 12 }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Favourites</Text>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.25)',
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 14,
            }}
          >
            <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '800' }}>For you</Text>
          </View>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Games</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Appearance</Text>
        </View>
      </View>
    </View>
  );
}
