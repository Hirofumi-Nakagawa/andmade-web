"use client";

import { Fragment, useEffect, useState } from "react";

/** How often the live year/date/weekday/time line re-reads the clock while
 *  the overlay is showing — cheap (just Intl formatting, no layout work), so
 *  every second keeps the minute display essentially live rather than
 *  lagging behind by up to a whole polling interval. */
const TICK_MS = 1_000;

/** ANDMADE is Tokyo-based (see the tagline right above this line) — always
 *  reads Tokyo's own clock, not the visitor's local one, wherever the
 *  overlay is actually being viewed from. */
const TIME_ZONE = "Asia/Tokyo";

function readTokyoParts(date: Date) {
  // hourCycle: "h23" (rather than just hour12: false) avoids en-US's default
  // h24 cycle, which would otherwise print midnight as "24:00" instead of
  // "00:00".
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

const ITEM_CLASS = "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] whitespace-nowrap";

type IdleDateTimeProps = {
  /** "pc" (default, unchanged) uses the original 30px styling. "sp" uses
   *  idle-overlay.tsx's own SP variant sizing per Figma node 1100:384 (24px
   *  — originally "," separated per that SP frame, reverted to match PC's
   *  "." per direct follow-up, see the `separator` const below) — see that
   *  file's own doc comment on why the SP variant exists as a parallel
   *  design rather than replacing the PC one. */
  variant?: "pc" | "sp";
  /** Overrides variant="sp"'s own default fixed 24px font-size / -0.48px
   *  letter-spacing / 6px gap — used by idle-overlay.tsx to make this line
   *  scale together with the rest of its SP panel via that file's own
   *  spScale() helper (vh-relative, so it grows/shrinks with the real
   *  device's viewport height) rather than staying flat literal px on every
   *  screen, per direct follow-up ("英字テキスト下の日付なども縦幅いっぱ
   *  いに収まるように調整"). No effect on variant="pc". Lengths are plain
   *  CSS length strings (e.g. "2.78vh"), not raw numbers, since spScale()
   *  itself already returns a unit-suffixed string.
   *
   *  `width`, when set, additionally forces this line's own (pre-rotation)
   *  width to that exact value instead of shrink-to-fit, and switches its
   *  items from a small fixed `gap` over to `justify-between` (same
   *  distribution PC's own layout below already uses) — per direct
   *  follow-up ("日付の幅を画面の縦幅いっぱいに伸ばして"): since this
   *  line's *visual* on-screen height after VerticalLabel's rotation is
   *  really its own pre-rotation width, forcing that width to (roughly) the
   *  viewport height is what actually stretches it to fill the screen's
   *  full vertical extent. */
  spSizeOverride?: { fontSize: string; letterSpacing: string; gap: string; width?: string };
  /** Tokyo's current temperature (°C), or null if idle-overlay.tsx's own
   *  fetch hasn't settled yet or failed — see that file's own doc comment.
   *  Was fetched internally here; lifted up to the parent so both this
   *  component's PC/SP instances (idle-overlay.tsx mounts one of each) share
   *  a single fetch/poll instead of running one independently each.
   *
   *  This component itself no longer drives its own fade-in (an earlier
   *  version did, gated on `visible`/`fadeMs` props that lived here) — per
   *  direct follow-up ("日付の列もフェードインで表示されるようにしてくださ
   *  い"), idle-overlay.tsx now wraps both call sites in the exact same
   *  opacity/transitionDuration pattern its pills/logo and Now Playing
   *  groups already use, rather than this component managing a parallel,
   *  structurally-separate copy of that same mechanism. */
  temperatureC: number | null;
};

/**
 * Live year / month+day / weekday / time line — Figma node 905:2091, sat
 * 40px below idle-overlay.tsx's own tagline (see that file's own wrapper for
 * the actual margin) per explicit request ("3行テキスト下マージン40pxの位置
 * に年、日付、曜日、時間を追加"). Always shows Tokyo time regardless of the
 * visitor's own timezone, since that's ANDMADE's own base (the tagline
 * itself says as much) — not just whatever clock the visitor's browser
 * happens to be set to. Also shows Tokyo's current temperature, prefixed
 * "Tokyo " (per explicit request: "天気の取得もできる？" → added to this same
 * line as "Tokyo <temp>", omitted entirely if that fetch hasn't resolved yet
 * or fails, same as the rest of the line still working fine without it). A
 * separator sits between every item on this line (also per explicit
 * request), interleaved via the `items` array below rather than hardcoded
 * between each pair, so it's not missed/duplicated if an item (e.g. the
 * temperature) is conditionally absent.
 */
export function IdleDateTime({ variant = "pc", spSizeOverride, temperatureC }: IdleDateTimeProps) {
  const [parts, setParts] = useState(() => readTokyoParts(new Date()));

  useEffect(() => {
    const interval = setInterval(() => setParts(readTokyoParts(new Date())), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // A single-digit day gets a leading non-breaking space instead of a
  // zero-pad ("July  7" rather than "July 07") — matches Figma's own
  // "July  7" exactly, keeping the day's own visual width roughly
  // consistent whether it's one or two digits, without an odd-looking
  // leading zero on a date.
  const day = parts.day.length < 2 ? ` ${parts.day}` : parts.day;

  const items: { key: string; content: React.ReactNode }[] = [
    { key: "year", content: parts.year },
    {
      key: "date",
      content: (
        <>
          {parts.month} {day}
        </>
      ),
    },
    { key: "weekday", content: `${parts.weekday}.` },
    { key: "time", content: `${parts.hour}:${parts.minute} JST` },
  ];
  if (temperatureC !== null) {
    items.push({ key: "temperature", content: `Tokyo ${Math.round(temperatureC)}°C` });
  }

  // Both variants use "." — SP originally used "," per Figma's own SP frame,
  // reverted per direct follow-up ("日付列の区切りは,じゃなく、「.」に変更").
  const separator = ".";

  return (
    <div
      // justify-between (PC, and SP whenever spSizeOverride?.width is set)
      // needs a defined ancestor width to distribute across — PC's own line
      // sits inside idle-overlay.tsx's own full-width dateTimeWrapperRef
      // there. The SP variant, by default, instead sits inside a
      // VerticalLabel sized to this element's own *natural* content width
      // (see that component's own doc comment), so there's no defined width
      // for justify-between to spread across there — a plain inline-flex
      // with a small gap reads correctly in that case. Once a `width` is
      // forced via spSizeOverride, though, there *is* now a defined width
      // (see that prop's own doc comment above), so SP switches to the same
      // flex/justify-between/w-full treatment PC already uses.
      //
      // No opacity/transition of its own — see `temperatureC`'s own doc
      // comment above for why the fade-in now lives entirely in
      // idle-overlay.tsx's own wrapping div at each call site instead.
      className={
        variant === "sp"
          ? `${spSizeOverride?.width ? "flex justify-between" : "inline-flex"} items-center text-center font-medium text-[#0022ff]`
          : "flex w-full items-center justify-between text-center font-medium text-[#0022ff]"
      }
      style={
        variant === "sp"
          ? {
              fontSize: spSizeOverride?.fontSize ?? 24,
              lineHeight: 1.1,
              letterSpacing: spSizeOverride?.letterSpacing ?? -0.48,
              gap: spSizeOverride?.width ? undefined : (spSizeOverride?.gap ?? 6),
              width: spSizeOverride?.width,
            }
          : {
              fontSize: "calc(30px * var(--scale))",
              lineHeight: 1.1,
              letterSpacing: "calc(-0.6px * var(--scale))",
            }
      }
    >
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 && <p className={ITEM_CLASS}>{separator}</p>}
          <p className={ITEM_CLASS}>{item.content}</p>
        </Fragment>
      ))}
    </div>
  );
}
