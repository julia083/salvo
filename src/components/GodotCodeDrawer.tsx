import { useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import { JOGADOR_AUX_GD, MAIN_TSCN_DIFF } from '../godotSource';

interface GodotCodeDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function GodotCodeDrawer({ open, onClose }: GodotCodeDrawerProps) {
  const [activeTab, setActiveTab] = useState<'script' | 'scene'>('script');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const currentCode = activeTab === 'script' ? JOGADOR_AUX_GD : MAIN_TSCN_DIFF;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JOGADOR_AUX_GD], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jogador_aux.gd';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-8"
      style={{ backgroundColor: 'rgba(10, 14, 9, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Arquivos Godot adicionados ao repositório"
    >
      <div className="flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/12 bg-[#141a12] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-6">
            <h2 className="font-display text-xl font-bold tracking-wide text-[#f4f6f2] whitespace-nowrap">
              Repositório Salvo — Lógica Godot 4
            </h2>
            <div className="flex items-center gap-1 rounded-lg bg-[#0d110c] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('script')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'script'
                    ? 'bg-[#253122] text-[#f4f6f2]'
                    : 'text-[#9aa695] hover:text-[#f4f6f2]'
                }`}
              >
                jogador_aux.gd
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('scene')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'scene'
                    ? 'bg-[#253122] text-[#f4f6f2]'
                    : 'text-[#9aa695] hover:text-[#f4f6f2]'
                }`}
              >
                Alteração em main.tscn
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#1c2419] px-3 py-1.5 text-xs font-medium text-[#e5ece2] hover:bg-[#263122] transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-[#2e6f40] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38844d] transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Baixar .gd</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar código"
              className="rounded-lg p-1.5 text-[#9aa695] hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-white/10 bg-[#10150e] px-5 py-2.5 text-xs text-[#a9b5a4]">
          Anexado aos nós <span className="font-mono-code text-[#e5ece2]">jogador_aux_1</span> e{' '}
          <span className="font-mono-code text-[#e5ece2]">jogador_aux_2</span> em{' '}
          <span className="font-mono-code text-[#e5ece2]">salvo/main.tscn</span>. Cada auxiliar reserva uma bandeira
          inimiga (<span className="font-mono-code text-[#e5ece2]">z &lt; 0</span>), desvia dos bots próximos, coleta
          a bandeira pelo centro do colisor e retorna até a base aliada para concluir a entrega.
        </div>

        <div className="flex-1 overflow-auto bg-[#0c100b] p-5">
          <pre className="font-mono-code text-[12.5px] leading-relaxed text-[#dce6d8] whitespace-pre">
            {currentCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
