/**
 * Draws the live text inside a DOM subtree onto a <canvas>, pixel-for-pixel
 * where the browser already put it.
 *
 * This exists so the Konami easter egg (components/konami-warp-canvas.tsx) can
 * hand the project list's text to a WebGL shader and warp it. The browser
 * gives no way to read a rendered element back as a texture, so the only route
 * to "the real page, distorted" is to re-draw it — which is exactly what the
 * Codrops tutorial this was modelled on does, except that it mirrors text into
 * WebGL geometry with an SDF font atlas. Canvas2D is used here instead for one
 * decisive reason: it draws with the same font stack the page already loaded
 * (Akzidenz Grotesk Next via Typekit, Courier Prime, Gen Interface JP), so
 * glyphs, kerning and letter-spacing come out identical for free. An atlas
 * would mean converting three families and then matching metrics by hand.
 *
 * Position comes from Range.getClientRects() rather than from element boxes:
 * a single text node can wrap across several lines (the longer project
 * categories do), and only a Range can say where each of those lines actually
 * landed. Everything is measured in viewport coordinates and rebased onto the
 * target's own top-left corner, so the result is a texture whose UV space maps
 * 1:1 onto the target's bounding box.
 *
 * Deliberately not a general-purpose html2canvas: it draws text and
 * `.underline-sweep` underlines and nothing else. Backgrounds, borders,
 * images and blend modes are all out of scope — the egg only warps the list's
 * type, and everything else stays as live DOM.
 */

export type TextRaster = {
  canvas: HTMLCanvasElement;
  /** Texture size in CSS pixels — UV space maps onto exactly this box. */
  cssWidth: number;
  cssHeight: number;
  /** Horizontal breathing room baked in on each side, in CSS pixels, so the
   *  shader can push glyphs sideways without clipping them at the edge. */
  padX: number;
  /** Same, vertically. Without it the first row of content sits flush
   *  against texture v=0, and any shader that displaces sampling upward
   *  crosses that edge — where CLAMP_TO_EDGE repeats the edge row forever,
   *  smearing glyph stems into tall vertical bars (the Konami warp's
   *  reported "バーコード状" corruption on the list's top row, present since
   *  the vertical tilt was introduced). */
  padY: number;
  /** Every underline bar drawn into the texture, in texture-space CSS px.
   *
   *  Consumers that re-shadow the texture need these: CSS `text-shadow` only
   *  shadows glyphs — never a `::after` underline — but in this texture the
   *  underline is just more alpha, indistinguishable from text. The Konami
   *  warp's ghost trail sampled it like any glyph and dragged solid
   *  full-width bars up through the title text (reported as "タイトルの文字
   *  上が伸びてるゴースト...このタイトルのバグ"); it uses these rects to
   *  skip the underline band in its ghost taps while the direct tap keeps
   *  drawing the underline itself. */
  underlines: { x: number; y: number; w: number; h: number }[];
};

type RasterizeOptions = {
  /** Horizontal padding, CSS px per side. */
  padX: number;
  /** Vertical padding, CSS px per side — see TextRaster.padY. */
  padY?: number;
  /** Hard ceiling from gl.MAX_TEXTURE_SIZE — the scale is reduced until the
   *  canvas fits inside it on both axes. */
  maxTextureSize: number;
  /** Upper bound on device-pixel oversampling. 2 is plenty for text this
   *  size, and the list is tall enough that 3 would blow past the texture
   *  limit on a HiDPI screen for no visible gain. */
  maxScale?: number;
  /** Draw everything at full opacity, ignoring each element's own `opacity`
   *  chain (visibility/display are still respected).
   *
   *  The project list fades its cards in as they scroll into view, so at any
   *  given moment some cards legitimately compute to opacity 0 — but the
   *  texture is a *snapshot standing in for the final state*, and a card
   *  baked in at 0 can never fade in afterwards: it just doesn't exist in the
   *  texture, which read as whole rows of the list being missing. A CSS rule
   *  (html.konami-glitch [data-konami-warp] > li, globals.css) forces the
   *  revealed state for the same reason, but capture correctness shouldn't
   *  hinge on a stylesheet being up to date — this flag makes the rasteriser
   *  itself immune. */
  assumeOpaque?: boolean;
};

/** Multiplied-up `opacity` of every ancestor between `node` and `stopAt`,
 *  exclusive of `stopAt` itself.
 *
 *  `stopAt` is excluded on purpose: the caller sets the target's own opacity
 *  to 0 to hide the real text once the texture is up, and re-rasterises (on
 *  resize) while it is still hidden. Opacity doesn't affect layout, so every
 *  rect is still correct — but counting the target's own 0 would make every
 *  glyph invisible and produce an empty texture. */
function inheritedOpacity(node: Element, stopAt: Element): number {
  let opacity = 1;
  let el: Element | null = node;
  while (el && el !== stopAt) {
    const value = Number.parseFloat(getComputedStyle(el).opacity);
    if (Number.isFinite(value)) opacity *= value;
    el = el.parentElement;
  }
  return opacity;
}

/** Splits a text node into its rendered lines.
 *
 *  The fast path — one client rect — covers almost everything and avoids
 *  ~30 range measurements per string. Only genuinely wrapped nodes pay for
 *  the per-character walk, which is the only way to find out *where* the
 *  browser chose to break. */
