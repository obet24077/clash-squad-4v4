/** Bot names by slot: every peer derives the same name of an AI slot (the wire carries none). [RECRIADO] */
export const BOT_NAMES = [
  "Viper", "Hawk", "Kobra", "Tank", "Ghost", "Raven", "Blitz", "Rex", "Jaguar", "Nitro",
  "Sniper", "Falcon", "Shadow", "Bravo", "Delta", "Tiger", "Spike", "Wolf", "Zulu", "Echo",
  "Ghost", "Spectre", "Reaper", "Phantom", "Wraith", "Stalker", "Nomad", "Rogue", "Scout", "Ranger",
  "Commando", "Sentinel", "Apex", "Titan", "Goliath", "Vanguard", "Paladin", "Templar", "Crusader", "Gladiator",
  "Bullet", "Trigger", "Magnum", "Revolver", "Shotgun", "Bunker", "Claymore", "C4", "Grenade", "Flashbang",
  "Smoke", "Crosshair", "Recoil", "Headshot", "Muzzle", "Suppressor", "Caliber", "Ballistic", "Armor", "Shield",
  "Panther", "Leopard", "Cheetah", "Puma", "Lion", "Bear", "Grizzly", "Badger", "Wolverine", "Scorpion",
  "Python", "Viper", "Mamba", "Rattler", "Shark", "Orca", "T-Rex", "Raptor", "Cerberus", "Hydra",
  "Storm", "Thunder", "Lightning", "Cyclone", "Tornado", "Blizzard", "Frost", "Inferno", "Magma", "Venom",
  "Toxic", "Acid", "Chaos", "Panic", "Anarchy", "Destiny", "Rage", "Fury", "Vengeance", "Havoc",
];

export const botNameOfSlot = (slot: number): string => BOT_NAMES[slot % BOT_NAMES.length];
