"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

/** Flip to false once the intro's timing/visuals are finalized — while
 *  testing, it should show on every visit regardless of the one-day check
 *  below (per explicit request: "現状はテスト確認中なので都度表示する").
 *  Briefly flipped to false while chasing the tap-responsiveness bug below,
 *  then immediately back to true per a direct follow-up ("イントロは毎回
 *  表示に戻して") once it became clear that bug wasn't actually caused by
 *  this flag replaying the intro on every test visit — it was a real bug
 *  in this component's own exit handling (see `shouldShow`'s own doc
 *  comment below). */
const ALWAYS_SHOW_FOR_TESTING = true;

/** localStorage key holding the last time the intro was shown, so it only
 *  reappears once a day (see ALWAYS_SHOW_FOR_TESTING above). */
const STORAGE_KEY = "andmade-intro-last-shown";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** How long the logo and the pills each take to fade in — bumped up
 *  temporarily from 400ms as a diagnostic per follow-up ("フェードインして
 *  ないように見える"): the logic itself (opacity 0→1 on `active`, deferred
 *  one rAF frame past mount so the 0-opacity state actually paints first) is
 *  the same proven pattern used elsewhere in this codebase (case-counter.tsx,
 *  reveal-on-mount.tsx), so a much longer, unmissable duration should
 *  confirm whether it's genuinely not transitioning at all versus just
 *  reading as an instant pop at 400ms. */
const FADE_MS = 900;
/** Same exaggerated ease-out curve used site-wide for reveals (see
 *  underline-sweep in globals.css). */
const TAGLINE_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";
/** How long each line's own mask reveal takes. */
const TAGLINE_REVEAL_MS = 700;
/** Delay between each line starting its own reveal, so they curtain up one
 *  after another — per explicit follow-up ("3行テキストは1行ずつ表示に
 *  戻して"), restoring this after a brief "all at once" version. Only this
 *  line-to-line stagger came back though — the logo, the tagline's first
 *  line, and the pills all still *start* revealing at the same instant
 *  (see this component's own doc comment). */
const TAGLINE_LINE_STAGGER_MS = 150;
/** How long, after everything above has finished revealing, the finished
 *  intro sits still before disappearing and navigating (the "静止時間"). */
const POST_REVEAL_DELAY_MS = 1500;

/** Logo's own real aspect ratio (public/andmade-logo.svg viewBox is
 *  1410x190) at a size matching the Figma design's own 160x22. */
const LOGO_WIDTH_PX = 160;
const LOGO_HEIGHT_PX = 22;

/** Gap between the logo, the tagline, and the pills row below it — per
 *  explicit spec ("ロゴとテキストと下の3要素のマージンは20px"), then
 *  tightened once more ("マージンをさらに5px詰めて"). Uniform between all
 *  three groups. */
const GROUP_GAP_PX = 15;

const TAGLINE_LINES = [
  "ANDMADE is an independent design studio based in Tokyo,",
  "partnering with brands to create thoughtful experiences through",
  "art direction, graphic design, and digital design.",
];

const PILLS = ["Designed with clarity", "Built to last", "Rooted in purpose"];

