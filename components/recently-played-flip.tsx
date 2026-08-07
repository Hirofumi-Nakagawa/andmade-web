"use client";

import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * Contact ページ（PC）右端の「直近再生した曲のジャケット」パラパラ表示 —
 * per direct follow-up（添付レイアウト "pcのcontactページの右端24pxの位置で、
 * 英語3行の上面にそろえて直近の曲ジャケットを50枚順に0.5秒間隔でパラパラと
 * アニメーションで切り替えて表示して"）。
 *
 * データ取得は public/recently-played.php（Spotify の
 * /v1/me/player/recently-played をサーバー側で叩くだけのエンドポイント。
 * 認証情報は now-playing.php と共用。詳細はそのファイルの冒頭コメント）。
 * 取得できなければ何も描かない（枠も出さない）ので、スコープ不足やネット
 * ワーク不調でもレイアウトが崩れることはない。
 *
 * 画像は全部プリロードしてから回し始める — パラパラの途中で未読み込みの
 * コマに当たると「一瞬空白 → 遅れて出る」になり、Studies のパラパラで
 * 過去に同じ問題を潰したのと同じ理由（studies-center-image.tsx の
 * usePreloadStudyImages 参照）。
 */

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

/** 置き場所の基準となる、親（Contact の英語3行ブロック）の左端。
 *  このコンポーネントは Contact 専用で、その親は必ず
 *  ml-[calc(198px*var(--grid-scale))] のコンテンツ左端に揃っている。
 *
 *  `right: 24px` で済ませないのは、親が flex-col + items-start の子で
 *  「内容幅」しか持たない（3行英文の実測幅で、ページのコンテンツ幅ではない）
 *  ため — right は親の右端＝テキストの右端からの距離になってしまい、画面
 *  右端 24px に来なかった（per direct follow-up "ジャケットの表示位置が画面
 *  右マージン24pxの位置に表示されてない"）。親の幅に一切依存しないよう、
 *  ビューポート幅から逆算した left で置く。 */
const PARENT_LEFT = "198px * var(--grid-scale)";
/** 画面右端からのマージン — 直接の指示（"画面右端24px"）。 */
const RIGHT_INSET = "24px";

/** ジャケット下のキャプション — 直接の指示（"ジャケット下12pxの位置に
 *  「Recently Played」をAkzidenz-Grotesk Nextのmediumで中央揃えで配置"）。
 *  書体はサイト既定の --font-sans がそのまま Akzidenz Grotesk Next なので
 *  指定不要（globals.css）。サイズはヘッダーの Playing 表示と同じ 12px。
 *  12px は trim 済みの文字下端からの距離にしたいので、キャプション側に
 *  text-box-trim を効かせたうえで mt で開ける。 */
const CAPTION_TEXT = "Recently Played";
const CAPTION_GAP_PX = 12;

export function RecentlyPlayedFlip() {
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const list =
          typeof data === "object" && data !== null && Array.isArray((data as { images?: unknown }).images)
            ? ((data as { images: unknown[] }).images.filter((u) => typeof u === "string") as string[])
            : [];
        if (cancelled || list.length === 0) return;

        // 全コマをプリロードしてから回し始める（このファイルの doc comment
        // 参照）。decode() まで待つのは、読み込み済みでもデコード前だと
        // 最初の描画でひと呼吸置かれることがあるため。失敗は無視して進む
        // （その1枚だけ空になるより、開始が遅れないほうが実害が小さい）。
        await Promise.all(
          list.map(
            (src) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  img.decode?.().catch(() => {});
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = src;
              })
          )
        );
        if (cancelled) return;
        setImages(list);
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
    if (images.length === 0) return;
    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % images.length;
      setIndex(indexRef.current);
    }, FLIP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0"
      style={{
        left: `calc(100vw - ${PARENT_LEFT} - ${RIGHT_INSET} - ${ART_SIZE})`,
        width: ART_SIZE,
        height: ART_SIZE,
      }}
    >
      {/* パラパラは transition を持たない素の差し替え（Studies のコマ送りと
         同じ読み味）。全コマを重ねて置き、現在のコマだけ表示する — src を
         書き換える方式だと、プリロード済みでもブラウザによっては差し替えの
         瞬間に一度空になることがある。 */}
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL（header-summon.tsx と同じ理由）
        <img
          key={src + i}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ visibility: i === index ? "visible" : "hidden" }}
        />
      ))}
      {/* キャプション（CAPTION_TEXT の doc comment 参照）。top-full +
         mt でジャケット下端から 12px、w-full + text-center でジャケット幅に
         対して中央揃え。 */}
      <p
        className="absolute top-full left-0 w-full text-center text-[length:calc(12px*var(--scale))] leading-[1.2] font-medium whitespace-nowrap text-[#fff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={{ marginTop: `calc(${CAPTION_GAP_PX}px * var(--scale))` }}
      >
        {CAPTION_TEXT}
      </p>
    </div>
  );
}
