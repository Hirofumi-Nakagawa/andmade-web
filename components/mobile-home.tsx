"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { MobileProjectList } from "@/components/mobile-project-list";
import { MobileProjectThumbnailGrid } from "@/components/mobile-project-thumbnail-grid";
import { ArrowIcon } from "@/components/arrow-icon";
import { CurtainLines } from "@/components/curtain-lines";
import { MobileRecentNews } from "@/components/mobile-recent-news";
import { introDefinitelyWontShow, willIntroShow } from "@/components/site-intro";
import { SlotDigits } from "@/components/slot-digits";
import { VerticalLabel } from "@/components/vertical-label";
import { FV_SECOND_BEAT_MS, LIST_ENTRANCE_DELAY_MS, markPageEntered } from "@/lib/entrance";
import { setFooterReady as broadcastFooterReady } from "@/lib/footer-mode-store";
import type { NewsItem } from "@/lib/news";
import { previewSrcSet, SP_PREVIEW_SIZES } from "@/lib/preview-image";
import {
  PREVIEW_RATIO_ASPECT,
  getProjectImageSrc,
  getProjectSpPreviewVideoSrc,
  getProjectImageSrcSet,
  slugify,
  type Project,
} from "@/lib/projects";

/** Extra left indent on top of the page's own 20px side margin — matches
 *  Figma's own `pl-[60px]` on both the header ("hd", 975:515) and the
 *  project list (975:530): exactly 2 of globals.css's own fluid
 *  `--sp-grid-column-width` columns, giving header/list text a left inset
 *  that stays aligned with GridOverlay's own SP grid at every viewport
 *  width — an earlier version hardcoded this as a literal 60px, which only
 *  matched the grid at Figma's exact 400px reference width and drifted out
 *  of alignment everywhere else (reported as "ANDMADE Inc.と一覧、フッター
 *  の左面がグリッドに合ってない"). */
const CONTENT_INDENT = "calc(var(--sp-grid-column-width) * 2)";
/** Gap between the project list's last row and the trailing spacer below it
 *  (where MobileMenu's own footer-mode panel grows in from) — Figma's own
 *  `gap-[200px]` between nodes 975:530 and 975:696, plus 150px ("フッターと
 *  一覧のマージンを150px増やして"), then another 50px ("フッターと一覧の
 *  マージンをあと50px増やして"), then down to a flat 220px per direct
 *  follow-up ("フッターと一覧のマージンを220pxに"), then up to 280px per a
 *  further direct follow-up ("フッター上のマージンを280pxに"), then to 350px
 *  per a still further direct follow-up ("フッター上のマージンを350pxに"),
 *  then up to a flat 600px per a still further direct follow-up ("トップの
 *  フッターは必ず一覧の下マージン600pxある状態にして") fixing two related
 *  reports at once: (1) with a song playing, the footer panel's own extra
 *  NOW_PLAYING_HEIGHT_PX made it tall enough to visually cover the tail end
 *  of the list when it grew in ("再生中の曲があってフッターの高さが長くな
 *  ったら、一覧が隠れてしまってる") — 600px comfortably clears that even at
 *  the panel's tallest; (2) the previous, tighter 350px gap sometimes left
 *  too little *scroll* room below the last row for it to ever naturally
 *  cross MobileProjectList's own trigger line (see that file's own
 *  "the very last row can run out of room" comment) before footerReady's own
 *  near-bottom check already fired via the true-bottom fallback — the two
 *  landing on the same tick meant the last project's own image/title never
 *  got a visible moment on screen before the footer took over, reading as
 *  the list stopping short one project early ("まだ、最後から2つ目の
 *  scramberryまでしか表示できてない"). The extra room here fixes that too:
 *  the last row now has enough scrollable distance below it to cross the
 *  trigger line the normal way, well before footerReady's own 100px-from-
 *  bottom check fires. Nudged down slightly to 550px per a still further
 *  direct follow-up ("一覧下マージンを550pxに変更"), then down to 120px per
 *  a later direct follow-up covering Top/About/project-detail together
 *  ("SPのトップとAbout、実績詳細ページのフッターが表示されたときのフッター
 *  エリアとコンテンツのマージンが120pxになるように調整して"), then back up
 *  to 500px per a still further direct follow-up, same across all three
 *  pages ("それぞれのフッター用トレーリングスペーサーを500pxにして"), then
 *  back to 550px per a still further direct follow-up ("それぞれのフッター
 *  用トレーリングスペーサーを550pxに戻して"). Fixed at 550px regardless of
 *  Now Playing state — per a still further direct follow-up ("SPトップの
 *  フッター用トレーリングスペーサーだけ550pxのままにしておいて"), unlike
 *  mobile-about.tsx/mobile-project-detail.tsx's own idle-shrunk variant of
 *  this same spacer. */
const LIST_FOOTER_GAP_PX = 550;
/** Shifts the rail's *resting* (not-yet-stuck) position up — sticky's own
 *  `top` value (see the rail markup below) only takes effect once scrolling
 *  actually carries the element that far, so nudging it alone did nothing
 *  visible while still positioned in its normal in-flow spot (reported as
 *  "上がってないけど"). This offsets the rail's sticky *containing block*
 *  itself instead, which shifts both the resting position and (by the same
 *  amount) where it releases at the bottom. Back to 0 (was -10, after
 *  cumulative nudges of up 5px, up 10px, down 5px) per direct follow-up
 *  ("一覧とtx-thの上面揃える") — any nonzero value here sits the rail's own
 *  resting position that many px above/below the actual list's own top edge
 *  (the list itself renders in normal flow, unaffected by this), so the two
 *  only land flush when this is exactly 0. */
const RAIL_REST_OFFSET_PX = 0;
/** How long after scrolling actually stops before the scroll-triggered
 *  project preview image fades out — per explicit spec ("スクロールをやめ
 *  て2秒経過するとイメージは消す"). */
const PREVIEW_IDLE_MS = 2000;
/** 300ms → 150ms per direct follow-up ("右下イメージが表示されるタイミング
 *  をもう少し速く"), then back up to 280ms after 150ms was reported as not
 *  reading as a fade at all ("イメージのフェードインがまだ効いてない"), then
 *  to 400ms after that same report recurred even at 280ms ("付いてるように見
 *  えないから少しわかるようにしてほしい") — the *real* root cause of that
 *  recurring report turned out to be unrelated to this duration at all (see
 *  PreviewImage's own doc comment: the container's opacity was fading in
 *  against an `<img>` that hadn't actually finished loading/painting yet, so
 *  the fade completed before there was any visible photo to fade). Bumped a
 *  little further anyway now that the real fix is in, for a bit more margin.
 *  Still deliberately faster than PREVIEW_FADE_OUT_MS below (appearing
 *  should still feel snappier than disappearing). */
const PREVIEW_FADE_IN_MS = 400;
/** Separate, slower duration for the fade *out* (idle timeout / footer
 *  reached / "Back to top"), per direct follow-up ("2秒後に消えるときはフェ
 *  ードアウト"): PREVIEW_FADE_IN_MS's own 150ms — tuned specifically to make
 *  the image feel snappy/immediate when it *appears* — reads as an
 *  instantaneous pop rather than a visible fade when used for the
 *  *disappearing* edge too, especially since the 2-second idle-hide is a
 *  passive, easy-to-miss transition (no scroll motion happening alongside it
 *  the way the fade-in usually has). PreviewOverlay below picks between the
 *  two based on which direction `shown` is actually headed, via CSS's own
 *  "duration is read from the *target* style at the moment a transition
 *  starts" behavior — not a fixed value shared by both directions. */
const PREVIEW_FADE_OUT_MS = 400;
/** SelectedProjectText's own `bottom` offset (its category line — the last,
 *  lowest content in that fixed-position block — sits flush with the block's
 *  own bottom edge, i.e. exactly this far above the viewport's own bottom
 *  edge). Shared with the bottom-of-page fade-out check below (footerReady)
 *  so the two can never drift apart the way an earlier flat 30px lead-in
 *  constant risked doing — see footerReady's own doc comment (MobileHome). */
const SELECTED_TEXT_BOTTOM_PX = 100;
/** SP grid constants — mirrors globals.css's own `--sp-grid-margin`/
 *  `--sp-grid-column-width` exactly (see :root there), so the random preview
 *  placement below (plain JS, needing real numbers to randomize with rather
 *  than a CSS calc()) always matches whatever those CSS variables currently
 *  resolve to. 4px → 8px per direct follow-up ("現状の両サイドの余白が8px
 *  じゃなく4pxになってる？...余白は8pxまま") — several other files' own doc
 *  comments (mobile-recent-news.tsx, the rail's own comment below) already
 *  assumed 8px even while this constant had drifted down to 4, which is
 *  exactly the inconsistency that follow-up called out. The Tx/Th/"33 Cases"
 *  rail below is the one deliberate exception — it keeps a 4px left margin
 *  specifically, per that same follow-up ("左マージン4pxっていうのは左の
 *  パーツ（tx-th、33）にだけ適用してほしい") — see its own `marginLeft`
 *  below for how. */
const SP_GRID_MARGIN_PX = 8;
const SP_GRID_COLUMNS = 12;
function getSpGridColumnWidthPx() {
  return (window.innerWidth - SP_GRID_MARGIN_PX * 2) / SP_GRID_COLUMNS;
}
/** Random preview placement — per direct follow-up ("背景のイメージ表示位置
 *  はpcと同じようにランダムにする"), matching PC's own
 *  generateRandomPreviewRect (app/page.tsx): a fresh random rect computed
 *  once per newly-activated project (see PreviewOverlay's own `useState`
 *  lazy initializer below), not re-rolled on every render.
 *
 *  Horizontal — the placement area runs from the 1st grid column in from the
 *  left edge — i.e. column index 0, truly including that first column (was
 *  index 1, which despite the "1マス目から" follow-up that introduced it
 *  still excluded that very first column; corrected per a still further
 *  direct follow-up, "イメージ表示エリアは1マス目も含む") — to the screen's
 *  own right edge. Width is a fixed column count per ratio — portrait 9,
 *  landscape 11 (per direct follow-up, "縦画像の幅は9マス...横画像の幅は
 *  11マス...", was 8/10 before that, and a random choice between two counts
 *  each before *that* — 7/8, then 9/10 — see
 *  PREVIEW_PORTRAIT_COLUMN_OPTIONS/PREVIEW_LANDSCAPE_COLUMN_OPTIONS
 *  below, now single-element arrays for the same reason `pickRandom` is
 *  still used on them: keeping the exact same shape/call site as when they
 *  held two options, so a future follow-up reintroducing a second choice
 *  needs no structural changes, just another array entry).
 *
 *  Each placement is drawn uniformly from every distinct horizontal position
 *  the box can occupy — flush against either screen edge, or grid-snapped at
 *  one of the interior columns between them. See placementOptions() below,
 *  which enumerates them (and for why an earlier three-way left/right/
 *  interior draw made the edges far more likely than the middle). The two
 *  flush cases extend the width by exactly SP_GRID_MARGIN_PX beyond the plain
 *  column-based width ("右端に表示するときは余白を足した幅にする", and,
 *  for the left edge, per a further direct follow-up, "イメージ表示エリア
 *  は左端の余白も入れて"): the grid's own 12-column area sits one margin
 *  short of each true screen edge, so adding exactly one margin's worth of
 *  width on the relevant side reaches flush against the real edge while
 *  keeping the *other* edge landing exactly on a column boundary — e.g. for
 *  the right case, `left = innerWidth - width` simplifies to
 *  `SP_GRID_MARGIN_PX + (12 - columns) * columnWidthPx`, still grid-aligned;
 *  the left case is the mirror image (left pinned to 0, right edge lands on
 *  a column boundary the same way). An earlier version used a separate flat
 *  `PREVIEW_EDGE_PADDING_PX` (20) constant for this instead of reading the
 *  live margin — that literal had equaled SP_GRID_MARGIN_PX back when the
 *  margin itself was still 20px, but silently drifted out of sync once the
 *  margin later changed to 14px, breaking that same right-edge grid
 *  alignment (reported as "右端付きの画像がグリッドに沿ってない"). The
 *  interior positions use the plain column-based width instead.
 *
 *  Vertical — the box's own vertical *center* lands at a random offset
 *  within this range of the viewport's own vertical center: up to
 *  PREVIEW_VERTICAL_RANGE_UP_PX *above* center, down to
 *  PREVIEW_VERTICAL_RANGE_DOWN_PX *below* it — per direct follow-up
 *  ("イメージの表示ルールは、画面中央から上に50px、下に20pxの範囲内でラン
 *  ダム表示に変更"), replacing the earlier symmetric ±50px range. */
const PREVIEW_AREA_START_COLUMN = 0;
const PREVIEW_PORTRAIT_COLUMN_OPTIONS = [9];
const PREVIEW_LANDSCAPE_COLUMN_OPTIONS = [11];
/** Square ("square-1-1") gets the portrait width rather than the landscape
 *  one: at 11 columns a 1:1 box is as tall as it is wide, which on SP's
 *  narrow viewport reads as overwhelming next to the 9-column portraits it
 *  alternates with. */
const PREVIEW_SQUARE_COLUMN_OPTIONS = [9];
const PREVIEW_VERTICAL_RANGE_UP_PX = 50;
const PREVIEW_VERTICAL_RANGE_DOWN_PX = 20;

function pickRandom<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

type PreviewRect = { top: number; left: number; width: number; height: number };

