/** Static copy for the About page (app/about/page.tsx) — sourced from Figma
 *  (node 520:1628, "about" frame). Bilingual (JP/EN) throughout, matching
 *  that design's two-column layout: Japanese in Gen Interface JP Light,
 *  English in the site's default sans (Akzidenz Grotesk Next) at 50% black. */

export type AboutSectionId = "vision" | "approach" | "services" | "awards" | "media" | "outline";

export const ABOUT_NAV_ITEMS: { id: AboutSectionId; label: string }[] = [
  { id: "vision", label: "Vision" },
  { id: "approach", label: "Approach" },
  { id: "services", label: "Services" },
  { id: "awards", label: "Awards" },
  { id: "media", label: "Media" },
  { id: "outline", label: "Outline" },
];

/**
 * Prefixes an ABOUT_NAV_ITEMS id for the SP tree's own section/anchor ids.
 * PC's AboutSection and SP's MobileAboutSection both render *simultaneously*
 * in the DOM (app/about/page.tsx splits them via a plain `hidden lg:contents`
 * / `lg:hidden` CSS toggle, not real conditional mounting) — using the same
 * bare id on both collided: `document.getElementById`/anchor `href="#id"`
 * navigation return the *first* match in DOM order regardless of `display`,
 * which is always PC's own element (rendered first in app/about/page.tsx) —
 * even on a phone, where it's `display:none` and so has no layout box at all
 * (its own `getBoundingClientRect()` is all zeros). mobile-about-side-nav.tsx's
 * own IntersectionObserver and tap-to-scroll both silently targeted that
 * invisible, zero-size PC element instead of the real, currently-visible SP
 * section — reported as the SP side nav neither scrolling to the right place
 * nor ever highlighting the active section. This prefix keeps SP's own ids
 * distinct from PC's, applied consistently by both mobile-about.tsx (each
 * MobileAboutSection's own `id` prop) and mobile-about-side-nav.tsx (every
 * `document.getElementById`/`href` call) so they never drift apart.
 */
export function spSectionId(id: AboutSectionId): string {
  return `sp-${id}`;
}

export const VISION_JA = [
  "ANDMADE（アンドメイド）は、企業やブランド、製品のブランディングに関わるウェブサイトやデジタル施策のUI設計から、ビジュアルコミュニケーションにおけるグラフィックデザインまで、包括的にアートディレクションとデザインを手掛けるデザインスタジオです。",
  "明確な美意識と高い視座を持って課題解決に取り組み、クライアントに寄り添いながらモノづくりをする「共創」のスタンスでビジョンを具現化し、未来への方向性を形にしていきます。",
  "また、企業やブランドの魅力を最大限に引き出すために考察し、新たな価値を生み出すことは、クライアントをはじめとするチーム全員のクリエイティブを加速させ、次の可能性を切り拓くことにつながると信じています。変化の激しい時代だからこそ、一時的な流行や表層的なアウトプットではなく、時間を経ても価値が残るデザインと体験を生み出していくこと、それがANDMADEの目指すクリエイティブです。",
];

export const VISION_EN = [
  "ANDMADE is a design studio providing comprehensive art direction and design, from UI design for websites and digital brand experiences to graphic design for visual communication, helping shape the identity of companies, brands, and products.",
  "Guided by a clear aesthetic vision and a thoughtful perspective, we approach every challenge through close collaboration with our clients. By embracing a spirit of co-creation, we transform ideas into tangible experiences and help define meaningful directions for the future.",
  "We believe that uncovering the true strengths of a brand and creating new value not only elevates the brand itself, but also inspires everyone involved in the process, opening the door to new possibilities. In a rapidly changing world, our goal is to create design and experiences that endure—work that goes beyond passing trends or surface-level aesthetics to deliver lasting value.",
];

export const APPROACH_JA = [
  "課題やビジョンの本質を見極め、複雑に絡み合った要素をシンプルな視点へと再定義し、表面的なアウトプットだけでなく、その背景にある思想や目的まで丁寧に整理しながら、ブランドにとって本当に必要な方向性を導き出していきます。",
  "そして、既存の枠組みにとらわれない柔軟な発想を取り入れながら、戦略・体験・ビジュアルを横断したアプローチで、長く価値が続くデザインをつくります。クライアントと対話を重ねながら共に思考し、細部まで一貫した視点で形にしていきます。",
];

export const APPROACH_EN = [
  "We begin by identifying the essence of each challenge and vision, distilling complex ideas into a clear perspective. Looking beyond surface-level outputs, we carefully clarify the thinking, intentions, and purpose behind a brand to define the direction that truly matters.",
  "By embracing ideas unconstrained by convention, we take a holistic approach that spans strategy, experience, and visual design to create work with lasting value. Through close collaboration and continuous dialogue with our clients, we shape every detail with clarity, consistency, and purpose.",
];

