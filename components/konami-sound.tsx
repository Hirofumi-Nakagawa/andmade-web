"use client";

import { useEffect } from "react";

/**
 * イースターエッグ発動後の効果音 — per direct follow-up
 * （"トップのイースターエッグ発動後に音出るようにして"、
 *   "エッグ後のスクロール音と各ボタンや一覧のホバーとクリック時、
 *    下層のボタンなども同様"）。
 *
 * 3つの短いクリック音を、スクロール / ホバー / クリックに割り当てる。
 * いずれも 8〜40ms の素材なので、鳴らし方は「間引き」が本体になる。
 *
 * ■ なぜ視覚エフェクトとは別の状態を持つか
 *   エッグ本体（konami-glitch.tsx）は**トップページ限定**で、下層へ遷移した
 *   時点で自動的に解除される（あちらの isTopPage 判定）。一方この音は
 *   「下層のボタンなども同様」と指定されているので、ページを移っても鳴り
 *   続ける必要がある。そこで konami-glitch.tsx が発火する専用イベント
 *   （andmade:konami-sound-on / -off）だけを購読し、`konami-glitch` クラスの
 *   有無や pathname は一切見ない。視覚エフェクトが消えても音は生きる。
 *
 * ■ 音の止まり方
 *   「解除で止まる」指定どおり、Escape もしくはコマンド再入力で off になる。
 *   ページをまたいで生き残る必要があるので sessionStorage に持たせてある
 *   （タブを閉じれば消える。リロードでは残る＝エッグ中にリロードしても
 *   音だけ復活する、という読み味）。
 *
 * ■ 自動再生ポリシー
 *   AudioContext はユーザー操作なしに音を出せないが、このモードに入る
 *   きっかけは必ずキー入力（コマンド成立）なので、その流れで resume() すれば
 *   確実に解錠できる。ページ遷移後も同じ AudioContext を使い回す。
 */

/** konami-glitch.tsx が発火する。音だけを on/off する専用の合図で、
 *  視覚エフェクトの active とは寿命が違う（上の doc comment 参照）。 */
export const KONAMI_SOUND_ON_EVENT = "andmade:konami-sound-on";
export const KONAMI_SOUND_OFF_EVENT = "andmade:konami-sound-off";

/** ページをまたいでも鳴り続けるための保存先。 */
const STORAGE_KEY = "andmade-konami-sound";

/** 音量。「小さめで固定」の指定どおり、UI も設定も持たない。
 *  クリックだけ気持ち大きいのは、素材自体（40ms の木質音）が他の2つより
 *  低く沈んで聞こえづらいぶんの補正（0.18 → 0.26。直接の指示で一段上げた）。 */
const VOLUME = { scroll: 0.1, hover: 0.12, click: 0.26 } as const;

const SOURCES = {
  scroll: "/sounds/tick-scroll.wav",
  hover: "/sounds/tick-hover.wav",
  click: "/sounds/tick-click.wav",
} as const;

type SoundName = keyof typeof SOURCES;

/** スクロール音を1回鳴らすごとに必要なスクロール量(px)。
 *  時間ではなく距離で刻むので、ゆっくり動かせばゆっくり、速く流せば速く
 *  鳴る＝「ダイヤルを回している」感触になる。 */
const SCROLL_TICK_PX = 110;
/** それでも速すぎるスクロールで連打にならないよう、最短の間隔(ms)を設ける。 */
const SCROLL_MIN_INTERVAL_MS = 45;

/** ホバー音を鳴らす対象。一覧のタイトルやトグルなど「押せるもの」全般。
 *  下層ページのボタン・リンクも同じ条件で拾える。 */
const INTERACTIVE_SELECTOR = 'a, button, [role="link"], [role="button"]';

/** 同じ要素に出入りを繰り返したときの連打止め(ms)。 */
const HOVER_MIN_INTERVAL_MS = 60;

/** 再生中の AudioContext とデコード済みバッファ。モジュールスコープに置いて
 *  ページ遷移をまたいで使い回す（毎回 new すると解錠からやり直しになる）。 */
let audioContext: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loadPromise: Promise<void> | null = null;
/** エッグの音モードが on か。下の playKonamiSound() が参照する。
 *  React の state ではなくモジュール変数なのは、コンポーネント外（Studies の
 *  ギャラリーなど）から同期的に参照したいため。 */
let soundEnabled = false;

async function ensureLoaded(): Promise<void> {
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = new Ctor();
  }
  // 解錠。コマンド入力というユーザー操作の延長で呼ばれるので通る。
  if (audioContext.state === "suspended") await audioContext.resume().catch(() => {});
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await Promise.all(
      (Object.keys(SOURCES) as SoundName[]).map(async (name) => {
        try {
          const response = await fetch(SOURCES[name]);
          const data = await response.arrayBuffer();
          const decoded = await audioContext!.decodeAudioData(data);
          buffers.set(name, decoded);
        } catch {
          // 1つ読めなくても他は鳴らす。音が出ないだけで操作は壊さない。
        }
      })
    );
  })();
  return loadPromise;
}