/**
 * Every distinct horizontal position a preview of this width can occupy, one
 * entry each, so picking one at random is genuinely uniform across positions.
 *
 * This replaces a three-way `pickRandom(["left", "right", "interior"])`,
 * which gave a third of the probability to each of the two single flush-edge
 * positions and split the remaining third across *all* the interior columns —
 * per direct follow-up "両端に表示されることが多い印象。均等にランダムに
 * なってる？", which was exactly right. For a 9-column portrait (4 interior
 * starts) that worked out to 33% flush-left, 33% flush-right and 8.3% for
 * each interior slot; counting the interior slots that sit within one 8px
 * margin of an edge, ~83% of previews landed on an edge.
 *
 * The two flush cases extend the width by exactly one margin so the *other*
 * edge still lands on a column boundary (see generateRandomPreviewRect's own
 * doc comment). That makes each end of the grid offer two neighbouring
 * variants — bleeding into the margin strip, or starting on it — and both
 * are kept, per direct follow-up "8pxの選択も残して": at the left they are
 * `left: 0` and `left: 8`, and at the right they are the mirror image
 * (ending flush against the screen, or one margin short of it, which is why
 * the two right-hand entries can share a `left` while differing in width).
 * They read as genuinely different placements, so they each get their own
 * equal share rather than one being folded into the other.
 *
 * A wide enough box has fewer positions to offer — an 11-column landscape in
 * a 12-column grid only has the two ends, so it yields four entries (two per
 * end) and no true middle.
 */
function placementOptions(
  baseWidth: number,
  columns: number,
  columnWidthPx: number
): { width: number; left: number }[] {
  const flushWidth = baseWidth + SP_GRID_MARGIN_PX;
  const options = [
    { width: flushWidth, left: 0 },
    { width: flushWidth, left: window.innerWidth - flushWidth },
  ];

  const maxStartColumn = Math.max(PREVIEW_AREA_START_COLUMN, SP_GRID_COLUMNS - columns);
  // Grid-snapped, per direct follow-up ("背景に表示するイメージの位置は常に
  // グリッドに沿うようにして") — whole columns, converted back to pixels.
  // Inclusive of both ends: those are the margin-aligned counterparts to the
  // two flush entries above.
  for (let column = PREVIEW_AREA_START_COLUMN; column <= maxStartColumn; column += 1) {
    options.push({ width: baseWidth, left: SP_GRID_MARGIN_PX + column * columnWidthPx });
  }
  return options;
}

/** One entry in MobileHome's own previewEntries history — mirrors PC's own
 *  HoverPreviewEntry (project-hover-preview.tsx): a per-activation rect plus
 *  the image to show there, keyed uniquely per activation (not per project)
 *  so re-activating the same project later still counts as a fresh entry
 *  (new random rect, replays its own fade-in). `title` is kept as its own
 *  field (not parsed back out of `key`) specifically so handleActiveChange
 *  below can de-duplicate by *project*, not just by activation — see that
 *  function's own doc comment for why. */
type PreviewEntry = {
  key: string;
  title: string;
  rect: PreviewRect;
  imageSrc: string;
  /** Responsive candidates for `imageSrc` — undefined for placeholder
   *  projects (see lib/projects.ts's own getProjectImageSrcSet). */
  imageSrcSet?: string;
  /** 入っていればこのプレビューは動画（imageSrc はポスター）— lib/projects.ts
   *  の Project.previewVideoSrc の doc comment 参照。 */
  videoSrc?: string;
};

function generateRandomPreviewRect(project: Project): PreviewRect {
  const columnWidthPx = getSpGridColumnWidthPx();
  // Three-way, not the old boolean `startsWith("portrait")` — "square-1-1"
  // matches neither prefix and would otherwise silently fall into the
  // landscape branch.
  const ratio = project.previewRatio;
  const columnOptions = ratio.startsWith("portrait")
    ? PREVIEW_PORTRAIT_COLUMN_OPTIONS
    : ratio.startsWith("square")
      ? PREVIEW_SQUARE_COLUMN_OPTIONS
      : PREVIEW_LANDSCAPE_COLUMN_OPTIONS;
  const columns = pickRandom(columnOptions);
  const baseWidth = columns * columnWidthPx;

  const { width, left } = pickRandom(placementOptions(baseWidth, columns, columnWidthPx));

  const height = width / PREVIEW_RATIO_ASPECT[project.previewRatio];
  const centerY = window.innerHeight / 2;
  // Asymmetric range — up to PREVIEW_VERTICAL_RANGE_UP_PX *above* center
  // (negative offset) down to PREVIEW_VERTICAL_RANGE_DOWN_PX *below* it
  // (positive offset), not a symmetric ± range — see this function's own
  // doc comment above.
  const offset =
    Math.random() * (PREVIEW_VERTICAL_RANGE_UP_PX + PREVIEW_VERTICAL_RANGE_DOWN_PX) - PREVIEW_VERTICAL_RANGE_UP_PX;
  const top = centerY + offset - height / 2;

  return { top, left, width, height };
}

/** Txt と Img の間の縦線の長さ。40px（"Tx-Thの間の線は40pxにして"）→ 50px
 *  （"txt-imgの間の線を10px伸ばして"）。 */
const DIVIDER_HEIGHT_PX = 50;

// VerticalLabel (rotate-90 content technique for Tx/Th/"33 Cases" below) now
// lives in its own file (components/vertical-label.tsx) — extracted so
// idle-overlay.tsx's own SP variant (Figma node 1100:384) can reuse the exact
// same rotation geometry for its own rotated tagline/date/logo/pills column.

/**
 * SP (mobile) top page — Figma node 975:44 ("sp_index"). Rendered alongside
 * (not replacing) the existing PC-only tree in app/page.tsx, split at
 * Tailwind's default `lg` breakpoint (1024px) via plain CSS (`hidden
 * lg:contents` on the PC tree, `lg:hidden` here) rather than a JS viewport
 * check — avoids any hydration mismatch, and keeps both trees' own state
 * alive across a resize instead of unmounting/remounting on every breakpoint
 * crossing. 1024px deliberately matches globals.css's own --grid-scale
 * floor point (see its comment: "pending a dedicated mobile layout — no
 * Figma mobile design exists yet, TODO once provided") — this is that
 * mobile layout. (A brief experiment moved this down to 850px so the PC
 * design could keep shrinking into tablet widths instead of handing off
 * here — reverted per direct follow-up ("やっぱり1024px以下はスマホ表示に
 * 戻して"), back to the plain 1024px split below.)
 *
 * Genuinely separate implementation from the PC tree, not a responsive
 * reskin of it, per explicit spec: PC is hover-driven with fluid --scale/
 * --grid-scale units; SP is scroll-driven with fixed px units and a
 * completely different preview mechanism (fixed bottom-right box that
 * follows list order instead of a random grid-snapped rect under the
 * cursor).
 *
 * The Tx/Img+"33 Cases" rail mirrors PC's own sticky-toggle technique
 * exactly (project-view-toggle.tsx: an `absolute inset-0` box, sized to the
 * full scrollable list section, containing a `sticky` child) — per explicit
 * spec ("tx/thは一覧上面に揃える" / "スクロールして上にきたら上から24px
 * の位置で固定", then nudged up 5px, up 10px, and down 5px per direct
 * follow-ups, landing on the current `top-[14px]`), this is literally what
 * CSS `position: sticky` does natively: it rests at its normal in-flow position (level
 * with the list's own top edge, since it lives inside that same section)
 * until scrolling would carry it above its own `top` value, at which point
 * it sticks there — no scrollY-threshold JS hack needed (an earlier version
 * used one, with a `fixed` position manually animated between two guessed
 * top values; removed in favor of this simpler, more accurate native
 * mechanism).
 *
 * Header, Tx/Img+counter, and the project list all render in white text
 * through mix-blend-exclusion — same convention as PC's own text layer (see
 * app/page.tsx's own top-of-file comments): reads as near-black over the
 * plain cream background at rest, and turns legibly white once a project's
 * own preview photo shows behind it while scrolling (the same mechanism
 * ProjectHoverPreview uses on PC, just scroll- instead of hover-triggered).
 * The footer, past every preview image, renders in plain black instead — no
 * blend-mode dependency, mirroring SiteFooter's own `theme: "dark"`.
 *
 * "ANDMADE Inc." itself scrolls away with the page (per explicit follow-up,
 * "ANDMADE Inc.は画面固定にしない") — only "Menu" stays `fixed` top-right.
 */
/** "ANDMADE Inc." header link's own fade-in duration — see `headerRevealed`'s
 *  own doc comment below. */
const HEADER_FADE_MS = 500;

/** 「Made Here」（13px / text-box-trim:trim-both）のボックス高さ＝キャップ
 *  ハイト。レールの marginTop と一覧の paddingTop の基準に使う。 */
const MADE_HERE_HEIGHT_PX = 9;

/** 背景プレビューを引っ込める「上端側」のしきい値。下端側の footerReady と
 *  対になる仕組み。
 *
 *  当初は「一覧セクションの原点がビューポート上端より下に来たら」という
 *  レイアウト由来の判定にしていたが、FV が入って一覧の開始位置が下がった
 *  結果、**1件目（Dots）が読み取り線を越える時点でもまだ抑制が効いていて、
 *  1件目だけ永久に選択されない**という副作用が出た。
 *  ページ最上部からの単純な距離に変え、1件目が読み取り線に届く前
 *  （実測で scrollY ≒ 250 付近）に解除されるよう 150px にしてある。 */
const PREVIEW_TOP_HIDE_PX = 150;

/** Txt/Img を切り替えたあと、背景プレビューを再び許す条件。
 *
 *  当初は 700ms の時間窓にしていたが、一覧の行が順に現れる（スクランブル
 *  テキストが終わる）のは切り替えから1秒以上あとで、そのタイミングで
 *  MobileProjectList の走査が「いま画面中央にある行」を active として通知し、
 *  showPreview() が走ってしまう。時間で待っても行の登場のほうが遅いので、
 *  **次にユーザーが画面に触れるまで**抑制する方式に変えた（レイアウト由来の
 *  スクロールはいくら起きても解除されない）。時間切れの保険だけ長めに残す。 */
const TOGGLE_PREVIEW_SUPPRESS_FALLBACK_MS = 6000;

/** FV ステートメントの登場。PC（home-statement.tsx）と同じ値。
 *  タイミングはヘッダーと同じくイントロ完了待ち（headerRevealed）。 */
/** コピー本文 — SP は画面幅で折り返しが変わるので改行位置は指定せず、
 *  CurtainLines 側で実測して1行ずつのマスクに割ってもらう。 */
const STATEMENT_COPY =
  "We uncover what truly matters and give purpose a clear form. By making every design decision intentional, we believe each thoughtful choice contributes to work that holds value over time.";
const STATEMENT_SLIDE_MS = 500;
const STATEMENT_DELAY_WHAT_MATTERS_MS = 0;
const STATEMENT_DELAY_COPY_MS = 120;
/** 「A sound archive〜 / Colors of Sound」はコピーより一拍遅れて（PC と同じ）。 */
const STATEMENT_DELAY_SOUND_MS = FV_SECOND_BEAT_MS;
/** 「Who we are」のフェードイン（PC と同値）。
 *
 *  始まりはコピーの**最終行が上がり始めた瞬間**（CurtainLines の
 *  onLastLineStart）。当初はコピーと同時（FV_SECOND_BEAT_MS）だったが、
 *  SP は折り返しが実測で決まって行数が多く、コピーがまだ半分も出ていない
 *  うちに先へ出てしまっていた。固定値だと画面幅で行数が変わるたびにずれる
 *  ので、行数からの逆算をコンポーネント側に任せている。 */
const STATEMENT_WHO_FADE_MS = 500;

type MobileHomeProps = {
  /** Fetched (or placeholder-fallback) project list — threaded down from
   *  app/page.tsx, which owns the actual microCMS fetch (see that file's own
   *  doc comment). Replaces this file's own previous direct `import {
   *  projects } from "@/lib/projects"` now that the real list is async. */
  projects: Project[];
  /** Recent announcements — threaded down from app/page.tsx via HomeView,
   *  same as `projects` above. See mobile-recent-news.tsx's own `items`. */
  news: NewsItem[];
  /** Colors of Sound（背景の色帯）の状態とトグル — 実体は home-view.tsx が
   *  持っていて、PC（home-statement.tsx）と共有する。SP の FV 右側にも
   *  同じスイッチを出す（Figma node 1712:1053）。 */
  colorsOn: boolean;
  onColorsToggle: () => void;
};

