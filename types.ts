import React from 'react';

export enum GameState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export type Side = 'left' | 'right';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Target {
  id: string;
  side: Side;
  y: number;
  hit: boolean;
  missed: boolean;
  type: 'fruit' | 'bomb';
  fruitIndex: number; // Index into the fruit config array
}

export interface GameScore {
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
}

export enum Difficulty {
  NOVICE = 'NOVICE',
  WARRIOR = 'WARRIOR',
  LEGEND = 'LEGEND'
}

export interface ThemeConfig {
  id: string;
  name: string;
  backgroundStyle: React.CSSProperties;
  videoFilter: string; // CSS filter for the camera feed
  primaryColor: string;
  secondaryColor: string;
}

export interface EquipmentConfig {
  id: string;
  name: string;
  icon: string;
  type: 'slash' | 'impact' | 'beam';
  color: string;
  soundType: 'sharp' | 'heavy' | 'electric';
}

export interface LevelConfig {
  difficulty: Difficulty;
  spawnInterval: number;
  gravity: number; // speed
  bombChance: number;
}