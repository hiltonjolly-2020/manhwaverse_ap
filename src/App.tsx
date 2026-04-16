import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import SearchPage from './pages/Search';
import ManhwaDetails from './pages/ManhwaDetails';
import Reader from './pages/Reader';
import Library from './pages/Library';
import DebugMangaHere from './pages/DebugMangaHere';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/manga/:id" element={<ManhwaDetails />} />
          <Route path="/library" element={<Library />} />
          <Route path="/debug-mangahere" element={<DebugMangaHere />} />
        </Route>
        <Route path="/manga/:mangaId/chapter/:chapterId" element={<Reader />} />
      </Routes>
    </BrowserRouter>
  );
}
