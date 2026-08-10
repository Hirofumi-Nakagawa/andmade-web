"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SCENIC_LOCATIONS, type ScenicLocation } from "@/lib/scenic-locations";

/** How long each location stays up before cycling to the next one. */
const CYCLE_MS = 10_000;
/** Crossfade duration between locations. */
const CROSSFADE_MS = 1_500;
/** Static Maps API's own per-request max at scale=1 is 640x640 (without a
 *  Premium plan) — `scale=2` (below) then doubles the *returned pixel*
 *  density (1280x1280 actual pixels) for a crisper background at no extra
 *  size-tier cost, same trick as any other "@2x" image request. */
const STATIC_MAP_SIZE_PX = 640;
const STATIC_MAP_SCALE = 2;

/** How much larger than its own container each photo renders (via CSS
 *  `transform: scale`) — the extra size is what gives the slow pan below
 *  room to slide around in without ever exposing an edge/gap underneath. */
const PAN_ZOOM = 1.15;
/** How far, as a % of the (unscaled) container size, the photo slides from
 *  center along its picked direction. `translate(%)` resolves against an
 *  element's own layout box regardless of any `scale()` in that same
 *  `transform` — so with PAN_ZOOM=1.15, the image has (1.15-1)/2 = 7.5%
 *  worth of overscan margin per side to move within; staying at 6% here
 *  leaves a small safety buffer so the zoomed photo always still fully
 *  covers its container at the fullest pan offset. */
const PAN_RANGE_PERCENT = 6;
/** Where the demoted "previous" layer keeps drifting *to*, during the
 *  crossfade that follows — see PreviousImage's own doc comment for why it
 *  needs to keep moving at all. Only a further 1% past PAN_RANGE_PERCENT's
 *  own 6% (not all the way to PAN_ZOOM's own 7.5% ceiling) — keeps a 0.5%
 *  safety margin in reserve for the exact same "never expose an edge"
 *  reason PAN_RANGE_PERCENT itself already stops short of that ceiling. */
const PREVIOUS_CONTINUE_RANGE_PERCENT = 7;
/** How long one photo's full pan sweep (from its start offset to its end
 *  offset) takes — matches CYCLE_MS exactly, so the pan finishes precisely
 *  as the next location cross-fades in, with no pause or jump. */
const PAN_DURATION_MS = CYCLE_MS;

/** All 8 compass directions (up/down/left/right + diagonals) a photo can
 *  slowly pan across, picked randomly per location — per the brief ("上下
 *  左右斜めにランダムにゆっくりスライド"). */
const PAN_DIRECTIONS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 },
];

