"use client";

import { useEffect, type RefObject } from "react";

/** Native keyboards resize the visual viewport, not necessarily 100dvh. */
export function useEditorViewport(
  open: boolean,
  dialogRef: RefObject<HTMLDialogElement | null>,
  bodyRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const viewport = window.visualViewport;
    let frame = 0;

    function update() {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      dialog!.style.setProperty("--editor-viewport-height", `${height}px`);
      dialog!.style.setProperty("--editor-viewport-top", `${top}px`);
      dialog!.style.setProperty(
        "--editor-viewport-bottom",
        `${Math.max(0, window.innerHeight - top - height)}px`,
      );
      dialog!.dataset.compactViewport = String(height <= 600);

      // Keep the focused field/error in the independently scrolling body.
      // Do not refocus: delayed focus can overwrite typing on iOS.
      const body = bodyRef.current;
      const active = document.activeElement;
      if (body && active instanceof HTMLElement && body.contains(active)) {
        const bounds = body.getBoundingClientRect();
        const field = active.getBoundingClientRect();
        if (field.bottom > bounds.bottom) {
          body.scrollTop += field.bottom - bounds.bottom + 8;
        } else if (field.top < bounds.top) {
          body.scrollTop -= bounds.top - field.top + 8;
        }
      }
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }

    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      for (const key of ["height", "top", "bottom"]) {
        dialog.style.removeProperty(`--editor-viewport-${key}`);
      }
      delete dialog.dataset.compactViewport;
    };
  }, [open, dialogRef, bodyRef]);
}
