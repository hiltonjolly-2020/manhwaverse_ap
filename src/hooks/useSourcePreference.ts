import { useState, useEffect } from 'react';

export function useSourcePreference(mangaId: string) {
  const [preferredSource, setPreferredSource] = useState<string>(() => {
    if (!mangaId) return 'mangadex';
    const saved = localStorage.getItem(`source_pref_${mangaId}`);
    return saved || 'mangadex';
  });

  const updatePreference = (source: string) => {
    if (!mangaId) return;
    const lowerSource = source.toLowerCase();
    setPreferredSource(lowerSource);
    localStorage.setItem(`source_pref_${mangaId}`, lowerSource);
  };

  return { preferredSource, updatePreference };
}
