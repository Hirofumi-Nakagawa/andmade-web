"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * イースターエッグ発動後の効果音 — per direct follow-up
 * （"トップのイースターエッグ発動後に音出るようにして"、
 *   "エッグ後のスクロール音と各ボタンや一覧のホバーとクリック時、
 *    下層のボタンなども同様"）。
 *
 * 3つの短いクリック音を、スクロール / ホバー / クリックに割り当てる。
 * いずれも 8〜40ms の素材なので、鳴らし方は「間引き」が本体になる。
 *
 * ■ 入口は2つ
 *   ① イースターエッグの発動（当初はこれだけだった）
 *   ② トップ右下の「Audio」トグル（case-counter.tsx）— 直接の指示で後から
 *      追加。誰でもオン/オフできる通常機能としての入口。
 *   どちらも同じ1つの状態（soundEnabled）を触る。片方で消せばもう片方の
 *   表示にも反映される。
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

/** 状態が変わったことを React へ知らせるための購読リスト。 */
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

/** 現在張っているイベントリスナの撤去関数。null = 未配線。 */
let detachHandlers: (() => void) | null = null;

function attachHandlers() {
  if (detachHandlers) return;

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
  // ページ遷移で DOM が丸ごと入れ替わっても、委譲なら張り直しが要らない。
  //
  // 判定は pointerover だけで行い、pointerout は使わない。
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

  detachHandlers = () => {
    window.removeEventListener("scroll", handleScroll);
    document.removeEventListener("pointerover", handlePointerOver, true);
    document.removeEventListener("pointerdown", handlePointerDown, true);
  };
}

/**
 * 効果音のオン/オフ。エッグ側のイベントと Audio トグルの共通の出入口。
 *
 * ユーザー操作（キー入力かクリック）の延長で呼ばれる前提。AudioContext の
 * 解錠がそこに乗るので、別経路から勝手に true にしないこと。
 */
export function setSoundEnabled(on: boolean) {
  if (soundEnabled === on) return;
  soundEnabled = on;
  try {
    if (on) window.sessionStorage.setItem(STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // プライベートブラウズ等で書けなくても、そのセッション中は動く。
  }
  if (on) {
    void ensureLoaded().then(attachHandlers);
  } else {
    detachHandlers?.();
    detachHandlers = null;
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 画面側（Audio トグル）が現在の状態を読むためのフック。
 *  サーバー側は常に false — 初期HTMLは「音オフ」の見た目で出す。 */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => soundEnabled,
    () => false
  );
}

export function KonamiSound() {
  useEffect(() => {
    const enable = () => setSoundEnabled(true);
    const disable = () => setSoundEnabled(false);
    window.addEventListener(KONAMI_SOUND_ON_EVENT, enable);
    window.addEventListener(KONAMI_SOUND_OFF_EVENT, disable);

    // リロードやページ遷移後の復帰。ただし AudioContext の解錠はユーザー
    // 操作が要るので、ここでは状態だけ戻して、最初の操作（ポインタ/キー/
    // スクロール）で解錠と配線を行う。鳴り始めが1アクション遅れることが
    // あるが、無音のまま壊れるよりよい。
    let restored = false;
    try {
      restored = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      restored = false;
    }
    if (restored) {
      soundEnabled = true;
      notify();
      const unlock = () => {
        void ensureLoaded().then(attachHandlers);
      };
      document.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
      window.addEventListener("scroll", unlock, { once: true, passive: true });
    }

    return () => {
      window.removeEventListener(KONAMI_SOUND_ON_EVENT, enable);
      window.removeEventListener(KONAMI_SOUND_OFF_EVENT, disable);
    };
  }, []);

  return null;
}

/**
 * Audio トグルから使う、押したときの処理。
 *
 * クリック音は**どちらの向きでも1回だけ**鳴る。鳴らし方が向きで違うのは、
 * 音が出ている間は委譲ハンドラ（attachHandlers の pointerdown）が
 * 既に拾っているため:
 *   ・オン → オフ … 押した時点ではまだ音が出ているので、委譲ハンドラが
 *                   鳴らす。ここで明示的に鳴らすと二重になる。
 *   ・オフ → オン … 押した時点では配線前で誰も鳴らさない。素材の読み込みを
 *                   待ってから1回鳴らす（「今オンにした」という返事）。
 */
export function useToggleSound(): [boolean, () => void] {
  const enabled = useSoundEnabled();
  const toggle = useCallback(() => {
    if (enabled) {
      setSoundEnabled(false);
      return;
    }
    setSoundEnabled(true);
    void ensureLoaded().then(() => play("click"));
  }, [enabled]);
  return [enabled, toggle];
}