/**
 * Full-screen splash shown once a day (see ALWAYS_SHOW_FOR_TESTING) before
 * landing on the top page — Figma node 878:2031: wordmark logo, the site's
 * 3-line tagline below it, and 3 rounded "Designed with clarity / Built to
 * last / Rooted in purpose" pills below that.
 * Mounted once in the root layout (see app/layout.tsx) rather than a
 * specific page — but only ever actually shows when the route
 * requested/reloaded is the top page itself ("/"); a direct visit or reload
 * on any other page never shows it (per explicit request: "トップ以外の
 * ページに直接アクセス、もしくはトップ以外でリロードしたときはイントロは
 * 表示しない" — see the pathname check below).
 *
 * Layout: the whole logo+tagline+pills stack is centered as one flex column,
 * `calc(-50% - 10px)` rather than dead-center — a brief version in between
 * instead anchored the *pills row* specifically at that same point (so that
 * "Built to last" landed exactly on it, per "3要素の配置はBuilt to lastが
 * 画面中心にくるように調整して"), but since the pills row sits at the
 * *bottom* of the stack, pinning it to a fixed point pushed the logo and
 * tagline further up above that point than intended, reported as "全体的に
 * 上位置に表示されてる" (the whole thing reading as sitting too high) —
 * reverted back to simple whole-stack centering, which is what actually
 * keeps the *visible group as a whole* sitting 10px above center rather
 * than just one specific row within it.
 *
 * Sequence: the logo, the tagline's first line, and the pills row all start
 * revealing at the same instant, per explicit follow-up ("表示のタイミング
 * はすべて同時にして") — an earlier version had the logo fade in first,
 * then the tagline, then the pills one by one; that whole cross-group
 * cascade is gone. Within the tagline itself though, the 3 lines still
 * curtain up one after another (TAGLINE_LINE_STAGGER_MS apart) rather than
 * together, per a later, separate follow-up restoring that specific
 * behavior ("3行テキストは1行ずつ表示に戻して") — see TAGLINE_LINE_STAGGER_MS.
 * The logo and pills fade (opacity); the tagline curtain-reveals (mask,
 * translateY) rather than fading, per the original spec ("3行テキストは
 * カーテンリビールのまま"). POST_REVEAL_DELAY_MS after the tagline's last
 * line finishes its own reveal (tracked via that line's onTransitionEnd,
 * not a guessed duration), the whole overlay disappears outright — no
 * fade-out (see the exit effect's own doc comment further down for why) —
 * dispatching an "andmade:intro-complete" window event in that same instant
 * (see mobile-home.tsx's own `introReplayGeneration`, which forces a full
 * remount of the project list/Tx-Th rail/MobileRecentNews, replaying their
 * entrance; case-counter.tsx also listens for it, replaying its own
 * count-up from 0) and navigating to "/".
 *
 * The logo is public/andmade-logo.svg (the wordmark, not the circular
 * public/andmade-mark.svg icon site-footer.tsx uses) — that file's own path
 * fills are hardcoded to the brand blue (#0022FF), not the black this
 * design calls for, so `brightness-0` forces it fully black regardless of
 * source color (the same "recolor an <img>-referenced SVG via a CSS filter,
 * since a raw <img>/<Image> tag can't reach into the file to override
 * individual path fills" trick site-footer.tsx's own `invert` on
 * andmade-mark.svg already relies on).
 */
// Module-scoped, session-lifetime decision cache — per direct bug report that
// navigating back to "/" from another page left the header stuck invisible
// forever, on both PC and SP ("下層からトップに戻ったとき、ヘッダーが表示さ
// れない"): SiteIntro itself is mounted exactly *once*, in the root layout,
// and its own mount effect below only ever *decides* whether to show a
// single time for the whole session/app-mount, based on whatever route was
// actually requested/reloaded *first*. But `willIntroShow` below used to
// recompute its answer from scratch on every call, purely from whatever
// `pathname` its caller happened to pass in — so SiteHeader/mobile-home.tsx,
// which *do* remount fresh on every navigation to "/", kept re-asking "will
// the intro show?" on each of those later visits too, and got `true` right
// back purely because pathname === "/" again, then sat waiting forever for
// an "andmade:intro-complete" event that was never coming (SiteIntro had
// already decided *not* to show, back on the session's real first mount).
//
// Caching the real decision here fixes that case — but the *true* case needs
// its own, separate fix: since the splash can only ever genuinely play once
// per session (this cache aside, SiteIntro's own mount effect never runs a
// second time to decide again), a cached `true` from that one real
// play-through can't be left standing forever either, or the *next* time the
// user leaves "/" and comes back, they'd hit the exact same bug from the
// opposite direction — waiting on a second "andmade:intro-complete" that
// will now never fire (see recordIntroDecision(false) at the bottom of the
// exit effect below, called the instant the one real play-through actually
// finishes). So this cache genuinely is one-shot in both directions: it
// starts `null` (undecided), gets set exactly once to whatever SiteIntro
// really decided, and — only in the `true` case — flips back to `false` the
// moment that one play-through completes, since there is no second one to
// wait for after that, ever again this session.
let introDecision: boolean | null = null;

/** Records SiteIntro's own show/skip decision — called from that component's
 *  mount effect below at each of its own exit points (so every branch: wrong
 *  route, already shown today, or genuinely about to show, updates this
 *  cache), and again from its exit effect once an actual play-through
 *  finishes (see `introDecision`'s own doc comment for why that second call
 *  is needed too, flipping `true` back to `false`). */
function recordIntroDecision(willShow: boolean) {
  introDecision = willShow;
}

