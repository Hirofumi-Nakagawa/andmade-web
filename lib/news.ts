import { getMicrocmsClient } from "@/lib/microcms";

/** Max number of news items ever shown on the top page's FV. */
const MAX_NEWS_ITEMS = 2;

export type NewsItem = {
  id: string;
  /** "Aug.20,2026" — formatted from microCMS's own system `publishedAt`
   *  field (see formatNewsDate below) rather than a separate custom date
   *  field, so ordering ("latest 2") and display both come from the exact
   *  same single value with no risk of the two ever disagreeing. */
  date: string;
  /** The announcement text itself (Figma: "Our new website is now live.",
   *  "Featured in an interview by iDID."). */
  text: string;
  /** When set, `text` renders as an underlined link out to this URL instead
   *  of plain text (matches Figma's own second example entry, which is
   *  underlined where the first isn't) — optional per-entry, not every news
   *  item needs to link anywhere. */
  url: string | null;
};

type NewsCmsContent = {
  text: string;
  url?: string;
};

/**
 * Placeholder content straight from Figma (node 1090:70/1090:71/1090:74),
 * shown only until a real microCMS "news" endpoint exists.
 * Same placeholder-now/CMS-later shape lib/projects.ts's own
 * projectsWithoutPreviewRatio and lib/studies.ts's own PLACEHOLDER_TITLES
 * use. Only ever returned when `getMicrocmsClient()` itself is `null` (i.e.
 * microCMS isn't configured yet at all) — once MICROCMS_SERVICE_DOMAIN/
 * MICROCMS_API_KEY are set and a real "news" endpoint exists, this stops
 * being reachable entirely, even if that endpoint is genuinely empty (that
 * case still correctly resolves to `[]` below, honoring "入力が無い場合は
 * 非表示" for real, intentional emptiness — this placeholder is only a
 * stand-in for "not wired up yet," not a permanent fallback). */
const PLACEHOLDER_NEWS: NewsItem[] = [
  { id: "placeholder-1", date: "Aug.20,2026", text: "Our new website is now live.", url: null },
  {
    id: "placeholder-2",
    date: "Aug.20,2026",
    text: "Featured in an interview by iDID.",
    // Figma's own second example entry renders underlined (i.e. a link) —
    // no real target given in the design, so this points nowhere in
    // particular yet; swap for the real interview URL once one exists.
    url: "#",
  },
];

/** "Aug.20,2026" — matches Figma's own exact date format (node 1090:70:
 *  "Aug.20,2026"): abbreviated month, no space before the day, comma before
 *  a full 4-digit year, no space after the comma either. Intentionally not
 *  reusing Intl.DateTimeFormat's own built-in styles here — none of them
 *  produce this exact "Mon.D,YYYY" shape (closest built-ins either add a
 *  space after the month or before the year). */
const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatNewsDate(isoDate: string): string {
  const date = new Date(isoDate);
  const month = MONTH_ABBREVIATIONS[date.getMonth()];
  return `${month}.${date.getDate()},${date.getFullYear()}`;
}

/**
 * The top page's FV-right "recent news" list (Figma node 1090:70) — per
 * direct request ("トップのFV右側に最近のお知らせを追加したいので...管理
 * 画面で入力できるようにする。最大2件。入力が無い場合は非表示。2件以上あ
 * る場合は最新2件だけ表示"): editable from the microCMS admin dashboard (a
 * "news" endpoint — list API, one content = one announcement), capped at the
 * 2 most recent (by microCMS's own `publishedAt`). Returns PLACEHOLDER_NEWS
 * (Figma's own two example entries) while microCMS itself isn't configured
 * yet — see getMicrocmsClient's own doc comment, and PLACEHOLDER_NEWS's own
 * comment for why that's *only* while unconfigured, not a permanent
 * fallback — or an empty array, never throwing, if the "news" endpoint
 * doesn't exist yet or the request fails for any other reason.
 * components/recent-news.tsx renders nothing at all when this resolves
 * empty, satisfying "入力が無い場合は非表示" for free — no separate "is
 * this configured" flag needed anywhere downstream.
 *
 * Expected microCMS "news" endpoint shape (list API) — set this up in the
 * microCMS admin dashboard:
 *   - `text` (text field, required) — the announcement itself.
 *   - `url` (text field, optional) — if filled in, the announcement renders
 *     as a link out to this URL; left blank, it renders as plain text.
 *   - `publishedAt` (microCMS's own built-in field) — doubles as both the
 *     displayed date and the sort key ("latest 2").
 */
export async function getRecentNews(): Promise<NewsItem[]> {
  const client = getMicrocmsClient();
  if (!client) return PLACEHOLDER_NEWS;

  try {
    const response = await client.getList<NewsCmsContent>({
      endpoint: "news",
      queries: { limit: MAX_NEWS_ITEMS, orders: "-publishedAt" },
    });

    return response.contents.map((content) => ({
      id: content.id,
      date: formatNewsDate(content.publishedAt ?? content.createdAt),
      text: content.text,
      url: content.url?.trim() ? content.url : null,
    }));
  } catch {
    // Covers both "the 'news' endpoint doesn't exist yet" (a 404 from
    // microCMS) and any genuine network/auth failure alike — either way,
    // the FV should just quietly show nothing rather than error.
    return [];
  }
}
