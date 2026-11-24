import { Input } from "./input";
import {
  VirtualKeyMapping,
  VirtualKeyMappingOptions
} from "./virtual-keymapping";

export interface CreateVirtualControlsOptions
  extends VirtualKeyMappingOptions {
  /** Mount even on a non-touch device (desktop testing). */
  forceEnable?: boolean;
}

function detectTouchDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || "");
  return (
    uaMobile ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: coarse)").matches
  );
}

export function createVirtualControls(
  input: Input,
  options: CreateVirtualControlsOptions = {}
): VirtualKeyMapping | null {
  const { forceEnable, ...mappingOptions } = options;

  if (!forceEnable && !detectTouchDevice()) {
    return null;
  }

  const controls = new VirtualKeyMapping(input, mappingOptions);

  controls.mount();

  return controls;
}