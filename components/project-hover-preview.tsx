"use client";

import { PC_PREVIEW_SIZES, previewSrcSet } from "@/lib/preview-image";
import { KONAMI_WARP_HOVER_ATTRIBUTE } from "@/components/konami-warp-canvas";

import { useEffect, useState } from "react";

/**
 * Large background preview shown behind the page while hovering a project
 * title (see app/page.tsx, which owns the hover-stack state and passes it
 * here — this component only renders). Shows that project's ratio sample
 * image (public/images/previews/) — one shared placeholder per ratio until
 * microCMS supplies a real per-project image.
 *
 * Stays behind the page's normal text via app/page.tsx wrapping the actual
 * content in its own `relative` (no z-index) layer — see the comment there.
 * These images deliberately have no explicit z-index either (previously
 * z-index:1 was used to keep the current entry above the previous one, but
 * *any* explicit z-index — even 0 — creates a new stacking context ranked
 * above plain "auto" positioned elements like that text layer, putting the
 * images back on top of it). Instead, the current entry is simply rendered
 * *after* the previous one in the DOM below, so it wins the tie-break that
 * applies among same-level ("auto") positioned siblings.
 */

export type HoverPreviewRect = { top: number; left: number; width: number; height: number };

export type HoverPreviewEntry = {
  /** React key — unique per hover event, not per project, so re-hovering
   *  the same project still counts as a fresh entry if it had been bumped out. */
  key: string;
  rect: HoverPreviewRect;
  imageSrc: string;
  /** Responsive candidates for `imageSrc` (lib/projects.ts's own
   *  getProjectImageSrcSet) — undefined for placeholder projects. */
  imageSrcSet?: string;
};

type ProjectHoverPreviewProps = {
  /** Newest first. Only the first two are ever rendered (see app/page.tsx). */
  entries: HoverPreviewEntry[];
  /** Once true (scrolled down to the footer), everything fades out. */
  released: boolean;
};

export function ProjectHoverPreview({ entries, released }: ProjectHoverPreviewProps) {
  const current = entries[0];
  // Oldest (or only) first, current last — so DOM order alone puts the
  // current entry on top, without any z-index at all.
  const ordered = entries.slice(0, 2).reverse();

  return (
    <>
      {ordered.map((entry) => (
        <HoverPreviewImage
          key={entry.key}
          entry={entry}
          isCurrent={entry.key === current?.key}
          released={released}
        />
      ))}
    </>
  );
}

type HoverPreviewImageProps = {
  entry: HoverPreviewEntry;
  isCurrent: boolean;
  released: boolean;
};