// bodyJa/bodyEn are arrays of paragraphs (not a single string) — per Figma
// node 520:1636 ("Guiding Principles"): principle 1's body is two separate
// lines (each its own <p>, no gap between beyond the natural 1.7 leading —
// see paragraphTrimClass in app/about/page.tsx, the same convention
// BilingualBody there already uses), while principles 2-4 are a single line
// each. Kept as arrays uniformly (rather than string | string[]) so the
// renderer doesn't need two separate code paths.
export type GuidingPrinciple = {
  titleJa: string;
  bodyJa: string[];
  /** SP-only line-break override for bodyJa: PC and SP share this same
   *  array (about-section.tsx / mobile-about.tsx), but the intended break
   *  points are SP-specific, so this is an *optional* override rendered only
   *  by mobile-about.tsx (falls back to `bodyJa` when absent) — PC keeps
   *  reading `bodyJa` directly, unaffected. */
  bodyJaSp?: string[];
  titleEn: string;
  bodyEn: string[];
  /** SP-only line-break override for bodyEn — see `bodyJaSp` above. */
  bodyEnSp?: string[];
};

// Text content and the "1."-"4." numbering (see app/about/page.tsx, which
// derives the number from this array's own index) match Figma node 520:1636
// exactly.
export const GUIDING_PRINCIPLES: GuidingPrinciple[] = [
  {
    titleJa: "答えをつくる前に、問いを理解する。",
    bodyJa: [
      "デザインを形づくる前に、まず物事を理解することを大切にしています。",
      "課題の背景にある目的や価値観を紐解きながら、ブランドが本当に向き合うべき本質を見極めます。",
    ],
    titleEn: "Find the Essence",
    bodyEn: ["Before creating, we begin by understanding.", "We uncover what truly matters to a brand."],
  },
  {
    titleJa: "複雑さの中から、明快さを導き出す。",
    bodyJa: ["多様な情報や考えを整理し、ブランドの本質をわかりやすく伝えます。"],
    bodyJaSp: ["多様な情報や考えを整理し、", "ブランドの本質をわかりやすく伝えます。"],
    titleEn: "Create Clarity",
    bodyEn: ["We bring clarity to complexity, revealing the essence of a brand."],
    bodyEnSp: ["We bring clarity to complexity,", "revealing the essence of a brand."],
  },
  {
    titleJa: "点在する要素を、一つの体験へつなぐ。",
    bodyJa: ["言葉やビジュアル、体験を一つの考え方でつなぎ、一貫した世界観を構築します。"],
    titleEn: "Connect Everything",
    bodyEn: ["We connect language, visuals, and experiences through a shared vision."],
    bodyEnSp: ["We connect language, visuals, and", "experiences through a shared vision."],
  },
  {
    titleJa: "時間とともに育つ価値をつくる。",
    bodyJa: ["一時的な流行ではなく、長く愛され、機能し続けるデザインを目指しています。"],
    bodyJaSp: ["一時的な流行ではなく、長く愛され、", "機能し続けるデザインを目指しています。"],
    titleEn: "Design for Longevity",
    bodyEn: ["We create designs that endure beyond trends."],
  },
];

export const SERVICES_COL_1 = ["Creative & Art Direction", "Graphic Design", "Interface Design", "APP Design", "Web Development"];
export const SERVICES_COL_2 = ["Branding", "Brand Identity", "Design System", "Naming", "Strategy"];

export const AWARDS_COL_1 = [
  "Web Grand Prix 2025 / Excellence Award",
  "Web Grand Prix 2024 / Grand Prize",
  "Awwwards / SOTD",
  "CSSDA / WOTD",
  "FWA / FOTD",
  "Good Design Awards 2019",
];
export const AWARDS_COL_2 = [
  "ADFEST 2018",
  "Code Awards 2018",
  "ACC Tokyo Creativity Awards 2018",
  "Web Grand Prix 2018 / Grand Prize",
  "Japan Media Arts Festival vol.22",
];

/** `linked` items render as an <a> with the same underline-sweep hover
 *  treatment as the project list's titles (project-card.tsx). `href` is
 *  left undefined until real URLs are supplied — the link still renders
 *  (with a `#` target) in the meantime. */
export type MediaItem = { text: string; linked?: boolean; href?: string };

export const MEDIA_COL_1: MediaItem[] = [
  { text: "The Art Director's Guide to Design", linked: true },
  { text: "iDID Works Interview", linked: true },
  { text: "MdN Designers File 2026", linked: true },
  { text: "Rough Sketch of Art Director & Desginer 250", linked: true },
];
export const MEDIA_COL_2: MediaItem[] = [
  { text: "MdN Designers File 2025", linked: true },
  { text: "Web Designing" },
  { text: "Brain" },
];

/** `href` renders the value as an underlined link (Figma node 520:1725's
 *  "Related Projects" / "Nauts™" entry) instead of plain text. */
export type OutlineEntry = { label: string; value: string; href?: string };

export const OUTLINE_COL_1: OutlineEntry[] = [
  { label: "Name", value: "ANDMADE Inc." },
  { label: "Founder", value: "Hirofumi Nakagawa" },
  { label: "Established", value: "Sep. 1, 2017" },
];
export const OUTLINE_COL_2: OutlineEntry[] = [
  { label: "Office", value: "Tokyo (Coming Soon)" },
  { label: "Related Projects", value: "Nauts™", href: "https://nauts.co.jp/" },
];
