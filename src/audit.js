import crypto from "node:crypto";

const OBJECTIVE_CHECKS = [
  "primary_cta",
  "cta_above_fold",
  "meta_title",
  "meta_description",
  "trust_signal",
  "hero_readable",
];

const SUBJECTIVE_CHECKS = [
  "hero_specific_target_user",
  "hero_concrete_outcome",
  "hero_avoids_generic_claims",
  "cta_matches_intent",
  "painful_alternative",
  "clear_differentiation",
];

const GENERIC_AUDIENCE = [
  "everyone",
  "people",
  "teams",
  "businesses",
  "developers",
  "saas teams",
  "users",
  "companies",
];

const GENERIC_DIFFERENCE = [
  "better",
  "smarter",
  "faster",
  "easier",
  "simpler",
  "more intelligent",
  "more powerful",
  "更好用",
  "更智能",
  "更快",
  "更简单",
];

const JARGON = [
  "platform",
  "solution",
  "infrastructure",
  "workflow",
  "seamless",
  "scalable",
  "end-to-end",
  "all-in-one",
  "ai-powered",
  "next-gen",
  "modern",
  "innovative",
  "leverage",
  "optimize",
];

const CTA_HINTS = [
  "start",
  "try",
  "get",
  "book",
  "join",
  "run",
  "sign up",
  "signup",
  "create",
  "demo",
  "contact",
  "download",
  "buy",
  "subscribe",
  "audit",
];

export function createAuditId() {
  return crypto.randomBytes(8).toString("hex");
}

export function createShareId() {
  return crypto.randomBytes(6).toString("base64url");
}

