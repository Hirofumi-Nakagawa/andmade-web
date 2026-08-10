import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

// タイトルを「404 - ANDMADE Inc.」に — per direct follow-up ("404のページ
// タイトルを「404 - ANDMADE Inc.」に変更")。中身（旧 app/not-found.tsx）は
// idle フェード等で client component のため metadata を export できず、
// この server wrapper に分離してここから title を出す（テンプレート
// "%s - ANDMADE Inc." は app/layout.tsx 由来）。
export const metadata: Metadata = {
  title: "404",
  // noindex + canonical の打ち消し — per direct follow-up (Search Console
  // の「代替ページ（適切な canonical タグあり）」報告)。この 404 ページは
  // root layout の alternates.canonical ("/") を継承していたため、存在
  // しない URL（旧サイトの /projects や /about など）がすべて「トップが
  // 正規」と宣言する HTML を返し、Google に「代替ページ」として分類されて
  // いた。エラーページは canonical を持たず、インデックス対象外が正しい。
  // alternates は Next のメタデータ継承で丸ごと置換される（app/contact/
  // page.tsx の同趣旨のコメント参照）ので、canonical: null で確実に消す。
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function NotFound() {
  return <NotFoundView />;
}
