import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

// タイトルを「404 - ANDMADE Inc.」に — per direct follow-up ("404のページ
// タイトルを「404 - ANDMADE Inc.」に変更")。中身（旧 app/not-found.tsx）は
// idle フェード等で client component のため metadata を export できず、
// この server wrapper に分離してここから title を出す（テンプレート
// "%s - ANDMADE Inc." は app/layout.tsx 由来）。
export const metadata: Metadata = {
  title: "404",
};

export default function NotFound() {
  return <NotFoundView />;
}
