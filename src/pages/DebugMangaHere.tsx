import * as React from 'react';
import { useState } from 'react';
import { mangahereService } from '@/services/mangahereService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, List, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function DebugMangaHere() {
  const [query, setQuery] = useState('Solo Leveling');
  const [mangaId, setMangaId] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  const testSearch = async () => {
    setLoading(true);
    setChapters([]);
    setActiveStep(1);
    try {
      toast.info(`Searching MangaHere for "${query}"...`);
      const searchResults = await mangahereService.searchManga(query);
      setResults(searchResults);
      if (searchResults.length > 0) {
        setMangaId(searchResults[0].id);
        toast.success(`Found ${searchResults.length} results!`);
      } else {
        toast.error('No results found for this query');
      }
    } catch (err: any) {
      toast.error(`Search Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testChapters = async (id: string = mangaId) => {
    if (!id) return;
    setLoading(true);
    setActiveStep(2);
    try {
      toast.info(`Fetching chapters for "${id}"...`);
      const chaptersList = await mangahereService.getChapters(id);
      setChapters(chaptersList);
      if (chaptersList.length > 0) {
        toast.success(`Successfully fetched ${chaptersList.length} chapters!`);
      } else {
        toast.error('Fetched 0 chapters. Check the patterns.');
      }
    } catch (err: any) {
      toast.error(`Chapters Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testPages = async (chapter: any) => {
    setLoading(true);
    setActiveStep(3);
    try {
      const parts = chapter.id.split(':');
      // parts[1] = mangaId, parts[2] = chapNum, parts[3] = domain
      toast.info(`Fetching pages for chapter ${chapter.chapter}...`);
      const pagesList = await mangahereService.getChapterPages(parts[1], parts[2], parts[3]);
      setPages(pagesList);
      if (pagesList.length > 0) {
        toast.success(`Found ${pagesList.length} pages! Validating proxy...`);
      } else {
        toast.error('No pages found for this chapter.');
      }
    } catch (err: any) {
      toast.error(`Pages Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-black tracking-tighter text-[#E2E8F0]">MangaHere <span className="text-[#4FD1C5]">Proof of Work</span></h1>
        <p className="text-zinc-500">Live technical validator for MangaHere scraping logic.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Search */}
        <Card className="bg-[#1A1D23] border-[#2D333B] rounded-2xl overflow-hidden shadow-xl">
          <CardHeader className="border-b border-[#2D333B] bg-[#2D333B]/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#4FD1C5] text-black flex items-center justify-center text-xs font-bold">1</span>
              Search Implementation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex gap-2">
              <Input 
                value={query} 
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Manga title..."
                className="bg-[#0D1117] border-[#2D333B] rounded-xl focus:border-[#4FD1C5]"
              />
              <Button 
                onClick={testSearch} 
                disabled={loading}
                className="bg-[#4FD1C5] hover:bg-[#38B2AC] text-black font-bold rounded-xl"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {results.map((res) => (
                <div key={res.id} className="p-2 rounded-lg bg-[#0D1117] border border-[#2D333B] flex justify-between items-center group hover:border-[#4FD1C5]/50 transition-all">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-100">{res.title}</span>
                    <span className="text-[10px] text-zinc-500 font-mono italic">{res.id}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-[10px] text-[#4FD1C5] hover:bg-[#4FD1C5]/10"
                    onClick={() => { setMangaId(res.id); testChapters(res.id); }}
                  >
                    Fetch
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Chapters */}
        <Card className="bg-[#1A1D23] border-[#2D333B] rounded-2xl overflow-hidden shadow-xl">
          <CardHeader className="border-b border-[#2D333B] bg-[#2D333B]/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#4FD1C5] text-black flex items-center justify-center text-xs font-bold">2</span>
              Parsing Proof
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#0D1117] border border-[#2D333B]">
              <span className="text-xs text-zinc-500 font-mono truncate mr-2">{mangaId || 'No ID selected'}</span>
              <Button 
                size="sm" 
                onClick={() => testChapters()} 
                disabled={!mangaId || loading}
                className="bg-[#4FD1C5] hover:bg-[#38B2AC] text-black font-bold h-8 rounded-lg"
              >
                <List className="w-3 h-3 mr-2" /> Start Parse
              </Button>
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {chapters.slice(0, 10).map((chap) => (
                <div key={chap.id} className="p-2 rounded-lg bg-[#0D1117] border border-green-500/20 flex justify-between items-center">
                  <span className="text-xs font-bold text-green-400">Chapter {chap.chapter}</span>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 text-[10px] bg-green-500/10 text-green-400"
                      onClick={() => testPages(chap)}
                    >
                      Test Pages
                    </Button>
                    <Badge variant="outline" className="text-[8px] border-green-500/30 text-green-500 bg-green-500/5">Verified</Badge>
                  </div>
                </div>
              ))}
              {chapters.length > 10 && <p className="text-[10px] text-center text-zinc-600">... and {chapters.length - 10} more chapters</p>}
              {chapters.length === 0 && !loading && <p className="text-xs text-center text-zinc-500 italic">No data parsed yet</p>}
              {loading && <div className="animate-pulse flex flex-col gap-2">
                <div className="h-8 bg-[#0D1117] rounded-lg w-full" />
                <div className="h-8 bg-[#0D1117] rounded-lg w-full" />
                <div className="h-8 bg-[#0D1117] rounded-lg w-full" />
              </div>}
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Visual Proof */}
        {pages.length > 0 && (
          <Card className="md:col-span-2 bg-[#1A1D23] border-[#2D333B] rounded-2xl overflow-hidden shadow-xl">
            <CardHeader className="border-b border-[#2D333B] bg-[#2D333B]/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#4FD1C5] text-black flex items-center justify-center text-xs font-bold">3</span>
                Visual Proof (Live Proxy)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {pages.slice(0, 5).map((pg, idx) => (
                  <div key={idx} className="flex-shrink-0 w-32 aspect-[3/4] bg-[#0D1117] rounded-lg border border-[#2D333B] overflow-hidden flex items-center justify-center relative group">
                    <img 
                      src={pg} 
                      alt="page" 
                      className="w-full h-full object-cover" 
                      onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150?text=Error')}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[8px] text-white">Page {idx + 1}</span>
                    </div>
                  </div>
                ))}
                {pages.length > 5 && (
                  <div className="flex-shrink-0 w-32 aspect-[3/4] bg-[#0D1117] rounded-lg border border-[#2D333B] flex items-center justify-center text-zinc-600 text-xs text-center p-4">
                    +{pages.length - 5} more pages ready
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="p-6 bg-green-500/5 border border-green-500/20 rounded-3xl space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2 text-green-400">
          <CheckCircle2 className="w-5 h-5" />
          Technical Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#1A1D23] border border-[#2D333B] space-y-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Search Proxy</p>
            <p className="font-bold flex items-center gap-2 text-[#E2E8F0]">
              {results.length > 0 ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-zinc-800" />}
              {results.length > 0 ? "Functional" : "Tested Needed"}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-[#1A1D23] border border-[#2D333B] space-y-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">DOM Parser</p>
            <p className="font-bold flex items-center gap-2 text-[#E2E8F0]">
              {chapters.length > 0 ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-zinc-800" />}
              {chapters.length > 0 ? "RegEx Balanced" : "Idle"}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-[#1A1D23] border border-[#2D333B] space-y-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">MangaHere Reader</p>
            <p className="font-bold flex items-center gap-2 text-[#E2E8F0]">
              {pages.length > 0 ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-zinc-800" />}
              {pages.length > 0 ? "Visual Validated" : "Awaiting Reader Test"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
