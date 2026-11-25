import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Code2, Pause, Play, RotateCcw } from 'lucide-react';
import { GodotCodeDrawer } from './components/GodotCodeDrawer';
import { AuxState, CameraPreset, SalvoSimulation, SimulationSnapshot } from './simulation/engine';

const INITIAL_SNAPSHOT: SimulationSnapshot = {
  capturedFlags: 0,
  totalEnemyFlags: 3,
  elapsedSeconds: 0,
  aux1: {
    id: 'jogador_aux_1',
    label: 'Auxiliar 1',
    state: 'INDO_PARA_BANDEIRA',
    targetFlagId: 'flag4',
    carryingFlagId: null,
    capturedCount: 0,
  },
  aux2: {
    id: 'jogador_aux_2',
    label: 'Auxiliar 2',
    state: 'INDO_PARA_BANDEIRA',
    targetFlagId: 'flag6',
    carryingFlagId: null,
    capturedCount: 0,
  },
  flags: [
    { id: 'flag4', side: 'enemy', status: 'base', carrier: null },
    { id: 'flag5', side: 'enemy', status: 'base', carrier: null },
    { id: 'flag6', side: 'enemy', status: 'base', carrier: null },
  ],
  contextLost: false,
};

function formatStateLabel(state: AuxState, targetFlagId: string | null, carryingFlagId: string | null): string {
  if (state === 'INDO_PARA_BANDEIRA') {
    return targetFlagId ? `Indo para ${targetFlagId}` : 'Buscando bandeira';
  }
  if (state === 'RETORNANDO_COM_BANDEIRA') {
    return carryingFlagId ? `Retornando com ${carryingFlagId}` : 'Retornando à base';
  }
  return 'Concluído na base';
}

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<SalvoSimulation | null>(null);

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(INITIAL_SNAPSHOT);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const sim = new SalvoSimulation(container, (next) => {
      setSnapshot(next);
    });
    simRef.current = sim;

    return () => {
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && !codeOpen) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [codeOpen]);

  const handleTogglePause = () => {
    const next = !paused;
    setPaused(next);
    simRef.current?.setPaused(next);
  };

  const handleReset = () => {
    setPaused(false);
    simRef.current?.setPaused(false);
    simRef.current?.reset();
  };

  const handleSpeedChange = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    simRef.current?.setSpeedMultiplier(nextSpeed);
  };

  const handleCameraChange = (preset: CameraPreset) => {
    setCameraPreset(preset);
    simRef.current?.setCameraPreset(preset);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#121810] select-none">
      {/* Isolated WebGL canvas container */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* WebGL context lost fallback */}
      {snapshot.contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#121810]/95 p-6">
          <div className="max-w-md rounded-xl border border-white/12 bg-[#1a2217] p-6 text-center">
            <h2 className="font-display text-2xl font-bold text-white">Contexto WebGL pausado</h2>
            <p className="mt-2 text-sm text-[#a9b5a4]">
              O navegador suspendeu o contexto 3D temporariamente. Recarregue a página ou reabra o painel de código Godot.
            </p>
          </div>
        </div>
      )}

      {/* Minimal top-left HUD bar (unboxed metadata, zero pill badges, zero viewport occlusion) */}
      <header className="pointer-events-none fixed top-4 left-5 right-5 z-10 flex flex-wrap items-baseline justify-between gap-4">
        <div className="pointer-events-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-[#141a12]/90 px-4 py-2.5">
          <h1 className="font-display text-2xl font-bold tracking-wide text-[#f4f6f2] whitespace-nowrap">
            Salvo
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#b7c2b3] tabular-nums">
            <span className="font-medium text-[#e7efe4]">
              Bandeiras {snapshot.capturedFlags}/{snapshot.totalEnemyFlags}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-code">{formatClock(snapshot.elapsedSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>
              Auxiliar 1: {formatStateLabel(snapshot.aux1.state, snapshot.aux1.targetFlagId, snapshot.aux1.carryingFlagId)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Auxiliar 2: {formatStateLabel(snapshot.aux2.state, snapshot.aux2.targetFlagId, snapshot.aux2.carryingFlagId)}
            </span>
          </div>
        </div>

        <div className="pointer-events-auto hidden md:flex items-center gap-3 rounded-lg border border-white/10 bg-[#141a12]/90 px-3.5 py-2 text-xs text-[#a9b5a4]">
          <span>WASD / Setas: Jogador Principal</span>
          <span aria-hidden="true">·</span>
          <span>Arrastar: Câmera</span>
        </div>
      </header>

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className={`fixed bottom-5 left-1/2 z-20 -translate-x-1/2 transition-transform duration-200 ease-out ${
          dockCollapsed ? 'translate-y-[calc(100%+24px)]' : 'translate-y-0'
        }`}
        style={{ maxWidth: 'min(960px, 95vw)' }}
      >
        {/* Collapse / Expand Handle */}
        <div className="mb-1.5 flex justify-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-white/12 bg-[#141a12]/92 px-3 py-1 text-[11px] font-medium text-[#c5d0c0] hover:text-white transition-colors whitespace-nowrap"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <span>Ocultar controles</span>
          </button>
        </div>

        {/* Main Dock */}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#141a12]/94 px-3.5 py-2.5 shadow-xl">
          {/* Play / Pause & Reset */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePause}
              className="flex items-center gap-1.5 rounded-lg bg-[#2e6f40] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#38844d] transition-colors whitespace-nowrap"
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              <span>{paused ? 'Continuar' : 'Pausar'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#1c2419] px-3 py-1.5 text-xs font-medium text-[#dce6d8] hover:bg-[#273223] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reiniciar</span>
            </button>
          </div>

          <div className="hidden sm:block h-5 w-px bg-white/10" aria-hidden="true" />

          {/* Camera Presets */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0d110c] p-1">
            {(
              [
                { id: 'overview', label: 'Visão Geral' },
                { id: 'aux1', label: 'Auxiliar 1' },
                { id: 'aux2', label: 'Auxiliar 2' },
                { id: 'player', label: 'Principal' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleCameraChange(item.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  cameraPreset === item.id
                    ? 'bg-[#253122] text-white'
                    : 'text-[#9aa695] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-5 w-px bg-white/10" aria-hidden="true" />

          {/* Speed Selector */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0d110c] p-1 tabular-nums">
            {[1, 1.5, 2].map((mult) => (
              <button
                key={mult}
                type="button"
                onClick={() => handleSpeedChange(mult)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  speed === mult ? 'bg-[#253122] text-white' : 'text-[#9aa695] hover:text-white'
                }`}
              >
                {mult}x
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-5 w-px bg-white/10" aria-hidden="true" />

          {/* Open Godot GDScript Inspector */}
          <button
            type="button"
            onClick={() => setCodeOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#1c2419] px-3 py-1.5 text-xs font-medium text-[#e5ece2] hover:bg-[#273223] transition-colors whitespace-nowrap"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Código Godot</span>
          </button>
        </div>
      </div>

      {/* Expand handle when collapsed */}
      {dockCollapsed && (
        <button
          type="button"
          onClick={() => setDockCollapsed(false)}
          className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-white/12 bg-[#141a12]/94 px-3.5 py-1.5 text-xs font-medium text-[#dce6d8] shadow-lg hover:text-white transition-colors whitespace-nowrap"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          <span>Mostrar controles</span>
        </button>
      )}

      <GodotCodeDrawer open={codeOpen} onClose={() => setCodeOpen(false)} />
    </div>
  );
}
