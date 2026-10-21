"use client";

import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { introDefinitelyWontShow, willIntroShow } from "@/components/site-intro";
import { useToggleSound } from "@/components/konami-sound";
import { LIST_ENTRANCE_DELAY_MS } from "@/lib/entrance";

type CaseCounterProps = {
  /** Ref to the last row's title — the same element the sticky release point
   *  is aligned to (see project-grid-section.tsx). Used to detect that release. */
  lastTitleRef: React.RefObject<HTMLDivElement | null>;
  /** 一覧（<ul>）そのもの。「Scroll」を押したときのスクロール先。
   *  Txt / Img どちらの親も既に持っているものをそのまま渡してもらう。 */
  listRef?: React.RefObject<HTMLUListElement | null>;
};

/** 登場のフェード時間。一覧のカード（project-card.tsx の duration-500）と
 *  同じにして、一覧と同時に立ち上がって見えるようにする（直接の指示
 *  "TickとScrollの表示タイミングを一覧の表示タイミングに合わせて"）。
 *  遅延も一覧と同じ LIST_ENTRANCE_DELAY_MS なので、これで出だしと
 *  終わりが揃う。 */
const ENTRANCE_FADE_MS = 500;
/** 消えるときは待たせたくないので従来どおり短いまま。 */
const EXIT_FADE_MS = 300;

/** 「Scroll」で一覧へ飛んだとき、一覧の上端を画面上から何px下に置くか。
 *  ヘッダーの真下に潜り込まない程度の余白。 */
