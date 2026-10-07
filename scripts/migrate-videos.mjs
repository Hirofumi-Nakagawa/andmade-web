/**
 * 動画の配信元を Cloudinary から別のホスト（Cloudflare R2）へ移すための補助。
 *
 * このサイトの動画は microCMS の**テキスト項目に貼った直リンク**でしかない
 * （microCMS の File 項目が有料プラン限定のため）。つまり移行は
 *
 *   1. CMS に入っている URL を全部集める      … このスクリプトの `list`
 *   2. その実ファイルを手元に落とす            … このスクリプトの `download`
 *   3. 新しい置き場へアップロードする          … R2 の管理画面にドラッグ＆ドロップ
 *   4. CMS の URL を書き換える                 … このスクリプトの `rewrite`
 *
 * という4手で済む。コード側の変更は不要。
 *
 * ファイル名は Cloudinary のものをそのまま使う。同じ名前で置けば、URL の
 * 違いは「先頭のホスト部分だけ」になり、4の書き換えが単純な前方一致の
 * 置換で済む（取り違えが起きない）。
 *
 * 使い方（.env.local が読める場所＝プロジェクト直下で実行すること）:
 *   node scripts/migrate-videos.mjs list
 *   node scripts/migrate-videos.mjs download
 *   node scripts/migrate-videos.mjs rewrite --dry
 *   node scripts/migrate-videos.mjs rewrite
 *
 * `rewrite` は microCMS を書き換えるので、必ず --dry で差分を確認してから
 * 実行すること。書き込みには管理用の API キー（PATCH 権限）が要る:
 *   MICROCMS_WRITE_API_KEY=...   （.env.local に追記。読み取り用とは別物）
 *
 * APIキーは読み込むだけで表示しない。
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = ".env.local";
/** 落とした実ファイルの置き場。ここから R2 へアップロードする。
 *  リポジトリには入れないこと（.gitignore 済みか確認）。 */
const DOWNLOAD_DIR = "media-migration";
/** 新しい配信元。R2 のカスタムドメインが Active になってから使う。 */
const NEW_BASE = "https://media.andmade.jp";
/** 置き換える対象。Cloudinary の配信 URL は
 *  https://res.cloudinary.com/<cloud>/video/upload/v<数字>/<ファイル名>
 *  の形なので、ファイル名より前をまとめて捨てる。 */
const CLOUDINARY_RE = /https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/[^"'\s]*?\/([^/"'\s]+\.(?:mp4|webm|mov))/gi;

/** 動画 URL が入りうる microCMS の項目（lib/projects.ts / lib/studies.ts の
 *  各 doc comment 参照）。トップレベルの項目と、`dtlGallery` 繰り返し項目の
 *  中の項目に分かれる。 */
const ENDPOINTS = [
  { endpoint: "projects", fields: ["previewVideo", "previewVideoSp"], repeat: { field: "dtlGallery", fields: ["video", "video1", "video2"] } },
  { endpoint: "studies", fields: ["video"] },
];

function readEnvLocal() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
}

const env = { ...readEnvLocal(), ...process.env };
const serviceDomain = env.MICROCMS_SERVICE_DOMAIN;
const apiKey = env.MICROCMS_API_KEY;
const writeKey = env.MICROCMS_WRITE_API_KEY;

if (!serviceDomain || !apiKey) {
  console.error(`${ENV_FILE} から microCMS の設定を読めませんでした。プロジェクト直下で実行していますか。`);
  process.exit(1);
}

const api = (path) => `https://${serviceDomain}.microcms.io/api/v1/${path}`;

async function fetchAll(endpoint) {
  const response = await fetch(api(`${endpoint}?limit=100`), { headers: { "X-MICROCMS-API-KEY": apiKey } });
  if (!response.ok) {
    console.log(`[${endpoint}] ${response.status} ${response.statusText} — 取得できないので飛ばします`);
    return [];
  }
  return (await response.json()).contents ?? [];
}

/** 1件のコンテンツから「どの項目に、どの Cloudinary URL が入っているか」を
 *  平らに取り出す。rewrite はこの位置情報を使って書き戻す。 */
