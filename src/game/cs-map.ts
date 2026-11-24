export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface CsMapConfig {
  id: string;
  folderName: string;
  name: string;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  spawns: {
    alpha: SpawnPoint[];
    bravo: SpawnPoint[];
  };
}

export const CS_MAP_POOL: CsMapConfig[] = [
  {
    id: "burninghall",
    folderName: "burninghall",
    name: "Burning Hall",
    bounds: { minX: -36, maxX: 36, minZ: -36, maxZ: 36 },
    spawns: {
      alpha: [
        { x: -22, y: 0, z: -6, yaw: Math.PI / 2 },
        { x: -22, y: 0, z: -2, yaw: Math.PI / 2 },
        { x: -22, y: 0, z: 2, yaw: Math.PI / 2 },
        { x: -22, y: 0, z: 6, yaw: Math.PI / 2 },
      ],
      bravo: [
        { x: 22, y: 0, z: -6, yaw: -Math.PI / 2 },
        { x: 22, y: 0, z: -2, yaw: -Math.PI / 2 },
        { x: 22, y: 0, z: 2, yaw: -Math.PI / 2 },
        { x: 22, y: 0, z: 6, yaw: -Math.PI / 2 },
      ],
    },
  },
  {
    id: "crackdown",
    folderName: "crackdown",
    name: "Crackdown",
    bounds: { minX: -34, maxX: 34, minZ: -34, maxZ: 34 },
    spawns: {
      alpha: [
        { x: -20, y: 0, z: -5, yaw: Math.PI / 2 },
        { x: -20, y: 0, z: -2, yaw: Math.PI / 2 },
        { x: -20, y: 0, z: 2, yaw: Math.PI / 2 },
        { x: -20, y: 0, z: 5, yaw: Math.PI / 2 },
      ],
      bravo: [
        { x: 20, y: 0, z: -5, yaw: -Math.PI / 2 },
        { x: 20, y: 0, z: -2, yaw: -Math.PI / 2 },
        { x: 20, y: 0, z: 2, yaw: -Math.PI / 2 },
        { x: 20, y: 0, z: 5, yaw: -Math.PI / 2 },
      ],
    },
  },
  {
    id: "mstation",
    folderName: "nstation",
    name: "Mstation",
    bounds: { minX: -38, maxX: 38, minZ: -32, maxZ: 32 },
    spawns: {
      alpha: [
        { x: -24, y: 0, z: -6, yaw: Math.PI / 2 },
        { x: -24, y: 0, z: -2, yaw: Math.PI / 2 },
        { x: -24, y: 0, z: 2, yaw: Math.PI / 2 },
        { x: -24, y: 0, z: 6, yaw: Math.PI / 2 },
      ],
      bravo: [
        { x: 24, y: 0, z: -6, yaw: -Math.PI / 2 },
        { x: 24, y: 0, z: -2, yaw: -Math.PI / 2 },
        { x: 24, y: 0, z: 2, yaw: -Math.PI / 2 },
        { x: 24, y: 0, z: 6, yaw: -Math.PI / 2 },
      ],
    },
  },
  {
    id: "library",
    folderName: "library",
    name: "Library",
    bounds: { minX: -35, maxX: 35, minZ: -35, maxZ: 35 },
    spawns: {
      alpha: [
        { x: -21, y: 0, z: -6, yaw: Math.PI / 2 },
        { x: -21, y: 0, z: -2, yaw: Math.PI / 2 },
        { x: -21, y: 0, z: 2, yaw: Math.PI / 2 },
        { x: -21, y: 0, z: 6, yaw: Math.PI / 2 },
      ],
      bravo: [
        { x: 21, y: 0, z: -6, yaw: -Math.PI / 2 },
        { x: 21, y: 0, z: -2, yaw: -Math.PI / 2 },
        { x: 21, y: 0, z: 2, yaw: -Math.PI / 2 },
        { x: 21, y: 0, z: 6, yaw: -Math.PI / 2 },
      ],
    },
  },
  {
    id: "redrock",
    folderName: "construction",
    name: "Red Rock",
    bounds: { minX: -36, maxX: 36, minZ: -36, maxZ: 36 },
    spawns: {
      alpha: [
        { x: -22, y: 0, z: -6, yaw: Math.PI / 2 },
        { x: -22, y: 0, z: -2, yaw: Math.PI / 2 },
        { x: -22, y: 0, z: 2, yaw: Math.PI / 2 },
        { x: -22, y: 0, z: 6, yaw: Math.PI / 2 },
      ],
      bravo: [
        { x: 22, y: 0, z: -6, yaw: -Math.PI / 2 },
        { x: 22, y: 0, z: -2, yaw: -Math.PI / 2 },
        { x: 22, y: 0, z: 2, yaw: -Math.PI / 2 },
        { x: 22, y: 0, z: 6, yaw: -Math.PI / 2 },
      ],
    },
  },
];

export const DEFAULT_CS_MAP: CsMapConfig = CS_MAP_POOL[0];

export function pickRandomCsMap(): CsMapConfig {
  const idx = Math.floor(Math.random() * CS_MAP_POOL.length);
  return CS_MAP_POOL[idx];
}