/**
 * One hover-preview image. Mounts at opacity 0 and flips to its real target
 * opacity a frame later (`entered`) so a brand-new entry actually fades in —
 * without this, a freshly-mounted DOM node's *initial* style can't animate
 * (CSS transitions only fire on a value change to an already-rendered
 * element), so it used to just pop straight to full opacity instead.
 *
 * Split into a background box (this project's own image-sized "frame") and
 * the actual `<img>` layered on top of it, each with their own independent
 * opacity — per direct follow-up ("ホバーでイメージが表示される前の一瞬、
 * グレーベタが表示されるので、読み込みできてないときは、イメージのサイズの
 * 枠（#e5e5e5）を表示するようにして"): the previous version put a
 * `background-color` directly on the `<img>` element itself, so this entry's
 * own entrance opacity (`entered`/`targetOpacity` above) controlled the box
 * and the actual photo *together* as one unit — meaning the instant the
 * photo actually finished loading, it just popped in wherever that shared
 * opacity already happened to be, with no fade of its own tied to real load
 * completion. Now the outer box fades in immediately per the existing
 * `entered`/`targetOpacity` logic (unchanged), while the `<img>` inside it
 * only fades in (its own separate 300ms transition) once `onLoad` actually
 * fires — same "placeholder box stays put, only the real photo gets its own
 * load-triggered fade" split project-hero-parallax.tsx's own `imageLoaded`
 * just added for the project detail page's Hero photo.
 *
 * The frame itself is a plain 1px `#e5e5e5` outline, not a filled box — a
 * follow-up report on the filled version ("まだトップのtxt時にホバーで表示
 * される画像が読み込まれてないとき、グレー画像が表示される") turned out to
 * be about that original fill itself reading as an odd "gray image" rather
 * than a subtle placeholder frame; a border-only outline (border-box, so it
 * doesn't change these outer dimensions) keeps the "something's about to
 * load here" cue without filling the whole box solid gray.
 *
 * The border itself now fades out once `imageLoaded` — per further direct
 * follow-up ("イメージが表示されるまでは罫線を表示させてほしいけど、イメー
 * ジにはつけないでほしい"): this border lives on the outer wrapper (see the
 * `<img>`'s own separate onLoad-gated fade below), so without this it stayed
 * visibly framing the real photo forever once loaded, not just during the
 * loading wait it was meant to signal. borderColor (not the `border` utility
 * itself) is what transitions — swapping `border` on/off would toggle the
 * box's own 1px width (border-box), causing a 1px content resize right as it
 * disappears; animating the *color* to transparent instead keeps that same
 * 1px reserved always, just invisible once loaded.
 *
 * Attempted-and-reverted fix ("pcのsafariで見たとき、トップのTxt時にホバー
 * で背景イメージが表示される際、ヘッダーが白文字の状態になってブレンド
 * モードが効いてない状態になる"): tried adding `transform: translateZ(0)`
 * to this component's own fixed-position div, on the theory that promoting
 * it to its own GPU compositing layer would work around a known Safari/
 * WebKit bug where a `position: fixed` element sharing a stacking context
 * with a `mix-blend-mode` element (SiteHeader's own per-element blend, see
 * its doc comment) can make Safari drop the blend. Confirmed by the user
 * this did NOT fix it — reverted. Root cause still unconfirmed; needs
 * further investigation (not yet re-attempted). */
function HoverPreviewImage({ entry, isCurrent, released }: HoverPreviewImageProps) {
  const [entered, setEntered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const targetOpacity = released ? 0 : isCurrent ? 1 : 0.1;

  return (
    <div
      aria-hidden
      // KONAMI_WARP_HOVER_ATTRIBUTE — エッグ実行中、この画像に紙の登場
      // アニメ（回転・スライド・拡大＋しなり）を掛ける対象のマーカー
      // （konami-warp-canvas.tsx の紙モード。エッグが動いていなければ誰も
      // 読まない不活性な属性）。一度 CSS transform 版に移行したが、CSS では
      // しなり（面の曲げ）が出せないためシェーダー版に戻した — per direct
      // follow-up ("紙のしなりとかついてないんだけど")。
      // 「現在ホバー中」のエントリだけに付ける — 残像側まで対象にすると
      // canvas が実DOMを隠して不透明で描き直すため、残像のフェードが壊れる。
      {...(isCurrent && !released ? { [KONAMI_WARP_HOVER_ATTRIBUTE]: "" } : {})}
      // project-hover-preview — エッグ実行中だけ遷移を遅くする CSS の
      // フック（globals.css）。通常時は何も変えない。
      className="project-hover-preview pointer-events-none fixed overflow-hidden border transition-[opacity,filter,border-color] duration-300 ease-out"
      style={{
        top: `${entry.rect.top}px`,
        left: `${entry.rect.left}px`,
        width: `${entry.rect.width}px`,
        height: `${entry.rect.height}px`,
        opacity: entered ? targetOpacity : 0,
        filter: isCurrent ? "none" : "grayscale(1)",
        borderColor: imageLoaded ? "transparent" : "#e5e5e5",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamically sized/positioned, see app/page.tsx */}
      <img
        src={entry.imageSrc}
        srcSet={previewSrcSet(entry.imageSrcSet)}
        // Was sizes="100vw" with the reasoning "never exceeds the window, so
        // the viewport width is the correct upper bound" — true, but a loose
        // upper bound is exactly what `sizes` shouldn't be: the browser
        // multiplies it by the screen's DPR to choose a candidate, so
        // over-claiming by 20% over-fetches on every hover. The real ceiling
        // is 20 of the 24 grid columns, i.e. PC_PREVIEW_SIZES — see that
        // constant for the derivation, and previewSrcSet for the separate
        // resolution cap.
        sizes={PC_PREVIEW_SIZES}
        alt=""
        onLoad={() => setImageLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-300 ease-out ${imageLoaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