function findUrls(content, spec) {
  const hits = [];
  for (const field of spec.fields) {
    const value = typeof content[field] === "string" ? content[field].trim() : "";
    if (value && value.includes("res.cloudinary.com")) hits.push({ path: field, url: value });
  }
  if (spec.repeat && Array.isArray(content[spec.repeat.field])) {
    content[spec.repeat.field].forEach((item, index) => {
      for (const field of spec.repeat.fields) {
        const value = typeof item?.[field] === "string" ? item[field].trim() : "";
        if (value && value.includes("res.cloudinary.com")) {
          hits.push({ path: `${spec.repeat.field}[${index}].${field}`, url: value, repeatIndex: index, repeatField: field });
        }
      }
    });
  }
  return hits;
}

/** Cloudinary がアップロード時に付けるランダムな接尾辞。
 *  `yatsumonji-top-mv_sl9ajr.mp4` の `_sl9ajr` の部分で、ファイル名の意味に
 *  関係しない。R2 へ移すときに外した（実際に R2 上の11本で規則を確認済み）。
 *
 *  5文字以上を条件にしてあるのは、`college8_mv_kih2jg.mp4` のように元の
 *  名前自体がアンダースコアを含む場合に、`_mv` まで巻き込んで削らない
 *  ようにするため（→ 正しく `college8_mv.mp4` になる）。 */
const CLOUDINARY_SUFFIX_RE = /_[a-z0-9]{5,10}(\.[a-z0-9]+)$/i;

/** 接尾辞を外したあと、さらに個別に名前を変えたファイルの対応表。
 *  キー＝接尾辞を外した名前、値＝R2 に実際に置いた名前。
 *  `logo-mv` は名前だけでは何の動画か分からないので Circus のものと
 *  分かるようにした、という経緯（直接の指示）。 */
const RENAMES = {
  "logo-mv.mp4": "circus-logo-mv.mp4",
};

/** Cloudinary の URL から、R2 側に置いたファイル名を決める。 */
function fileNameOf(url) {
  const stripped = originalFileNameOf(url).replace(CLOUDINARY_SUFFIX_RE, "$1");
  return RENAMES[stripped] ?? stripped;
}

/** Cloudinary 側のファイル名そのまま（接尾辞あり）。download で使う。 */
function originalFileNameOf(url) {
  CLOUDINARY_RE.lastIndex = 0;
  const match = CLOUDINARY_RE.exec(url);
  return match ? match[1] : url.split("/").pop();
}

/** 書き換え先の URL が本当に存在するか確かめる。
 *  CMS に死んだ URL を書き込んでしまうと、どの実績の動画が消えたのか
 *  後から追うのが大変なので、rewrite の前に必ず全件通す。
 *
 *  HEAD だけに頼らない。ブラウザからは全件読めるのに Node の HEAD では
 *  全件失敗する、という状態に実際に遭遇したため（HEAD の扱いか IPv6 の
 *  選択あたりが原因）。先頭1バイトだけを GET する方法でも試し、どちらかが
 *  通れば「ある」と判断する。失敗したときは理由も返して、原因が分かる
 *  ようにしておく。 */
async function probeUrl(url) {
  const attempts = [
    { method: "HEAD" },
    { method: "GET", headers: { Range: "bytes=0-0" } },
  ];
  let lastReason = "";
  for (const init of attempts) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status === 206) return { ok: true };
      lastReason = `HTTP ${response.status}`;
    } catch (error) {
      lastReason = String(error?.cause?.message ?? error?.message ?? error).slice(0, 120);
    }
  }
  return { ok: false, reason: lastReason };
}

async function collect() {
  const rows = [];
  for (const spec of ENDPOINTS) {
    for (const content of await fetchAll(spec.endpoint)) {
      for (const hit of findUrls(content, spec)) {
        rows.push({
          endpoint: spec.endpoint,
          id: content.id,
          title: content.title ?? content.id,
          ...hit,
          file: fileNameOf(hit.url),
          original: originalFileNameOf(hit.url),
        });
      }
    }
  }
  return rows;
}

