"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SlotDigits } from "@/components/slot-digits";
import { introDefinitelyWontShow, willIntroShow } from "@/components/site-intro";

type CaseCounterProps = {
  count: number;
  /** Ref to the last row's title — the same element the sticky release point
   *  is aligned to (see project-grid-section.tsx). Used to detect that release. */
  lastTitleRef: React.RefObject<HTMLDivElement | null>;
};

/** Roughly where this counter itself sits (bottom-6 + its own ~15px height). */
const RELEASE_ZONE_PX = 40;

/**
 * Sticks to the bottom-right of the viewport while its parent (the project grid)
 * scrolls past, then releases exactly when the last row's title reaches it —
 * see the negative margin on ProjectList in project-grid-section.tsx. It fades
 * out right at that release point (and fades back in if you scroll back up
 * before reaching it), detected by watching when the last title's top rises
 * into the same bottom-of-viewport band this counter occupies.
 *
 * Also replays its count-up from 0 whenever site-intro.tsx's splash finishes
 * and dispatches "andmade:intro-complete" (see project-list.tsx for the same
 * mechanism on the project cards' own reveal) — while that splash sat on top,
 * this counter kept running normally underneath it, so by the time the
 * splash is gone the count-up would otherwise have already finished
 * silently, with nothing left to see.
 *
 * The count-up itself is SlotDigits (slot-digits.tsx) — a slot-machine/
 * odometer-style digit roll per explicit spec ("トップの右下33 casesも最初に
 * 表示されるときスロットにして"), replacing what used to be a plain eased
 * numeric interpolation (0→count over COUNT_UP_DURATION_MS via rAF). Keying
 * it on `replayGeneration` forces a full fresh mount on every intro-complete
 * replay, which is what makes it spin all the way up from 0 again each time
 * (a mounted SlotDigits instance only animates in response to its own prop
 * changing — remounting is how every other one-shot replay in this codebase
 * restarts an animation, e.g. the gauge fill in studies-gallery.tsx). A few
 * A few extra flourish spins (extraSpins=2) and a longer duration than the
 * Studies gallery's own use of this same component: this is a rare,
 * deliberate reveal rather than frequent live-navigation feedback, so it can
 * afford to be showier and slower.
 */
export function CaseCounter({ count, lastTitleRef }: CaseCounterProps) {
  const pathname = usePathname();
  const [released, setReleased] = useState(false);
  const [replayGeneration, setReplayGeneration] = useState(0);
  // `revealed` — per direct follow-up ("トップ右下の29 casesもイントロが終
  // わってから表示するようにして"): same `introDefinitelyWontShow()`/
  // `willIntroShow()`/"andmade:intro-complete" pairing site-header.tsx's own
  // `fadeIn` uses (see that component's own doc comment on `revealed` for the
  // full reasoning, including why the lazy initializer specifically calls
  // `introDefinitelyWontShow()` rather than `!willIntroShow(pathname)`, to
  // avoid a hydration mismatch). No `fadeIn` prop gate here unlike
  // SiteHeader — this component is only ever rendered on Home
  // (project-grid-section.tsx, itself Home-only), so it can apply this
  // unconditionally rather than needing an opt-in per call site.
  const [revealed, setRevealed] = useState(() => introDefinitelyWontShow());

  useEffect(() => {
    if (!willIntroShow(pathname)) return;

    function handleRevealOnIntroComplete() {
      setRevealed(true);
    }
    window.addEventListener("andmade:intro-complete", handleRevealOnIntroComplete, { once: true });
    return () => window.removeEventListener("andmade:intro-complete", handleRevealOnIntroComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: `pathname` is intentionally only read at its initial value, matching site-header.tsx's own identical convention.
  }, []);

  useEffect(() => {
    function handleIntroComplete() {
      setReplayGeneration((generation) => generation + 1);
    }
    window.addEventListener("andmade:intro-complete", handleIntroComplete);
    return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
  }, []);

  // Re-attaches on every `replayGeneration` bump, not just on mount — every
  // time site-intro.tsx's splash finishes, project-list.tsx fully remounts
  // every ProjectCard (a bumped `key`, not an in-place update — see its own
  // comment), which replaces the actual DOM node behind lastTitleRef.current
  // with a brand new one. lastTitleRef itself is a plain RefObject (stable
  // identity, so an effect depending only on it never re-runs), so without
  // this, the observer set up here keeps watching the *old*, now-detached
  // node forever after that remount — on a normal page load, the intro
  // always plays and always triggers exactly that remount, so this
  // effectively broke the scroll-to-fade behavior on every single visit
  // (reported as "33 casesがスクロールで消える仕様だったのが機能しなくなってる").
  useEffect(() => {
    const lastTitle = lastTitleRef.current;
    if (!lastTitle) return;

    // threshold: 1 — per direct follow-up that the fade-out fired too early
    // ("33casesがフェードアウトするタイミングがちょっと早い。最後の列が表示
    // されてからにして"): IntersectionObserver's default threshold (0) fires
    // the instant *any* single pixel of the target (lastTitleRef — the whole
    // last card, title *and* its meta block below, not just the title line)
    // crosses into the shrunken root region below, i.e. while the row was
    // still only partway into view. Requiring the full target (threshold: 1)
    // means `released` only flips once the *entire* last row has cleared
    // that same -RELEASE_ZONE_PX band, genuinely after it's fully displayed.
    const observer = new IntersectionObserver(([entry]) => setReleased(entry.isIntersecting), {
      rootMargin: `0px 0px -${RELEASE_ZONE_PX}px 0px`,
      threshold: 1,
    });
    observer.observe(lastTitle);
    return () => observer.disconnect();
  }, [lastTitleRef, replayGeneration]);

  return (
    // pointer-events-none: this div has no explicit width, so as a
    // block-level element it spans the full row — which, because of the
    // negative margin in project-grid-section.tsx, sits right over the last
    // row's cards (the gap between their underlined title and the meta text
    // below it). Without this it silently swallowed clicks/hover there,
    // since it's a later DOM sibling and paints on top. The counter itself
    // is just static text, never interactive, so this has no downside.
    <div className="sticky bottom-[18px] h-[calc(15px*var(--scale))] pointer-events-none">
      <p
        // Hidden (opacity-0) whenever either gate says so — not yet
        // `revealed` (still waiting on the intro, see this component's own
        // top-level `revealed` doc comment) or already `released` (scrolled
        // past, this element's own pre-existing scroll fade-out).
        className={`absolute top-0 whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.2] font-normal text-white transition-opacity duration-300 ease-out [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
          revealed && !released ? "opacity-100" : "opacity-0"
        }`}
        style={{ right: "var(--edge-right-inset)" }}
      >
        <SlotDigits key={replayGeneration} value={count} digits={String(count).length} extraSpins={2} durationMs={1200} /> Cases
      </p>
    </div>
  );
}
