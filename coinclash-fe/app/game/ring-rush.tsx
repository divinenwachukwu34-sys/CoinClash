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

const TOTAL_PEGS = 5;
const PEG_SPACING = 1.38;

// Exact color palette matching Snapchat reference: Coral Pink, Sunshine Yellow, Cyan Blue, Royal Purple
const RING_COLORS = [0xff4d79, 0xffd214, 0x22c1ee, 0x7c56b8];

export default function RingRushScreen() {
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
  } = useLiveMatch('ring-rush', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameReady, setGameReady] = useState(false);
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isWon, setIsWon] = useState(false);

  // Initial stacks matching the colorful abacus challenge
  const [pegStacks, setPegStacks] = useState<number[][]>([
    [2, 3, 2, 1, 0], // Peg 1
    [3, 1, 2, 3, 1, 0], // Peg 2
    [], // Peg 3 (Center taller peg starts empty)
    [0, 0, 3, 2], // Peg 4
    [2, 3, 1, 1], // Peg 5
  ]);

  // Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const ringsGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const startTimeRef = useRef(Date.now());
  const movesRef = useRef(0);
  const aiTime = useRef(26000 + Math.random() * 8000);

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
    }
  }, [matchState.status]);

  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      const res = matchState.gameResult;
      finish(res.won, res.playerScore, res.opponentScore, 'pts', {
        playerTimeMs: res.playerTimeMs,
        aiTimeMs: res.opponentTimeMs,
      });
    }
  }, [matchState.status, matchState.gameResult, finish, gameReady]);

  // Rebuild 3D Rings representation whenever pegStacks updates
  const updateRingsInScene = useCallback(
    (stacks: number[][], selected: number | null) => {
      const group = ringsGroupRef.current;
      if (!group) return;

      while (group.children.length > 0) {
        group.remove(group.children[0]);
      }

      // Chunky Torus Geometry for authentic donut look
      const ringGeo = new THREE.TorusGeometry(0.44, 0.18, 20, 36);

      stacks.forEach((stack, pegIdx) => {
        const pegX = (pegIdx - 2) * PEG_SPACING;
        stack.forEach((ringColorIdx, heightIdx) => {
          const color = RING_COLORS[ringColorIdx % RING_COLORS.length];
          const ringMat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.28,
            metalness: 0.08,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = Math.PI / 2;

          // Lift selected top ring on selected peg
          const isSelectedTop = selected === pegIdx && heightIdx === stack.length - 1;
          const yPos = isSelectedTop ? 3.4 : 0.42 + heightIdx * 0.38;

          ringMesh.position.set(pegX, yPos, 0);

          // Contact shadow under ring
          if (!isSelectedTop && heightIdx === 0) {
            const shadow = new THREE.Mesh(
              new THREE.CircleGeometry(0.48, 16),
              new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
            );
            shadow.rotation.x = -Math.PI / 2;
            shadow.position.set(pegX, 0.06, 0);
            group.add(shadow);
          }

          group.add(ringMesh);
        });
      });
    },
    []
  );

  useEffect(() => {
    updateRingsInScene(pegStacks, selectedPeg);
  }, [pegStacks, selectedPeg, updateRingsInScene]);

  // Build Scene Base and Pegs
  const buildScene = useCallback((scene: THREE.Scene) => {
    // 1. Natural Wooden Stand Base with rounded bevel
    const baseGeo = new THREE.BoxGeometry(7.6, 0.9, 2.3);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.45,
      metalness: 0.05,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, -0.22, 0);
    scene.add(base);

    // Front wood chamfer plinth strip
    const plinthGeo = new THREE.BoxGeometry(7.6, 0.22, 0.12);
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xc69255, roughness: 0.4 });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, 0.18, 1.16);
    scene.add(plinth);

    // 2. 5 Vertical Wooden Pegs (Center peg is taller as in screenshot)
    const pegMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.4,
    });

    for (let i = 0; i < TOTAL_PEGS; i++) {
      const isMiddle = i === 2;
      const height = isMiddle ? 3.5 : 2.6;
      const pegGeo = new THREE.CylinderGeometry(0.09, 0.09, height, 20);
      const peg = new THREE.Mesh(pegGeo, pegMat);
      peg.position.set((i - 2) * PEG_SPACING, height / 2 + 0.22, 0);
      scene.add(peg);

      // Rounded peg domed tip
      const tipGeo = new THREE.SphereGeometry(0.09, 16, 16);
      const tip = new THREE.Mesh(tipGeo, pegMat);
      tip.position.set((i - 2) * PEG_SPACING, height + 0.22, 0);
      scene.add(tip);
    }

    // Rings container group
    const ringsGroup = new THREE.Group();
    scene.add(ringsGroup);
    ringsGroupRef.current = ringsGroup;
  }, []);

  // WebGL Setup
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18181b); // Dark studio grey background as in reference
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    camera.position.set(0, 3.4, 6.2);
    camera.lookAt(0, 1.1, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Atmospheric Studio Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    dirLight.position.set(4, 9, 6);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    rimLight.position.set(-4, 6, -3);
    scene.add(rimLight);

    buildScene(scene);
    updateRingsInScene(pegStacks, null);

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
  }, [buildScene, updateRingsInScene]);

  // Handle Peg Selection & Ring Transfer
  const handlePegTap = (pegIndex: number) => {
    if (!gameReady || isWon) return;

    if (selectedPeg === null) {
      if (pegStacks[pegIndex].length === 0) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedPeg(pegIndex);
    } else if (selectedPeg === pegIndex) {
      setSelectedPeg(null);
    } else {
      const sourceStack = [...pegStacks[selectedPeg]];
      const targetStack = [...pegStacks[pegIndex]];

      if (sourceStack.length === 0) {
        setSelectedPeg(null);
        return;
      }

      // Max stack height = 6
      if (targetStack.length >= 6) {
        setFeedback('PEG FULL! 🛑');
        setTimeout(() => setFeedback(null), 600);
        setSelectedPeg(null);
        return;
      }

      const ringToMove = sourceStack.pop()!;
      targetStack.push(ringToMove);

      const newStacks = [...pegStacks];
      newStacks[selectedPeg] = sourceStack;
      newStacks[pegIndex] = targetStack;

      setPegStacks(newStacks);
      setSelectedPeg(null);
      const newMoves = movesRef.current + 1;
      movesRef.current = newMoves;
      setMoves(newMoves);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Check win: all non-empty stacks contain rings of identical color
      const hasSortedStacks = newStacks.filter((s) => s.length > 0).every((s) => s.every((val) => val === s[0]));
      const totalRings = newStacks.reduce((sum, s) => sum + s.length, 0);

      if (hasSortedStacks && totalRings >= 14) {
        setIsWon(true);
        setFeedback('SORT COMPLETE! 🎉');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const totalTime = Date.now() - startTimeRef.current;
        const finalScore = Math.max(10, 100 - newMoves * 3);

        setTimeout(() => {
          if (matchState.status === 'playing' && matchState.roomId) {
            submitFinalScore(finalScore, totalTime, `${newMoves} moves`);
          } else {
            const won = totalTime < aiTime.current;
            finish(won, finalScore, 85, 'pts', {
              playerTimeMs: totalTime,
              aiTimeMs: aiTime.current,
            });
          }
        }, 1200);
      }
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#18181b' },
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
      bottom: 220,
      alignSelf: 'center',
      backgroundColor: '#a855f7',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 25,
      shadowColor: '#000',
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 8,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', fontFamily: 'Inter_700Bold' },
  });

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || (matchState.status === 'matched' && !gameReady)}
        gameTitle="💍 Ring Rush 3D"
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

      {/* Top Floating Oval Score Badge matching Snapchat screenshot */}
      <View
        style={{
          position: 'absolute',
          top: topPad + 45,
          alignSelf: 'center',
          width: 46,
          height: 56,
          borderRadius: 23,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 15,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 8,
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: '900', color: '#000000', fontFamily: 'Inter_700Bold' }}>
          {moves}
        </Text>
      </View>

      {/* 3D WebGL Canvas Layer */}
      <View style={s.canvasWrapper}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

        {/* BEST 🏆 25 Banner matching screenshot */}
        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + 140,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            paddingHorizontal: 16,
            paddingVertical: 5,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: '#deb887',
            zIndex: 15,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '900', color: '#0284c7', letterSpacing: 1 }}>BEST 🏆</Text>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#1e293b' }}>25</Text>
        </View>
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Interactive Peg Tap Buttons */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 70,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-around',
          zIndex: 20,
        }}
      >
        {[0, 1, 2, 3, 4].map((idx) => {
          const isSelected = selectedPeg === idx;
          return (
            <Pressable
              key={idx}
              onPress={() => handlePegTap(idx)}
              style={({ pressed }) => [
                {
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: isSelected ? '#a855f7' : 'rgba(30, 41, 59, 0.9)',
                  borderWidth: 2.5,
                  borderColor: isSelected ? '#FFFFFF' : '#475569',
                  alignItems: 'center',
                  justifyContent: 'center',
                  elevation: 6,
                },
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
              disabled={!gameReady || isWon}
            >
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#FFFFFF' }}>{idx + 1}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom Category Tabs */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 12,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 20,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>Favourites</Text>
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
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>Games</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>Appearance</Text>
        </View>
      </View>
    </View>
  );
}