async function cmdList() {
  const rows = await collect();
  const files = new Set(rows.map((r) => r.file));
  for (const row of rows) {
    const renamed = row.file === row.original ? "" : `  （R2 では ${row.file}）`;
    console.log(`${row.endpoint}/${row.id}  ${row.path}\n    ${row.title}\n    ${row.original}${renamed}`);
  }
  console.log(`\n参照 ${rows.length} 箇所 / 実ファイル ${files.size} 本`);
  if (files.size !== rows.length) console.log("（同じファイルを複数箇所から参照しているものがあります）");
}

async function cmdDownload() {
  const rows = await collect();
  const byFile = new Map(rows.map((r) => [r.original, r.url]));
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  let done = 0;
  let total = 0;
  for (const [file, url] of byFile) {
    const dest = join(DOWNLOAD_DIR, file);
    if (existsSync(dest)) {
      console.log(`skip  ${file}（取得済み）`);
      total += statSync(dest).size;
      done += 1;
      continue;
    }
    process.stdout.write(`get   ${file} ... `);
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`失敗 ${response.status}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(dest, buffer);
    total += buffer.length;
    done += 1;
    console.log(`${(buffer.length / 1048576).toFixed(1)}MB`);
  }
  console.log(`\n${done}/${byFile.size} 本、合計 ${(total / 1048576).toFixed(1)}MB を ${DOWNLOAD_DIR}/ に保存しました。`);
  console.log(`次は この中身を R2 のバケット（andmade-media）へアップロードしてください。`);
}

/**
 * microCMS から読み取った値を、そのまま書き戻せる形に直す。
 *
 * 画像フィールドは読み取り時 `{url, width, height}` のオブジェクトで返るが、
 * 書き込み時は URL の文字列しか受け付けない。繰り返しフィールド
 * （dtlGallery）を丸ごと送り直すとこの差で配列全体が弾かれる
 * （`'dtlGallery' has unexpected data type.`）。
 *
 * 対象は「url を持つオブジェクト」だけ。それ以外（select の配列、
 * テキスト、fieldId など）は触らない。
 */
function toWritable(value) {
  if (Array.isArray(value)) return value.map(toWritable);
  if (value && typeof value === "object") {
    if (typeof value.url === "string") return value.url;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toWritable(v)]));
  }
  return value;
}

/** 書き戻した結果が、狙った箇所以外を壊していないかの照合用。
 *  画像の表現差（オブジェクト/文字列）を吸収してから比べる。 */
function normalized(value) {
  return JSON.stringify(toWritable(value));
}

async function cmdRewrite(dryRun) {
  if (!dryRun && !writeKey) {
    console.error("MICROCMS_WRITE_API_KEY が未設定です。書き込み権限のある API キーを .env.local に追加してください。");
    process.exit(1);
  }
  const rows = await collect();

  // 先に全部の移行先 URL を実在確認する。1本でも欠けていたら、CMS には
  // 一切触れずに止める（中途半端に書き換わった状態がいちばん困るため）。
  const targets = [...new Set(rows.map((r) => `${NEW_BASE}/${r.file}`))];
  if (process.argv.includes("--skip-verify")) {
    console.log(`実在確認を飛ばします（--skip-verify）。移行先 ${targets.length} 本。\n`);
  } else {
    console.log(`移行先 ${targets.length} 本の実在を確認しています...`);
    const missing = [];
    for (const url of targets) {
      const result = await probeUrl(url);
      if (!result.ok) missing.push({ url, reason: result.reason });
    }
    if (missing.length > 0) {
      console.error(`\n次の ${missing.length} 本を確認できませんでした。`);
      for (const item of missing) console.error(`  ${item.url}\n      ${item.reason}`);
      if (missing.length === targets.length) {
        console.error(
          "\n全件失敗しています。ファイルが無いのではなく、この環境から " +
            "media.andmade.jp に届いていない可能性が高いです（DNS の反映待ち、" +
            "社内ネットワーク、IPv6 など）。ブラウザで上記 URL を開いて再生できるなら、" +
            "--skip-verify を付けて実行して構いません。"
        );
      } else {
        console.error("\nアップロード漏れか名前違いです。");
      }
      console.error("\n中断しました。CMS は変更していません。");
      process.exit(1);
    }
    console.log("すべて存在を確認しました。\n");
  }

  // 1コンテンツに複数箇所ある場合があるので、コンテンツ単位にまとめて1回で送る。
  const byContent = new Map();
  for (const row of rows) {
    const key = `${row.endpoint}/${row.id}`;
    if (!byContent.has(key)) byContent.set(key, { endpoint: row.endpoint, id: row.id, title: row.title, hits: [] });
    byContent.get(key).hits.push(row);
  }

  const succeeded = [];
  const failed = [];

  for (const entry of byContent.values()) {
    const spec = ENDPOINTS.find((s) => s.endpoint === entry.endpoint);
    const body = {};
    let repeat = null;
    for (const hit of entry.hits) {
      const next = `${NEW_BASE}/${hit.file}`;
      console.log(`${entry.endpoint}/${entry.id}  ${hit.path}\n    ${hit.url}\n -> ${next}`);
      if (hit.repeatIndex === undefined) {
        body[hit.path] = next;
      } else {
        // 繰り返し項目は配列まるごと送り直す必要があるので、元の配列を複製して
        // 該当要素だけ差し替える。
        if (!repeat) {
          const response = await fetch(api(`${entry.endpoint}/${entry.id}`), { headers: { "X-MICROCMS-API-KEY": apiKey } });
          repeat = structuredClone((await response.json())[spec.repeat.field] ?? []);
        }
        repeat[hit.repeatIndex][hit.repeatField] = next;
      }
    }
    if (repeat) body[spec.repeat.field] = toWritable(repeat);
    if (dryRun) continue;
    const response = await fetch(api(`${entry.endpoint}/${entry.id}`), {
      method: "PATCH",
      headers: { "X-MICROCMS-API-KEY": writeKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      // 狙った動画URL以外が壊れていないか、書き戻した直後に読み直して照合する。
      // 繰り返しフィールドは丸ごと送り直しているので、ここを確認しないと
      // ギャラリーの画像や並びが欠けていても気づけない。
      let verdict = "更新しました";
      if (repeat) {
        const after = await fetch(api(`${entry.endpoint}/${entry.id}`), {
          headers: { "X-MICROCMS-API-KEY": apiKey },
        }).then((r) => r.json());
        if (normalized(after[spec.repeat.field]) !== normalized(repeat)) {
          verdict = "更新しましたが、ギャラリーの内容が送った値と一致しません。CMS を確認してください";
          failed.push({ id: `${entry.endpoint}/${entry.id}`, title: entry.title, status: "照合NG", text: "" });
        }
      }
      if (!verdict.startsWith("更新しましたが")) succeeded.push(`${entry.endpoint}/${entry.id}`);
      console.log(`    ${verdict}`);
    } else {
      const text = (await response.text()).slice(0, 300);
      failed.push({ id: `${entry.endpoint}/${entry.id}`, title: entry.title, status: response.status, text });
      console.log(`    失敗 ${response.status} ${text}`);
    }
  }

  if (dryRun) {
    console.log("\n--dry なので何も書き換えていません。");
    return;
  }
  // 1件でも失敗したら、それが埋もれないよう最後にまとめ直して非ゼロで終わる。
  console.log(`\n成功 ${succeeded.length} 件 / 失敗 ${failed.length} 件`);
  if (failed.length > 0) {
    console.log("\n失敗したもの:");
    for (const f of failed) console.log(`  ${f.id}  ${f.title}\n      ${f.status} ${f.text}`);
    console.log("\n書き換えは途中までです。原因を直してからもう一度実行してください（成功済みのものは list に出なくなります）。");
    process.exitCode = 1;
    return;
  }
  console.log("書き換え完了。ビルドし直すとサイトに反映されます。");
}

const command = process.argv[2];
if (command === "list") await cmdList();
else if (command === "download") await cmdDownload();
else if (command === "rewrite") await cmdRewrite(process.argv.includes("--dry"));
else {
  console.log("使い方: node scripts/migrate-videos.mjs <list|download|rewrite [--dry]>");
  process.exit(1);
}