export function MobileHome({ projects, news, colorsOn, onColorsToggle }: MobileHomeProps) {
  const pathname = usePathname();
  /** コピー（CurtainLines）の最終行が上がり始めたか — 「Who we are」を
   *  出すきっかけ（STATEMENT_WHO_FADE_MS の doc comment 参照）。 */
  const [copyLastLineStarted, setCopyLastLineStarted] = useState(false);
  const handleCopyLastLineStart = useCallback(() => setCopyLastLineStarted(true), []);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  // "ANDMADE Inc." header link (below) fades in instead of rendering
  // instantly visible, matching site-header.tsx's own identical `fadeIn`
  // prop/reasoning on PC: starting genuinely
  // invisible (opacity 0) rather than instantly fully opaque means even the
  // unavoidable pre-hydration server paint (see site-intro.tsx's own
  // useLayoutEffect doc comment) has nothing here to flash.
  //
  // Waits for site-intro.tsx's own "andmade:intro-complete" event before
  // actually fading in, rather than starting the fade immediately on mount,
  // matching site-header.tsx's own identical
  // fix on PC (see that file's own doc comment for the full reasoning) and
  // mobile-menu.tsx's own established `willIntroShow`/`andmade:intro-
  // complete` pairing.
  //
  // Starts already-revealed (no fade at all) whenever `introDefinitelyWontShow()`
  // already knows, right at this very mount, that the splash isn't coming:
  // every
  // navigation *back* to "/" within the same session (the splash only ever
  // plays once per session at most — see site-intro.tsx's own
  // `introDecision` doc comment) used to still start hidden and fade in a
  // moment later via the event-listener branch below, reading as an
  // unwanted, unnecessary fade on every return trip instead of only on the
  // one genuine first-load-with-intro case. Computed via a lazy initializer
  // (not a plain `useState(false)` + effect) so it's decided once, up front,
  // before the first paint.
  //
  // `introDefinitelyWontShow()` specifically, *not* `!willIntroShow(pathname)`
  // — an earlier version used the latter and caused a real hydration
  // mismatch (Next's dev overlay reported it directly on site-header.tsx's
  // own identical pattern: server rendered pre-revealed, `opacity: 1`, while
  // the client's first hydration pass computed `opacity: 0`):
  // `willIntroShow`'s own SSR branch returns `false` (nothing decided yet
  // server-side), which reads as "won't show" to a plain `!` negation even
  // on a genuine fresh "/" load where the intro *is* about to play once
  // hydrated — see `introDefinitelyWontShow`'s own doc comment (site-intro.tsx)
  // for exactly why it stays safely `false` (matching the server's own
  // render) through both SSR and the client's own first hydration pass, only
  // ever turning `true` on a later, purely client-side mount — i.e. exactly
  // the "returning to '/' from elsewhere" case this was actually meant to fix.
  // 常に隠れた状態から始める。イントロが出ない
  // 復帰時も演出を見せたいので、その回はマウント直後の1フレームで true に
  // する（PC は components/use-intro-reveal.ts が同じことをしている）。
  const [headerRevealed, setHeaderRevealed] = useState(false);

  useEffect(() => {
    if (willIntroShow(pathname) && !introDefinitelyWontShow()) {
      function handleIntroComplete() {
        setHeaderRevealed(true);
      }
      window.addEventListener("andmade:intro-complete", handleIntroComplete, { once: true });
      return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
    }
    const frame = requestAnimationFrame(() => setHeaderRevealed(true));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: `pathname` is intentionally only read at its initial value, matching mobile-menu.tsx's own identical convention.
  }, []);
  // Bumped on every Tx/Th click (regardless of whether the view actually
  // changes) to replay every row's own underline sweep — per direct
  // follow-up ("PC同様、Tx,Th切り替え時に下線見出しにアンダーラインスイー
  // プを適用して"), matching PC's own app/page.tsx handleToggleClick exactly
  // (which does the same to every project title there). Threaded down to
  // MobileProjectList as `replayUnderlineToken`; each row bumps its own
  // underline's remount key whenever this changes (see that file's own doc
  // comment on the effect that does it).
  const [underlineReplayToken, setUnderlineReplayToken] = useState(0);
  // Tx-Th divider's own vertical sweep — per direct follow-up ("Tx-Thの線も
  // ラインスイープでアニメーションさせたい。Thを押したら上→下へ、Txを押し
  // たら下→上へ"): remounted (via `key`) on every click, same restart trick
  // as mobile-project-list.tsx's own .underline-bar (a fresh DOM mount
  // replays the CSS animation with no JS reflow-timing tricks needed).
  // `generation` starting at 0 keeps the divider un-animated (its plain
  // resting style) until the first click.
  const [dividerSweep, setDividerSweep] = useState<{ direction: "down" | "up"; generation: number }>({
    direction: "down",
    generation: 0,
  });
  // Tx/Th toggle — per direct follow-up ("SPでトップのThをタップしたら添付
  // のようにPC同様一覧の各テキスト背面にサムネを順に表示して"): mirrors
  // app/page.tsx's own `showImages` (PC). Originally drove a thumbnail
  // overlay layered on top of the always-mounted list (MobileProjectThumbnails,
  // now removed); Th mode now renders a genuine independent grid instead
  // (MobileProjectThumbnailGrid, see this component's own render below),
  // matching PC's own Th redesign.
  const [showImages, setShowImages] = useState(false);
  const sectionOriginRef = useRef<HTMLDivElement>(null);
  // Wraps MobileProjectList (below) — railReleased's own last-row check
  // further down queries this container fresh (`querySelectorAll("li")`)
  // every time it measures, rather than reading a row element handed up
  // once via a per-row ref callback (an earlier version's `rowRefs`/
  // `onRowRef`, removed as part of this fix — see that check's own doc
  // comment for why a captured, once-set ref to a specific row DOM node
  // could go stale and was replaced with this always-fresh lookup instead).
  const listContainerRef = useRef<HTMLDivElement>(null);
  // Replays the Tx/Th rail's own slide-up-and-fade entrance whenever
  // site-intro.tsx's splash finishes (its own "33 Cases" SlotDigits counter
  // was removed per direct follow-up, "33は消して" — this generation counter
  // now only replays the rail itself). Same mechanism (and same event) the
  // rail's own `key` below relies on, matching the way PC's own
  // project-list.tsx replays every ProjectCard via `key`
  // (`${project.title}-${replayGeneration}`) rather than resetting an
  // in-place reveal state: on a fresh visit this whole component mounts (and
  // the rail's own mount-time reveal below fires) immediately, well before
  // SiteIntro's opaque full-screen overlay actually fades away, so that
  // first reveal finishes invisibly, hidden behind it. An earlier attempt at
  // fixing this manually reset the *existing* rail's `railRevealed` state
  // back to false in an effect (rather than a real remount) and re-showed it
  // a couple of rAFs later — still reported as showing no animation
  // ("まだイントロ後にアニメーションが見れない" / "まだアニメーション表示
  // されない"), likely because resetting an already-mounted, already-
  // transitioning element mid-flight doesn't give the transition a clean,
  // fully-settled starting point the way a genuine fresh mount does. A real
  // remount via `key` sidesteps that entirely — it's a brand new DOM node
  // starting from `railRevealed`'s true initial (unrevealed) state, so its
  // own mount-time effect below always has a clean run.
  const [introReplayGeneration, setIntroReplayGeneration] = useState(0);
  // 「ページに入った瞬間」を記録（lib/entrance.ts 参照）。PC の home-view.tsx
  // と同じ扱い — Txt/Img の切り替えでは打ち直さないので、切り替え時の一覧は
  // 遅延なしで即出る。
  useState(() => {
    markPageEntered();
    return true;
  });
  useEffect(() => {
    function handleIntroComplete() {
      markPageEntered();
      setIntroReplayGeneration((generation) => generation + 1);
    }
    window.addEventListener("andmade:intro-complete", handleIntroComplete);
    return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
  }, []);
  // Tx/Th+"33 Cases"+Contact rail's own entrance — matches PC's
  // ProjectViewToggle exactly (rAF-deferred so the initial unrevealed state
  // actually paints before flipping), per explicit follow-up ("tx/th
  // 33casesは表示時にPCと同じアニメーションを付けて")。イントロ完了の
  // 再生は `key` の再マウント + 下の世代替わりリセットの2点セット
  // （どちらか片方では動かない — リセットの comment 参照）。
  const [railRevealed, setRailRevealed] = useState(false);
  // 世代が変わったレンダーで railRevealed を未表示に戻す（レンダー中の
  // 前値比較 setState — idle-overlay.tsx などと同じ確立された書き方）。
  // ここが per direct follow-up ("pc, spのtxt-Imgもスライドイン+フェード
  // インで表示 / SPのcasesとcontactも同様に") の本体: `key` の再マウントは
  // DOM を作り直すが、railRevealed はこの親コンポーネントの state なので
  // true のまま残り、作り直された瞬間から表示済み＝アニメーション無しに
  // なっていた（上の doc comment は「再マウントで初期状態から始まる」と
  // 書いていたが、state が子ではなく親にある以上そうならない）。レンダー
  // 時に false へ戻せば、再マウント直後の初回描画が未表示状態になり、
  // 下の effect が世代替わりでもう一度 rAF で true に流す。
  const [prevRailGeneration, setPrevRailGeneration] = useState(introReplayGeneration);
  if (prevRailGeneration !== introReplayGeneration) {
    setPrevRailGeneration(introReplayGeneration);
    setRailRevealed(false);
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRailRevealed(true));
    // Safety net matching mobile-project-list.tsx's own REVEAL_FALLBACK_MS —
    // rAF can be delayed indefinitely if the tab starts backgrounded, which
    // would otherwise leave the rail stuck at opacity-0 forever.
    const fallback = setTimeout(() => setRailRevealed(true), 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
    // introReplayGeneration を deps に — イントロ完了の再マウント後に
    // もう一度 false → true を流すため（従来はマウント時のみで、
    // 再マウント後は誰も true に戻さず…ではなく true のままだった。上記）。
  }, [introReplayGeneration]);
  // Tx/Th+"33 Cases" rail's own release fade-out — per direct follow-up
  // ("SPトップのtx-thと33 casesは固定解除されるタイミングでフェードアウト
  // で消える仕様にして"): this rail is `position: sticky` inside
  // sectionOriginRef (see that div's own doc comment) — it releases (stops
  // sticking, scrolls away with the rest of the page like ordinary in-flow
  // content) the instant sectionOriginRef's own bottom edge scrolls up far
  // enough that there's no more room left to stick within.
  //
  // Two earlier attempts at detecting this both used an IntersectionObserver
  // watching the last row alone (first with just `threshold: 1`, then also a
  // rootMargin buffer) and both still read as firing "a little early" per two
  // separate direct follow-ups. Per the most specific follow-up yet ("最後の
  // ブロックと左要素の下面が揃うタイミングでフェードアウトにして" — fade out
  // exactly when the last block's bottom edge lines up with the left
  // element's, i.e. the rail's, own bottom edge), this now measures both
  // elements' actual on-screen bottom edges directly via
  // getBoundingClientRect() on every scroll/resize (rAF-throttled) rather
  // than approximating via IntersectionObserver: while the rail is still scrolling normally
  // alongside the list (not yet stuck), the last row's own bottom sits far
  // below the rail's — once the rail actually becomes stuck (pinned at
  // top-30) and the list keeps scrolling up past it, the last row's bottom
  // rises to meet, then pass, the rail's own fixed-on-screen bottom edge —
  // the exact instant those two align is both the geometrically precise
  // moment asked for here, and also the real moment position: sticky itself
  // has no more room left to keep sticking in.
  const railRef = useRef<HTMLDivElement>(null);
  const [railReleased, setRailReleased] = useState(false);
  useEffect(() => {
    // showImages guard — per bug report ("SPの左のTx-Thが消える挙動あり"): Th
    // mode unmounts MobileProjectList entirely (see this component's own
    // render further down, `{!showImages && (...<MobileProjectList/>...)}`),
    // leaving no "last row" to release against — Th mode's own grid has no
    // comparable concept here — so this just forces the rail to stay visible
    // (never released) the whole time Th mode is active.
    if (showImages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this is itself the effect's whole job here: reacting to `showImages` (an external toggle, not derivable at render time without this same effect) by forcing `railReleased` back to a known value, matching this effect's own later `setRailReleased(...)` calls, which the lint rule doesn't flag inside a scroll/resize *callback* — this early-return branch is really just that same synchronization, run once immediately instead of waiting for the next scroll event.
      setRailReleased(false);
      return;
    }

    // Queries the container fresh on every single check() call below, rather
    // than measuring a specific row element captured once (an earlier
    // version threaded each row's own <li> up via a per-row ref callback —
    // rowRefs/onRowRef, since removed) — per repeated bug report that the
    // rail still vanished after navigating from a project detail page back
    // to "/" ("下層からトップに戻ってTxのときに消える"), even after two
    // earlier attempts (a `showImages` guard for the Th-unmount case above;
    // then also re-running this effect on `pathname` changes, plus a
    // one-frame-deferred second check for layout-settling races) — neither
    // fixed it, while toggling Th→Tx once back on top reliably self-healed
    // it every time. That self-heal is the real tell: it works specifically
    // *because* switching modes forces MobileProjectList to genuinely
    // remount, handing this effect a brand new, definitely-attached row
    // element. Which means the actual bug was staleness, not timing — a
    // once-captured row reference (from whatever the container looked like
    // whenever this effect last ran) can end up pointing at a detached DOM
    // node after a soft/cached back-navigation restores this page without
    // re-running that capture, and a detached node's getBoundingClientRect()
    // returns an all-zero rect, which reads as "released" (0 <= any real
    // rail bottom) immediately and permanently, with nothing left to ever
    // correct it. Looking the last row up fresh, straight from the live DOM,
    // every time check() runs sidesteps that whole class of staleness
    // entirely — it can never be pointing at the wrong generation of row
    // elements, because it never holds onto one across renders at all.
    function getLastRow(): Element | null {
      const container = listContainerRef.current;
      if (!container) return null;
      const rows = container.querySelectorAll("li");
      return rows.length > 0 ? rows[rows.length - 1] : null;
    }

    let frame: number | null = null;
    function check() {
      frame = null;
      const lastRow = getLastRow();
      const rail = railRef.current;
      if (!lastRow || !rail) return;
      setRailReleased(lastRow.getBoundingClientRect().bottom <= rail.getBoundingClientRect().bottom);
    }
    function onScrollOrResize() {
      if (frame !== null) return;
      frame = requestAnimationFrame(check);
    }
    check();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // showImages — re-runs this guard on every Tx/Th toggle (see comment
    // above).
    // pathname — re-measures on every route change back to this page too,
    // on general principle (cheap, and avoids depending on some other
    // effect's own scroll-reset elsewhere firing a "scroll" event this one
    // happens to be listening for) — no longer load-bearing for the actual
    // bug fix itself now that getLastRow() reads fresh every time regardless
    // of when this effect last ran, but left in since it's still a real
    // signal worth re-checking on.
  }, [showImages, pathname]);
  // Mirrors activeIndex for synchronous reads from inside the Lenis callback
  // below (a plain ref assignment in handleActiveChange, not a setState call
  // — the callback itself is where setPreviewVisible actually runs, since
  // that's genuinely "subscribing to an external system," unlike deriving it
  // from a useEffect keyed on some tracked scroll state, which the lint
  // rules flag as an avoidable cascading-render pattern).
  const activeIndexRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once the page has been scrolled (near) all the way to its own true
  // bottom *and* the last project in the list is the one currently active —
  // both conditions, not just the scroll distance alone — per direct
  // follow-up ("フッターが表示されるタイミングを、トップの場合に限って一覧
  // 最後の要素が選択されてイメージとタイトルが表示される場所まで行ってか
  // ら、フッターが表示されるようにして"): a pure distance-from-bottom check
  // alone could in principle flip this before the last row ever actually got
  // its own turn as the shown image/title (e.g. a very fast scroll/fling),
  // which would hide the footer's grow-in date this exact moment. Requiring
  // `activeIndexRef.current === projects.length - 1` too means this can only
  // ever become true once the last project has genuinely been "shown" first
  // (see previewShown below — its own image/title stays visible the whole
  // time the last project is active, right up until this itself flips true
  // and takes over). Deliberately computed here in MobileHome itself (not
  // baked into MobileMenu, which has no concept of "projects") — per the
  // same follow-up's own explicit scoping ("トップの場合に限って"): this is
  // the top page's own definition of "at the bottom", not a generic one:
  // MobileMenu just receives whatever boolean this component passes it via
  // `footerMode`. distanceFromBottom itself reuses SELECTED_TEXT_BOTTOM_PX,
  // the same lead-in this already used to fade the preview image/text out a
  // little before the very end (see previewShown's own doc comment below for
  // that history: removed once, reinstated, retimed to a flat 30px lead-in,
  // then finally made exact per a still further direct follow-up: "選択中に
  // 表示されるタイトル下のカテゴリが、フッターの上面に触れたらイメージと
  // タイトルとかがフェードアウトする仕様にして"). Also drives MobileMenu's
  // own `footerMode` — per a separate direct follow-up ("画面一番下までいっ
  // たら、MENUが開くときと同じように、MENUが開いてフッター要素が表示され
  // る仕様にして"), this same pill grows into footer content once this flips
  // true, and shrinks back once it flips false, replacing the previous
  // separate footer card + footerRef bounding-rect check entirely
  // (that card is no longer rendered anywhere, and there's no dedicated
  // footer element left in the page's own flow to measure the position of).
  // Kept as local state (drives previewShown below directly) *and* mirrored
  // into lib/footer-mode-store.ts on every change (see handleLenisTick below)
  // — MobileMenu itself now reads that store, not a prop, since it's mounted
  // persistently in app/layout.tsx rather than here (see mobile-menu.tsx's
  // own top-level doc comment on the persistence refactor).
  const [footerReady, setFooterReady] = useState(false);
  /** ページ上端側でプレビューを引っ込めるフラグ（PREVIEW_TOP_HIDE_PX
   *  の doc comment 参照）。初期値 true — マウント直後は必ずページ最上部。 */
  const [nearTop, setNearTop] = useState(true);
  /** Txt/Img を切り替えた直後の抑制（previewShown の doc comment 参照）。
   *  レンダー中の前値比較でフラグを立て、少し経ってから解除する。 */
  const [toggleSuppressed, setToggleSuppressed] = useState(false);
  const [prevShowImagesForPreview, setPrevShowImagesForPreview] = useState(showImages);
  if (prevShowImagesForPreview !== showImages) {
    setPrevShowImagesForPreview(showImages);
    setToggleSuppressed(true);
    // 直前の状態も落としておく（解除後にそのまま復活しないように）。
    setPreviewVisible(false);
    setActiveIndex(null);
  }
  useEffect(() => {
    if (!toggleSuppressed) return;
    // 次の「ユーザー操作」で解除（TOGGLE_PREVIEW_SUPPRESS_FALLBACK_MS の
    // doc comment 参照）。切り替えのタップ自体はこの effect が張られる前に
    // 終わっているので、これに拾われることはない。
    const release = () => setToggleSuppressed(false);
    window.addEventListener("touchstart", release, { passive: true, once: true });
    window.addEventListener("wheel", release, { passive: true, once: true });
    const timer = setTimeout(release, TOGGLE_PREVIEW_SUPPRESS_FALLBACK_MS);
    return () => {
      window.removeEventListener("touchstart", release);
      window.removeEventListener("wheel", release);
      clearTimeout(timer);
    };
  }, [toggleSuppressed]);
  // Resets the shared store back to false on unmount — otherwise navigating
  // away mid-footerMode (scrolled to the bottom of Top, then tapping a nav
  // link) would leave MobileMenu's panel grown into footer content for a
  // moment on whatever page mounts next, until that page's own first real
  // scroll tick reports its own correct value.
  useEffect(() => () => broadcastFooterReady(false), []);
  // Suppresses the preview outright while "Back to top" is smooth-scrolling
  // back up through the list — per explicit follow-up ("back to topで上に
  // 戻ってる間は右下のイメージを出さないようにして"): without this, the
  // Lenis scroll ticks the smooth-scroll itself generates as it passes back
  // up through each row keep re-triggering showPreview() below (same as any
  // ordinary scroll would), briefly flashing whichever project happens to be
  // scrolling past. Mirrors PC's own suppressHoverPreview/
  // handleBackToTopStart/End in app/page.tsx. MobileMenu's own Back to top
  // button now dispatches window events (see that component's own
  // BACK_TO_TOP_START_EVENT) rather than calling these directly as props —
  // same reason as footerReady above — so this component listens for those
  // instead (see the effect right after handleBackToTopEnd below).
  const [returningToTop, setReturningToTop] = useState(false);
  const handleBackToTopStart = useCallback(() => setReturningToTop(true), []);
  // Also force-hides the preview itself (not just clearing returningToTop) —
  // per direct follow-up ("back to topで上に戻ったとき、一覧の一番上選択時
  // のイメージが表示されないようにして"): by the moment the scroll-to-top
  // actually completes, the top project has already become "active" (its own
  // Lenis-tick sweep re-fires handleActiveChange for row 0 as it passes
  // through), which already called showPreview() — that call was invisible
  // while returningToTop suppressed previewShown, but previewVisible itself
  // was left sitting at true underneath. Simply flipping returningToTop back
  // to false the instant scrolling stops would let previewShown recompute to
  // true immediately, flashing the top item's image the moment "Back to top"
  // lands even though the user never actually scrolled/hovered onto it
  // themselves. Explicitly clearing previewVisible (and its pending idle
  // hide-timeout) here means the image stays hidden until a genuine
  // subsequent Lenis tick — i.e. the user actually scrolling again — calls
  // showPreview() on its own.
  const handleBackToTopEnd = useCallback(() => {
    setReturningToTop(false);
    setPreviewVisible(false);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
  }, []);

  // See handleBackToTopStart's own doc comment above — MobileMenu (now a
  // persistent singleton in app/layout.tsx) dispatches these instead of
  // calling props directly.
  useEffect(() => {
    window.addEventListener("andmade:back-to-top-start", handleBackToTopStart);
    window.addEventListener("andmade:back-to-top-end", handleBackToTopEnd);
    return () => {
      window.removeEventListener("andmade:back-to-top-start", handleBackToTopStart);
      window.removeEventListener("andmade:back-to-top-end", handleBackToTopEnd);
    };
  }, [handleBackToTopStart, handleBackToTopEnd]);

  // Shows the active project's preview image and (re)starts a
  // PREVIEW_IDLE_MS hide-timeout — per explicit spec ("スクロールをやめて
  // 2秒経過するとイメージは消す"): the timeout only ever gets to actually
  // fire once it stops being restarted. Called both the instant the active
  // project itself changes (handleActiveChange below — MobileProjectList's
  // own Lenis-tick sweep) and on every one of *this* component's own Lenis
  // ticks while that same project stays active (so continuing to scroll
  // through one long entry keeps resetting the timer too, not just
  // switching entries).
  // 動画プレビューの先読み（ウォームアップ）。ページ表示後のアイドル
  // 時間に preload="metadata" で先頭だけ読んでおき、CDN・ブラウザの
  // キャッシュを選択前に温める（データ量は先頭数百KB程度）。
  // 低速回線・データセーバー時は動画自体を出さないので先読みもしない。
  useEffect(() => {
    if (isSlowConnection()) return;
    const urls = Array.from(
      new Set(
        projects.flatMap((project) => {
          const video = getProjectSpPreviewVideoSrc(project);
          return video ? [video] : [];
        })
      )
    );
    if (urls.length === 0) return;
    const warm = () => {
      for (const url of urls) {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.src = url;
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(warm, { timeout: 5000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timer);
  }, [projects]);

  // 指が画面に触れている間はプレビューを消さない — per direct follow-up
  // ("スクロール時に選択中に背面にイメージが表示されてる状態で、画面に
  // 触れてたらイメージを消さない仕様にできる？")。Lenis の慣性スクロールは
  // 指を離した後も tick が続くので「触れているか」はスクロール状態からは
  // 分からず、touchstart/touchend を直接見る。タイマー満了時に触れていたら
  // 消さずにおき、指が離れた時点で（プレビューが出たままなら）改めて
  // PREVIEW_IDLE_MS を数え直す。
  const touchActiveRef = useRef(false);
  const previewVisibleRef = useRef(false);
  useEffect(() => {
    previewVisibleRef.current = previewVisible;
  }, [previewVisible]);

  const showPreview = useCallback(() => {
    setPreviewVisible(true);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = setTimeout(() => {
      // 触れている間は消さない（touchActiveRef の doc comment 参照）。
      // 指が離れたときに touchend 側が数え直す。
      if (touchActiveRef.current) return;
      setPreviewVisible(false);
    }, PREVIEW_IDLE_MS);
  }, []);

  useEffect(() => {
    const handleTouchStart = () => {
      touchActiveRef.current = true;
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return; // まだ他の指が残っている
      touchActiveRef.current = false;
      // 触れている間にタイマーが満了して「消し損ねた」プレビューがあれば、
      // 離した時点から改めて数え直す。プレビューが出ていないときの単なる
      // タップで showPreview（＝表示）してしまわないよう、表示中のみ。
      if (previewVisibleRef.current && activeIndexRef.current != null) showPreview();
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [showPreview]);

  // Wrapped in useCallback — lenis-react's own useLenis(callback) invokes
  // `callback(lenis)` immediately (not just on real scroll ticks) any time
  // the callback's own *reference* changes, since that's one of its internal
  // effect's own dependencies (see node_modules/lenis/dist/lenis-react.mjs).
  // An inline arrow function here is a brand-new reference on *every*
  // MobileHome render, so this was firing on every render, not just actual
  // scrolling — each phantom firing called showPreview(), which
  // unconditionally re-arms the PREVIEW_IDLE_MS hide-timer. Once that timer
  // genuinely fired (setPreviewVisible(false), a real state change → a real
  // re-render), the *next* render's own phantom firing immediately called
  // showPreview() again (activeIndexRef never actually cleared), flipping
  // it straight back to true — reading as the preview image quietly
  // reloading/re-fading every ~PREVIEW_IDLE_MS regardless of whether the
  // user was even still scrolling (reported as "右下イメージも数秒おきに読
  // み込まれるループ状態になってるっぽい"). A stable callback reference
  // means this effect (and the immediate invocation it does on change) only
  // re-runs when `lenis` itself actually changes, not on every render.
  // lastScrollRef guard — see mobile-project-list.tsx's own identical guard
  // on its own handleLenisTick for the full rationale (a real, Safari Web
  // Inspector Timeline-confirmed forced-synchronous-layout cost from
  // per-tick DOM/layout reads like `scrollHeight`/`scrollY` below, running
  // every single animation frame regardless of whether the user has
  // actually scrolled, real-device-only and worst for the first several
  // seconds after mount while every row's own reveal/ScrambleText is
  // simultaneously mutating the DOM).
  const lastScrollRef = useRef<number | null>(null);
  const handleLenisTick = useCallback(
    (lenisInstance: Lenis) => {
      if (lenisInstance.scroll === lastScrollRef.current) return;
      lastScrollRef.current = lenisInstance.scroll;

      if (activeIndexRef.current != null) showPreview();
      const distanceFromBottom =
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      const nearBottom = distanceFromBottom <= SELECTED_TEXT_BOTTOM_PX;
      // lastProjectActive only ever means anything in Tx mode — it's driven
      // by activeIndexRef.current, which only MobileProjectList's own
      // onActiveChange (handleActiveChange below) ever updates. Th mode
      // renders MobileProjectThumbnailGrid instead (mutually exclusive with
      // MobileProjectList — see the JSX below), which has no equivalent
      // "which project is active" callback at all, so activeIndexRef stays
      // frozen at whatever it last held in Tx mode (often still `null`, e.g.
      // right after mount) the entire time Th is showing. Gating `ready` on
      // it unconditionally left the footer permanently unable to expand in
      // Th mode even once genuinely scrolled to the true bottom — reported
      // as "SPの「Th」ページで、フッターまでスクロールしてもフッターが展開
      // しない". In Th mode, `nearBottom` alone is the whole story: Th has no
      // equivalent of previewShown's own "wait for the last project's own
      // image/title to have its moment" refinement to protect in the first
      // place (previewShown itself already excludes Th mode entirely, see
      // its own `!showImages` condition below).
      const lastProjectActive = activeIndexRef.current === projects.length - 1;
      const ready = nearBottom && (showImages || lastProjectActive);
      setFooterReady(ready);
      broadcastFooterReady(ready);

      // 上端側の引っ込め（PREVIEW_TOP_HIDE_PX の doc comment 参照）。
      setNearTop(window.scrollY < PREVIEW_TOP_HIDE_PX);
    },
    [showPreview, projects.length, showImages],
  );

  useLenis(handleLenisTick);

  useEffect(() => () => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
  }, []);

  // History of the last two preview images, newest first — mirrors PC's own
  // hoverEntries in app/page.tsx (ProjectHoverPreview/HoverPreviewImage),
  // per direct follow-up ("pc同様、次に画像が表示されたら一つ前の画像はその
  // 背面に表示（彩度0、透過もpcに合わせる）フェードイン・アウトも付ける"):
  // each newly-active project's rect is pushed to the front and the array is
  // capped at 2, so the just-superseded image keeps rendering (desaturated,
  // dim) behind the new one instead of instantly disappearing — see
  // ProjectPreviewStack below for the actual rendering.
  const [previewEntries, setPreviewEntries] = useState<PreviewEntry[]>([]);

  // Clears any preview image history accumulated *before* the intro finished
  // — per direct follow-up ("SPで最初のDotsのイメージが表示されるとき、イ
  // メージ背面にDotsの彩度0のイメージが表示されるんだけど、一番上のイメー
  // ジは単体で表示するようにして"): MobileProjectList remounts on this same
  // `introReplayGeneration` change (see its own `key` below), which resets
  // *its* internal `lastActiveRef` to null — so if a row (typically the
  // first one) was already active during the ~1.5s intro overlay, that
  // remount makes it re-fire `onActiveChange` for that same row a second
  // time the instant the list remounts. `previewEntries` itself lives here
  // in the parent, not in the list, so it isn't reset by that child
  // remount — the "first" project's own re-activation then pushed a
  // *second*, separate entry for the exact same project, which
  // ProjectPreviewStack dutifully renders as a desaturated "previous" image
  // behind the real one, even though nothing else was ever actually shown
  // yet. Reset *during render* (comparing against a tracked previous value),
  // not inside a `useEffect` — React's own recommended pattern for "reset
  // this state when some other value changes" (see ScrambleText's own
  // identical `prevKey` comparison for the same reason), avoiding an extra
  // cascading render an effect-based reset would cause.
  const [prevIntroReplayGenerationForPreview, setPrevIntroReplayGenerationForPreview] = useState(introReplayGeneration);
  if (introReplayGeneration !== prevIntroReplayGenerationForPreview) {
    setPrevIntroReplayGenerationForPreview(introReplayGeneration);
    setPreviewEntries([]);
  }

  // De-dupes by *project title*, not just by activation, when pushing a new
  // entry — per direct follow-up reporting the same desaturated "previous"
  // image still showing behind the very first (Dots) project's own image
  // even on a production build ("試したけどまだ背景イメージが2つ表示され
  // るな"), which ruled out the earlier dev-mode-hydration-speed theory (see
  // this file's own history on that). The actual mechanism: MobileProjectList
  // remounts via `key={introReplayGeneration}` once the intro finishes (see
  // that prop's own doc comment), which resets its internal `lastActiveRef`
  // to null — if the same project (typically the first row) was already
  // active before that remount, the fresh instance's own mount-time Lenis
  // tick reports it "active" *again* as if newly activated, and this
  // function has no way to tell that apart from a genuine new activation.
  // The previous fix (resetting `previewEntries` to `[]` the instant
  // `introReplayGeneration` itself changes — see that state's own doc
  // comment) only works if that reset and this function's own next call
  // are guaranteed to land in that exact order with nothing else able to
  // read the array in between — true in the common case, but apparently not
  // reliably enough in practice. Filtering out any existing entry for the
  // *same project* before prepending the new one is a stronger guarantee
  // that doesn't depend on ordering at all: this array can never hold two
  // entries for the same project simultaneously, so a duplicate/redundant
  // activation of "Dots" can never render a second, desaturated "Dots"
  // behind the real one, regardless of what caused the redundant call.
  const handleActiveChange = useCallback(
    (index: number | null) => {
      activeIndexRef.current = index;
      setActiveIndex(index);
      if (index != null) {
        showPreview();
        const project = projects[index];
        setPreviewEntries((prev) =>
          [
            {
              key: `${project.title}-${Date.now()}`,
              title: project.title,
              rect: generateRandomPreviewRect(project),
              imageSrc: getProjectImageSrc(project),
              imageSrcSet: getProjectImageSrcSet(project),
              videoSrc: getProjectSpPreviewVideoSrc(project),
            },
            ...prev.filter((entry) => entry.title !== project.title),
          ].slice(0, 2),
        );
      }
    },
    [showPreview, projects],
  );

  const activeProject = activeIndex != null ? projects[activeIndex] : null;
  // returningToTop and footerReady both override previewVisible outright
  // (not just extra idle-hide triggers). returningToTop mirrors PC's own
  // suppressHoverPreview check in app/page.tsx.
  // footer-proximity-based suppression was removed entirely at one point,
  // then reinstated, then retimed to a flat 30px lead-in, then made exact —
  // an actual geometric collision check against SelectedProjectText's own
  // bottom edge — and finally also gated on the last project actually being
  // active
  // — see footerReady's own doc comment above for the full check (now a
  // plain scroll-position + activeIndex check rather than one measured
  // against a dedicated footer element, since there no longer is one).
  // Computed once here (not just inline where the preview JSX lives) since
  // the list below also needs it, to know which row (if any) is the one
  // "currently shown" for its own dimming (see MobileProjectList's own
  // `activeIndex` prop, passed `previewShown ? activeIndex : null` below).
  //
  // !showImages: this big scroll-triggered bottom-right preview is
  // redundant (and visually competes) with Th mode's own per-row thumbnails
  // now showing behind each row's text as you scroll past it.
  // !nearTop。footerReady（下端側）と対になる上端側の抑制。
  //
  // !toggleSuppressed。Img → Txt に戻すと一覧の高さが変わり、Lenis の resize
  // （home-view.tsx）でスクロール位置が動く → スクロールティックが発火し、
  // 切り替え前に選択されていた行（activeIndexRef）のプレビューが、指を
  // 触れてもいないのに出てしまっていた。切り替え直後だけ止める。
  const previewShown =
    previewVisible && !toggleSuppressed && !footerReady && !nearTop && !returningToTop && !showImages;

  return (
    // bg-(--color-background) を外してある。この div は
    // #top（home-view.tsx）の中で position:relative = 配置済み要素なので、
    // 同じ #top 直下にある背景キャンバス（position:fixed / z-index:auto）
    // より DOM 順であとに来るぶん前面に描かれる。そこに不透明な背景色が
    // 乗っていたため、SP では帯が完全に隠れていた。背景色は #top 自身が
    // 持っているので、ここから外しても見た目は変わらない。
    <div className="relative w-full lg:hidden">
      {/* "Menu" — per Figma node 1052:660/1052:877 ("sp_index_menu"/"menu")
          — no longer rendered here. MobileMenu is now a persistent
          singleton mounted once in app/layout.tsx (see that component's own
          top-level doc comment on the persistence refactor it went through
          and its own reveal-timing doc comment for how it now syncs with
          SiteIntro without needing a key-based remount); footerReady and
          handleBackToTopStart/handleBackToTopEnd above are how this page
          still feeds it footerMode + back-to-top notifications despite no
          longer rendering it directly. */}

      {/* Scroll-triggered project preview — a small stack of up to 2 images
          (per direct follow-up, "pc同様、次に画像が表示されたら一つ前の画像
          はその背面に表示"), fixed at each entry's own random rect. See
          ProjectPreviewStack's own doc comment for why this reads from
          previewEntries (a rolling history) rather than just `activeProject`
          directly, and for why it's rendered *here* (before the list section
          below in DOM order) with no explicit z-index — per a further direct
          follow-up ("画像は一覧テキストよりも背面に表示する"): the list's own
          text renders through mix-blend-exclusion, which needs to see the
          *real* page background to blend against; wrapping the list in its
          own elevated z-index (an earlier attempt at this same "behind the
          text" ask) gave it a new stacking context that cut it off from that
          real backdrop instead, silently breaking the blend entirely
          ("一覧のテキストとtx-thにブレンドモード適用" — reported right after
          that change). Both this and the list's own blend-mode wrapper below
          are left at z-index:auto, so plain DOM order decides paint order
          instead: whichever renders *later* in the tree paints on top, with
          no separate stacking context to interfere with either one's own
          backdrop. */}
      <ProjectPreviewStack entries={previewEntries} released={!previewShown} />
      {activeProject && (
        <SelectedProjectText key={`text-${activeProject.title}`} project={activeProject} shown={previewShown} />
      )}

      <div className="px-[8px]">
        {/* Brand — in normal flow (scrolls away), CONTENT_INDENT on top of
            the page's own 8px margin (was 4px, 14px, then 20px, then back to
            8px — this side margin and CONTENT_INDENT's own
            --sp-grid-column-width both derive from globals.css's
            --sp-grid-margin, so the two stay in sync automatically). pt-[50px] — header top margin, per direct
            follow-up ("SPのヘッダーANDMADE Inc,の上マージンも50pxに", was
            14px). 18px → 16px（"文字サイズ：18pxは16pxに"）→ 14px
            （"ヘッダーのANDMADE Inc.を14pxに"）→ 15px — per direct
            follow-up ("14pxにした箇所を15pxにして")。 */}
        <Link
          href="/"
          // transform-gpu + willChange。背景の色帯
          // キャンバス（position:fixed）が入ると、この要素の
          // mix-blend-exclusion が合成し直しの巻き添えで効かなくなり、素の
          // 白文字のままになる。GPU レイヤーに固定しておくと剥がれない —
          // site-header.tsx（PC の Safari 対策）、一覧のブレンド包み、
          // Tx-Img レール、Made Here と同じ対策。
          className="block pt-[50px] mix-blend-exclusion transform-gpu text-[15px] leading-[1.5] font-medium text-white transition-opacity ease-out [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{
            paddingLeft: CONTENT_INDENT,
            willChange: "transform",
            opacity: headerRevealed ? 1 : 0,
            transitionDuration: `${HEADER_FADE_MS}ms`,
          }}
        >
          ANDMADE Inc.
        </Link>

        {/* FV ステートメント（PC は home-statement.tsx、Figma node 1712:1053）:
            What Matters 13px → 40px下に本文 22px → 20px下に Who we are 15px
            → 30px下に「A sound archive〜」13px → 80px下に Made Here（下の
            レール1行目）。縦の間隔は PC と同じく [text-box-trim:trim-both]
            前提（前の要素のベースライン → 次の要素のキャップ上端）。
            ヘッダーからの余白は 45px（Figma 実測）→ 80px。

            `relative` — スクロールで出る背景プレビュー（ProjectPreviewStack、
            position:fixed / z-index:auto）より前面に出すため。fixed 要素は
            「配置済み要素」の層に描かれるので、DOM 順があとでも通常フローの
            ブロックは必ずその下になる。ここを配置済み要素にすれば、DOM 順が
            あとであるぶん上に来る（PC 側 home-view.tsx が同じ理由で
            `relative` を付けているのと同じ手）。

            「What Matters」はページ左マージン（この px-[8px] の内側 = 8px）、
            本文と Who we are はヘッダーの "ANDMADE Inc." と同じ
            CONTENT_INDENT に揃える。本文は SP 幅がまちまちなので改行位置は
            固定せず自然に流す。 */}
        <div className="relative mt-[80px]">
          <p
            className="text-[13px] leading-[1.5] font-normal text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{
              opacity: headerRevealed ? 1 : 0,
              translate: headerRevealed ? "0 0" : "0 24px",
              transitionProperty: "translate, opacity",
              transitionDuration: `${STATEMENT_SLIDE_MS}ms`,
              transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
              transitionDelay: `${STATEMENT_DELAY_WHAT_MATTERS_MS}ms`,
            }}
          >
            What Matters
          </p>

          <div style={{ paddingLeft: CONTENT_INDENT }}>
            <div className="mt-[40px]">
              <CurtainLines
                text={STATEMENT_COPY}
                active={headerRevealed}
                delayMs={STATEMENT_DELAY_COPY_MS}
                onLastLineStart={handleCopyLastLineStart}
                className="text-[22px] leading-[1.05] font-medium text-black"
              />
            </div>
            <div
              // 遷移指定はクラス（transition-opacity ease-out）ではなく
              // インライン。Made Here / Colors of Sound の
              // 透過と同じで、SP では新規の utility が dev の生成CSSに
              // 追いつかず効かないことがあるため、確実に効く書き方に寄せる。
              className="mt-[20px]"
              style={{
                // 出るきっかけはコピーの最終行（STATEMENT_WHO_FADE_MS の
                // doc comment 参照）。遅延はそちらで持っているのでここは 0。
                opacity: headerRevealed && copyLastLineStarted ? 1 : 0,
                transitionProperty: "opacity",
                transitionDuration: `${STATEMENT_WHO_FADE_MS}ms`,
                transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              <Link
                href="/about"
                // data-ink-group — アイドル中のインク差し替えで文字と矢印を
                // 同色に塗るための目印（lib/album-colors.ts 参照）。
                data-ink-group
                className="inline-flex items-center gap-[8px] text-[15px] leading-[1.5] font-medium text-black"
              >
                <span className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                  Who we are
                </span>
                <ArrowIcon className="block h-[10px] w-[12px] shrink-0" />
              </Link>
            </div>
          </div>

          <div
            className="mt-[30px] text-right text-[13px] leading-[1.2] font-normal text-black"
            style={{
              opacity: headerRevealed ? 1 : 0,
              translate: headerRevealed ? "0 0" : "0 24px",
              transitionProperty: "translate, opacity",
              transitionDuration: `${STATEMENT_SLIDE_MS}ms`,
              transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
              transitionDelay: `${STATEMENT_DELAY_SOUND_MS}ms`,
            }}
          >
            <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              A sound archive that turns
              <br />
              everyday listening into color.
            </p>
            <div className="mt-[10px]">
              <button
                type="button"
                onClick={onColorsToggle}
                aria-pressed={colorsOn}
                data-ink-group
                className="font-medium"
                // 透過はクラス（opacity-50）ではなくインラインで。
                // このコードベースでは新規の arbitrary/utility が
                // dev の生成CSSに追いつかず一時的に効かないことがあるので、
                // 状態表示のように「効かないと意味が変わる」ものはインラインに
                // する慣例（scroll-progress-gauge.tsx などと同じ）。
                style={{
                  touchAction: "manipulation",
                  opacity: colorsOn ? 0.5 : 1,
                  transitionProperty: "opacity",
                  transitionDuration: "300ms",
                }}
              >
                <span
                  className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  // PC は既定から 2px 上げているが、SP はそこからさらに
                  // 2px 下げる＝共有既定値（-0.1em）と同じ位置。
                  style={{ "--underline-offset": "-0.1em" } as CSSProperties}
                >
                  Colors of Sound
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* List section — mt-[170px] directly below the header (was 180px,
            tightened 10px per direct follow-up: "SPのトップヘッダーと一覧の
            マージンを10px詰めて"; see mobile-project-list.tsx's own
            getTriggerLinePx() for the matching -10px adjustment to the
            scroll-active trigger line). Originally 180px per an earlier
            follow-up ("ヘッダーと一覧とのマージンを180pxに変更"). "33 Cases"
            (previously its own in-flow block, mt-[180px] below the header,
            with the list a further mt-[70px] below *that* — a 250px total
            gap) moved into the sticky rail itself below, stacked under Tx/Th
            (see Figma node 1021:215: "33 Cases" is its own absolutely-
            positioned decorative label sitting below the Tx/Th toggle, not a
            block taking up flow space before the list) — freeing the header-
            to-list gap to be this single literal value. This is also
            the sticky containing block for the Tx/Img rail below (see this
            component's own doc comment). */}
        {/* mt-[170px] → 80px（Figma node 1712:1053）。
            この原点がレール（Made Here / 26 Cases / Tx-Img）とお知らせの
            上面そのものなので、「A sound archive〜」ブロックの下 80px に
            Made Here が来る、という指定がそのままこの値になる。 */}
        <div
          ref={sectionOriginRef}
          className="relative pb-[20px]"
          // mt — 「A sound archive〜」の下 80px にセクション原点（= Made Here /
          // お知らせの上面）。
          // pt — その Made Here のベースラインから一覧まで 40px。absolute な
          // レール／お知らせ／Made Here はパディングボックスの上端基準なので、
          // この padding では動かず、フロー内の一覧だけが下がる。
          style={{ marginTop: 80, paddingTop: MADE_HERE_HEIGHT_PX + 40 }}
        >
          {/* 「Made Here」— レール（sticky）の外に出した非固定ラベル。位置は
              セクション原点の左上 = お知らせ（MobileRecentNews、topPx=0）の
              上面と同じ。左は -4px（＝画面左から 4px）でレールに合わせて
              いたが、ページ左マージンと同じ 8px へ。この段落だけの指定で、
              下のレール（Tx-Img / N Cases）は -4px のまま。 */}
          <p
            // ブレンドモード廃止 + #000 + regular。
            //
            // key + インラインの transition。レール本体と
            // 同じく世代キーで作り直し、遷移指定もクラス（transition-[…]）
            // ではなくインラインにしてある。レールは `key` の再マウントと
            // railRevealed のリセットの2点セットで初めてアニメーションする
            // （すぐ上の doc comment 参照）ので、その外に出したこの行だけ
            // 同じ仕掛けが抜けていた。
            key={`made-here-${introReplayGeneration}`}
            className="absolute top-0 left-0 text-[13px] leading-[1.5] font-normal text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{
              opacity: railRevealed ? 1 : 0,
              translate: railRevealed ? "0 0" : "0 24px",
              transitionProperty: "translate, opacity",
              transitionDuration: "500ms",
              transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
              // 一覧・レールと同じく一拍おく（lib/entrance.ts 参照）。
              transitionDelay: `${LIST_ENTRANCE_DELAY_MS}ms`,
            }}
          >
            Made Here
          </p>

          <div className="absolute inset-0 flex items-start justify-between" style={{ top: RAIL_REST_OFFSET_PX }}>
            {/* Rail (Tx/Th + "33 Cases") is `sticky`; MobileRecentNews below
                is deliberately its own separate, *non*-sticky sibling again —
                per direct follow-up re-asserting "お知らせは固定にしない"
                (an intermediate version merged both into one shared sticky
                wrapper so they'd never drift apart during scroll, but that
                necessarily also made news itself pin/stick, contradicting
                this same instruction). MobileRecentNews gets its own
                `topPx` prop (independently tuned now, not the rail's exact
                value — see that call site's own comment) and applies it via
                plain `position: relative`, not `sticky` — a sticky element
                behaves exactly like a relatively-positioned one for as long
                as it hasn't actually reached its own stuck threshold, so the
                two stay roughly aligned near the top of the page and only
                diverge once you scroll far enough for the rail to actually
                freeze in place — which is the intended, accepted trade-off
                of "not fixed" now, not a bug. */}
            <div
              key={`rail-${introReplayGeneration}`}
              ref={railRef}
              // duration-300 on release — faster than the rail's own 500ms
              // entrance fade-in, per direct follow-up asking specifically
              // for a quicker release fade ("フェードアウトの速度をもう少し
              // 速くして"). Matches PC's own case-counter.tsx release-fade
              // duration for consistency.
              className={`pointer-events-none sticky top-[30px] z-40 w-fit transition-all ease-out ${
                railReleased ? "duration-300" : "duration-500"
              } ${railRevealed ? "translate-y-0" : "translate-y-[24px]"}`}
              // opacity driven by both railRevealed (entrance fade-in) and
              // railReleased (own fade-out once unstuck): only a fade was
              // asked for on release, not a slide, so translate-y above stays
              // driven by railRevealed alone while opacity here also drops to
              // 0 the instant railReleased flips true, regardless of
              // railRevealed's own value. Merged into the single style prop
              // below (willChange/marginLeft) — duplicate style props aren't
              // allowed.
              //
              // willChange: "transform" — same mobile-only mix-blend-mode
              // scroll flicker mitigation as the list's own blend wrapper
              // below; this rail is sticky (so it's *also* on screen and
              // compositing throughout every scroll) and shares the same
              // mix-blend-exclusion property, so it's equally exposed to the
              // same class of bug.
              //
              // No `left` offset — verified via live DevTools measurement
              // (real Chrome, genuine 400-500px viewport, fresh post-
              // Dropbox-cache-fix build) that `left` on this element is
              // actually a no-op: `position: sticky`'s inset offsets only
              // ever manifest once scrolling in that offset's own axis would
              // cross the "stuck" threshold — this page never scrolls
              // horizontally, so a `left` value here can never engage, no
              // matter what it's set to. `marginLeft` is used instead below
              // for the same kind of horizontal nudge (a real margin, unlike
              // `left`, does affect a sticky element's own box position both
              // at rest and once stuck).
              //
              // marginLeft: -4 — this
              // rail keeps a 4px left margin specifically even though the
              // page's own general SP_GRID_MARGIN_PX is 8px — pulling it back
              // by the 8-4=4px difference here, rather than changing
              // SP_GRID_MARGIN_PX itself, keeps that 4px an intentional,
              // one-off exception for just this element instead of affecting
              // the whole page's own margin. (Tx/Th/"33 Cases"'s own visible
              // glyph ink measures ~1.5px further right than the box edge,
              // consistent with ordinary font left-side-bearing inside the
              // text span, not a layout offset — left as-is.)
              //
              // top-[30px] (was 27px, then 24px) — nudged down another 3px.
              //
              // marginTop — 「Made Here」がこのレールの外（非固定）へ出た
              // ぶん、レール本体を1行分 + 20px だけ下げて元の並びを保つ。
              // sticky の停止位置は top-[30px] が決めるので、この margin は
              // 静止時の位置にだけ効く。
              style={{
                willChange: "transform",
                marginLeft: -4,
                marginTop: MADE_HERE_HEIGHT_PX + 20,
                opacity: railRevealed && !railReleased ? 1 : 0,
                // 一覧と足並みを揃えて一拍おいて出す。
                // 固定解除で消えるときは待たせない。
                transitionDelay: railReleased ? "0ms" : `${LIST_ENTRANCE_DELAY_MS}ms`,
              }}
            >
              {/* items-start (was items-center) — per direct follow-up
                  ("tx-th、33casesの左マージンは8pxにしてグリッドに沿うよう
                  にして"): the Tx/Th group and the "33 Cases" label are two
                  independently-sized VerticalLabel boxes (their own widths
                  come from each one's own measured, swapped content, which
                  naturally differ between "Tx"/"Th" and "33 Cases"/digits).
                  items-center centered each of them on the *other's* width
                  instead of sharing one common left edge, so their visible
                  left margins drifted apart instead of both sitting flush at
                  this rail's own left-0 (i.e. the page's 8px grid margin).
                  items-start pins every child's own left edge to the same
                  x=0, keeping both flush with the grid regardless of how
                  wide each one's own content happens to measure out to. */}
              <div className="flex flex-col items-start">

                {/* "26 Cases" — Tx/Img の **上** に移動（Figma node
                    1712:1053）。以前は Tx/Th の下に gap-[40px] で置いていた。いまは
                    Made Here の 20px 下、Tx/Img の 40px 上。
                    以下は当時の経緯メモ: 100px → 80px per an earlier follow-up
                    ("33casesとのマージンは80pxに"), then 80px → 60px → 40px
                    per two further direct follow-ups ("SPトップのTxt-Imgと
                    Casesのマージンを20px詰めて" ×2). ウェイトは
                    font-medium → font-normal（"33casesのウェイトをregularに
                    変更"）→ font-medium（"PC,SPのCasesのウェイトをmediumに"、
                    PC の case-counter.tsx も同時に変更）→ 数字だけ medium で
                    "Cases" は regular（下の span 参照）。
                    SlotDigits — same odometer/slot-machine digit roll as
                    PC's counter (slot-digits.tsx), counting up to the real
                    project count. */}
                <VerticalLabel className="mt-[20px] text-[13px] font-normal text-black">
                  <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                    {/* 数字だけ medium、"Cases" は regular。
                        PC (case-counter.tsx) は全体 medium のまま。 */}
                    <span className="font-medium">
                      <SlotDigits value={projects.length} digits={String(projects.length).length} extraSpins={2} durationMs={1200} />
                    </span>{" "}
                    Cases
                  </span>
                </VerticalLabel>

                {/* Tx/Th — each individually rotated (VerticalLabel), per
                    direct follow-up ("tx-thと33casesをそれぞれ180°回転させ
                    て"). Divider 50px long ("Tx-Thの間の線は40pxにして"、その後
                    "txt-imgの間の線を10px伸ばして" で 40 → 50) —
                    drawn directly as a vertical bar (not itself rotated — a
                    1px-thick bar looks identical either way, and this
                    sidesteps rotating a zero-content element at all).
                    text-box-trim on Tx/Th (cap-height/baseline-tight) so each
                    VerticalLabel measures and swaps a snug box with no extra
                    line-height padding, and the divider sits flush against
                    each one's own trimmed edge — per direct follow-up
                    ("Tx-Thの線はTxとThのテキストの下面にそろえて配置して").
                    gap-[10px] (was 4px) — the margin between Tx, the line,
                    and Th, per direct follow-up ("Txと線とThのマージンは
                    10pxに"). The divider's own -5px translateX (was -4px,
                    nudged 1px back right per follow-up "tx-thの線を右に1px
                    移動", then nudged back left 1px per a further follow-up
                    "Tx-Thの線を1px左に移動") is a direct manual correction —
                    items-center here (this inner Tx/divider/Th column only,
                    distinct from the outer group's own items-start above)
                    centers the divider on each VerticalLabel's own *box*
                    width, but that box's measured width doesn't perfectly
                    coincide with where the rotated glyph itself visually
                    sits inside it, leaving the divider a few px off the
                    glyphs' own true center; nudging it corrects for that
                    residual gap directly rather than chasing the underlying
                    measurement further. */}
                {/* text-[14px] → 12px（"txt-img、26 cases、Contactを12pxに"）
                    → 13px — per direct follow-up ("12pxにした箇所を13pxに")。
                    下の "Cases" と Contact の VerticalLabel も同時に 13px。 */}
                <div className="mt-[40px] flex flex-col items-center gap-[10px] text-[13px] font-medium text-black">
                  {/* Tx/Th — now real toggle buttons (see showImages above),
                      previously plain static labels. Dim/bright convention
                      matches PC's own ProjectViewToggle exactly: the
                      *currently active* view's own label is the dimmed one
                      (text-white/50), the inactive one stays full white —
                      same, slightly counterintuitive pairing this file's own
                      markup already had baked in before any state existed
                      (Tx hardcoded white/50, Th hardcoded full white, i.e.
                      already matching showImages' own default `false`).

                      pointer-events-auto — this whole rail is
                      `pointer-events-none` (see its own sticky wrapper's doc
                      comment further up), which made these two buttons
                      untappable the instant real onClick handlers were added
                      here (reported as "thがタップできない") — the rail was
                      always non-interactive by design back when Tx/Th were
                      still plain decorative labels with nothing to click, so
                      nobody had reason to notice. Re-enabling pointer events
                      on just these two buttons (not the rest of the rail —
                      the divider/"33 Cases" stay non-interactive) is the
                      standard way to carve out a real tap target from inside
                      an otherwise click-through ancestor. */}
                  <VerticalLabel>
                    {/* `disabled` while already active — per direct follow-up
                       ("SPのトップtx-thは、それぞれ選択時は押せないように
                       して"): re-tapping the already-selected one used to
                       still fire onClick, redundantly replaying the
                       underline/divider sweep with no actual state change. */}
                    <button
                      type="button"
                      disabled={!showImages}
                      onClick={() => {
                        setShowImages(false);
                        setUnderlineReplayToken((token) => token + 1);
                        setDividerSweep((prev) => ({ direction: "up", generation: prev.generation + 1 }));
                      }}
                      aria-pressed={!showImages}
                      className={`transition-colors [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                        !showImages ? "pointer-events-none cursor-default text-black/50" : "pointer-events-auto cursor-pointer text-black"
                      }`}
                      style={{ touchAction: "manipulation" }}
                    >
                      Txt
                    </button>
                  </VerticalLabel>
                  <span
                    aria-hidden
                    key={dividerSweep.generation}
                    className={`w-px ${
                      dividerSweep.generation > 0
                        ? dividerSweep.direction === "down"
                          ? "underline-sweep-vertical-down-play"
                          : "underline-sweep-vertical-up-play"
                        : ""
                    }`}
                    // 高さはインラインで持たせている。h-[50px] のような
                    // 新しい arbitrary クラスは生成CSSが追いつくまで存在せず、
                    // 高さ0＝線が消えて見える。
                    // このコードベースでは同じ理由で
                    // scroll-progress-gauge.tsx も z-index をインラインに
                    // している。インラインスタイルはCSSの生成を待たない。
                    // backgroundColor もインライン。ブレンド廃止で
                    // bg-white/50 → bg-black/50 に変えた際、このコードベース
                    // で唯一の bg-black/50 になり、dev の生成CSSに現れず
                    // 背景色が付かない＝線が消えていた。高さを同じ理由で
                    // インラインにしてある（すぐ上のコメント参照）ので、
                    // 色も同じ扱いに寄せる。
                    style={{
                      height: DIVIDER_HEIGHT_PX,
                      backgroundColor: "rgba(0, 0, 0, 0.5)",
                      transform: "translateX(-5px)",
                    }}
                  />
                  <VerticalLabel>
                    {/* `disabled` while already active — see the Tx button's
                       own comment above. */}
                    <button
                      type="button"
                      disabled={showImages}
                      onClick={() => {
                        setShowImages(true);
                        setUnderlineReplayToken((token) => token + 1);
                        setDividerSweep((prev) => ({ direction: "down", generation: prev.generation + 1 }));
                      }}
                      aria-pressed={showImages}
                      className={`transition-colors [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                        showImages ? "pointer-events-none cursor-default text-black/50" : "pointer-events-auto cursor-pointer text-black"
                      }`}
                      style={{ touchAction: "manipulation" }}
                    >
                      Img
                    </button>
                  </VerticalLabel>
                </div>

                {/* かつてここに縦書きの "Contact"（/contact への Link）が
                    あったが、per direct follow-up ("SPトップの左にある
                    Contactはトリ") で削除。復活させる場合は git 履歴参照。 */}
              </div>
            </div>

            {/* SP "recent news" — Figma node 1021:215's own "news" node, a
                sibling of the sticky rail above (not nested inside it — see
                that rail's own doc comment for why this needs to be
                *outside* the sticky wrapper now), flush against the page's
                own right margin (ml-auto — see MobileRecentNews's own doc
                comment for why that's used instead of PC's `absolute` +
                `--edge-right-inset` technique). Renders nothing at all
                whenever there's no news to show (see lib/news.ts).
                key="news-${introReplayGeneration}" — kept distinct from the
                Tx/Th group's own key (both are siblings under this same flex
                wrapper — React warns/misbehaves if siblings share a literal
                key, which is exactly what an earlier version of this did,
                and is what actually caused a previously-reported "Tx/Th
                renders twice" bug). topPx=3 (was 30, matching the rail's own
                top-[30px]) — moved up 27px per direct follow-up ("お知らせ
                を上に27px上げて"), no longer sharing the rail's exact value —
                intentionally a separate, independently-tuned number now. */}
            {/* topPx=0 (was 3) — moved up a further 3px per direct follow-up
                ("一覧とお知らせを3px上に移動").

                hidden={showImages} — restored per direct follow-up ("SPのImg
                時、右端のお知らせをフェードアウトで消して、その分、一覧の幅
                を11マス分に広げて"), having been dropped for a while in the
                middle ("お知らせのフェードアウト非表示も無しにして"). This
                time it's paired with the thumbnail grid claiming the freed
                right-hand columns (see mobile-project-thumbnail-grid.tsx's
                own `width`), so the two changes belong together. PC still
                keeps its own news visible in Img mode — that was a
                separate, PC-scoped instruction ("PCのお知らせはTh時も消さな
                い") and is deliberately not mirrored here. */}
            <MobileRecentNews
              key={`news-${introReplayGeneration}`}
              items={news}
              revealed={railRevealed}
              topPx={0}
              hidden={showImages}
            />
          </div>

          {/* Th mode — a genuine independent grid (MobileProjectThumbnailGrid,
              matching Figma node 1400:1835) rendered *instead of* the list
              below, not layered on top of it — per direct follow-up
              ("SPのTh選択時も下記に変更" [Figma link]), replacing the old
              MobileProjectThumbnails approach entirely (a thumbnail layer
              positioned on top of the always-mounted Tx text list, kept
              pixel-synced via a live-measured rowPositions/rowSettled/
              screenStaggerHidden system — see this file's own git history).
              Matches PC's own identical Th redesign (app/page.tsx swapping
              ProjectGridSection for ProjectThumbnailGrid). */}
          {showImages && <MobileProjectThumbnailGrid projects={projects} />}

          {/* willChange: "transform" — per direct follow-up ("スマホでスク
              ロールしてる最中、たまにブレンドモードが切れるときがある。pc
              の検証ツールだと問題なし"): a real-device-only, scroll-only
              mix-blend-mode glitch is a known mobile Safari/Chrome
              compositing bug — the browser can demote a blend-mode element
              off its own GPU layer and back during scroll (e.g. when
              momentum scrolling starts/stops), and the blend briefly drops
              out while that layer is being torn down/rebuilt. Forcing this
              onto a permanent, dedicated compositor layer up front (the
              standard fix for this class of bug) keeps it stable through the
              whole scroll instead of being promoted/demoted on the fly.
              Desktop devtools never repros this because desktop Chrome/
              Safari's own compositor doesn't demote layers under scroll the
              same way mobile engines do — matching the user's own report
              ("pcの検証ツールだと問題ない"). */}
          {/* width: 8 grid columns — per direct follow-up ("一覧の表示エリ
              アをグリッド8マス分に変更。エリア内に収まらないテキストは改行
              するようにして"): previously unconstrained (this div just spans
              whatever width remains within its own full-width parent), so
              long titles/category strings never wrapped, they just kept
              extending rightward past the grid. This project's global
              box-sizing is border-box (Tailwind's preflight), so this width
              includes CONTENT_INDENT's own left padding — the box itself
              spans grid columns 0–8 from the page margin, with the actual
              text starting at column 2 (past CONTENT_INDENT) and wrapping if
              it would run past column 8. MobileProjectList's own title/
              category/date elements already have no `whitespace-nowrap` of
              their own, so plain CSS text wrapping just works once an
              explicit width constrains them — no changes needed there. */}
          {!showImages && (
            <div
              ref={listContainerRef}
              // No mix-blend-exclusion anymore — matching PC (see
              // home-view.tsx): the list is plain black text on a plate in
              // the page's own background color that wipes in behind the
              // selected row (mobile-project-list.tsx's own SelectedPlate),
              // rather than white text blended against the preview image.
              className=""
              style={{
                paddingLeft: CONTENT_INDENT,
                width: `calc(var(--sp-grid-column-width) * 8)`,
                willChange: "transform",
                // translateY(-3px) — per direct follow-up ("一覧とお知らせを
                // 3px上に移動"). A transform (not a smaller mt-[180px] on the
                // shared parent) so it only shifts the list itself, not the
                // sticky rail's own resting position or the footer/gap
                // spacing below, which are computed from this section's own
                // untouched layout box.
                transform: "translateY(-3px)",
              }}
            >
              <MobileProjectList
                key={introReplayGeneration}
                projects={projects}
                onActiveChange={handleActiveChange}
                highlightedIndex={previewShown ? activeIndex : null}
                replayUnderlineToken={underlineReplayToken}
              />
            </div>
          )}
        </div>

        {/* Rendered *outside* the sticky containing block above (rather than
            as its last child) — otherwise the rail would keep sticking
            across this whole gap and the footer below it too, since a
            sticky element only releases once its own containing block's
            bottom edge scrolls past it. Releasing right at the end of the
            actual list (matching PC's own ProjectViewToggle, which uses a
            similar release trick via project-grid-section.tsx's negative
            margin) reads better than the rail floating over the footer. */}
        {/* Trailing spacer — the old SP footer card used to render
            here (this was that card's marginTop gap). It's no longer
            rendered anywhere: MobileMenu itself now grows into
            footer-equivalent content once scrolled this close to the bottom
            (see that component's own `footerMode` prop and its doc comment,
            and this component's own `footerReady` above), rather than
            handing off to a separate in-flow card. This plain spacer keeps the
            page's own overall scrollable height/feel roughly the same as
            before that merge, giving a natural pause before hitting the
            true bottom instead of the list's last row butting flush against
            it. */}
        <div style={{ height: LIST_FOOTER_GAP_PX }} />
      </div>

      {/* Scroll-triggered project preview — fixed bottom-right (per spec:
          "スクロールで一覧の上から順にイメージを画面右下固定で表示"). See
          PreviewOverlay's own doc comment for why this is a dedicated child
          component rather than inline JSX here. */}
    </div>
  );
}