/**
 * 任意の場所からエッグの効果音を鳴らす。
 *
 * ページ全体の委譲ハンドラ（下の attach）で拾えない操作のための出口。
 * 具体的には Studies のギャラリーで、
 *   ・ホイールで作品が切り替わった瞬間（window は一切スクロールしないので
 *     スクロール音のハンドラが反応しない）
 *   ・中央画像の Zoom / Zoom Out（ただの <div> なのでクリック音の
 *     セレクタに掛からない）
 * を鳴らすのに使う。
 *
 * エッグが off のときは何もしないので、呼び出し側は状態を気にしなくてよい。
 */
export function playKonamiSound(name: SoundName) {
  if (!soundEnabled) return;
  play(name);
}

function play(name: SoundName) {
  const buffer = buffers.get(name);
  if (!audioContext || !buffer || audioContext.state !== "running") return;
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const gain = audioContext.createGain();
  gain.gain.value = VOLUME[name];
  source.connect(gain).connect(audioContext.destination);
  source.start();
}

export function KonamiSound() {
  useEffect(() => {
    let enabled = false;
    let detach: (() => void) | null = null;

    function attach() {
      if (detach) return;

      // --- スクロール（距離で刻む） ---
      let lastTickY = window.scrollY;
      let lastTickAt = 0;
      const handleScroll = () => {
        const now = performance.now();
        if (Math.abs(window.scrollY - lastTickY) < SCROLL_TICK_PX) return;
        lastTickY = window.scrollY;
        if (now - lastTickAt < SCROLL_MIN_INTERVAL_MS) return;
        lastTickAt = now;
        play("scroll");
      };

      // --- ホバー / クリック ---
      // pointerover を1つだけ document に張る（要素ごとに付けない）。
      // エッグ中はページ遷移で DOM が丸ごと入れ替わるので、個別付与だと
      // 付け直しが要る。委譲なら下層ページでもそのまま効く。
      // 判定は pointerover だけで行い、pointerout は使わない。
      //
      // 当初は pointerout で「要素から出た」を記録していたが、中身が1文字ずつ
      // span に分かれている箇所（ScrambleText — 再生中の曲名など）では、
      // 文字から文字へ移るたびに内側の span の pointerout がバブリングして
      // くる。closest() で辿った祖先は同じリンクなので「出た」と誤判定し、
      // 次の文字の pointerover で鳴り直す＝**1文字ごとに音が鳴る**という
      // 不具合になっていた。
      //
      // pointerover はカーソルが乗った要素で必ず発火するので、「今どの
      // インタラクティブ要素の上にいるか」は over だけで完全に追える。
      // リンクの外（closest が null）へ移った時点で記録を捨てればよい。
      let lastHoverTarget: Element | null = null;
      let lastHoverAt = 0;
      const handlePointerOver = (event: PointerEvent) => {
        const target = (event.target as Element | null)?.closest(INTERACTIVE_SELECTOR) ?? null;
        if (!target) {
          lastHoverTarget = null;
          return;
        }
        if (target === lastHoverTarget) return;
        const now = performance.now();
        lastHoverTarget = target;
        if (now - lastHoverAt < HOVER_MIN_INTERVAL_MS) return;
        lastHoverAt = now;
        play("hover");
      };
      // pointerdown（click ではなく）— 押した瞬間に鳴るほうが操作と一致する。
      // 遷移を伴うリンクでは click まで待つと鳴る前にページが変わることがある。
      const handlePointerDown = (event: PointerEvent) => {
        if (!(event.target as Element | null)?.closest(INTERACTIVE_SELECTOR)) return;
        play("click");
      };

      window.addEventListener("scroll", handleScroll, { passive: true });
      document.addEventListener("pointerover", handlePointerOver, true);
      document.addEventListener("pointerdown", handlePointerDown, true);

      detach = () => {
        window.removeEventListener("scroll", handleScroll);
        document.removeEventListener("pointerover", handlePointerOver, true);
        document.removeEventListener("pointerdown", handlePointerDown, true);
      };
    }

    function enable() {
      if (enabled) return;
      enabled = true;
      soundEnabled = true;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // プライベートブラウズ等で書けなくても、そのセッション中は動く。
      }
      void ensureLoaded().then(attach);
    }

    function disable() {
      enabled = false;
      soundEnabled = false;
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // 同上。
      }
      detach?.();
      detach = null;
    }

    window.addEventListener(KONAMI_SOUND_ON_EVENT, enable);
    window.addEventListener(KONAMI_SOUND_OFF_EVENT, disable);

    // リロードやページ遷移後の復帰。ただし AudioContext の解錠はユーザー
    // 操作が要るので、ここでは配線だけして、最初の操作（ホバー/クリック/
    // スクロール）で resume を試みる。鳴り始めが1アクション遅れることが
    // あるが、無音のまま壊れるよりよい。
    let restored = false;
    try {
      restored = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      restored = false;
    }
    if (restored) {
      enabled = true;
      soundEnabled = true;
      const unlock = () => {
        void ensureLoaded().then(attach);
      };
      document.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
      window.addEventListener("scroll", unlock, { once: true, passive: true });
    }

    return () => {
      window.removeEventListener(KONAMI_SOUND_ON_EVENT, enable);
      window.removeEventListener(KONAMI_SOUND_OFF_EVENT, disable);
      detach?.();
    };
  }, []);

  return null;
}
