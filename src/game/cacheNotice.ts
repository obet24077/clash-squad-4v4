// One-time box: the browser does not keep the downloaded game files (src/cache/cacheProbe.ts).
import { loadStrings, tOr } from "../lobby/ui/i18n.ts";
import { CrossMessageBox } from "./crossMessageBox.ts";

// [RECRIADO]: the original client has no such message (it installs to disk); the Cross message popup carries it.
const TEXT = "Your browser is not saving the game files (incognito mode, disabled cache, or insufficient disk space). Each session will require everything to be downloaded again. Please use a standard browser tab and free up some disk space.";

export async function showCacheNotice(host: HTMLElement): Promise<void> {
  await loadStrings();
  const box = await CrossMessageBox.create(host, {
    caption: tOr("STBL_IDX_COMMON_MSGBOX_CAPTION", "Notice"),
    message: TEXT,
    confirm: { label: tOr("STBL_IDX_BUTTON_OK", "Confirm"), onClick: () => box.destroy() },
    modal: true,
  });
}