type ProjectPreviewStackProps = {
  /** Newest first, capped at 2 — see MobileHome's own previewEntries. */
  entries: PreviewEntry[];
  /** True while idle-timed-out or "Back to top" is scrolling — the inverse
   *  of MobileHome's own `previewShown`, matching PC's own `released` prop
   *  on ProjectHoverPreview (project-hover-preview.tsx) exactly. Fades every
   *  entry (not just the current one) out to opacity 0. */
  released: boolean;
};

/** Non-current entries sit at this opacity (desaturated) rather than
 *  disappearing outright — matches PC's own project-hover-preview.tsx
 *  (HoverPreviewImage's own `targetOpacity`) exactly. */
const PREVIEW_BACKDROP_OPACITY = 0.1;

/**
 * The scroll-triggered preview images — up to 2 stacked, the just-superseded
 * one rendered behind the current one (desaturated, dimmed), per direct
 * follow-up ("pc同様、次に画像が表示されたら一つ前の画像はその背面に表示
 * （彩度0、透過もpcに合わせる）フェードイン・アウトも付ける"), porting PC's
 * own ProjectHoverPreview/HoverPreviewImage (project-hover-preview.tsx)
 * mechanism to SP's scroll-driven trigger instead of PC's hover-driven one.
 * `entries` is a rolling history owned by MobileHome (previewEntries) rather
 * than derived from `activeProject` here — a single "current project" value
 * has no way to also remember what was showing a moment ago once it changes,
 * which is exactly what the previous entry needs to still render.
 *
 * Rendered unconditionally (not gated on `activeProject` being non-null) —
 * `entries` naturally starts empty (nothing to map over) and keeps whatever
 * it last held even after the active project goes back to `null` (e.g.
 * scrolled above the first row), so the last images still get a proper
 * `released` fade-out via previewShown's own idle timeout, rather than
 * vanishing the instant `activeProject` itself flips to null.
 *
 * `ordered` puts the current entry *last* (oldest-of-the-two first) so plain
 * DOM order — not z-index — decides which one paints on top, exactly
 * matching ProjectHoverPreview's own comment on why it avoids z-index there.
 */
