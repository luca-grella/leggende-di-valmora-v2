// Per-island tints of the core PALETTE (docs/GDD.md "Look"): every island keeps the warm Sun/Moon
// style but shifts grass, sand, rock, path and roof colours (snow, moor, canyon, volcano…).
import { PALETTE } from '../core/toon.js';

const base = {
  grass: PALETTE.grass, grass2: PALETTE.grass2, grassDark: '#5fae3e', meadow: '#a8dc62',
  sand: PALETTE.sand, sandWet: '#e2c286', bed: '#7fd6c4', bedDeep: '#2a8fa8',
  path: PALETTE.path, path2: '#c99d62', plaza: '#efd9b0', plaza2: '#e2c89a',
  rock: PALETTE.rock, rockDark: '#94806c', cliff: '#d8c6a4',
  tallGrass: PALETTE.tallGrass, tallGrassTip: '#6fc24a',
  leaf: '#5cb848', leaf2: '#7fd05a', leafDark: '#3f9a3e', trunk: '#9a6a43',
  wall: PALETTE.wall, wall2: '#ffe6c2', roofs: [PALETTE.roofCoral, PALETTE.roofTeal, PALETTE.roofSun, PALETTE.roofLilac],
  wood: PALETTE.wood, woodDark: '#8a5a36', trim: '#ffffff', door: ['#3fa6d9', '#e8674a', '#f5b83d', '#7fc24a', '#9b7fd1'],
  flowers: [PALETTE.pink, PALETTE.yellow, '#ffffff', '#ff8a5c', '#b48cff'],
  trees: ['round', 'round', 'palm'],
  snow: 0,
};

/** island id → colour set (merged over the base). */
export const WORLD_COLORS = {
  aurora: { ...base, trees: ['round', 'round', 'round', 'cypress'] },
  giada: {
    ...base, grass: '#5fbf4a', grass2: '#7ccf52', grassDark: '#3f9a3a', meadow: '#8fd35a', leaf: '#3fae4a', leaf2: '#62c652', leafDark: '#2d8a3c',
    path: '#c9a06a', rock: '#9fae8c', rockDark: '#7a8a6c', tallGrass: '#2f8f3a', tallGrassTip: '#5abf45', trees: ['jungle', 'jungle', 'palm', 'round'],
    roofs: ['#5bb06a', '#d9824a', '#2fa8a0', '#c9a04a'],
  },
  nebbia: {
    ...base, grass: '#8fb86a', grass2: '#a3c27a', grassDark: '#6f9a5a', meadow: '#b5a0c8', path: '#bfa786', path2: '#a8916f',
    rock: '#a8a2b4', rockDark: '#857f96', cliff: '#bcb6c8', tallGrass: '#6f8f4a', tallGrassTip: '#a07fc0', leaf: '#6fa85a', leaf2: '#8fbf6a', leafDark: '#4f7f4a',
    flowers: ['#b48cff', '#d6a8ff', '#ffffff', '#ff8ac0'], trees: ['round', 'pine'], roofs: ['#7f6fb8', '#5f7f9e', '#9b7fd1', '#c86a6a'],
    wall: '#e8e2d8', wall2: '#d8d2c8',
  },
  gelida: {
    ...base, grass: '#eef6ff', grass2: '#ffffff', grassDark: '#cfe2f2', meadow: '#e2eefa', sand: '#e6e2d4', sandWet: '#c8c4b8',
    path: '#c8d4e2', path2: '#b4c2d4', plaza: '#dde6f0', plaza2: '#c9d6e4', rock: '#9fb0c4', rockDark: '#7f90a8', cliff: '#c4d2e2',
    tallGrass: '#8fbf9a', tallGrassTip: '#d8f0ff', leaf: '#3f8a6a', leaf2: '#5aa07f', leafDark: '#2f6f5a', trunk: '#7a5a43',
    flowers: ['#bfe6ff', '#ffffff', '#d8c8ff'], trees: ['pine', 'pine', 'pine'], roofs: ['#3f7fbf', '#c84a4a', '#2fa8a0', '#9b7fd1'], snow: 1,
  },
  coralline: {
    ...base, grass: '#86d150', grass2: '#a2de5c', sand: '#fbe9b8', sandWet: '#efd59a', bed: '#8ae8d8', path: '#e8cf9a', path2: '#dcc088',
    plaza: '#f5e6c4', trees: ['palm', 'palm', 'round'], roofs: ['#2fa8a0', '#e8674a', '#3fa6d9', '#f5b83d'],
  },
  sole: {
    ...base, grass: '#7cc84a', grass2: '#98d656', sand: '#5a5560', sandWet: '#45414c', bed: '#3fb4b0', path: '#c9a074', rock: '#6a6070', rockDark: '#4f4757',
    cliff: '#7a6a72', tallGrass: '#3f9a3a', trees: ['palm', 'palm', 'jungle'], roofs: ['#e8674a', '#f5b83d', '#2fa8a0', '#ff8a5c'],
    flowers: [PALETTE.pink, '#ff8a3c', PALETTE.yellow, '#ffffff'],
  },
  ramato: {
    ...base, grass: '#d8b46a', grass2: '#e2c27a', grassDark: '#c49a5a', meadow: '#e8c98a', sand: '#f0c890', sandWet: '#d8ac74',
    path: '#e6b47a', path2: '#d49c64', plaza: '#f2d2a2', plaza2: '#e4bf8c', rock: '#d0764a', rockDark: '#b05a3a', cliff: '#e08a5a',
    tallGrass: '#a8a04a', tallGrassTip: '#d8c86a', leaf: '#7fa04a', leaf2: '#9ab45a', leafDark: '#5f803a', trees: ['cactus', 'cactus', 'palm'],
    wall: '#f4d8b4', wall2: '#ecc89c', roofs: ['#d0764a', '#2fa8a0', '#f5b83d', '#e8674a'],
  },
};

/** Cave tints (dark toon lighting, glowing accents). */
export const CAVE_COLORS = {
  grotta_sussurro: { floor: '#6a6488', wall: '#4f4a6e', glow: '#b48cff', accent: '#7fe0ff' },
  grotta_cristallo: { floor: '#9fb4d4', wall: '#6f84a8', glow: '#9ff0ff', accent: '#ffffff' },
  grotta_marina: { floor: '#5f9a9a', wall: '#3f7480', glow: '#5ff0d8', accent: '#ffb07a' },
  grotta_vulcano: { floor: '#6a4a4a', wall: '#4a3438', glow: '#ff7a3c', accent: '#ffd23f' },
};

export const colorsFor = island => WORLD_COLORS[island] || WORLD_COLORS.aurora;
