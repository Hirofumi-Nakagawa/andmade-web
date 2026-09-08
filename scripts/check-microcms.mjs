/**
 * microCMS に「今なにが入っているか」をターミナルで確認する。
 *
 * サイトに出ない実績・お知らせ・Studies があるとき、原因が
 *   (a) CMS 側でまだ公開されていない（下書き / 公開予約 / 公開終了）
 *   (b) 取得はできているがコード側の条件で出ていない
 * のどちらなのかを切り分けるためのもの。API が返した生の一覧をそのまま
 * 出すので、ここに出ていなければ (a)、出ているのにサイトに無ければ (b)。
 *
 * microCMS の list API は draftKey を付けない限り**公開中のものしか返さない**
 * ので、このスクリプトの結果はサイトのビルドが見ているものと完全に一致する。
 *
 * 使い方（.env.local が読める場所＝プロジェクト直下で実行すること）:
 *   node scripts/check-microcms.mjs            すべて
 *   node scripts/check-microcms.mjs projects   実績だけ
 *
 * APIキーは読み込むだけで表示しない（設定の有無だけ出す）。
 */

import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const ENDPOINTS = ["projects", "news", "studies"];

/** .env.local の最小パーサ。dotenv を足すほどのものではないので自前。
 *  `KEY=value` の行だけ拾い、コメント行と空行は飛ばす。値のクォートは外す。 */
function readEnvLocal() {
  if (!existsSync(ENV_FILE)) return {};
  const entries = readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      return [key, value];
    });
  return Object.fromEntries(entries);
}

const env = { ...readEnvLocal(), ...process.env };
const serviceDomain = env.MICROCMS_SERVICE_DOMAIN;
const apiKey = env.MICROCMS_API_KEY;

if (!serviceDomain || !apiKey) {
  console.error(
    `${ENV_FILE} から microCMS の設定を読めませんでした。\n` +
      `  MICROCMS_SERVICE_DOMAIN: ${serviceDomain ? "設定あり" : "未設定"}\n` +
      `  MICROCMS_API_KEY: ${apiKey ? "設定あり" : "未設定"}\n` +
      `プロジェクト直下で実行しているか確認してください。`
  );
  process.exit(1);
}

/** 一覧のうち、どのフィールドを1行に出すか。エンドポイントごとに違う。 */
const LABEL = {
  projects: (c) => c.title,
  news: (c) => c.text,
  studies: (c) => c.title ?? c.id,
};

/** 実績詳細ページが生成される条件（lib/projects.ts の buildProjectDetail）。
 *  この5つが**すべて**埋まっていないと detail が undefined になり、詳細ページは
 *  「Full case study coming soon.」のプレースホルダになる（KVもギャラリーも
 *  出ない）。1つでも欠けるとその時点で全部出ないので、どれが欠けているかを
 *  名指しできるようにしておく。 */
const DETAIL_REQUIRED = [
  ["dtlBgColor", "背景色"],
  ["dtlHeroPcImg", "KV(PC)"],
  ["dtlHeroSpImg", "KV(SP)"],
  ["dtlOverviewJa", "Overview 日本語"],
  ["dtlOverviewEn", "Overview 英語"],
];

/** 値が「入っている」と言えるか。画像フィールドはオブジェクトで返り、
 *  url が無いものは未設定と同じ扱い（asMicrocmsImage と同じ判定）。 */
function filled(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Boolean(value.url);
  return true;
}

async function show(endpoint) {
  // projects だけは詳細ページの生成条件も見たいので、判定に要る5つを足す。
  const extra = endpoint === "projects" ? `,${DETAIL_REQUIRED.map(([f]) => f).join(",")},dtlGallery` : "";
  const url =
    `https://${serviceDomain}.microcms.io/api/v1/${endpoint}` +
    `?limit=100&fields=id,title,text,date,createdAt,publishedAt,updatedAt${extra}`;

  let response;
  try {
    response = await fetch(url, { headers: { "X-MICROCMS-API-KEY": apiKey } });
  } catch (error) {
    console.log(`\n[${endpoint}] 通信に失敗しました: ${error.message}`);
    return;
  }

  if (!response.ok) {
    // 404 は「そのエンドポイントがまだ無い」。401/403 はキーの権限。
    console.log(`\n[${endpoint}] ${response.status} ${response.statusText}`);
    return;
  }

  const json = await response.json();
  const contents = json.contents ?? [];
  console.log(`\n[${endpoint}] 公開中 ${json.totalCount} 件`);
  contents.forEach((content, index) => {
    const label = (LABEL[endpoint] ?? ((c) => c.id))(content) ?? "(タイトル未入力)";
    // publishedAt が未来だと「公開予約」で、サイトには出ない。
    const scheduled =
      content.publishedAt && new Date(content.publishedAt) > new Date() ? "  ← 公開予約（未来）" : "";
    console.log(
      `  ${String(index).padStart(2)} ${label}\n` +
        `     id=${content.id} date=${content.date ?? "-"} ` +
        `published=${content.publishedAt ?? "-"} updated=${content.updatedAt ?? "-"}${scheduled}`
    );

    if (endpoint !== "projects") return;
    const missing = DETAIL_REQUIRED.filter(([field]) => !filled(content[field]));
    if (missing.length === 0) {
      const blocks = Array.isArray(content.dtlGallery) ? content.dtlGallery.length : 0;
      console.log(`     詳細ページ: OK（ギャラリー ${blocks} ブロック）`);
    } else {
      console.log(
        `     詳細ページ: 未完成 — 未入力 ${missing.map(([f, ja]) => `${ja}(${f})`).join(" / ")}`
      );
    }
  });
}

const requested = process.argv[2];
const targets = requested ? [requested] : ENDPOINTS;
console.log(`serviceDomain=${serviceDomain}`);
for (const endpoint of targets) await show(endpoint);