function ProjectPreviewStack({ entries, released }: ProjectPreviewStackProps) {
  const current = entries[0];
  const ordered = entries.slice(0, 2).reverse();

  return (
    <>
      {ordered.map((entry) => (
        <PreviewImage key={entry.key} entry={entry} isCurrent={entry.key === current?.key} released={released} />
      ))}
    </>
  );
}

type PreviewImageProps = {
  entry: PreviewEntry;
  isCurrent: boolean;
  released: boolean;
};

/**
 * One preview image. `entered` flips true once the actual `<img>` has
 * finished loading (or was already cached/`complete` the instant this
 * mounts), not on a fixed rAF timer — per direct follow-up reporting the
 * fade-in wasn't visible ("選択中のイメージが表示されるときとそのタイトル
 * にフェードイン付いてる？付いてるように見えない"). A plain `<img>` (not
 * next/image) has no built-in fade-of-its-own-content-on-load, so the
 * *container's* opacity transition was running against whatever pixels
 * happened to be there yet: on a not-yet-decoded/loaded image, the
 * container reaches full opacity while still showing nothing, and the photo
 * itself then just pops in whenever it finishes loading sometime after —
 * reading as no fade at all rather than a genuine one. Tying `entered` to
 * the image's own load state guarantees the opacity transition always
 * starts once real pixels are already there to fade in.
 */
