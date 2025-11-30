
import React, { useState, useRef, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GeminiLiveService } from './services/geminiLive';
import { audioService } from './services/audioService';
import { GameState, GameScore, Difficulty, ThemeConfig, LevelConfig, EquipmentConfig } from './types';

// Icons
const CameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
);
const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const SwordIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>
);

// Configurations
const THEMES: ThemeConfig[] = [
  {
    id: 'cyber',
    name: 'Neon City',
    backgroundStyle: {
      background: 'linear-gradient(to bottom, #0f172a, #2e1065)',
      backgroundImage: 'radial-gradient(circle at 50% 120%, #818cf8, transparent 60%)'
    },
    videoFilter: 'contrast(1.2) saturate(1.2) hue-rotate(10deg)',
    primaryColor: 'cyan',
    secondaryColor: 'pink'
  },
  {
    id: 'dojo',
    name: 'Ancient Dojo',
    backgroundStyle: {
      background: '#3f2e21', // Dark wood
      backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent), repeating-linear-gradient(90deg, transparent 0, transparent 40px, rgba(0,0,0,0.1) 40px, rgba(0,0,0,0.1) 42px)' 
    },
    videoFilter: 'sepia(0.4) contrast(1.1) brightness(0.9)',
    primaryColor: 'orange',
    secondaryColor: 'red'
  },
  {
    id: 'space',
    name: 'Galactic Core',
    backgroundStyle: {
      background: '#000000',
      backgroundImage: 'radial-gradient(white, rgba(255,255,255,.2) 2px, transparent 3px), radial-gradient(white, rgba(255,255,255,.15) 1px, transparent 2px), radial-gradient(white, rgba(255,255,255,.1) 2px, transparent 3px)',
      backgroundSize: '550px 550px, 350px 350px, 250px 250px',
      backgroundPosition: '0 0, 40px 60px, 130px 270px'
    },
    videoFilter: 'brightness(1.1) saturate(0.8) hue-rotate(-10deg)',
    primaryColor: 'violet',
    secondaryColor: 'blue'
  }
];

const EQUIPMENTS: EquipmentConfig[] = [
  { id: 'claws', name: 'Neon Claws', icon: '⚡', type: 'slash', color: '#22d3ee', soundType: 'electric' },
  { id: 'katana', name: 'Katana', icon: '🗡️', type: 'slash', color: '#f8fafc', soundType: 'sharp' },
  { id: 'fist', name: 'Power Fist', icon: '🥊', type: 'impact', color: '#fbbf24', soundType: 'heavy' },
  { id: 'beam', name: 'Plasma Beam', icon: '🔦', type: 'beam', color: '#a855f7', soundType: 'electric' },
];

