"use client";

import { useSyncExternalStore } from "react";
import { PageBodyBackground } from "@/components/page-body-background";
import { ABOUT_SETTLE_COLORS } from "@/components/about-blend-background";
import {
  getAboutGradient,
  getAboutGradientServerSnapshot,
  subscribeAboutGradient,
} from "@/lib/about-gradient-store";

/**
 * About ページの `<html>`/`<body>` 背景色（＝ページ下端のオーバースクロール
 * 時にゴムのように見える領域）を、**選ばれている背景バリアントの収束色**に
 * 合わせる。
 *
 * 以前は app/about/page.tsx が色を直接書いていた（#438ed0 = バリアント1の
 * 収束色）。背景が3種から選べるようになったので固定値では合わなくなる —
 * 2 を選んでフッターまでスクロールすると、画面はクリームなのにオーバー
 * スクロール領域だけ青が出る。
 *
 * 色そのものは about-blend-background.tsx が持っている（シェーダーの定数と
 * 同じ定義から出ている）ので、こちらは選択を読んで渡すだけ。
 */
export function AboutBodyBackground() {
  const variant = useSyncExternalStore(subscribeAboutGradient, getAboutGradient, getAboutGradientServerSnapshot);
  return <PageBodyBackground color={ABOUT_SETTLE_COLORS[variant - 1]} />;
}