/** 回線が遅い（またはデータセーバー有効）かどうか — Network Information
 *  API（navigator.connection）で判定。per direct follow-up ("spで回線が
 *  遅いときはトップの動画は表示せずに静止画を表示して")。effectiveType は
 *  Chrome 系のみ対応（iOS Safari は connection 自体が undefined）なので、
 *  取れない環境では「遅くない」扱い＝従来どおり動画。saveData はユーザーの
 *  明示的な節約意思なので回線速度に関係なく静止画に落とす。 */
function isSlowConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  const type = connection.effectiveType ?? "";
  return type === "slow-2g" || type === "2g" || type === "3g";
}

function PreviewImage({ entry, isCurrent, released }: PreviewImageProps) {
  const [entered, setEntered] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // Covers the cached case — a cached image can already be `complete` the
    // instant this ref attaches, before an `onLoad` listener would ever
    // fire for it. 動画も同様に、マウント時点で最初のフレームが既に
    // デコード済み（readyState >= HAVE_CURRENT_DATA = 2）なら即 entered。
    if (imgRef.current?.complete) setEntered(true);
    if (videoRef.current && videoRef.current.readyState >= 2) setEntered(true);
  }, []);

  // 背面（残像）に回った動画は停止 — per direct follow-up ("次を選択して
  // 動画が背面にいったら停止して")。PC（project-hover-preview.tsx）と同じ。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isCurrent && !released) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isCurrent, released]);

  const targetOpacity = released ? 0 : isCurrent ? 1 : PREVIEW_BACKDROP_OPACITY;
  const opacity = entered ? targetOpacity : 0;
  // Read from the *target* state (`released`), not a single shared constant —
  // a CSS transition's own duration is resolved from whichever style is
  // current at the instant the transition starts, i.e. the *new* value being
  // transitioned to, so this reliably picks the fast duration on the way in
  // and the slow one on the way out. See PREVIEW_FADE_OUT_MS's own doc
  // comment above for why these need to differ at all.
  const fadeDurationMs = released ? PREVIEW_FADE_OUT_MS : PREVIEW_FADE_IN_MS;

  return (
    <>
    <div
      // No z-index (was z-10, paired with a z-20 on the list section) — per a
      // direct follow-up reporting that pairing had silently broken the
      // list's own mix-blend-exclusion text ("一覧のテキストとtx-thにブレン
      // ドモード適用" — see ProjectPreviewStack's own call site for the full
      // explanation): giving the list section a new elevated stacking
      // context cut its blend-mode content off from the real page backdrop
      // it needs to blend against. Both this and the list are left at
      // z-index:auto now, so plain DOM order decides paint order instead,
      // with no extra stacking context for either side.
      // No background fill. This box used to carry `bg-[#d9d9d9]` as a
      // while-loading placeholder, but it never actually served that purpose
      // here: `entered` (and so this box's own opacity) only flips true once
      // the image has genuinely loaded — see this component's own doc comment
      // above — so the box is fully transparent for the entire loading
      // window and the fill only ever became visible *after* load, showing
      // through the transparent areas of any PNG with real alpha. PC's own
      // equivalent (project-hover-preview.tsx) hit the same problem and
      // dropped its fill for a border-only outline; SP doesn't even need
      // that, since nothing here is visible pre-load to need a placeholder.
      className="pointer-events-none fixed overflow-hidden transition-[opacity,filter] ease-out"
      style={{
        top: entry.rect.top,
        left: entry.rect.left,
        width: entry.rect.width,
        height: entry.rect.height,
        opacity,
        filter: isCurrent ? "none" : "grayscale(1)",
        transitionDuration: `${fadeDurationMs}ms`,
      }}
    >
      {/* 動画プレビュー — PC（project-hover-preview.tsx）と同じ分岐・同じ
          理由の属性（poster / autoPlay / muted / loop / playsInline）。
          per direct follow-up ("トップのtxt時のサムネ画像に、動画も登録
          できるようにしたい Img時は静止画を表示する")。 */}
      {entry.videoSrc && !isSlowConnection() ? (
        <video
          ref={videoRef}
          src={entry.videoSrc}
          poster={entry.imageSrc}
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={() => setEntered(true)}
          className="h-full w-full object-cover"
        />
      ) : (
      /* eslint-disable-next-line @next/next/no-img-element -- dynamically sized/swapped, same convention as project-hover-preview.tsx */
      <img
        ref={imgRef}
        src={entry.imageSrc}
        srcSet={previewSrcSet(entry.imageSrcSet)}
        // Was sizes="100vw" ("never wider than the screen") — see
        // project-hover-preview.tsx's own note on why a loose upper bound
        // costs real bytes. The widest this can be is 11 of 12 columns plus a
        // margin, i.e. SP_PREVIEW_SIZES.
        sizes={SP_PREVIEW_SIZES}
        alt=""
        aria-hidden
        className="h-full w-full object-cover"
        onLoad={() => setEntered(true)}
      />
      )}
    </div>
      {/* 画像タップで詳細へ — per direct follow-up ("SPでTx時に選択中に
          背面に表示されるイメージもタップして詳細ページに飛べるようにして"
          → "まだなってない")。画像の箱自体は一覧より DOM 順で前（＝背面）
          にあり、一覧の各行が全幅のブロックなので、画像上のタップは行側に
          吸われて背面のリンクには届かない。そこで**透明のタップ用リンク**を
          同じ矩形で z-20 に重ねる。何も描画しないので、一覧テキストの
          mix-blend-exclusion には影響しない（ブレンドが壊れるのは list 側を
          stacking context で包んだ場合 — 上の div の doc comment 参照）。
          現行の1枚が表示中のときだけ出す。href は選択中タイトル
          （SelectedProjectText）と同じ slugify(entry.title)。 */}
      {isCurrent && !released && entered && (
        <Link
          href={`/projects/${slugify(entry.title)}`}
          aria-label={entry.title}
          className="fixed z-20 block"
          style={{
            top: entry.rect.top,
            left: entry.rect.left,
            width: entry.rect.width,
            height: entry.rect.height,
            touchAction: "manipulation",
          }}
        />
      )}
    </>
  );
}