/** Pure, read-only version of the mount effect's own show/skip check below —
 *  used by mobile-menu.tsx, site-header.tsx, and mobile-home.tsx to decide,
 *  at their own mount, whether to wait for this component's own
 *  "andmade:intro-complete" event before starting their own reveal, or
 *  start revealing immediately since this component isn't going to show
 *  anything to wait for. Prefers `introDecision` (see its own doc comment
 *  above) once SiteIntro has actually made (and, if needed, later revised)
 *  its own real decision — that cached answer reflects whether an
 *  "andmade:intro-complete" event is still genuinely outstanding, which
 *  `pathname` alone can't tell you once the session's one real play-through
 *  has already happened. Only falls back to recomputing straight from
 *  `pathname` before any decision has been cached yet (this function's own
 *  callers all run in a plain `useEffect`, which — across the *entire* tree,
 *  not just this one component's own subtree — always fires after every
 *  `useLayoutEffect`, including SiteIntro's own below, on any commit where
 *  both mount together; so in practice this fallback path is only ever hit
 *  on server-rendered/pre-hydration reads, never a real race). Deliberately
 *  doesn't write STORAGE_KEY itself in that fallback path — only the real
 *  effect below does that, exactly once. */
export function willIntroShow(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (introDecision !== null) return introDecision;
  if (pathname !== "/") return false;
  if (ALWAYS_SHOW_FOR_TESTING) return true;
  const lastShown = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
  const shownWithinOneDay = Date.now() - lastShown < ONE_DAY_MS;
  return !shownWithinOneDay;
}

/** True only once SiteIntro's own decision has *actually* been cached (see
 *  `introDecision`'s own doc comment) *and* that decision is "won't show" —
 *  used by SiteHeader/mobile-home.tsx's own `revealed`/`headerRevealed`
 *  lazy initializers to decide whether to start already-revealed (skipping
 *  their fade-in outright) — per direct follow-up asking for exactly that on
 *  a return trip to "/" ("下層からトップに戻るときはヘッダーはフェードイン
 *  つけないで").
 *
 * Deliberately *not* the same thing as `!willIntroShow(pathname)`: that
 * function's own SSR branch (`typeof window === "undefined"`) returns
 * `false` — correct for "should something wait for the event", but WRONG
 * for "is it safe to skip the fade entirely", since `false` there really
 * means "unknown yet" (running on the server, before SiteIntro's client-only
 * effects have had any chance to decide anything), not "genuinely won't
 * show". A first version of this fade-skip used `!willIntroShow(pathname)`
 * directly and caused a real hydration mismatch (reported via a Next.js
 * dev-overlay error, `site-header.tsx (154:9)`: server rendered this header
 * pre-revealed — `opacity: 1` — while the client's first hydration pass
 * computed `opacity: 0`): on an actual fresh server-rendered load of "/",
 * `willIntroShow` returns `false` server-side (nothing's been decided yet,
 * `typeof window === "undefined"`) even though the intro *is* about to show
 * once hydrated — so `!willIntroShow(...)` was `true` on the server (skip
 * fade, render fully opaque) while the client's own post-hydration decision
 * correctly stayed hidden, waiting for the real splash. This function
 * instead only ever returns `true` once `introDecision` has genuinely been
 * set to `false` — during SSR, and during the client's own first hydration
 * pass (before SiteIntro's layout effect has run), `introDecision` is still
 * `null`, so this safely returns `false` (stay hidden, matching the
 * server's own render) in both of those cases, identically. It only starts
 * returning `true` on a real, later, client-side-only mount — i.e. exactly
 * the "returning to '/' from another page within the same session" case
 * this was actually meant to fix — never during any render that has to
 * agree with server-rendered HTML. */
export function introDefinitelyWontShow(): boolean {
  return introDecision === false;
}