function renderedLines(node: Text): { text: string; rect: DOMRect }[] {
  const range = document.createRange();
  range.selectNodeContents(node);
  const rects = range.getClientRects();
  const value = node.nodeValue ?? "";

  if (rects.length <= 1) {
    const rect = rects[0] ?? range.getBoundingClientRect();
    return rect.width > 0 ? [{ text: value, rect }] : [];
  }

  const lines: { text: string; rect: DOMRect }[] = [];
  let lineStart = 0;
  let previousTop: number | null = null;

  const pushLine = (start: number, end: number) => {
    const text = value.slice(start, end);
    if (!text.trim()) return;
    range.setStart(node, start);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0) lines.push({ text, rect });
  };

  for (let i = 0; i < value.length; i += 1) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const rect = range.getBoundingClientRect();
    // A collapsed space at a line break measures as a zero box — it belongs to
    // neither line, so it can't be used to decide where the break was.
    if (rect.width === 0 && rect.height === 0) continue;
    // 1px of slack: sub-pixel layout means two glyphs on the same line can
    // report tops that differ in the last decimal place.
    if (previousTop !== null && Math.abs(rect.top - previousTop) > 1) {
      pushLine(lineStart, i);
      lineStart = i;
    }
    previousTop = rect.top;
  }
  pushLine(lineStart, value.length);

  return lines;
}

/** Where to put the baseline for a line whose box is `rect`.
 *
 *  Range rects and Canvas2D disagree about what a "text box" is, and which
 *  one a browser hands back has changed between versions. Centring the font's
 *  own ascent+descent box inside the measured rect is correct either way: if
 *  the rect is the tight text box the two are equal and the offset is 0, and
 *  if it carries half-leading the offset splits it evenly, which is exactly
 *  how leading is distributed. */
function baselineFor(ctx: CanvasRenderingContext2D, text: string, rect: DOMRect): number {
  const metrics = ctx.measureText(text);
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? 0;
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? 0;
  const boxHeight = ascent + descent;
  if (!boxHeight) return rect.bottom;
  return rect.top + (rect.height - boxHeight) / 2 + ascent;
}

/**
 * Draws `.underline-sweep`'s underline.
 *
 * The underline is a `::after` pseudo-element, so there is no node for the
 * tree walker to find. Its computed style is readable though, and reading it
 * beats re-deriving the geometry from the CSS: `bottom` and `height` come back
 * already resolved to pixels, so the `-0.1em` default and the two per-instance
 * `--underline-offset` / `--underline-thickness` overrides in this codebase
 * are all handled without parsing anything.
 *
 * `bottom` is a distance up from the containing block's bottom edge, and the
 * default is negative — hence the subtraction, which lands the underline
 * *below* the text box.
 */
function drawUnderlines(
  ctx: CanvasRenderingContext2D,
  target: HTMLElement,
  originX: number,
  originY: number,
  assumeOpaque: boolean
): TextRaster["underlines"] {
  const drawn: TextRaster["underlines"] = [];
  for (const el of target.querySelectorAll<HTMLElement>(".underline-sweep")) {
    const after = getComputedStyle(el, "::after");
    if (after.content === "none" || after.position !== "absolute") continue;

    const thickness = Number.parseFloat(after.height);
    const bottom = Number.parseFloat(after.bottom);
    if (!Number.isFinite(thickness) || !Number.isFinite(bottom) || thickness <= 0) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) continue;

    const opacity = assumeOpaque ? 1 : inheritedOpacity(el, target);
    if (opacity <= 0.01) continue;

    const x = rect.left - originX;
    const y = rect.bottom - bottom - thickness - originY;
    ctx.globalAlpha = opacity;
    ctx.fillStyle = after.backgroundColor;
    ctx.fillRect(x, y, rect.width, thickness);
    drawn.push({ x, y, w: rect.width, h: thickness });
  }
  ctx.globalAlpha = 1;
  return drawn;
}

/**
 * Rasterises every visible text node inside `target`.
 *
 * Returns null when there is nothing to draw or no 2D context is available —
 * callers should treat that as "skip the effect", not as an error.
 */
export function rasterizeText(
  target: HTMLElement,
  { padX, padY = 0, maxTextureSize, maxScale = 2, assumeOpaque = false }: RasterizeOptions
): TextRaster | null {
  const targetRect = target.getBoundingClientRect();
  if (targetRect.width <= 0 || targetRect.height <= 0) return null;

  const cssWidth = targetRect.width + padX * 2;
  const cssHeight = targetRect.height + padY * 2;

  const scale = Math.min(
    maxScale,
    window.devicePixelRatio || 1,
    maxTextureSize / cssWidth,
    maxTextureSize / cssHeight
  );
  if (!(scale > 0)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(cssWidth * scale));
  canvas.height = Math.max(1, Math.floor(cssHeight * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(canvas.width / cssWidth, canvas.height / cssHeight);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const originX = targetRect.left - padX;
  const originY = targetRect.top - padY;

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    if (!textNode.nodeValue?.trim()) continue;

    const parent = textNode.parentElement;
    if (!parent) continue;

    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.display === "none") continue;

    const opacity = assumeOpaque ? 1 : inheritedOpacity(parent, target);
    if (opacity <= 0.01) continue;

    // Rebuilt rather than copied from `style.font`, which several browsers
    // return as an empty string whenever any longhand came from a shorthand
    // they can't losslessly serialise.
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // letterSpacing is a fairly recent Canvas2D addition and is still missing
    // from some TS DOM libs; the project's date line depends on it (it carries
    // a negative tracking), so it is set defensively rather than skipped.
    const spacingCapable = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in spacingCapable) {
      spacingCapable.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    }
    ctx.fillStyle = style.color;
    ctx.globalAlpha = opacity;

    for (const line of renderedLines(textNode)) {
      ctx.fillText(line.text, line.rect.left - originX, baselineFor(ctx, line.text, line.rect) - originY);
    }
  }
  ctx.globalAlpha = 1;

  const underlines = drawUnderlines(ctx, target, originX, originY, assumeOpaque);

  return { canvas, cssWidth, cssHeight, padX, padY, underlines };
}