/** 選択中タイトルの基準文字サイズ。これより大きくはならず、画面幅に
 *  収まらないときだけ縮む（SelectedProjectText 内の計測 effect 参照）。 */
const SELECTED_TITLE_FONT_PX = 30;
/** 縮小判定で確保する左右の余白（片側）。画面ぴったりだと窮屈なので、
 *  グリッドの左右マージン（--sp-grid-margin, 20px）と同値を空ける。 */
const SELECTED_TITLE_SIDE_INSET_PX = 20;

type SelectedProjectTextProps = {
  project: Project;
  /** Same meaning as ProjectPreviewStack's own `!released` — see MobileHome's
   *  own `previewShown` for the full mix. */
  shown: boolean;
};

/**
 * Selected project's title (+ category underneath), bottom-center — per
 * direct follow-up ("選択中のタイトルとカテゴリーを画面下100px、横は中央の
 * 位置にスクランブルテキストで表示（PCと同じ）"), originally mirroring PC's
 * own hovered-project-title.tsx with both a scramble-revealed title and a
 * category line underneath. Per a further direct follow-up ("カテゴリは無し
 * でタイトルだけ表示にして。表示アニメーションもシンプルにフェードインで"),
 * simplified to plain (non-scrambled) text — the wrapper div's own opacity
 * transition below already provides the fade-in, so no per-character reveal
 * is needed. The category line was then reinstated per a still further
 * direct follow-up ("選択中に表示する30pxのタイトル下にカテゴリを12pxで表
 * 示"), also as plain text, at 12px. Plain black, no mix-blend-mode — reads
 * directly against the page/image behind it rather than inverting.
 *
 * A dedicated sibling component (not nested inside PreviewOverlay) — same
 * `key={activeProject.title}`-per-project remount pattern at the call site
 * below, but its own `entered`/fade timing is independent of the image's,
 * matching PC's own two separate components (ProjectHoverPreview vs.
 * HoveredProjectTitle) for the same reason.
 */