export function SiteIntro() {
  const router = useRouter();
  const pathname = usePathname();
  const [shouldShow, setShouldShow] = useState(false);
  const [active, setActive] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Decide once, client-side only (localStorage isn't available during SSR,
  // and shouldn't be — starting at `false` on both server and the first
  // client render avoids a hydration mismatch; this effect then flips it on
  // shortly after mount if warranted).
  //
  // useLayoutEffect, not useEffect — per direct report that the real page
  // underneath (SiteHeader on PC, the MENU pill on SP — neither has any
  // awareness of this component at all, so nothing else was hiding them)
  // flashes visibly for a moment before this overlay covers it on a genuine
  // reload of "/" ("トップでページをリロードしたらイントロが表示される前に
  // 一瞬ヘッダーが表示される（pc,spともに）"). A plain `useEffect` here is
  // scheduled *after* the browser has already painted the current (still
  // `shouldShow=false`, overlay-absent) frame, so at least one real frame of
  // the bare page underneath is visible before the callback even runs.
  // `useLayoutEffect` instead runs synchronously right after this component
  // commits, before the browser gets to paint that frame at all — so if
  // `shouldShow` flips true here, the very first frame the browser actually
  // paints (post-hydration) already includes this overlay, with no
  // intermediate "hydrated but still bare" frame in between. This can't
  // erase the very first, unavoidable pre-hydration paint straight from the
  // server-rendered HTML (which has no way to know `shouldShow` — localStorage
  // isn't available server-side at all), only the (likely larger, multi-
  // frame) gap after hydration that a plain `useEffect` would otherwise add
  // on top of that.
  useLayoutEffect(() => {
    // Only the top page itself ever shows this — a direct visit or reload
    // on any other route shouldn't. Deliberately checked against
    // `pathname`'s value at mount only (this effect intentionally runs
    // once): a later client-side navigation *to* "/" from elsewhere
    // shouldn't retroactively trigger the splash either, only whatever
    // route was actually requested/reloaded.
    if (pathname !== "/") {
      recordIntroDecision(false);
      return;
    }

    const lastShown = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    const shownWithinOneDay = Date.now() - lastShown < ONE_DAY_MS;
    if (shownWithinOneDay && !ALWAYS_SHOW_FOR_TESTING) {
      recordIntroDecision(false);
      return;
    }

    recordIntroDecision(true);
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    // Genuinely reading from an external system (localStorage) on mount,
    // with no prop/key available to derive this from during render instead
    // — one of the two effect uses React's own docs call out as legitimate
    // (see app/contact/page.tsx's identical exception for the same reason).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShouldShow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only, see comment above; `pathname` is intentionally only read at its initial value.
  }, []);

  useEffect(() => {
    if (!shouldShow) return;
    const revealFrame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(revealFrame);
  }, [shouldShow]);

  // Once the tagline has finished its own reveal (tracked via its own
  // onTransitionEnd -- see the JSX below -- rather than a guessed duration),
  // wait POST_REVEAL_DELAY_MS, then disappear and navigate -- in one single,
  // synchronous step, with no separate fade-out stage in between.
  //
  // This *used* to fade the whole overlay out over a further EXIT_FADE_MS
  // (opacity 1->0), with pointer-events-none applied a beat after that fade
  // started so real taps could reach the actual page underneath during the
  // fade rather than being swallowed by a now-invisible-but-still-mounted
  // layer. Both versions of that fix were chasing the same real report
  // ("Menuがすぐに押せない") but neither actually resolved it on real iOS
  // Safari/Chrome -- per a further direct follow-up asking the far simpler
  // question directly ("単純にトップが表示されたらイントロのレイヤーを完全に消したら解消するんじゃないの？"):
  // rather than continuing to tune exactly *when* a still-mounted layer's
  // pointer-events should unlock relative to its own fade and the project
  // list's own remount (see mobile-home.tsx's own `introReplayGeneration`),
  // removing the fade entirely and unmounting this layer outright the
  // instant the top page should show removes that whole class of timing
  // mismatch at its root -- there is no window, of any length, where this
  // layer is still mounted (visible, fading, or invisible-but-present)
  // while the page underneath is supposed to be interactive. Trades away
  // the previous gentle cross-fade for a hard cut; if that reads as too
  // abrupt once the actual tap bug is confirmed fixed, a fade can be
  // reintroduced on the *content inside* this layer instead (which doesn't
  // require keeping the full-screen div itself mounted a moment longer).
  useEffect(() => {
    if (!revealed) return;

    const timeout = setTimeout(() => {
      // Tells the top page's project list (plus the Tx/Th rail and
      // MobileRecentNews) to reset and replay its own slide-up entrance --
      // see mobile-home.tsx's own `introReplayGeneration`. Dispatched in the
      // same instant this layer itself unmounts (not up to
      // POST_REVEAL_DELAY_MS *earlier*, while this layer was still covering
      // the screen) -- per the same follow-up above, so that remount's own
      // DOM churn only ever happens once this overlay is already fully
      // gone, never while it's still around (mounted, fading, or otherwise)
      // intercepting/exposing taps around that same instant.
      window.dispatchEvent(new Event("andmade:intro-complete"));
      // Flips the cached decision back to false the instant the splash
      // actually finishes — per a second direct bug report that the header
      // still didn't show after navigating back to "/" ("まだ下層からトップ
      // でヘッダー表示されない"): this splash can only ever genuinely play
      // once per session (SiteIntro's own mount effect above never runs a
      // second time), so `introDecision` having been cached `true` for that
      // one real play-through must not keep answering `true` forever after —
      // any *later* SiteHeader/mobile-home.tsx mount asking "will the intro
      // show?" (e.g. navigating away and back to "/" again) needs `false`
      // here, or it ends up waiting on an "andmade:intro-complete" event
      // that's never coming a second time.
      recordIntroDecision(false);
      router.replace("/");
      // Unmount entirely, right away -- no fade-out stage left to wait on.
      setShouldShow(false);
    }, POST_REVEAL_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [revealed, router]);

  if (!shouldShow) return null;

  return (
    // Solid the whole time this is mounted, no fade at either end (only the
    // logo/tagline/pills inside fade or reveal in) — see this component's
    // own doc comment above on why the previous fade-*out* (and the
    // pointer-events juggling that went with it) was removed entirely: this
    // div is either fully present, solidly blocking the whole screen behind
    // it, or it's unmounted and gone outright, with nothing in between.
    <div className="fixed inset-0 z-[100] bg-[#f6f6f4]">
      {/* Positioning anchor — centers the *whole* logo+tagline+pills stack
          as one block (see this component's own doc comment on why this
          replaced a brief attempt at anchoring the pills row specifically). */}
      <div
        className="absolute top-1/2 left-1/2 flex flex-col items-center"
        style={{ transform: "translate(-50%, calc(-50% - 10px))" }}
      >
        <Image
          src={withBasePath("/andmade-logo.svg")}
          alt="ANDMADE"
          width={LOGO_WIDTH_PX}
          height={LOGO_HEIGHT_PX}
          priority
          className="shrink-0 brightness-0 transition-opacity ease-out"
          style={{ opacity: active ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        />

        {/* Tagline — per-line mask reveal (not the site's usual character
            scramble): each line sits in its own overflow-hidden "window"
            exactly its own line-height tall, with the text itself starting
            translated down 100% (fully hidden below that window) and
            sliding up to translateY(0) once `active`, curtaining into view
            one line after another (TAGLINE_LINE_STAGGER_MS apart). Always
            rendered — the mask itself already keeps the text fully
            invisible until its transform actually animates, no separate
            "hide pre-active" trick needed.

            No fixed width: `whitespace-nowrap` on each line plus
            shrink-to-fit block sizing lets every line stay on one row,
            sized to its own longest line, still centered (text-center on
            this wrapper centers each line's inline content within that
            shared shrink-to-fit width). */}
        {/* text-[12px] on SP, text-[14px] from lg up — per explicit
            follow-up ("スマホ時のイントロ3行テキストは12pxに"): this intro
            is shared between the PC and SP top-page trees (mounted once in
            app/layout.tsx, not split like app/page.tsx's own PC/SP trees),
            so the size difference has to live here rather than in a
            separate component. */}
        <div
          className="text-center text-[12px] leading-[1.25] font-medium text-black lg:text-[14px]"
          style={{ marginTop: GROUP_GAP_PX }}
        >
          {TAGLINE_LINES.map((line, i) => (
            <div key={line} className="overflow-hidden">
              <p
                className="whitespace-nowrap"
                style={{
                  transform: active ? "translateY(0)" : "translateY(100%)",
                  transitionProperty: "transform",
                  transitionDuration: `${TAGLINE_REVEAL_MS}ms`,
                  transitionDelay: active ? `${i * TAGLINE_LINE_STAGGER_MS}ms` : "0ms",
                  transitionTimingFunction: TAGLINE_EASE,
                }}
                // Only the last line needs to report completion — see the
                // effect above keyed on `revealed`.
                onTransitionEnd={i === TAGLINE_LINES.length - 1 ? () => setRevealed(true) : undefined}
              >
                {line}
              </p>
            </div>
          ))}
        </div>

        {/* Pills — fade in together with the logo and tagline above (see
            this component's own doc comment). px-[10px]/py-[7px] →
            px-[8px]/py-[6px] (per "イントロの3要素のpaddingは水平8px、垂直
            6pxに") → px-[7px]/py-[5px], gap-[6px] → gap-[4px], text-[12px] →
            text-[10px] (per a further direct follow-up, "イントロの3要素の
            文字サイズを10pxに、padding垂直5px、水平7pxに変更、3要素間の
            マージンは4pxに"). Font size then split by breakpoint — text-[10px]
            on SP, back to lg:text-[12px] on PC (per a still further direct
            follow-up, "イントロのテキスト下の3要素の文字サイズはPCは文字
            サイズ12pxのままに戻して") — same SP/PC split convention the
            tagline above already uses; padding/gap stay as-is at every
            width, only the font size reverted for PC. */}
        <div className="flex items-center justify-center gap-[4px]" style={{ marginTop: GROUP_GAP_PX }}>
          {PILLS.map((pill) => (
            <div
              key={pill}
              className="shrink-0 rounded-[30px] border border-black/50 px-[7px] py-[5px] transition-opacity ease-out"
              style={{ opacity: active ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
            >
              <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] text-[10px] leading-[1.05] font-medium tracking-[-0.24px] whitespace-nowrap text-black lg:text-[12px]">
                {pill}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
