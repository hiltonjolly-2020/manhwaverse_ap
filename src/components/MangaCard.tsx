import * as React from 'react';
import { Manga } from '@/services/mangaService';
import { Card } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export function MangaCard({ manga }: { manga: Manga; key?: React.Key }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Link to={`/manga/${manga.id}`} className="group block">
        <Card className="bg-[#1A1D23] rounded-xl overflow-hidden border border-[#2D333B] transition-all duration-300 group-hover:border-[#4FD1C5]/50 shadow-lg hover:shadow-[#4FD1C5]/5">
          <div className="aspect-[3/4] relative overflow-hidden bg-[#23272F]">
            <img
              src={manga.coverUrl}
              alt={manga.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
            {manga.status && (
              <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md text-[10px] px-2 py-0.5 rounded text-white font-bold uppercase tracking-wider border border-white/10">
                {manga.status}
              </div>
            )}
          </div>
          <div className="p-3 space-y-1.5">
            <h3 className="text-sm font-bold text-[#E2E8F0] line-clamp-1 group-hover:text-[#4FD1C5] transition-colors leading-tight">
              {manga.title}
            </h3>
            <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
              <span className="font-medium">Ch. {Math.floor(Math.random() * 50) + 50}+</span>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-[#4FD1C5] text-[#4FD1C5]" />
                <span className="text-[#E2E8F0] font-bold">{(8.5 + Math.random() * 1.4).toFixed(1)}</span>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
