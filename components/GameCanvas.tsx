
import React, { useEffect, useRef } from 'react';
import { GameState, Side, Target, Particle, GameScore, LevelConfig, Difficulty, EquipmentConfig } from '../types';
import { audioService } from '../services/audioService';

interface GameCanvasProps {
  gameState: GameState;
  score: GameScore;
  setScore: React.Dispatch<React.SetStateAction<GameScore>>;
  videoRef: React.RefObject<HTMLVideoElement>;
  triggerRef: React.MutableRefObject<{ left: number; right: number }>;
  levelConfig: LevelConfig;
  equipmentConfig: EquipmentConfig;
}

// Fruit Configuration
const FRUITS = [
  { emoji: '🍉', color: '#ef4444' }, 
  { emoji: '🍌', color: '#facc15' }, 
  { emoji: '🍍', color: '#f59e0b' }, 
  { emoji: '🥥', color: '#f5f5f4' }, 
  { emoji: '🥝', color: '#84cc16' }, 
  { emoji: '🍎', color: '#dc2626' }, 
  { emoji: '🍇', color: '#9333ea' }, 
  { emoji: '🍊', color: '#f97316' }, 
];

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  gameState, 
  score, 
  setScore,
  triggerRef,
  levelConfig,
  equipmentConfig
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Game Logic Refs
  const targetsRef = useRef<Target[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const scoreRef = useRef<GameScore>(score);

  // Constants
  const STRIKE_WINDOW_MS = 600; 
  const HIT_THRESHOLD_Y = 220; 

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // Handle Keyboard (Fallback)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== GameState.PLAYING) return;
      if (e.key === 'a' || e.key === 'ArrowLeft') {
        triggerRef.current.left = Date.now();
      }
      if (e.key === 'd' || e.key === 'ArrowRight') {
        triggerRef.current.right = Date.now();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, triggerRef]);

  // Handle Mouse/Touch Interaction
  const handleInteraction = (x: number) => {
    if (gameState !== GameState.PLAYING || !canvasRef.current) return;
    const width = canvasRef.current.width;
    
    if (x < width * 0.4) {
      triggerRef.current.left = Date.now();
    } else if (x > width * 0.6) {
      triggerRef.current.right = Date.now();
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) handleInteraction(e.clientX - rect.left);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && e.touches.length > 0) handleInteraction(e.touches[0].clientX - rect.left);
  };

  const spawnTarget = (width: number) => {
    const side: Side = Math.random() > 0.5 ? 'left' : 'right';
    
    // Determine if Bomb or Fruit based on difficulty
    const isBomb = Math.random() < levelConfig.bombChance;
    const fruitIndex = Math.floor(Math.random() * FRUITS.length);
    
    targetsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      side,
      y: -100,
      hit: false,
      missed: false,
      type: isBomb ? 'bomb' : 'fruit',
      fruitIndex
    });
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 15 + 5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color
      });
    }
  };

  const update = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    if (gameState !== GameState.PLAYING) return;

    const width = canvas.width;
    const height = canvas.height;
    const now = Date.now();
    const hitY = height - 160; 

    // Spawning Logic
    if (now - lastSpawnRef.current > levelConfig.spawnInterval) { 
      spawnTarget(width);
      lastSpawnRef.current = now;
    }

    // --- CHECK HITS ---
    if (now - triggerRef.current.left < STRIKE_WINDOW_MS) {
       checkHit('left', hitY, HIT_THRESHOLD_Y, width);
    }
    if (now - triggerRef.current.right < STRIKE_WINDOW_MS) {
       checkHit('right', hitY, HIT_THRESHOLD_Y, width);
    }

    // Update Targets
    targetsRef.current.forEach(t => {
      t.y += levelConfig.gravity; // Variable speed

      // Miss detection (Only fruits count as misses)
      if (t.y > height + 100 && !t.hit && !t.missed) {
        t.missed = true;
        if (t.type === 'fruit') {
           updateScore('miss');
        }
      }
    });

    // Cleanup Targets
    targetsRef.current = targetsRef.current.filter(t => t.y < height + 150 && !t.hit);

    // Update Particles
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
  };

  const checkHit = (side: Side, hitY: number, threshold: number, width: number) => {
    // Find closest target
    const targetIndex = targetsRef.current.findIndex(t => 
      t.side === side && 
      !t.hit && 
      Math.abs(t.y - hitY) < threshold
    );

    if (targetIndex !== -1) {
      const t = targetsRef.current[targetIndex];
      t.hit = true;
      const xPos = side === 'left' ? width * 0.20 : width * 0.80;
      
      if (t.type === 'bomb') {
        createExplosion(xPos, t.y, '#000000');
        audioService.playBombSfx();
        updateScore('bomb');
      } else {
        const fruitConfig = FRUITS[t.fruitIndex] || FRUITS[0];
        createExplosion(xPos, t.y, fruitConfig.color); 
        audioService.playSliceSfx();
        updateScore('hit');
      }
    }
  };

  const updateScore = (type: 'hit' | 'miss' | 'bomb') => {
    setScore(prev => {
      const newScore = { ...prev };
      if (type === 'hit') {
        newScore.score += 100 + (prev.combo * 10);
        newScore.combo += 1;
        newScore.hits += 1;
        if (newScore.combo > newScore.maxCombo) newScore.maxCombo = newScore.combo;
      } else if (type === 'bomb') {
        newScore.score = Math.max(0, newScore.score - 500);
        newScore.combo = 0;
        newScore.misses += 1; // Count bomb as a negative event
      } else {
        newScore.combo = 0;
        newScore.misses += 1;
      }
      return newScore;
    });
  };

  const draw = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const width = canvas.width;
    const height = canvas.height;
    const now = Date.now();

    ctx.clearRect(0, 0, width, height);

    const zoneY = height - 160;
    
    // --- DRAW EQUIPMENT EFFECTS ---
    const drawEquipmentEffect = (side: Side, x: number) => {
      const timeSinceTrigger = now - triggerRef.current[side];
      const isActive = timeSinceTrigger < 300; 
      
      if (isActive) {
        ctx.save();
        // Use 'screen' or 'lighter' to make effects glow but see-through
        ctx.globalCompositeOperation = 'screen'; 
        
        const progress = timeSinceTrigger / 300;
        const alpha = 1 - progress;
        
        ctx.shadowColor = equipmentConfig.color;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = equipmentConfig.color;
        ctx.fillStyle = equipmentConfig.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.globalAlpha = alpha;

        if (equipmentConfig.type === 'slash') {
            // Dynamic curved slash
            const dir = side === 'left' ? 1 : -1;
            ctx.lineWidth = 12 * alpha;
            
            ctx.beginPath();
            ctx.moveTo(x - (120 * dir), zoneY - 100 + (progress * 50));
            // Bezier curve for fluid slash motion
            ctx.quadraticCurveTo(
              x, 
              zoneY + (progress * 100), 
              x + (120 * dir), 
              zoneY + 100 + (progress * 50)
            );
            ctx.stroke();

            // Center flash (subtle)
            ctx.beginPath();
            ctx.arc(x, zoneY, 60 * progress, 0, Math.PI * 2);
            ctx.globalAlpha = alpha * 0.2; // Very transparent fill
            ctx.fill();

        } else if (equipmentConfig.type === 'impact') {
            // Expanding Shockwave Ring
            ctx.lineWidth = 20 * (1 - progress);
            
            ctx.beginPath();
            ctx.arc(x, zoneY, 40 + (progress * 120), 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner Core
            ctx.beginPath();
            ctx.arc(x, zoneY, 30, 0, Math.PI * 2);
            ctx.globalAlpha = alpha * 0.4;
            ctx.fill();

        } else if (equipmentConfig.type === 'beam') {
            // Vertical Energy Pillar
            const beamWidth = 80 * (1 - progress); 
            
            // Inner core (White hot)
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillRect(x - (beamWidth * 0.2), 0, beamWidth * 0.4, height);
            
            // Outer glow
            ctx.fillStyle = equipmentConfig.color;
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillRect(x - (beamWidth * 0.5), 0, beamWidth, height);
            
            // Electricity sparks
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            for(let i=0; i < height; i+=30) {
              ctx.lineTo(x + (Math.random() * 40 - 20), i);
            }
            ctx.stroke();
        }
        
        ctx.restore();
      } else {
        // IDLE STATE - Minimalist Brackets
        ctx.save();
        ctx.strokeStyle = `${equipmentConfig.color}88`; // 50% opacity
        ctx.lineWidth = 3;
        ctx.shadowColor = equipmentConfig.color;
        ctx.shadowBlur = 10;
        
        const size = 60; 
        const bracketLen = 20;

        ctx.beginPath();
        // Top Left
        ctx.moveTo(x - size, zoneY - size + bracketLen);
        ctx.lineTo(x - size, zoneY - size);
        ctx.lineTo(x - size + bracketLen, zoneY - size);
        
        // Top Right
        ctx.moveTo(x + size - bracketLen, zoneY - size);
        ctx.lineTo(x + size, zoneY - size);
        ctx.lineTo(x + size, zoneY - size + bracketLen);

        // Bottom Left
        ctx.moveTo(x - size, zoneY + size - bracketLen);
        ctx.lineTo(x - size, zoneY + size);
        ctx.lineTo(x - size + bracketLen, zoneY + size);

        // Bottom Right
        ctx.moveTo(x + size - bracketLen, zoneY + size);
        ctx.lineTo(x + size, zoneY + size);
        ctx.lineTo(x + size, zoneY + size - bracketLen);
        
        ctx.stroke();
        
        // Subtle pulsing center glow
        const pulse = (Math.sin(now / 300) + 1) / 2;
        ctx.fillStyle = equipmentConfig.color;
        ctx.globalAlpha = 0.05 + (pulse * 0.1);
        ctx.beginPath();
        ctx.arc(x, zoneY, size * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };

    drawEquipmentEffect('left', width * 0.20); 
    drawEquipmentEffect('right', width * 0.80); 

    // --- DRAW TARGETS ---
    targetsRef.current.forEach(t => {
      if (t.hit) return;
      
      const x = t.side === 'left' ? width * 0.20 : width * 0.80;
      
      ctx.font = '80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add a subtle dark glow behind fruit to separate it from background effects
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 20;
      
      if (t.type === 'bomb') {
         ctx.fillText('💣', x, t.y);
      } else {
         const fruit = FRUITS[t.fruitIndex] || FRUITS[0];
         ctx.fillText(fruit.emoji, x, t.y);
      }
      ctx.restore();
    });

    // --- DRAW PARTICLES ---
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; // Particles glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.random() * 6 + 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1.0;
    });
  };

  const loop = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
        update(canvas, ctx);
        draw(canvas, ctx);
      }
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, equipmentConfig]); 

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute top-0 left-0 w-full h-full z-10 cursor-crosshair touch-none"
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
      onMouseDown={onMouseMove}
    />
  );
};