function SelectedProjectText({ project, shown }: SelectedProjectTextProps) {
  const router = useRouter();
  const href = `/projects/${slugify(project.title)}`;
  const [entered, setEntered] = useState(false);
  // タイトルが画面幅に収まらないときだけ自動で縮小する — per direct
  // follow-up（"画面幅に収まらない場合は、幅に収まるようにその文字サイズを
  // 自動で縮小して表示する仕様にして"）。折り返しは不可（whitespace-nowrap
  // のまま＝デザイン上1行）なので、実測した文字幅と使える幅の比を font-size
  // に掛ける。縮小のみで、短いタイトルが 30px より大きくなることはない。
  const titleRef = useRef<HTMLParagraphElement>(null);
  const [titleFontPx, setTitleFontPx] = useState(SELECTED_TITLE_FONT_PX);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // 実測 → 収まらなければ縮小（SELECTED_TITLE_FONT_PX の doc comment 参照）。
  // 常に基準サイズで一度描いてから測るのではなく、scrollWidth（＝折り返し
  // なしの本来の文字幅）と clientWidth の比で一発で求める。回転や
  // タイトル切替でも測り直す。
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const measure = () => {
      // いま適用中のサイズを基準に「本来の幅」を戻し、使える幅に対する比で
      // 決め直す（縮小後の実測から再計算しても同じ答えに収束する）。
      const available = Math.min(
        window.innerWidth - SELECTED_TITLE_SIDE_INSET_PX * 2,
        el.parentElement?.parentElement?.clientWidth ?? Infinity
      );
      const current = parseFloat(window.getComputedStyle(el).fontSize) || SELECTED_TITLE_FONT_PX;
      const naturalAtBase = (el.scrollWidth / current) * SELECTED_TITLE_FONT_PX;
      if (naturalAtBase <= 0 || available <= 0) return;
      const next = Math.min(SELECTED_TITLE_FONT_PX, (available / naturalAtBase) * SELECTED_TITLE_FONT_PX);
      setTitleFontPx((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [project.title]);

  const opacity = entered && shown ? 1 : 0;
  const fadeDurationMs = shown ? PREVIEW_FADE_IN_MS : PREVIEW_FADE_OUT_MS;

  // Whether the tap target below is live. Deliberately NOT just `opacity === 1`:
  // this block auto-hides PREVIEW_IDLE_MS (2s) after scrolling stops, and
  // `shown` flips false at the *start* of that hide, while the element stays
  // visibly on screen for a further PREVIEW_FADE_OUT_MS as it fades. Gating
  // on the fully-opaque state meant the title stopped responding to taps
  // while it was still plainly visible — reported as the tap simply not
  // working. Stays live for the whole fade-out instead, and only goes dead
  // once the block is genuinely invisible (at which point it must go dead,
  // since it's `fixed` and stays mounted over the list underneath).
  //
  // Turning *on* is handled by comparing `shown` against its previous value
  // during render (the same pattern studies-center-image.tsx uses for its
  // own activeIndex), not in an effect — it has to be synchronous with the
  // prop change, and a plain setState in an effect body is both an extra
  // render and something this codebase's lint config rejects outright.
  // Turning *off* is the only genuinely time-delayed half, so that's the
  // only part an effect handles.
  const [interactive, setInteractive] = useState(shown);
  const [prevShown, setPrevShown] = useState(shown);
  if (prevShown !== shown) {
    setPrevShown(shown);
    if (shown) setInteractive(true);
  }
  useEffect(() => {
    if (shown) return;
    const timeout = setTimeout(() => setInteractive(false), PREVIEW_FADE_OUT_MS);
    return () => clearTimeout(timeout);
  }, [shown]);

  return (
    // bottom: SELECTED_TEXT_BOTTOM_PX (a shared JS constant, not a plain
    // Tailwind class) — MobileHome's own footerReady check reads that exact
    // same value to detect when the page's own true bottom would actually
    // touch this block's own bottom edge (the category line below, its
    // lowest content) so that the image/title fade out right as they'd
    // otherwise collide with the footer — keeping both reads of "100px" as
    // one single constant is what guarantees they can never drift out of
    // sync.
    //
    // This outer wrapper stays `pointer-events-none` so the *whole* fixed,
    // full-width band never swallows taps meant for the list underneath —
    // only the inner `role="link"` box below opts back in, and only while
    // actually visible (see its own comment).
    //
    // z-30 — required for that inner link to be tappable at all. This block
    // renders *before* the list section in DOM order (see the call site's own
    // comment on why the preview images deliberately sit behind the list's
    // mix-blend-exclusion text), and among positioned elements that all share
    // `z-index: auto` the later one in tree order paints on top — so the
    // list section (`relative`, further down the tree) was painting over this
    // fixed block and, since hit-testing follows paint order in reverse,
    // swallowing every tap aimed at this title. An explicit z-index lifts
    // only *this* block above the list; it's safe to give this one its own
    // stacking context (unlike the list, where an earlier attempt at exactly
    // that cut its text off from the real page backdrop and silently broke
    // its blend) because nothing here uses mix-blend-mode at all. Stays
    // below the sticky Tx/Th rail (z-40) and the Menu pill (z-50) so neither
    // of those is covered.
    <div
      className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 text-center transition-opacity ease-out"
      style={{ bottom: SELECTED_TEXT_BOTTOM_PX, opacity, transitionDuration: `${fadeDurationMs}ms` }}
    >
      {/* Tappable — navigates to the same detail page the matching list row
          does (mobile-project-list.tsx's own MobileProjectItem, identical
          `router.push(slugify(title))` handling including the Enter/Space
          keyboard equivalent).
          `pointer-events` is tied to `opacity` rather than left permanently
          `auto`: this block is `fixed` and stays mounted (only faded) while
          nothing is selected, or once scrolled into the footer zone, so an
          always-tappable box would keep intercepting taps over whatever is
          really underneath it even when it's completely invisible. */}
      <div
        role="link"
        tabIndex={interactive ? 0 : -1}
        aria-label={`${project.title} — ${project.category}`}
        onClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(href);
          }
        }}
        className="inline-block cursor-pointer"
        style={{ pointerEvents: interactive && entered ? "auto" : "none" }}
      >
        <p
          ref={titleRef}
          className="whitespace-nowrap leading-[1.2] font-medium text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ fontSize: `${titleFontPx}px` }}
        >
          {project.title}
        </p>
        <p className="mt-[8px] whitespace-nowrap text-[12px] leading-[1.25] font-medium text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          {project.category}
        </p>
      </div>
    </div>
  );
}
