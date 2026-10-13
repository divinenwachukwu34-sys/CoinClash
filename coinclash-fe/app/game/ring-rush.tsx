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
const PEG_SPACING = 1.4;

// Colors for the puzzle rings
const RING_COLORS = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6];

export default function RingRushScreen() {
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
  } = useLiveMatch('ring-rush', stake);

  const hasSentStart = useRef(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameReady, setGameReady] = useState(false);
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isWon, setIsWon] = useState(false);

  // Puzzle State: Array of arrays representing stacks on each of the 5 pegs
  // Target: Each peg i has exactly ring i (ordered 0, 1, 2, 3, 4)
  const [pegStacks, setPegStacks] = useState<number[][]>([
    [2, 0],
    [3],
    [1],
    [4],
    [],
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
  const aiTime = useRef(24000 + Math.random() * 8000);

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
    }
  }, [matchState.status]);

  useEffect(() => {
    if (matchState.status === 'ended' && matchState.gameResult && gameReady) {
      const res = matchState.gameResult;
      finish(res.won, res.playerTimeMs, res.opponentTimeMs, 'moves', {
        playerScore: res.playerScore,
        aiScore: res.opponentScore,
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

      // Clear existing rings
      while (group.children.length > 0) {
        group.remove(group.children[0]);
      }

      // Re-create rings
      stacks.forEach((stack, pegIdx) => {
        const pegX = (pegIdx - 2) * PEG_SPACING;
        stack.forEach((ringId, heightIdx) => {
          const ringGeo = new THREE.TorusGeometry(0.38, 0.1, 16, 32);
          const ringMat = new THREE.MeshStandardMaterial({
            color: RING_COLORS[ringId],
            roughness: 0.3,
            metalness: 0.2,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = Math.PI / 2;

          // Lift selected top ring on selected peg
          const isSelectedTop = selected === pegIdx && heightIdx === stack.length - 1;
          const yPos = isSelectedTop ? 2.5 : 0.3 + heightIdx * 0.25;

          ringMesh.position.set(pegX, yPos, 0);
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
    // Wooden Stand Base
    const baseGeo = new THREE.BoxGeometry(7.2, 0.35, 1.8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.6 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0, 0);
    scene.add(base);

    // 5 Pegs / Sticks
    const pegGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 16);
    const pegMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.5 });
    for (let i = 0; i < TOTAL_PEGS; i++) {
      const peg = new THREE.Mesh(pegGeo, pegMat);
      peg.position.set((i - 2) * PEG_SPACING, 1.1, 0);
      scene.add(peg);
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
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 3.6, 6.0);
    camera.lookAt(0, 1.0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(4, 8, 5);
    scene.add(dir);

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

  // Handle Peg Selection / Move
  const handlePegTap = (pegIndex: number) => {
    if (!gameReady || isWon) return;

    if (selectedPeg === null) {
      // Pick up top ring from peg if not empty
      if (pegStacks[pegIndex].length === 0) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedPeg(pegIndex);
    } else if (selectedPeg === pegIndex) {
      // Deselect
      setSelectedPeg(null);
    } else {
      // Move ring from selectedPeg to pegIndex
      const sourceStack = [...pegStacks[selectedPeg]];
      const targetStack = [...pegStacks[pegIndex]];

      if (sourceStack.length === 0) {
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

      // Check winning arrangement: Each peg i has exactly [i]
      const solved = newStacks.every((stack, i) => stack.length === 1 && stack[0] === i);
      if (solved) {
        setIsWon(true);
        setFeedback('PUZZLE SOLVED! 🎉');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const totalTime = Date.now() - startTimeRef.current;
        const finalScore = Math.max(10, 100 - newMoves * 5);

        setTimeout(() => {
          if (matchState.status === 'playing' && matchState.roomId) {
            submitFinalScore(finalScore, totalTime, `${newMoves} moves`);
          } else {
            const won = totalTime < aiTime.current;
            finish(won, totalTime, aiTime.current, 'pts', {
              playerScore: finalScore,
              aiScore: 80,
              playerTimeMs: totalTime,
              aiTimeMs: aiTime.current,
            });
          }
        }, 1200);
      }
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
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
    scoreVal: { fontSize: 16, fontWeight: '700', color: '#8B5CF6', fontFamily: 'Inter_700Bold' },
    canvasWrapper: { flex: 1, width: '100%' },
    feedback: {
      position: 'absolute',
      bottom: 160,
      alignSelf: 'center',
      backgroundColor: '#8B5CF6',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 28,
      zIndex: 12,
    },
    feedbackText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    pegButtonsRow: {
      position: 'absolute',
      bottom: insets.bottom + 40,
      left: 10,
      right: 10,
      flexDirection: 'row',
      justifyContent: 'space-around',
      zIndex: 10,
    },
    pegBtn: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: '#1E293B',
      borderWidth: 2,
      borderColor: '#475569',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pegBtnActive: {
      borderColor: '#8B5CF6',
      backgroundColor: '#312E81',
    },
    pegBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'Inter_700Bold',
    },
    hint: {
      position: 'absolute',
      bottom: insets.bottom + 12,
      alignSelf: 'center',
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)',
      fontFamily: 'Inter_500Medium',
    },
  });

  return (
    <View style={s.container}>
      <MatchmakingModal
        visible={matchState.status === 'searching' || matchState.status === 'matched'}
        searchSeconds={searchSeconds}
        opponentUsername={matchState.opponentUsername}
        stake={stake}
        gameName="Ring Rush 3D"
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
        <Text style={s.title}>💍 Ring Rush 3D</Text>
        <View style={s.scorePill}>
          <Text style={s.scoreVal}>{moves} MOVES</Text>
        </View>
      </View>

      {/* 3D WebGL Canvas */}
      <View style={s.canvasWrapper}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View style={s.feedback}>
          <Text style={s.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Interactive Peg Buttons */}
      <View style={s.pegButtonsRow}>
        {[0, 1, 2, 3, 4].map(idx => (
          <Pressable
            key={idx}
            style={[s.pegBtn, selectedPeg === idx && s.pegBtnActive]}
            onPress={() => handlePegTap(idx)}
            disabled={!gameReady || isWon}
          >
            <Text style={s.pegBtnText}>{idx + 1}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.hint}>
        {selectedPeg !== null ? 'Tap destination peg to place ring' : 'Tap peg button to lift top ring'}
      </Text>
    </View>
  );
}
