export type RankTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Master";

export interface LobbyPlayer {
  id: string;
  name: string;
  isLeader?: boolean;
  isAutofill?: boolean;
  rank: RankTier;
  rp: number;
  skinId: string;
  weaponId: string;
}

export interface ClashSquadMatchRoster {
  teamSize: 4;
  alpha: LobbyPlayer[];
  bravo: LobbyPlayer[];
  autofillCountAlpha: number;
  autofillCountBravo: number;
}

const MAX_PARTY_SIZE = 4;
const MIN_PARTY_SIZE = 1;

export function createParty(leader: LobbyPlayer): LobbyPlayer[] {
  return [{ ...leader, isLeader: true, isAutofill: false }];
}

export function addPartyMember(party: LobbyPlayer[], member: LobbyPlayer): LobbyPlayer[] {
  if (party.length >= MAX_PARTY_SIZE) return party;
  if (party.some((p) => p.id === member.id)) return party;
  return [...party, { ...member, isLeader: false, isAutofill: false }];
}

export function removePartyMember(party: LobbyPlayer[], memberId: string): LobbyPlayer[] {
  if (party.length <= MIN_PARTY_SIZE) return party;
  const filtered = party.filter((p) => p.id !== memberId);
  if (filtered.length > 0 && !filtered.some((p) => p.isLeader)) {
    filtered[0].isLeader = true;
  }
  return filtered;
}

function createAutofillPlayer(slotIndex: number, referenceRank: RankTier, side: "A" | "B"): LobbyPlayer {
  return {
    id: `autofill-${side}-${slotIndex}-${Date.now()}`,
    name: `Player_${side}${slotIndex}`,
    isAutofill: true,
    rank: referenceRank,
    rp: 0,
    skinId: "default-skin",
    weaponId: "default-rifle",
  };
}

/**
 * Mengisi otomatis slot kosong pada tim (jika party 1-3 orang) agar kedua tim genap 4vs4.
 */
export function buildMatchRoster4v4(
  userParty: LobbyPlayer[],
  enemyParty: LobbyPlayer[] = [],
): ClashSquadMatchRoster {
  const clampedUser = userParty.slice(0, MAX_PARTY_SIZE);
  const clampedEnemy = enemyParty.slice(0, MAX_PARTY_SIZE);
  const refRank = clampedUser[0]?.rank ?? "Bronze";

  const alpha: LobbyPlayer[] = [...clampedUser];
  let autofillCountAlpha = 0;
  while (alpha.length < MAX_PARTY_SIZE) {
    autofillCountAlpha += 1;
    alpha.push(createAutofillPlayer(alpha.length + 1, refRank, "A"));
  }

  const bravo: LobbyPlayer[] = [...clampedEnemy];
  let autofillCountBravo = 0;
  while (bravo.length < MAX_PARTY_SIZE) {
    autofillCountBravo += 1;
    bravo.push(createAutofillPlayer(bravo.length + 1, refRank, "B"));
  }

  return {
    teamSize: 4,
    alpha,
    bravo,
    autofillCountAlpha,
    autofillCountBravo,
  };
}

export function calculateRankedRpDelta(won: boolean, currentRp: number): number {
  const delta = won ? 24 : -16;
  return Math.max(0, currentRp + delta);
}