const SCROLL_TO_LIST_OFFSET_PX = 90;

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
export function CaseCounter({ lastTitleRef, listRef }: CaseCounterProps) {
  const pathname = usePathname();
  const [released, setReleased] = useState(false);
  /** 少しでもスクロールしたら即座に消す。最終行に到達したら消える従来の `released`
   *  はそのまま（スクロールを戻したときに戻ってこないよう、こちらが先に
   *  効く）。 */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 0);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
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

  // 登場の遅延は「初回だけ」。
  //
  // LIST_ENTRANCE_DELAY_MS は一覧と足並みを揃えて一拍おいて出すための待ちで、
  // ページを開いた最初の1回にだけ意味がある。スクロールで消えたあと上へ
  // 戻ってきたときにも同じ待ちが入ると、戻ったのに出てこない時間ができて
  // 反応が鈍く見える（直接の指示 "上に戻った時の表示タイミングを
  // scrollともにもう少し早く"）。一度でも出したあとは遅延なしで即座に戻す。
  const visible = revealed && !released && !scrolled;
  // state で持つ（ref ではない）。描画中に ref を読み書きするのは
  // react-hooks/refs に引っかかるうえ、遅延の値は実際に描画へ出るので
  // state が正しい。visible が立った最初の1回だけ true に倒す。
  // 描画中の条件付き setState（React 公式の "Adjusting state when a prop
  // changes" の形）。effect に逃がすと react-hooks/set-state-in-effect に
  // 当たるうえ、1フレーム遅れて遅延値が切り替わる。
  const lenis = useLenis();
  const [hasShown, setHasShown] = useState(false);
  if (visible && !hasShown) setHasShown(true);
  const entranceDelayMs = hasShown ? 0 : LIST_ENTRANCE_DELAY_MS;

  // 「Scroll」を押したら一覧の先頭へ。
  // Lenis がある場合はそちらに任せる（サイト全体のスクロールは Lenis が
  // 握っているので、window.scrollTo だと慣性と競合して途中で引き戻される）。
  const scrollToList = () => {
    const list = listRef?.current;
    if (!list) return;
    if (lenis) {
      lenis.scrollTo(list, { offset: -SCROLL_TO_LIST_OFFSET_PX });
      return;
    }
    const top = list.getBoundingClientRect().top + window.scrollY - SCROLL_TO_LIST_OFFSET_PX;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    // pointer-events-none: this div has no explicit width, so as a
    // block-level element it spans the full row — which, because of the
    // negative margin in project-grid-section.tsx, sits right over the last
    // row's cards (the gap between their underlined title and the meta text
    // below it). Without this it silently swallowed clicks/hover there,
    // since it's a later DOM sibling and paints on top. The counter itself
    // is just static text, never interactive, so this has no downside.
    <div className="sticky bottom-[18px] h-[calc(15px*var(--scale))] pointer-events-none">
      {/* 外側 = 位置と「出す/引っ込める」、内側 = ホバー。Tick と同じ
         2段構成（あちらのコメント参照）。 */}
      <span
        // Hidden (opacity-0) whenever any gate says so — not yet
        // `revealed` (still waiting on the intro, see this component's own
        // top-level `revealed` doc comment) or already `released` (scrolled
        // past, this element's own pre-existing scroll fade-out).
        className={`absolute top-0 transition-opacity ease-out ${
          visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          right: "var(--edge-right-inset)",
          transitionDuration: `${visible ? ENTRANCE_FADE_MS : EXIT_FADE_MS}ms`,
          // 一覧と足並みを揃えて一拍おいて出す（lib/entrance.ts 参照）。
          // 消えるとき（released / scrolled）は待たせたくないので、出るとき
          // だけ遅延を付ける。
          transitionDelay: `${visible ? entranceDelayMs : 0}ms`,
        }}
      >
        {/* 「N Cases」→「Scroll」。件数の表示は左レール（Made Here / N
           Cases、project-view-toggle.tsx）へ移した。出す/引っ込めるタイミング
           （イントロ待ち・最終行に到達したらフェードアウト）はそのまま。

           押すと一覧の先頭まで送る（直接の指示）。案内文のままにしておく
           よりは、文字どおり「スクロールする」ボタンにしたほうが素直。 */}
        <button
          type="button"
          onClick={scrollToList}
          className="block cursor-pointer whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.2] font-normal text-black transition-opacity hover:opacity-50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        >
          Scroll
        </button>
      </span>

      <TickToggle visible={visible} delayMs={visible ? entranceDelayMs : 0} />
    </div>
  );
}

/** 「Scroll」からグリッド1マス（58px）ぶん左に置く。
 *  Scroll は --edge-right-inset でグリッド右端に右揃えされているので、
 *  そこへ1マス足せば「右から2つめ」の位置に右揃えされる。 */
const TICK_RIGHT_OFFSET_PX = 58;

/**
 * 効果音のオン/オフ（components/konami-sound.tsx）。
 *
 * ラベルは「Tick」— 実際に鳴っているのが 8〜40ms のクリック音そのもの
 * なので、機能名（Audio / SE / Snd）より鳴っている音を指すほうが
 * このサイトの語彙（Scroll / Made Here など、動作や状態を短く置く）に
 * 馴染む、という判断（直接の指示）。
 *
 * Scroll と同じ行・同じ級数で、グリッドの右から2つめに置く（直接の指示）。
 * 出す/引っ込めるタイミングも Scroll と同一にしてある（イントロ待ち・
 * 最終行に到達／スクロール開始でフェードアウト）。
 *
 * 状態は濃度で示す — オンで 50%。トップFVの「Colors of Sound」と同じ作法。
 * 下線とホバー時のスイープはサイト共通の .underline-sweep。
 *
 * pointer-events-auto — 親の sticky な箱は pointer-events-none で
 * 一覧のクリックを素通しにしているので、ここだけ拾い直す。
 */
function TickToggle({ visible, delayMs }: { visible: boolean; delayMs: number }) {
  const [enabled, toggle] = useToggleSound();
  return (
    // 位置決めは外側の span が持つ。.underline-sweep 自身が
    // `position: relative` を持っていて（globals.css）、Tailwind の
    // `absolute` ユーティリティより後ろに出るため、同じ要素に両方付けると
    // relative が勝って絶対配置が効かない（実際に位置が崩れた）。
    // 位置と装飾を別の要素に分ければ競合しない。
    // 外側 = 位置と「出す/引っ込める」。内側 = 状態（オン=50%）とホバー。
    // 透過を2段に分けているのは、どちらも opacity を使うため。入れ子なら
    // 掛け算になるので、隠れている間（外側 0）はホバーしても出てこない。
    // 1要素にまとめると hover:opacity-50 が opacity-0 を上書きしてしまう。
    <span
      className={`absolute top-0 transition-opacity ease-out ${
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{
        right: `calc(var(--edge-right-inset) + ${TICK_RIGHT_OFFSET_PX}px * var(--grid-scale))`,
        transitionDuration: `${visible ? ENTRANCE_FADE_MS : EXIT_FADE_MS}ms`,
        transitionDelay: `${delayMs}ms`,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        // 下線は無し（直接の指示）。隣の Scroll も下線を持たないので、
        // この行は2つとも素のテキストで揃う。
        // ホバーで 50% — トップFVの「Colors of Sound」と同じ作法
        // （あちらも状態・ホバーとも opacity で表す）。オン中は既に 50% な
        // ので、ホバーしても見た目は変わらない。
        className={`block cursor-pointer whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.2] font-normal text-black transition-opacity hover:opacity-50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
          enabled ? "opacity-50" : "opacity-100"
        }`}
      >
        Tick
      </button>
    </span>
  );
}
