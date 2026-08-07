"use client";

import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * 「直近再生した曲のジャケット」パラパラ表示（最大50枚、新しい順）— 初出は
 * Contact ページ（PC）右端だったが、per direct follow-up（"contactから直近
 * 再生はトリで、Aboutの一番下に横位置中央に配置して"）で About 最下部
 * （フッターの上）へ移設。位置は呼び出し側が決める（このコンポーネント自体は
 * 素の in-flow ブロック）。
 *
 * 構成は「Recently Played（見出し）／ジャケット／アーティスト名」の3段 —
 * per direct follow-up（"Recently Playedをジャケの上に移動して、ジャケ下には
 * アーティスト名を入れて"）。アーティスト名はコマ送りに合わせて切り替わる。
 *
 * データ取得は public/recently-played.php（Spotify の
 * /v1/me/player/recently-played をサーバー側で叩くだけのエンドポイント。
 * 認証情報は now-playing.php と共用。詳細はそのファイルの冒頭コメント）。
 * 取得できなければ中身を出さない（枠の高さだけは保つ。下記 hasTracks 参照）
 * ので、スコープ不足やネットワーク不調でもレイアウトが崩れることはない。
 *
 * 画像は全部プリロードしてから回し始める — パラパラの途中で未読み込みの
 * コマに当たると「一瞬空白 → 遅れて出る」になり、Studies のパラパラで
 * 過去に同じ問題を潰したのと同じ理由（studies-center-image.tsx の
 * usePreloadStudyImages 参照）。
 */

type Track = { image: string; artist: string };

/** 開発時だけサーバー上の本物の PHP を見に行く — now-playing-provider.tsx と
 *  同じ理由（Next の dev サーバーは PHP を実行できない）。NODE_ENV は
 *  ビルド時に畳まれるので、本番の成果物にこの URL は残らない。 */
const DEV_ENDPOINT = "https://andmade.jp/recently-played.php";
const ENDPOINT =
  process.env.NODE_ENV === "development" ? DEV_ENDPOINT : withBasePath("/recently-played.php");

/** コマ送りの間隔 — 直接の指示（"0.5秒間隔" → "0.3に変更"）。 */
const FLIP_INTERVAL_MS = 300;

/** ジャケットの一辺 — ヘッダー右上の再生中ホバーで出るジャケットと同じ
 *  110px*scale（header-summon.tsx の同じ値。直接の指示 "ヘッダー右上再生中の
 *  曲にホバーしたときに表示するジャケと同じサイズで"）。 */
const ART_SIZE = "calc(110px*var(--scale))";

/** 見出し（ジャケット上）とアーティスト名（ジャケット下）の共通スタイル。
 *  書体はサイト既定の --font-sans がそのまま Akzidenz Grotesk Next なので
 *  指定不要（globals.css）。12px / regular（いずれも直接の指示）。 */
const LABEL_CLASS =
  "w-full text-center text-[length:calc(12px*var(--scale))] leading-[1.2] font-normal text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
const LABEL_TEXT = "Recently Played";
/** ジャケットと上下のテキストの間隔 — 直接の指示（"ジャケット下12px"）を
 *  上側にも同値で適用。 */
const LABEL_GAP_PX = 12;

export function RecentlyPlayedFlip() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const raw =
          typeof data === "object" && data !== null && Array.isArray((data as { tracks?: unknown }).tracks)
            ? (data as { tracks: unknown[] }).tracks
            : [];
        const list: Track[] = raw.flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const { image, artist } = entry as { image?: unknown; artist?: unknown };
          if (typeof image !== "string" || image === "") return [];
          return [{ image, artist: typeof artist === "string" ? artist : "" }];
        });
        if (cancelled || list.length === 0) return;

        // 全コマをプリロードしてから回し始める（このファイルの doc comment
        // 参照）。decode() まで待つのは、読み込み済みでもデコード前だと
        // 最初の描画でひと呼吸置かれることがあるため。失敗は無視して進む
        // （その1枚だけ空になるより、開始が遅れないほうが実害が小さい）。
        await Promise.all(
          list.map(
            (track) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  img.decode?.().catch(() => {});
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = track.image;
              })
          )
        );
        if (cancelled) return;
        setTracks(list);
      } catch {
        // 取得失敗＝非表示のまま。
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tracks.length === 0) return;
    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % tracks.length;
      setIndex(indexRef.current);
    }, FLIP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tracks.length]);

  // 取得の成否にかかわらず**箱の高さは常に確保する** — per direct follow-up
  // （"aboutページでフッターまで表示されない"）。以前は取得できるまで null を
  // 返して高さゼロにしていたが、そうすると読み込み完了の瞬間にページ全体が
  // 130px ほど伸びる。このサイトのスクロールは Lenis（仮想スクロール）で、
  // 初期化後に document の高さが変わると内部のスクロール上限が古いままに
  // なることがあり、ページ末尾（＝フッター）まで到達できなくなっていた。
  // 箱を最初から実寸で置いておけば高さは一切変化しないので、この問題自体が
  // 起きない。中身（画像とテキスト）だけを出し入れする。
  const hasTracks = tracks.length > 0;
  const gap = `calc(${LABEL_GAP_PX}px * var(--scale))`;

  return (
    <div aria-hidden className="pointer-events-none" style={{ width: ART_SIZE }}>
      <p className={LABEL_CLASS} style={{ marginBottom: gap, visibility: hasTracks ? "visible" : "hidden" }}>
        {LABEL_TEXT}
      </p>

      <div className="relative" style={{ width: ART_SIZE, height: ART_SIZE }}>
        {/* パラパラは transition を持たない素の差し替え（Studies のコマ送りと
           同じ読み味）。全コマを重ねて置き、現在のコマだけ表示する — src を
           書き換える方式だと、プリロード済みでもブラウザによっては差し替えの
           瞬間に一度空になることがある。 */}
        {tracks.map((track, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL（header-summon.tsx と同じ理由）
          <img
            key={track.image + i}
            src={track.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ visibility: i === index ? "visible" : "hidden" }}
          />
        ))}
      </div>

      {/* アーティスト名はコマに追従。長い名前でも**1行に固定**して省略する
         （truncate = overflow hidden + ellipsis）— 折り返すと曲が変わる
         たびに行数＝ページ高さが変わり、Lenis のスクロール上限がずれる
         （上の hasTracks のコメントと同じ問題）。 */}
      <p
        className={`${LABEL_CLASS} truncate`}
        style={{ marginTop: gap, visibility: hasTracks ? "visible" : "hidden" }}
      >
        {tracks[index]?.artist || " "}
      </p>
    </div>
  );
}