const DIFFICULTY_CONFIGS: Record<Difficulty, LevelConfig> = {
  [Difficulty.NOVICE]: { difficulty: Difficulty.NOVICE, spawnInterval: 1400, gravity: 6, bombChance: 0 },
  [Difficulty.WARRIOR]: { difficulty: Difficulty.WARRIOR, spawnInterval: 1000, gravity: 9, bombChance: 0.15 },
  [Difficulty.LEGEND]: { difficulty: Difficulty.LEGEND, spawnInterval: 750, gravity: 12, bombChance: 0.30 }
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Settings
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(THEMES[0]);
  const [currentEquipment, setCurrentEquipment] = useState<EquipmentConfig>(EQUIPMENTS[0]);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>(Difficulty.NOVICE);
  
  const [score, setScore] = useState<GameScore>({ score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const geminiServiceRef = useRef<GeminiLiveService | null>(null);
  const triggerRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const frameIntervalRef = useRef<number>();

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      return true;
    } catch (err) {
      console.error("Camera error:", err);
      setStatusMessage("Failed to access camera.");
      return false;
    }
  };

  const handleGesture = (side: 'left' | 'right') => {
    triggerRef.current[side] = Date.now();
  };

  const startGame = async () => {
    // Init Audio
    audioService.init();
    audioService.startBGM(currentDifficulty === Difficulty.LEGEND ? 'high' : 'low');

    setGameState(GameState.CONNECTING);
    const videoStarted = await startVideo();
    
    if (videoStarted) {
      const service = new GeminiLiveService(handleGesture, (status) => setStatusMessage(status));
      try {
        await service.connect();
        geminiServiceRef.current = service;
        setGameState(GameState.PLAYING);
        startFrameStream();
      } catch (e) {
        setGameState(GameState.IDLE);
        setStatusMessage("Failed to connect to Gemini.");
      }
    } else {
      setGameState(GameState.IDLE);
    }
  };

  const startFrameStream = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;
    if (!ctx || !video) return;

    frameIntervalRef.current = window.setInterval(async () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && geminiServiceRef.current) {
        const w = 320;
        const scale = w / video.videoWidth;
        const h = video.videoHeight * scale;
        canvas.width = w;
        canvas.height = h;
        
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        await geminiServiceRef.current.sendFrame(base64);
      }
    }, 100); 
  };

  const stopGame = () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (geminiServiceRef.current) geminiServiceRef.current.disconnect();
    if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    
    audioService.stopBGM();
    setGameState(GameState.GAME_OVER);
  };

  const resetGame = () => {
    setScore({ score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0 });
    setGameState(GameState.IDLE);
  };

  return (
    <div className="min-h-screen text-white font-sans overflow-hidden select-none transition-all duration-700"
         style={currentTheme.backgroundStyle}>
      
      {/* Header */}
      <header className="fixed top-0 w-full p-4 z-50 flex justify-between items-center bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2">
          <BoltIcon />
          <h1 className="text-2xl font-bold tracking-wider">NEON SLICE</h1>
        </div>
        <div className="text-xs uppercase font-bold tracking-widest opacity-50 hidden md:block">
           {currentEquipment.name} // {currentTheme.name}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full h-screen flex flex-col justify-center items-center pt-16">
        
        <div className="relative w-full max-w-4xl h-[80vh] bg-black/50 rounded-3xl border border-white/20 overflow-hidden shadow-2xl ring-1 ring-white/10">
          
          {/* Battle Background Overlay (Simulated) */}
          <div className="absolute inset-0 opacity-40 z-0" style={currentTheme.backgroundStyle}></div>

          {/* Vignette Overlay for Immersion */}
          <div className="absolute inset-0 pointer-events-none z-20"
               style={{
                 background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.8) 100%)'
               }}>
          </div>

          {/* Video Feed with Theme Filter */}
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover opacity-60 transform scale-x-[-1] transition-all duration-500" 
            style={{ filter: currentTheme.videoFilter }}
            muted 
            playsInline 
          />
          
          <GameCanvas 
            gameState={gameState} 
            score={score} 
            setScore={setScore} 
            videoRef={videoRef}
            triggerRef={triggerRef}
            levelConfig={DIFFICULTY_CONFIGS[currentDifficulty]}
            equipmentConfig={currentEquipment}
          />

          {/* HUD */}
          <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-30">
             <div className="flex flex-col">
               <span className="text-white/70 font-bold text-sm tracking-wider">SCORE</span>
               <span className="text-4xl font-mono font-black drop-shadow-md text-white">{score.score.toLocaleString()}</span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-white/70 font-bold text-sm tracking-wider">COMBO</span>
               <span className={`text-5xl font-mono font-black ${score.combo > 5 ? 'text-yellow-400 scale-110' : 'text-white'}`}>
                 x{score.combo}
               </span>
             </div>
          </div>

          {/* Status Toast */}
          {statusMessage && (
            <div className="absolute bottom-16 left-0 w-full text-center pointer-events-none z-30">
              <span className="bg-black/60 px-6 py-2 rounded-full text-cyan-300 border border-cyan-500/50 backdrop-blur animate-pulse font-mono">
                {statusMessage}
              </span>
            </div>
          )}

          {/* MENU SCREEN */}
          {gameState === GameState.IDLE && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50 p-6 overflow-y-auto">
              <div className="max-w-2xl w-full bg-slate-900/90 p-8 rounded-2xl border border-white/10 shadow-2xl my-auto">
                <h2 className="text-3xl font-bold mb-2 text-center text-white">MISSION BRIEFING</h2>
                <p className="text-slate-400 mb-8 text-center text-sm">
                  Controls: Hands 👋 / Head Tilt 🙆 / Eye Gaze 👀
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Theme Selector */}
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-2">Location</label>
                    <div className="flex flex-col gap-2">
                      {THEMES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setCurrentTheme(t)}
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold border transition-all duration-200 ${currentTheme.id === t.id ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500 hover:bg-slate-800'}`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Equipment Selector */}
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-2 flex items-center gap-2">
                      <SwordIcon /> Equipment
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {EQUIPMENTS.map(e => (
                        <button
                          key={e.id}
                          onClick={() => setCurrentEquipment(e)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl text-xs font-bold border transition-all duration-200 ${currentEquipment.id === e.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg scale-105' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500 hover:bg-slate-800'}`}
                        >
                          <span className="text-2xl mb-1">{e.icon}</span>
                          {e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Difficulty Selector */}
                <div className="mb-8">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-2 mb-4">Difficulty</label>
                  <div className="flex gap-2">
                    {Object.keys(DIFFICULTY_CONFIGS).map((d) => (
                      <button
                        key={d}
                        onClick={() => setCurrentDifficulty(d as Difficulty)}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                          currentDifficulty === d 
                          ? d === Difficulty.LEGEND ? 'bg-red-600 border-red-600 text-white shadow-red-900/50 shadow-lg' : 'bg-cyan-600 border-cyan-600 text-white shadow-cyan-900/50 shadow-lg'
                          : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                
                <button 
                  onClick={startGame}
                  className="w-full bg-white hover:bg-cyan-50 text-slate-900 font-black tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.3)] transform transition active:scale-95 flex items-center justify-center gap-2 text-lg"
                >
                  <CameraIcon />
                  START MISSION
                </button>
              </div>
            </div>
          )}

           {/* Game Over Screen */}
           {gameState === GameState.GAME_OVER && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-50 animate-in fade-in duration-500">
              <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600 mb-4 tracking-tighter">MISSION FAILED</h2>
              <div className="text-center mb-8 bg-white/5 p-8 rounded-2xl border border-white/10 w-64">
                <div className="text-sm uppercase tracking-widest text-slate-400 mb-2">Total Score</div>
                <div className="text-5xl text-white font-mono font-bold mb-4 border-b border-white/10 pb-4">{score.score}</div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Max Combo</span>
                  <span className="text-white">{score.maxCombo}</span>
                </div>
              </div>
              <button 
                onClick={resetGame}
                className="px-8 py-3 bg-white text-slate-900 font-bold rounded-full hover:bg-slate-200 transition-colors"
              >
                RETURN TO BASE
              </button>
            </div>
          )}

          {/* Connecting Loader */}
          {gameState === GameState.CONNECTING && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-50">
              <div className="relative w-20 h-20 mb-4">
                 <div className="absolute inset-0 border-4 border-cyan-900 rounded-full"></div>
                 <div className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-cyan-400 font-mono text-sm tracking-widest animate-pulse">ESTABLISHING NEURAL LINK...</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer Controls */}
      {gameState === GameState.PLAYING && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-4">
          <button 
            onClick={stopGame}
            className="bg-red-500/80 hover:bg-red-600 text-white w-14 h-14 rounded-full shadow-lg backdrop-blur flex items-center justify-center border border-white/20"
          >
            <span className="font-bold text-xs">EXIT</span>
          </button>
        </div>
      )}
    </div>
  );
}
