"use client";

import type { CSSProperties } from "react";
import { useLenis } from "lenis/react";
import { CopyEmail } from "@/components/copy-email";
import Image from "next/image";
import Link from "next/link";
import { CopyrightYear } from "@/components/copyright-year";
import { withBasePath } from "@/lib/base-path";

type SiteFooterProps = {
  /** Called the instant "Back to top" is clicked, before the scroll starts. */
  onBackToTopStart?: () => void;
  /** Called once the smooth-scroll to the top has actually finished. */
  onBackToTopEnd?: () => void;
  /** "blend" (default) renders white text meant to be read through an
   *  ancestor's `mix-blend-exclusion` (see app/page.tsx, which wraps this
   *  in that class) — it appears black once blended against the cream
   *  background. "dark" renders literal black text directly instead, no
   *  blend-mode dependency — used by the About page, which doesn't sit
   *  inside a blending ancestor. */
  theme?: "blend" | "dark";
  /** Set to false to skip rendering "Back to top" entirely — used by the
   *  Studies page, which has no scroll to jump back from (it's a single,
   *  non-scrolling viewport). Defaults to true (rendered), unchanged
   *  everywhere else. */
  showBackToTop?: boolean;
};

export function SiteFooter({
  onBackToTopStart,
  onBackToTopEnd,
  theme = "blend",
  showBackToTop = true,
}: SiteFooterProps) {
  const lenis = useLenis();
  const text = theme === "dark" ? "text-black" : "text-white";
  const textMuted = theme === "dark" ? "text-black/50" : "text-white/50";
  const hoverMuted = theme === "dark" ? "hover:text-black/50" : "hover:text-white/50";

  return (
    <footer
      className="relative h-[calc(52px*var(--scale))] w-full"
      // --underline-offset — このフッターの下線（.underline-sweep）だけ
      // 共有既定値（-0.1em）から 1px 下げる。カスタムプロパティは継承
      // するので、中の4つ（メアド / Instagram / X / Back to top）に
      // まとめて効く。globals.css の .underline-sweep::after 参照。
      style={{ "--underline-offset": "calc(-0.1em - 1px)" } as CSSProperties}
    >
      <div
        className={`absolute bottom-0 left-0 text-[length:calc(30px*var(--scale))] leading-[0] font-medium ${text} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
      >
        <p className="mb-0 leading-[1.05]">
          ©<CopyrightYear />
        </p>
        <p className="leading-[1.05]">ANDMADE Inc.</p>
      </div>

      <Link
        href="/"
        className="absolute top-0 h-[calc(52px*var(--scale))] w-[calc(52px*var(--scale))]"
        style={{ right: "var(--edge-right-inset)" }}
      >
        <Image
          src={withBasePath("/andmade-mark.svg")}
          alt="ANDMADE"
          width={52}
          height={52}
          // data-footer-logo — トップのアイドル中インク差し替え
          // （lib/album-colors.ts の applyRandomInk）がロゴを見つけて
          // ジャケ色のシルエットに差し替えるためのフック。
          data-footer-logo
          // The SVG's paths are hardcoded fill="white" — on the "blend" theme
          // that's read through an ancestor's mix-blend-exclusion (see
          // app/page.tsx) and appears dark once blended against the cream
          // background. "dark" theme has no such blending ancestor, so it'd
          // otherwise just render literal white-on-cream (invisible) —
          // `invert` flips white to black instead.
          className={`h-full w-full ${theme === "dark" ? "invert" : ""}`}
        />
      </Link>

      <div
        className="absolute bottom-0 flex gap-[calc(40px*var(--scale))] text-[length:calc(12px*var(--scale))] leading-[1.4]"
        style={{ left: "calc(348px * var(--grid-scale))" }}
      >
        <div className="flex w-[calc(92px*var(--scale))] flex-col items-start gap-[calc(12px*var(--scale))] whitespace-nowrap">
          {/* relative top 2px — per direct follow-up ("フッターの「Inquiries」、
              「Social」を2px下げて")。relative なので下の値の位置は動かない。 */}
          <p
            className={`relative top-[calc(2px*var(--scale))] font-(family-name:--font-courier) ${textMuted} tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
          >
            Inquiries
          </p>
          {/* mailto → クリックでコピー＋"Copied" 表示（copy-email.tsx）。 */}
          <CopyEmail
            offsetY={2}
            className={`underline-sweep font-medium ${text} transition-colors ${hoverMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
          />
        </div>
        <div className="flex w-[calc(72px*var(--scale))] flex-col items-start gap-[calc(12px*var(--scale))] whitespace-nowrap">
          <p
            className={`relative top-[calc(2px*var(--scale))] font-(family-name:--font-courier) ${textMuted} tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
          >
            Social
          </p>
          <div className={`flex items-center gap-[calc(4px*var(--scale))] font-medium ${text}`}>
            <a
              href="https://www.instagram.com/andmade_inc"
              className={`underline-sweep transition-colors ${hoverMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
            <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">,</span>
            <a
              href="https://x.com/ANDMADE_jp"
              className={`underline-sweep transition-colors ${hoverMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
              target="_blank"
              rel="noopener noreferrer"
            >
              X
            </a>
          </div>
        </div>
      </div>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => {
            onBackToTopStart?.();
            lenis?.scrollTo(0, { onComplete: () => onBackToTopEnd?.() });
          }}
          // group — 下線のスイープは中の span が持つ（.underline-sweep は
          // position:relative を付けるので、絶対配置のこのボタン自身には
          // 当てられない）。.group:hover .underline-sweep::after の側で
          // 拾わせる。
          className={`group absolute cursor-pointer whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.4] font-medium ${text} transition-colors ${hoverMuted}`}
          // bottom を負に＝4px 下げる。中の span を inline-block にして
          // text-box-trim を効かせたぶん（行ボックスの下側のハーフ
          // レディング）箱が縮み、bottom-0 のままだと左の
          // Instagram / X より上に浮いていた。その差を戻して下面を揃える。
          style={{ left: "calc(696px * var(--grid-scale))", bottom: "calc(-4px * var(--scale))" }}
        >
          {/* inline-block — text-box-trim はブロック化された要素にしか
              効かない。素のインラインのままだと箱が行ボックス（1.4em）の
              高さになり、下端基準の下線がテキストから離れる。他の3つは
              button（メアド）と flex アイテム（Instagram / X）で自動的に
              ブロック化されていて、ここだけ抜けていた。 */}
          <span className="underline-sweep inline-block [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            Back to top
          </span>
        </button>
      )}
    </footer>
  );
}
