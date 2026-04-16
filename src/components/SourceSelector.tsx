import React from 'react';
import { Database, ExternalLink, Check, Zap, ShieldAlert } from 'lucide-react';
import { SourceData } from '../services/mangaOrchestrator';
import { motion } from 'motion/react';

interface SourceSelectorProps {
  sources: SourceData[];
  selectedSourceKey: string;
  onSelect: (sourceKey: string) => void;
}

export const SourceSelector: React.FC<SourceSelectorProps> = ({ sources, selectedSourceKey, onSelect }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#2D333B] border border-[#2D333B] rounded-xl overflow-hidden">
      {sources.map((source) => {
        const isActive = selectedSourceKey === source.sourceKey;
        return (
          <button
            key={source.sourceKey}
            onClick={() => onSelect(source.sourceKey)}
            className={`relative flex flex-col p-4 transition-all group overflow-hidden ${
              isActive
                ? 'bg-[#1A1D23]'
                : 'bg-[#0D1117] hover:bg-[#1A1D23]/80'
            }`}
          >
            {/* Active Indicator Bar */}
            {isActive && (
              <motion.div 
                layoutId="active-bar"
                className="absolute top-0 left-0 right-0 h-0.5 bg-[#4FD1C5] shadow-[0_0_10px_rgba(79,209,197,0.5)]" 
              />
            )}

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-md ${isActive ? 'bg-[#4FD1C5]/10 text-[#4FD1C5]' : 'bg-zinc-800/50 text-zinc-500 group-hover:text-zinc-400'}`}>
                  {source.isExternal ? <ExternalLink className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
                </div>
                {source.isMature && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-tighter border border-red-500/20">
                    <ShieldAlert className="w-2.5 h-2.5" />
                    Mature
                  </div>
                )}
              </div>
              {isActive ? (
                <div className="flex items-center gap-1 text-[10px] font-black text-[#4FD1C5] uppercase tracking-tighter">
                  <Check className="w-3 h-3" />
                  Active
                </div>
              ) : (
                source.sourceKey === 'mangadex' && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">
                    <Zap className="w-3 h-3" />
                    Default
                  </div>
                )
              )}
            </div>

            <div className="space-y-1">
              <p className={`text-sm font-bold tracking-tight transition-colors ${isActive ? 'text-[#4FD1C5]' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                {source.sourceName}
              </p>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${isActive ? 'bg-[#4FD1C5]/10 text-[#4FD1C5]' : 'bg-zinc-900 text-zinc-600'}`}>
                  {source.chapterCount.toString().padStart(3, '0')}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold">Chapters</span>
              </div>
            </div>

            {/* Subtle background glow for active */}
            {isActive && (
              <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-[#4FD1C5]/5 blur-2xl rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};