function buildStaticMapUrl(location: ScenicLocation, apiKey: string): string {
  const params = new URLSearchParams({
    center: `${location.lat},${location.lng}`,
    zoom: String(location.zoom),
    size: `${STATIC_MAP_SIZE_PX}x${STATIC_MAP_SIZE_PX}`,
    scale: String(STATIC_MAP_SCALE),
    maptype: "satellite",
    // "satellite" tiles carry no labels of their own already, but this style
    // rule is added as a belt-and-suspenders guarantee per the brief ("文字
    // 情報など一切載せない") in case that default ever changes.
    style: "feature:all|element:labels|visibility:off",
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/** A location paired with the one random pan direction it slides across for
 *  its whole time on screen — picked once, together, whenever a new
 *  location is chosen (see pickNextSlide below), so the frozen "previous"
 *  layer in the render below can reproduce the exact end-of-pan position
 *  its own CrossfadeImage was just animating towards, with no visible jump
 *  at the crossfade handoff. */
type Slide = {
  locationIndex: number;
  dx: number;
  dy: number;
};

/** 全ロケーションのインデックスを Fisher–Yates でシャッフルした「山札」を
 *  作る。表示順は完全ランダムだが、山札を上から順に引くので**一巡するまで
 *  同じ場所は二度出ない** — per direct follow-up ("毎回表示時にランダムに
 *  並んだ30個を順に表示したい。なので、30個全部表示されるまでは重複
 *  しない")。以前は毎回の独立抽選（直前との重複だけ回避）で、数枚で同じ
 *  場所が再登場し得た。 */
function shuffledLocationIndices(): number[] {
  const deck = SCENIC_LOCATIONS.map((_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** 山札（deck）から1枚引いてスライドにする。山札が尽きたら（＝30箇所を
 *  出し切ったら）シャッフルし直す。継ぎ目で「前の山の最後 = 新しい山の
 *  最初」になったときだけ入れ替えて、連続表示の重複を避ける。deck は
 *  呼び出し側が useRef で持つ配列で、この関数が直接消費する（shift）。 */
function drawNextSlide(deck: number[], current: Slide | null): Slide {
  if (deck.length === 0) {
    const fresh = shuffledLocationIndices();
    if (current && fresh.length > 1 && fresh[0] === current.locationIndex) {
      const j = 1 + Math.floor(Math.random() * (fresh.length - 1));
      [fresh[0], fresh[j]] = [fresh[j], fresh[0]];
    }
    deck.push(...fresh);
  }
  const locationIndex = deck.shift()!;
  const { dx, dy } = PAN_DIRECTIONS[Math.floor(Math.random() * PAN_DIRECTIONS.length)];
  return { locationIndex, dx, dy };
}

/** Shared by the actively-panning CrossfadeImage, the still-drifting
 *  PreviousImage, and the initial frozen-previous render below: scale(PAN_ZOOM)
 *  first (so translate's own percentage has literal overscan room to move
 *  within without exposing an edge), then translate by the given direction *
 *  `rangePercent`. A signed percent (not the earlier `atEnd: boolean`, which
 *  only ever toggled between ±PAN_RANGE_PERCENT) — PreviousImage needs a
 *  *third* distance (PREVIOUS_CONTINUE_RANGE_PERCENT, past the main pan's own
 *  ±PAN_RANGE_PERCENT endpoints), so this now just takes whatever signed
 *  distance the caller wants directly. */
function panTransform(dx: number, dy: number, rangePercent: number) {
  return `scale(${PAN_ZOOM}) translate(${rangePercent * dx}%, ${rangePercent * dy}%)`;
}

/** Per-character reveal delay shared by both bottom-of-screen readouts below
 *  (coordinates + place name) — same stagger/technique as
 *  now-playing-ticker.tsx's own left-to-right char reveal, reused here per
 *  explicit request ("緯度経度が表示されるとき、再生中の曲と同じように左から一文字ずつ表示").
 */
const BOTTOM_INFO_CHAR_REVEAL_STAGGER_MS = 25;

/** "35.68° N , 139.76° E" style formatting — 2 decimal places, N/S and E/W
 *  suffixes derived from sign rather than baked into the coordinate data
 *  itself (lib/scenic-locations.ts just stores plain signed lat/lng). */
function formatCoordinates(lat: number, lng: number): string {
  const latDirection = lat >= 0 ? "N" : "S";
  const lngDirection = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${latDirection} , ${Math.abs(lng).toFixed(2)}° ${lngDirection}`;
}

/** Shared by both CoordinatesReadout and LocationNameReadout below — splits
 *  `text` into one `.char-reveal`-animated span per character, each keyed by
 *  `${text}-${i}` (same convention as now-playing-ticker.tsx), which is what
 *  actually forces the reveal to replay: a changed `key` remounts a fresh
 *  span, restarting its animation, rather than reusing the old
 *  already-finished one in place — so this replays every time `text` itself
 *  changes (i.e. every time the photo cycles to a new location). */
function RevealedChars({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((char, i) => (
        <span
          key={`${text}-${i}`}
          className="char-reveal"
          style={{ animationDelay: `${i * BOTTOM_INFO_CHAR_REVEAL_STAGGER_MS}ms` }}
        >
          {/* Same reasoning as now-playing-ticker.tsx's identical char map:
              a plain space alone inside its own inline-block collapses to
              zero width, so a non-breaking space is used instead to keep
              its width. */}
          {char === " " ? " " : char}
        </span>
      ))}
    </>
  );
}

type CoordinatesReadoutProps = {
  lat: number;
  lng: number;
};

/** Bottom-of-screen readout of whichever location is currently displayed
 *  (Figma node 925:221) — grid column 3 (same left edge as the standard
 *  198px content margin used site-wide), 24px up from the bottom.
 *  PC-only (`hidden lg:block`) — see MobileScenicReadouts below for the SP
 *  counterpart (Figma node 1195:278), which groups this together with the
 *  location name in one shared block rather than two independently
 *  positioned elements. */
function CoordinatesReadout({ lat, lng }: CoordinatesReadoutProps) {
  const text = formatCoordinates(lat, lng);
  return (
    <p
      className="absolute z-10 hidden text-[length:calc(12px*var(--scale))] leading-[calc(16px*var(--scale))] font-medium whitespace-nowrap text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] lg:block"
      style={{
        left: "calc(198px * var(--grid-scale))",
        bottom: "24px",
        letterSpacing: "calc(-0.24px * var(--scale))",
      }}
    >
      <RevealedChars text={text} />
    </p>
  );
}

/** Place name (e.g. "Matterhorn, Swiss Alps") for whichever location is
 *  currently displayed — same grid column as CoordinatesReadout above.
 *  Originally sat 40px above it (per explicit request: "緯度経度の上40px
 *  の位置に20pxで表示"), then nudged down twice (10px, then a further 10px
 *  — "地名の位置を10px下げ" / "地名をさらに10px下げて"), then back up 5px
 *  ("地名を5px上に移動して") — net gap above the coordinates line is now
 *  40-10-10+5=25px, folded into this same scaled term rather than stacking
 *  separate unscaled offsets.
 *  `lib/scenic-locations.ts`'s own `name` field was originally internal-only
 *  (alt-text/bookkeeping, never rendered — see that file's own comment),
 *  repurposed here as real on-page copy once asked ("緯度経度以外に場所の名称も取得できるの？").
 *  PC-only (`hidden lg:block`) — see MobileScenicReadouts below for the SP
 *  counterpart.
 */
function LocationNameReadout({ name }: { name: string }) {
  return (
    <p
      className="absolute z-10 hidden text-[length:calc(20px*var(--scale))] leading-[calc(24px*var(--scale))] font-medium whitespace-nowrap text-white tracking-[calc(-0.4px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] lg:block"
      style={{
        left: "calc(198px * var(--grid-scale))",
        bottom: "calc(24px + 25px * var(--scale))",
      }}
    >
      <RevealedChars text={name} />
    </p>
  );
}

/** "Google Maps" own bottom edge — per direct follow-up ("Google Mapsと地名
 *  と座標は画面下から100pxの位置に配置して"): a plain, flat 100px from the
 *  true viewport bottom edge (replacing an earlier version that instead held
 *  a precise 40px gap above MobileMenu's own closed pill specifically — see
 *  git history for that version's own doc comment/math — this simpler flat
 *  distance is what's actually wanted now). */
const GOOGLE_MAPS_BOTTOM_PX = 100;
/** Gap between the coordinates line's own bottom edge and "Google Maps"'s
 *  own top edge — 30px per direct follow-up ("それぞれのマージンを30pxに
 *  して"), was 40px, then 50px, then 60px before that, itself replacing an
 *  earlier 83px (an inferred, never explicitly requested value carried
 *  over from Figma's own original relative spacing). */
const COORDS_TO_GOOGLE_MAPS_GAP_PX = 30;
/** The name/coordinates block's own bottom edge: "Google Maps" own bottom
 *  (GOOGLE_MAPS_BOTTOM_PX) + its 16px line height + the gap above. */
const NAME_COORDS_BOTTOM_PX = GOOGLE_MAPS_BOTTOM_PX + 16 + COORDS_TO_GOOGLE_MAPS_GAP_PX;

/**
 * SP counterpart of LocationNameReadout + CoordinatesReadout + the "Google
 * Maps" attribution below, grouped into one shared block per Figma node
 * 1195:278 (sp_404): name and coordinates stack with a 12px gap, left-aligned
 * at grid column 3 (margin + 2 columns — same "margin + N columns" idiom
 * mobile-home.tsx's own rail uses), "Google Maps" sits further below at its
 * own fixed offset rather than sharing that 12px gap. Both anchored to the
 * viewport's own bottom edge (GOOGLE_MAPS_BOTTOM_PX/NAME_COORDS_BOTTOM_PX
 * above), not Figma's own literal top offsets — see those constants' own
 * doc comment for why.
 */
function MobileScenicReadouts({ name, lat, lng }: { name: string; lat: number; lng: number }) {
  const text = formatCoordinates(lat, lng);
  const left = "calc(var(--sp-grid-column-width) * 2 + var(--sp-grid-margin))";
  return (
    <>
      <div
        className="absolute z-10 flex flex-col items-start gap-[12px] whitespace-nowrap text-white lg:hidden"
        style={{ left, bottom: NAME_COORDS_BOTTOM_PX }}
      >
        <p className="text-[16px] leading-[16px] font-medium tracking-[-0.36px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          <RevealedChars text={name} />
        </p>
        <p className="text-[12px] leading-[16px] font-medium tracking-[-0.24px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          <RevealedChars text={text} />
        </p>
      </div>
      <p
        className="absolute z-10 whitespace-nowrap text-[10px] leading-[16px] font-medium text-white lg:hidden"
        style={{ left, bottom: GOOGLE_MAPS_BOTTOM_PX }}
        aria-hidden
      >
        Google Maps
      </p>
    </>
  );
}

type PreviousImageProps = {
  src: string;
  dx: number;
  dy: number;
};

/** The demoted "previous" layer — still visible, fading out underneath the
 *  incoming CrossfadeImage for the whole CROSSFADE_MS window, but no longer
 *  the active pan. Used to render at a single, static, non-transitioning
 *  transform (its pan's own end position) the instant it was demoted — per
 *  direct follow-up that the whole scene visibly stopped moving right as
 *  each crossfade began, well before the new image had actually finished
 *  fading in ("404の背景マップは、次の画像にクロスフェードするまでずっと
 *  動いててほしい。現状だと、クロスフェードの直前に止まってる"): that static
 *  render was a hard freeze at the exact moment this layer stopped being
 *  "current", even though it stays on screen, still fully visible under a
 *  fading-in top layer, for CROSSFADE_MS afterward. Now keeps drifting a
 *  little further in the exact same direction over that same CROSSFADE_MS
 *  window (PAN_RANGE_PERCENT → PREVIOUS_CONTINUE_RANGE_PERCENT — see that
 *  constant's own doc comment for why not all the way to PAN_ZOOM's own
 *  overscan ceiling), linear easing matching the main pan's own feel, so
 *  motion never actually stops until the instant this layer is removed
 *  outright (handleCurrentLoaded's own cleanup timeout). Mount-time
 *  rAF-deferred flip (same pattern as CrossfadeImage's own `panning` state)
 *  so the *starting* position (PAN_RANGE_PERCENT — exactly where the
 *  previous pan had just arrived, so there's no visible jump at the
 *  handoff) actually paints once before transitioning onward. */
function PreviousImage({ src, dx, dy }: PreviousImageProps) {
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setContinuing(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Google Static Maps URL
    <img
      src={src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{
        transitionProperty: "transform",
        transitionDuration: `${CROSSFADE_MS}ms`,
        transitionTimingFunction: "linear",
        transform: panTransform(dx, dy, continuing ? PREVIOUS_CONTINUE_RANGE_PERCENT : PAN_RANGE_PERCENT),
      }}
    />
  );
}

type CrossfadeImageProps = {
  src: string;
  dx: number;
  dy: number;
  onLoaded: () => void;
};

/** The incoming image: starts transparent, fades to fully opaque once
 *  actually loaded (never fades in a half-downloaded image) — sits on top of
 *  whatever the previous location's own plain, always-opaque `<img>` still
 *  is, so the crossfade is really just "reveal the new one over the old
 *  one", not a true two-sided cross-dissolve. Also slowly pans from its
 *  start offset to its end offset (panTransform above) over the same
 *  PAN_DURATION_MS it stays "current" — both the opacity fade-in and the
 *  pan sweep are kicked off the same way (flipped from an initial state to
 *  a settled one via a mount-time requestAnimationFrame), but run at their
 *  own independent durations via `transition-property`'s comma-separated
 *  form. */
function CrossfadeImage({ src, dx, dy, onLoaded }: CrossfadeImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPanning(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Google Static Maps URL
    <img
      src={src}
      alt=""
      className={`absolute inset-0 h-full w-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
      style={{
        transitionProperty: "opacity, transform",
        transitionDuration: `${CROSSFADE_MS}ms, ${PAN_DURATION_MS}ms`,
        transitionTimingFunction: "ease-out, linear",
        transform: panTransform(dx, dy, panning ? PAN_RANGE_PERCENT : -PAN_RANGE_PERCENT),
      }}
      onLoad={() => {
        // A location already cached from earlier in the same session (its
        // browser cache entry already warm) can fire `onLoad` fast enough
        // that the browser never actually paints the starting opacity:0
        // frame before this flips straight to opacity:100 — collapsing the
        // fade into an instant cut (reported as "クロスフェードが効かない
        // ときがたまにある"). A double requestAnimationFrame — the first
        // fires right before the *next* paint (so opacity:0 actually gets
        // painted once), the second (scheduled from inside the first) fires
        // right before the paint *after that* — reliably forces at least
        // one real paint of the starting state first, regardless of how
        // instantly the image itself resolved.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setLoaded(true));
        });
        onLoaded();
      }}
      // Static Maps requests fail silently from this component's own point
      // of view otherwise (the <img> just never fires onLoad, so it stays
      // invisible forever with no visible sign why) — logging here at least
      // surfaces the failing request/status in the browser console so a key
      // restriction, disabled API, or billing issue is diagnosable instead
      // of just "nothing shows up".
      onError={() => console.error("[ScenicMapBackground] failed to load:", src)}
    />
  );
}

/**
 * Full-bleed, ever-changing satellite-photo background for the 404 page
 * (app/not-found.tsx) — cycles through a curated worldwide list of scenic
 * locations (lib/scenic-locations.ts) every 10s, crossfading between them,
 * each one slowly panning in a random one of 8 directions (up/down/left/
 * right/diagonals — per explicit request: "この航空写真を上下左右斜めにラ
 * ンダムにゆっくりスライドさせて"). The photo itself still carries zero
 * text/labels (per the original brief) — but `ScenicLocation.name` (see
 * LocationNameReadout above) is now rendered separately, as its own
 * bottom-of-screen readout above the coordinates, per a later explicit
 * request ("緯度経度以外に場所の名称も取得できるの？").
 *
 * Requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — a Google Static Maps API key
 * on a billing-enabled Cloud project (see .env.local.example). Deliberately
 * `NEXT_PUBLIC_` (unlike lib/spotify.ts's server-only secrets): a Static Maps
 * key is designed to be used straight in an image `src` URL from the client,
 * so it's restricted by HTTP referrer in the Google Cloud Console rather than
 * kept server-side-secret. Renders nothing at all if that env var isn't set
 * — same "just degrade gracefully" convention as lib/spotify.ts.
 */
export function ScenicMapBackground() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Starts at `null` (nothing picked/rendered yet), *not* a random Slide
  // picked inline via useState(() => pickNextSlide(null)) — despite "use
  // client", Next.js still server-renders this component for the initial
  // HTML, and Math.random() called during that render picks a different
  // value than the client's own separate render during hydration, producing
  // a mismatched-img-src hydration error ("Variable input such as Date.now()
  // or Math.random() which changes each time it's called"). The actual
  // random starting slide is instead picked inside the mount-only effect
  // below (client-only, runs once after hydration is already done) — same
  // "keep Math.random() inside an effect, not an initial useState" pattern
  // already used in hovered-project-title.tsx's own scramble jitter.
  const [current, setCurrent] = useState<Slide | null>(null);
  const [previous, setPrevious] = useState<Slide | null>(null);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** シャッフル済みの残り山札（drawNextSlide の doc comment 参照）。マウント
   *  ごとに空から始まる＝ページを開くたびに並びを引き直す。 */
  const deckRef = useRef<number[]>([]);
  /** interval から前回のスライドを読むためのミラー。以前は setCurrent の
   *  updater 内で次を抽選していたが、山札の消費（shift）は副作用なので
   *  updater の中に置けない（StrictMode の二重実行で1枚余計に引いて
   *  しまう）。抽選を interval 本体へ出すため、現在値は ref で追う。 */
  const currentSlideRef = useRef<Slide | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    // Deferred via requestAnimationFrame rather than called directly in the
    // effect body — same convention already used elsewhere in this codebase
    // (reveal-on-mount.tsx, idle-overlay.tsx's own reveal effect) for a
    // mount-only setState, and it also satisfies react-hooks' own
    // set-state-in-effect rule, which flags a *direct, synchronous* setState
    // call in an effect body but not one deferred into a callback like this.
    const frame = requestAnimationFrame(() => {
      const first = drawNextSlide(deckRef.current, null);
      currentSlideRef.current = first;
      setCurrent(first);
    });
    const interval = setInterval(() => {
      const next = drawNextSlide(deckRef.current, currentSlideRef.current);
      setPrevious(currentSlideRef.current);
      currentSlideRef.current = next;
      setCurrent(next);
    }, CYCLE_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [apiKey]);

  // Once the new "current" image has finished crossfading in, drop the
  // stacked-behind "previous" layer — nothing visually changes (it's already
  // fully covered by then), this just stops the DOM from quietly holding on
  // to an ever-growing trail of past images.
  const handleCurrentLoaded = useCallback(() => {
    if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
    cleanupTimeoutRef.current = setTimeout(() => setPrevious(null), CROSSFADE_MS);
  }, []);

  useEffect(
    () => () => {
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
    },
    [],
  );

  if (!apiKey || current === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {previous && (
        // Starts at its pan's own *end* position (PAN_RANGE_PERCENT) — right
        // where its CrossfadeImage's pan sweep had just finished
        // (PAN_DURATION_MS === CYCLE_MS, the same span this slide just spent
        // as "current"), so there's no visible jump at the handoff — then
        // keeps drifting further for the rest of its time on screen instead
        // of freezing outright; see PreviousImage's own doc comment.
        <PreviousImage
          key={previous.locationIndex}
          src={buildStaticMapUrl(SCENIC_LOCATIONS[previous.locationIndex], apiKey)}
          dx={previous.dx}
          dy={previous.dy}
        />
      )}
      <CrossfadeImage
        key={current.locationIndex}
        src={buildStaticMapUrl(SCENIC_LOCATIONS[current.locationIndex], apiKey)}
        dx={current.dx}
        dy={current.dy}
        onLoaded={handleCurrentLoaded}
      />

      {/* Required attribution — Google's Maps Platform Terms of Service
         mandate that Google's own attribution stay visible and never be
         cropped/obscured wherever Static Maps imagery is displayed. The
         image Google returns already has its own small watermark baked in,
         but this component's own object-cover cropping + PAN_ZOOM/pan
         sliding can shift or crop that baked-in watermark out of frame at
         various positions/aspect ratios — so this fixed, never-moving label
         is added independently to stay compliant regardless of whatever the
         photo itself is doing underneath. Small, bottom-right, 24px margin
         per explicit request ("入れるんだったら右下24pxの位置に小さめに")
         — sits *under* app/not-found.tsx's own dark bg-black/45 overlay
         (same DOM-order stacking as the photo itself), which if anything
         helps its own legibility (light text against the same dimmed
         backdrop as everything else on that page). "Google Maps" text
         (rather than just "Google") per Google's current guidance for new
         implementations. z-10 for the same reason as CoordinatesReadout's
         own z-10 below — without it, app/not-found.tsx's own bg-black/45
         overlay (a later, and therefore higher-painting, sibling of this
         entire component in the DOM) sits on top of this text too despite
         it being coded text-white, visibly dimming/greying it out (reported
         as the coordinates/Google Maps text "not being white" even though
         it already was in code). PC-only (`hidden lg:block`) — see
         MobileScenicReadouts' own "Google Maps" line for the SP counterpart
         (Figma node 1195:278), positioned per that design instead of
         bottom-right. */}
      <p
        className="absolute right-[24px] bottom-[24px] z-10 hidden text-[length:calc(12px*var(--scale))] leading-none font-medium text-white lg:block"
        aria-hidden
      >
        Google Maps
      </p>

      {/* Bottom-of-screen place name + coordinates readouts (Figma node
         925:221 for the coordinates line; the name line above it is new) —
         both always reflect whichever location is actually showing right
         now, not the "previous" one still fading out underneath. PC/SP
         split at Tailwind's default `lg` breakpoint, per app/not-found.tsx's
         own PC/MobileNotFound pairing. */}
      <LocationNameReadout name={SCENIC_LOCATIONS[current.locationIndex].name} />
      <CoordinatesReadout lat={SCENIC_LOCATIONS[current.locationIndex].lat} lng={SCENIC_LOCATIONS[current.locationIndex].lng} />
      <MobileScenicReadouts
        name={SCENIC_LOCATIONS[current.locationIndex].name}
        lat={SCENIC_LOCATIONS[current.locationIndex].lat}
        lng={SCENIC_LOCATIONS[current.locationIndex].lng}
      />
    </div>
  );
}
