import { ClashSquadLobby } from "./lobby/cs-lobby";
import { ClashSquadEngineBridge } from "./game/cs-engine-bridge";
import { LobbyPlayer } from "./ranked/party-ranked";

const rootEl = document.getElementById("app") as HTMLElement;

const initialLeader: LobbyPlayer = {
  id: "player-1",
  name: "Ubed_CS",
  isLeader: true,
  rank: "Gold",
  rp: 1240,
  skinId: "Cyber_Vanguard",
  weaponId: "M4A1_Ranked",
};

let lobby: ClashSquadLobby | null = null;
let bridge: ClashSquadEngineBridge | null = null;

function openLobby(leader: LobbyPlayer): void {
  bridge?.cleanup();
  bridge = null;

  lobby = new ClashSquadLobby(rootEl, leader, {
    onStartRankedMatch(roster, selectedMap) {
      lobby?.destroy();
      lobby = null;

      bridge = new ClashSquadEngineBridge({
        container: rootEl,
        roster,
        mapConfig: selectedMap,
        customHudUrl: "/custom-hud.html",
        onMatchFinished({ won, newRp, leader: finishedLeader }) {
          const updatedLeader: LobbyPlayer = {
            ...(finishedLeader ?? leader),
            rp: newRp,
          };
          alert(
            won
              ? `BOOYAH / MENANG RANKED! RP kamu sekarang: ${newRp}`
              : `KALAH RANKED! RP kamu sekarang: ${newRp}`
          );
          openLobby(updatedLeader);
        },
      });

      void bridge.start();
    },
    onOpenSkinMenu(player) {
      const nextSkin = player.skinId === "Cyber_Vanguard" ? "Shadow_Ops" : "Cyber_Vanguard";
      lobby?.setLeaderLoadout(nextSkin, player.weaponId);
    },
    onOpenWeaponMenu(player) {
      const nextWeapon = player.weaponId === "M4A1_Ranked" ? "MP5_Rush" : "M4A1_Ranked";
      lobby?.setLeaderLoadout(player.skinId, nextWeapon);
    },
    onOpenCustomHud() {
      window.location.href = "/custom-hud.html";
    },
  });

  lobby.mount();
}

openLobby(initialLeader);