export function extractPageFromHtml(html, url = "") {
  const cleaned = stripScripts(html);
  const title = decodeEntities(firstMatch(cleaned, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const metaDescription = decodeEntities(
    firstMatch(cleaned, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
      firstMatch(cleaned, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i),
  );
  const h1 = decodeEntities(firstMatch(cleaned, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  const heroHtml = firstMatch(cleaned, /<(header|main|section)[^>]*>([\s\S]{0,5000})<\/\1>/i, 2) || cleaned.slice(0, 5000);
  const heroText = normalizeText(stripTags(h1 || heroHtml).slice(0, 500));
  const bodyText = normalizeText(stripTags(cleaned));
  const ctas = extractCtas(cleaned);

  return {
    url,
    title: normalizeText(title),
    metaDescription: normalizeText(metaDescription),
    hero: normalizeText(h1 || heroText),
    heroText,
    bodyText,
    ctas,
    html: cleaned,
  };
}

export function normalizeManualInput(input) {
  const title = normalizeText(input.title || "");
  const metaDescription = normalizeText(input.metaDescription || "");
  const hero = normalizeText(input.hero || "");
  const ctaText = normalizeText(input.cta || "");
  const sections = normalizeText(input.sections || "");
  const bodyText = normalizeText([hero, ctaText, sections].filter(Boolean).join(" "));

  return {
    url: normalizeText(input.url || ""),
    title,
    metaDescription,
    hero,
    heroText: hero,
    bodyText,
    ctas: ctaText ? [{ text: ctaText, href: "", aboveFold: true }] : [],
    html: "",
  };
}

export function buildInitialAudit(page) {
  return [
    checkPrimaryCta(page),
    checkCtaAboveFold(page),
    checkMetaTitle(page),
    checkMetaDescription(page),
    checkTrustSignal(page),
    checkHeroReadable(page),
    ...SUBJECTIVE_CHECKS.map((id) => ({
      id,
      requires_brief: true,
      status: "locked",
      evidence: "",
      recommendation: "Answer the 3-question brief to unlock this diagnosis.",
    })),
  ];
}

export function validateBrief(rawBrief) {
  const target = validateTargetUser(rawBrief.target_user || "");
  const alternative = validateAlternative(rawBrief.alternative || "");
  const difference = validateDifference(rawBrief.difference || "", rawBrief.alternative || "");

  return {
    target_user: target,
    alternative,
    difference,
  };
}

export function buildSubjectiveAudit(page, brief) {
  const target = brief.target_user.answer;
  const alternative = brief.alternative.answer;
  const difference = brief.difference.answer;
  const hero = page.hero || page.heroText || "";
  const body = page.bodyText || "";
  const ctaText = page.ctas.map((cta) => cta.text).join(" | ");

  return [
    {
      id: "hero_specific_target_user",
      requires_brief: true,
      status: containsTargetUser(hero, target) ? "pass" : "missing",
      evidence: hero ? `Hero: "${truncate(hero, 140)}"` : "No hero text was detected.",
      recommendation: `Name the target user directly, such as "${extractPhrase(target, 7)}".`,
    },
    {
      id: "hero_concrete_outcome",
      requires_brief: true,
      status: hasOutcomeLanguage(hero) ? "pass" : "warning",
      evidence: hero ? `Hero: "${truncate(hero, 140)}"` : "No hero text was detected.",
      recommendation: "State the concrete result users get, not just the product category.",
    },
    {
      id: "hero_avoids_generic_claims",
      requires_brief: true,
      status: countMatches(hero.toLowerCase(), JARGON) <= 1 ? "pass" : "warning",
      evidence: hero ? `Hero uses ${countMatches(hero.toLowerCase(), JARGON)} generic terms.` : "No hero text was detected.",
      recommendation: "Replace broad claims with one specific user, outcome, or mechanism.",
    },
    {
      id: "cta_matches_intent",
      requires_brief: true,
      status: ctaMatchesIntent(ctaText, page, brief) ? "pass" : "warning",
      evidence: ctaText ? `CTA: "${truncate(ctaText, 140)}"` : "No CTA text was detected.",
      recommendation: recommendCta(page, brief),
    },
    {
      id: "painful_alternative",
      requires_brief: true,
      status: containsMeaningfulOverlap(body, alternative) ? "pass" : "missing",
      evidence: containsMeaningfulOverlap(body, alternative)
        ? "The page mentions part of the current alternative."
        : `Alternative from brief: "${truncate(alternative, 140)}"`,
      recommendation: "Explain why the current workaround is slow, costly, risky, or frustrating.",
    },
    {
      id: "clear_differentiation",
      requires_brief: true,
      status: containsMeaningfulOverlap(body, difference) ? "pass" : "warning",
      evidence: `Difference from brief: "${truncate(difference, 140)}"`,
      recommendation: "Make the differentiation visible near the hero or first supporting section.",
    },
  ];
}

export function mergeAuditItems(currentItems, subjectiveItems) {
  const byId = new Map(currentItems.map((item) => [item.id, item]));
  subjectiveItems.forEach((item) => byId.set(item.id, item));
  return [...OBJECTIVE_CHECKS, ...SUBJECTIVE_CHECKS].map((id) => byId.get(id));
}

export function buildRewritePack(page, brief) {
  const target = cleanTarget(brief.target_user.answer);
  const alternative = cleanAlternative(brief.alternative.answer);
  const mechanism = cleanMechanism(brief.difference.answer, brief.alternative.answer);
  const product = inferProductName(page);
  const contextWarnings = Object.entries(brief)
    .filter(([, value]) => value.quality === "weak_after_followup")
    .map(([key]) => `Context for ${key.replace("_", " ")} is still weak; add a more specific answer before shipping.`);

  const hero = {
    outcome_led: ensureContextReference(
      `${product} helps ${target} ${mechanism}.`,
      brief,
    ),
    problem_led: ensureContextReference(
      `Replace ${alternative} with a workflow ${target} can use to ${mechanism}.`,
      brief,
    ),
    category_led: ensureContextReference(
      `${product} is the ${categoryFromBrief(brief)} for ${target}.`,
      brief,
    ),
  };

  const ctaBase = chooseCta(page, brief);
  const cta = {
    outcome_led: {
      primary: ctaBase.primary,
      secondary: "See the before and after",
      microcopy: `Built around ${target}, not a generic template.`,
    },
    problem_led: {
      primary: ctaBase.problemPrimary,
      secondary: "Compare with my current setup",
      microcopy: `Find out what ${alternative} is costing you.`.replace("scripts is", "scripts are"),
    },
    category_led: {
      primary: ctaBase.categoryPrimary,
      secondary: "Explore the workflow",
      microcopy: `A focused option for ${target}.`,
    },
  };

  return {
    paid: true,
    price: 29,
    context_warnings: contextWarnings,
    hero,
    cta,
    before_after: {
      hero_before: page.hero || "No hero detected",
      hero_after_recommended: hero.outcome_led,
      cta_before: page.ctas[0]?.text || "No CTA detected",
      cta_after_recommended: cta.outcome_led.primary,
    },
    markdown: buildMarkdown(page, hero, cta, contextWarnings),
    badge_html: `<a href="#" rel="nofollow" style="font: 13px system-ui; color: #1f2937;">Audited by ShipReady</a>`,
  };
}

export function publicReportPayload(record, share) {
  return {
    id: record.id,
    share_id: share.id,
    source_label: share.sourceLabel,
    created_at: record.createdAt,
    url: record.page.url,
    title: record.page.title,
    hero: record.page.hero,
    items: record.items,
    rewrite: record.rewrite || null,
  };
}

function checkPrimaryCta(page) {
  const ctas = page.ctas.filter((cta) => CTA_HINTS.some((hint) => cta.text.toLowerCase().includes(hint)));
  const status = ctas.length === 1 ? "pass" : ctas.length === 0 ? "missing" : "warning";
  return {
    id: "primary_cta",
    requires_brief: false,
    status,
    evidence: ctas.length ? `Detected CTA candidates: ${ctas.map((cta) => `"${cta.text}"`).slice(0, 4).join(", ")}` : "No clear CTA candidate found.",
    recommendation:
      status === "pass" ? "Keep one primary CTA visually dominant." : "Choose one primary CTA and make secondary actions visually quieter.",
  };
}

function checkCtaAboveFold(page) {
  const aboveFold = page.ctas.some((cta) => cta.aboveFold);
  return {
    id: "cta_above_fold",
    requires_brief: false,
    status: aboveFold ? "pass" : "missing",
    evidence: aboveFold ? `Above-fold CTA: "${page.ctas.find((cta) => cta.aboveFold)?.text}"` : "No CTA was detected in the first screen.",
    recommendation: "Place the primary CTA in the hero so visitors can act without scrolling.",
  };
}

function checkMetaTitle(page) {
  const length = page.title.length;
  return {
    id: "meta_title",
    requires_brief: false,
    status: length > 0 && length <= 60 ? "pass" : length === 0 ? "missing" : "warning",
    evidence: length ? `${length} characters: "${page.title}"` : "No meta title found.",
    recommendation: "Use a specific title under 60 characters with the product name and core promise.",
  };
}

function checkMetaDescription(page) {
  const length = page.metaDescription.length;
  return {
    id: "meta_description",
    requires_brief: false,
    status: length >= 50 && length <= 160 ? "pass" : length === 0 ? "missing" : "warning",
    evidence: length ? `${length} characters: "${page.metaDescription}"` : "No meta description found.",
    recommendation: "Write a 50-160 character description that matches the page promise.",
  };
}

function checkTrustSignal(page) {
  const text = page.bodyText.toLowerCase();
  const hasTrust =
    /\b(trusted by|customers|users|teams|testimonial|case study|featured in|as seen in)\b/i.test(text) ||
    /\b\d{2,}[kKmM+]?\b/.test(text) ||
    /★★★★★|stars|rated/i.test(text);
  return {
    id: "trust_signal",
    requires_brief: false,
    status: hasTrust ? "pass" : "missing",
    evidence: hasTrust ? "Detected social proof language, numbers, ratings, or testimonial markers." : "No trust signal was detected.",
    recommendation: "Add one proof point: customer logo, usage number, testimonial, rating, or credible quote.",
  };
}

function checkHeroReadable(page) {
  const hero = page.hero || "";
  const words = wordCount(hero);
  const jargonCount = countMatches(hero.toLowerCase(), JARGON);
  const status = hero && words <= 20 && jargonCount <= 2 ? "pass" : hero ? "warning" : "missing";
  return {
    id: "hero_readable",
    requires_brief: false,
    status,
    evidence: hero ? `${words} words, ${jargonCount} jargon terms: "${truncate(hero, 140)}"` : "No hero headline detected.",
    recommendation: "Keep the hero under 20 words and replace stacked jargon with concrete nouns.",
  };
}

function validateTargetUser(answer) {
  const normalized = normalizeText(answer);
  const lower = normalized.toLowerCase();
  const weak =
    normalized.length < 20 ||
    (GENERIC_AUDIENCE.some((term) => lower === term || lower.includes(term)) && !hasSpecificQualifier(normalized));
  return {
    answer: normalized,
    quality: weak ? "weak" : "good",
    follow_up_used: false,
    follow_up: weak ? "再具体一点:是哪类人在什么场景下最痛?" : "",
  };
}

function validateAlternative(answer) {
  const normalized = normalizeText(answer);
  const lower = normalized.toLowerCase();
  const tooVague = ["手动做", "manual", "excel", "chatgpt"].includes(lower);
  const hasToolOrVerb = /[A-Z][A-Za-z0-9]+|notion|excel|sheets|airflow|zapier|slack|email|chatgpt|cursor|webflow|framer|copy|paste|export|import|sync|write|build|track|review|手动|复制|粘贴|导出|同步|填写|检查/i.test(normalized);
  const weak = normalized.length < 15 || tooVague || !hasToolOrVerb;
  return {
    answer: normalized,
    quality: weak ? "weak" : "good",
    follow_up_used: false,
    follow_up: weak ? "他们具体打开什么工具、做什么动作、花在哪里最久?" : "",
  };
}

function validateDifference(answer, alternative) {
  const normalized = normalizeText(answer);
  const lower = normalized.toLowerCase();
  const onlyGeneric = GENERIC_DIFFERENCE.some((term) => lower === term || lower.includes(term)) && normalized.length < 40;
  const referencesAlternative = containsMeaningfulOverlap(normalized, alternative);
  const hasMechanism = /without|instead|unlike|while|needs?|requires?|automates?|generates?|replaces?|one person|self-serve|flat fee|一次|自动|生成|替代|不需要|不用|相比|他们|我们/i.test(normalized);
  const weak = onlyGeneric || (!referencesAlternative && !hasMechanism) || normalized.length < 15;
  return {
    answer: normalized,
    quality: weak ? "weak" : "good",
    follow_up_used: false,
    follow_up: weak ? "不要写比较级。请说清楚:他们的方案怎么运作,你的方案怎么不一样。" : "",
  };
}

export function applyBriefFollowUp(previous, field, answer) {
  const next = structuredClone(previous);
  const validator = field === "target_user" ? validateTargetUser : field === "alternative" ? validateAlternative : (value) => validateDifference(value, next.alternative.answer);
  const validated = validator(answer);
  next[field] = {
    answer: validated.answer,
    quality: validated.quality === "good" ? "good" : "weak_after_followup",
    follow_up_used: true,
    follow_up: "",
  };
  return next;
}

function extractCtas(html) {
  const matches = [...html.matchAll(/<(a|button)[^>]*(?:href=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/\1>/gi)];
  return matches
    .map((match) => ({
      text: normalizeText(stripTags(match[3])),
      href: match[2] || "",
      aboveFold: match.index < 5000,
    }))
    .filter((cta) => cta.text && cta.text.length <= 45)
    .slice(0, 12);
}

function stripScripts(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeText(value) {
  return decodeEntities(stripTags(value)).replace(/\s+/g, " ").trim();
}

function firstMatch(value, regex, group = 1) {
  const match = String(value || "").match(regex);
  return match ? match[group] || "" : "";
}

function truncate(value, max) {
  const text = normalizeText(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function wordCount(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function countMatches(value, terms) {
  return terms.filter((term) => value.includes(term)).length;
}

function hasSpecificQualifier(value) {
  return /\b(when|who|with|without|at|for|in|early|solo|indie|b2b|ai|seed|series|founder|manager|operator|engineer|marketer|creator)\b|\d|的|在|负责|阶段|场景/i.test(value);
}

function containsMeaningfulOverlap(source, target) {
  const sourceLower = normalizeText(source).toLowerCase();
  const tokens = keywords(target);
  return tokens.some((token) => sourceLower.includes(token.toLowerCase()));
}

function containsTargetUser(source, target) {
  const sourceLower = normalizeText(source).toLowerCase();
  const tokens = keywords(target);
  const roleTokens = tokens.filter((token) =>
    /founder|developer|engineer|lead|manager|marketer|creator|operator|analyst|designer|team|company|agency|startup|开发|工程|负责人|创始|设计|营销|团队|公司/i.test(token),
  );
  const matched = tokens.filter((token) => sourceLower.includes(token.toLowerCase()));
  return matched.length >= 2 || roleTokens.some((token) => sourceLower.includes(token.toLowerCase()));
}

function keywords(value) {
  return normalizeText(value)
    .split(/[^A-Za-z0-9\u4e00-\u9fa5]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 || /[\u4e00-\u9fa5]{2,}/.test(token))
    .filter((token) => !["with", "that", "they", "this", "from", "have", "your", "their", "using"].includes(token.toLowerCase()))
    .slice(0, 8);
}

function extractPhrase(value, maxWords) {
  const text = normalizeText(value);
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

function hasOutcomeLanguage(value) {
  return /\b(save|increase|reduce|ship|launch|find|generate|convert|automate|sync|track|close|publish|learn|discover|提升|减少|生成|发布|自动|转化|发现|同步)\b/i.test(value);
}

function ctaMatchesIntent(ctaText, page, brief) {
  const text = ctaText.toLowerCase();
  if (!text) return false;
  if (/demo|sales|enterprise|book/.test(text) && /enterprise|b2b|sales|team|procurement/i.test(brief.target_user.answer)) return true;
  if (/free|try|start|run|audit|join|waitlist/.test(text)) return true;
  return page.ctas.length === 1;
}

function recommendCta(page, brief) {
  const lower = `${page.bodyText} ${brief.target_user.answer} ${brief.difference.answer}`.toLowerCase();
  if (/waitlist|beta|coming soon|prelaunch/.test(lower)) return "Use a waitlist CTA and say what happens after joining.";
  if (/audit|diagnos|report|score/.test(lower)) return "Use an action-oriented diagnostic CTA like \"Run a free audit\".";
  if (/enterprise|sales|procurement|b2b/.test(lower)) return "Use a demo CTA and support it with a lower-commitment secondary CTA.";
  return "Use a low-friction product CTA like \"Start free\" or \"Try it now\".";
}

function inferProductName(page) {
  const title = page.title || "";
  const first = title.split(/[|–—-]/)[0]?.trim();
  if (first && first.length <= 32) return first;
  try {
    const host = new URL(page.url).hostname.replace(/^www\./, "");
    return host.split(".")[0].replace(/^\w/, (char) => char.toUpperCase());
  } catch {
    return "This product";
  }
}

function outcomeFromDifference(difference) {
  const text = normalizeText(difference).replace(/\.$/, "");
  if (!text) return "move faster";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function categoryFromBrief(brief) {
  const diff = brief.difference.answer.toLowerCase();
  if (/audit|diagnos|report/.test(diff)) return "landing page audit layer";
  if (/sync|data|pipeline|dag|airflow/.test(diff)) return "self-serve data sync workflow";
  if (/autom/.test(diff)) return "automation workflow";
  if (/flat|once|一次|lifetime/.test(diff)) return "fixed-price alternative";
  return "focused alternative";
}

function chooseCta(page, brief) {
  const text = `${page.bodyText} ${brief.difference.answer} ${brief.target_user.answer}`.toLowerCase();
  if (/waitlist|coming soon|beta/.test(text)) {
    return { primary: "Join the waitlist", problemPrimary: "Skip the workaround", categoryPrimary: "Get early access" };
  }
  if (/audit|report|diagnos/.test(text)) {
    return { primary: "Run a free audit", problemPrimary: "Find what is leaking", categoryPrimary: "See my report" };
  }
  if (/enterprise|sales|procurement|b2b/.test(text)) {
    return { primary: "Book a demo", problemPrimary: "See the better workflow", categoryPrimary: "Talk to sales" };
  }
  return { primary: "Start free", problemPrimary: "Replace the manual workflow", categoryPrimary: "Try the new way" };
}

function cleanTarget(value) {
  return extractPhrase(value, 9).replace(/\bcompanies\b/i, "teams");
}

function cleanAlternative(value) {
  const text = normalizeText(value)
    .replace(/^(they|users|teams|people)\s+/i, "")
    .replace(/^(currently\s+)?(use|uses|using|maintain|maintains|rely on|relying on|open|copy|paste)\s+/i, "")
    .replace(/\s+to\s+.+$/i, "")
    .replace(/\.$/, "");
  return extractPhrase(text || value, 7);
}

function cleanMechanism(difference, alternative) {
  let text = normalizeText(difference).replace(/\.$/, "");
  const semicolonPart = text.split(";").pop()?.trim();
  if (semicolonPart && semicolonPart.length >= 12) text = semicolonPart;
  text = text
    .replace(/^[A-Z][A-Za-z0-9]+\s+(helps|lets|allows|enables)\s+/i, "")
    .replace(/^(we|it|this product)\s+(helps|lets|allows|enables)\s+/i, "")
    .replace(/^(analysts|users|teams|founders|developers|marketers|operators|designers|engineers)\s+/i, "")
    .replace(/\bwithout code\b/i, "without code");
  if (/configure|sync|generate|audit|automate|replace|publish|launch|find|discover/i.test(text)) {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }
  const alt = cleanAlternative(alternative);
  return `move beyond ${alt}`;
}

function ensureContextReference(text, brief) {
  const reference = [brief.target_user.answer, brief.alternative.answer, brief.difference.answer].some((value) => containsMeaningfulOverlap(text, value));
  return reference ? text : `${text} Built for ${extractPhrase(brief.target_user.answer, 6)}.`;
}

function buildMarkdown(page, hero, cta, warnings) {
  const lines = [
    `# Landing Page Rewrite`,
    ``,
    `## Original Hero`,
    page.hero || "No hero detected.",
    ``,
    `## Recommended Hero`,
    hero.outcome_led,
    ``,
    `## CTA`,
    `Primary: ${cta.outcome_led.primary}`,
    `Secondary: ${cta.outcome_led.secondary}`,
    `Microcopy: ${cta.outcome_led.microcopy}`,
  ];
  if (warnings.length) {
    lines.push("", "## Context Warnings", ...warnings.map((warning) => `- ${warning}`));
  }
  return lines.join("\n");
}
