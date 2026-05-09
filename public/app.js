let currentAudit = null;

const form = document.querySelector("#audit-form");
const briefForm = document.querySelector("#brief-form");
const auditList = document.querySelector("#audit-list");
const reportSubtitle = document.querySelector("#report-subtitle");
const reportState = document.querySelector("#report-state");
const scrapeNote = document.querySelector("#scrape-note");
const paywall = document.querySelector("#paywall");
const rewritePack = document.querySelector("#rewrite-pack");
const unlockButton = document.querySelector("#unlock-button");
const briefWarnings = document.querySelector("#brief-warnings");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(form, true);
  try {
    const manualOpen = document.querySelector("#manual-details").open;
    const payload = manualOpen
      ? {
          mode: "manual",
          manual: manualPayload(),
        }
      : {
          mode: "url",
          url: document.querySelector("#url-input").value,
          manual: manualPayload(),
        };
    currentAudit = await api("/api/audit", payload);
    renderAudit(currentAudit);
    briefForm.classList.remove("hidden");
    paywall.classList.add("hidden");
    rewritePack.classList.add("hidden");
    if (!currentAudit.scrape.ok) {
      scrapeNote.textContent = currentAudit.scrape.message;
      scrapeNote.classList.remove("hidden");
      document.querySelector("#manual-details").open = true;
    } else {
      scrapeNote.classList.add("hidden");
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(form, false);
  }
});

briefForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentAudit) return;
  setBusy(briefForm, true);
  try {
    currentAudit = await api("/api/brief", {
      audit_id: currentAudit.id,
      brief: {
        target_user: document.querySelector("#brief-target").value,
        alternative: document.querySelector("#brief-alternative").value,
        difference: document.querySelector("#brief-difference").value,
      },
    });
    renderBriefWarnings(currentAudit.brief);
    renderAudit(currentAudit);
    if (Object.values(currentAudit.brief).every((value) => value.quality === "good" || value.quality === "weak_after_followup")) {
      paywall.classList.remove("hidden");
    } else {
      paywall.classList.add("hidden");
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(briefForm, false);
  }
});

unlockButton.addEventListener("click", async () => {
  if (!currentAudit) return;
  unlockButton.disabled = true;
  unlockButton.textContent = "Unlocking...";
  try {
    currentAudit = await api("/api/rewrite", { audit_id: currentAudit.id });
    renderRewrite(currentAudit);
  } catch (error) {
    showError(error.message);
  } finally {
    unlockButton.disabled = false;
    unlockButton.textContent = "Unlock rewrite pack";
  }
});

function manualPayload() {
  return {
    url: document.querySelector("#url-input").value,
    hero: document.querySelector("#manual-hero").value,
    cta: document.querySelector("#manual-cta").value,
    title: document.querySelector("#manual-title").value,
    metaDescription: document.querySelector("#manual-description").value,
    sections: document.querySelector("#manual-sections").value,
  };
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderAudit(audit) {
  auditList.classList.remove("empty");
  reportState.textContent = audit.brief ? "Full audit" : "Needs context";
  reportSubtitle.textContent = audit.page.title || audit.page.url || "Manual page audit";
  auditList.innerHTML = audit.items.map(renderAuditItem).join("");
}

function renderAuditItem(item) {
  return `<article class="audit-item">
    <div class="audit-name">
      <span>${labelFor(item.id)}</span>
      <span class="status ${item.status}">${item.status}</span>
    </div>
    <div class="audit-copy">
      <p class="evidence">${escapeHtml(item.evidence || "No evidence yet.")}</p>
      <p class="recommendation">${escapeHtml(item.recommendation || "")}</p>
    </div>
  </article>`;
}

function renderBriefWarnings(brief) {
  const weak = Object.entries(brief)
    .filter(([, value]) => value.quality !== "good")
    .map(([key, value]) => ({ key, ...value }));

  if (!weak.length) {
    briefWarnings.classList.add("hidden");
    briefWarnings.innerHTML = "";
    return;
  }

  briefWarnings.classList.remove("hidden");
  briefWarnings.innerHTML = weak
    .map((item) => {
      const label = item.key.replace("_", " ");
      if (item.quality === "weak") {
        return `<div class="follow-up" data-field="${item.key}">
          <strong>${label} needs detail.</strong>
          <p>${escapeHtml(item.follow_up || "Add a more specific answer.")}</p>
          <textarea rows="2" placeholder="Add a sharper answer"></textarea>
          <button class="secondary" type="button">Submit follow-up</button>
        </div>`;
      }
      return `<div><strong>${label} is still weak.</strong> The rewrite will mark this as context-limited.</div>`;
    })
    .join("");

  briefWarnings.querySelectorAll(".follow-up button").forEach((button) => {
    button.addEventListener("click", async () => {
      const wrapper = button.closest(".follow-up");
      const answer = wrapper.querySelector("textarea").value;
      button.disabled = true;
      try {
        currentAudit = await api("/api/brief/follow-up", {
          audit_id: currentAudit.id,
          field: wrapper.dataset.field,
          answer,
        });
        renderBriefWarnings(currentAudit.brief);
        renderAudit(currentAudit);
        if (Object.values(currentAudit.brief).every((value) => value.quality === "good" || value.quality === "weak_after_followup")) {
          paywall.classList.remove("hidden");
        }
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderRewrite(audit) {
  const rewrite = audit.rewrite;
  paywall.classList.add("hidden");
  rewritePack.classList.remove("hidden");
  rewritePack.innerHTML = `
    <div class="section-head">
      <h2>Rewrite Pack</h2>
      <p>Unlocked. These variants cite your brief context instead of writing generic copy.</p>
    </div>
    ${rewrite.context_warnings.length ? `<div class="warning-list">${rewrite.context_warnings.map(escapeHtml).join("<br>")}</div>` : ""}
    <div class="rewrite-grid">
      ${rewriteCard("Outcome-led", rewrite.hero.outcome_led)}
      ${rewriteCard("Problem-led", rewrite.hero.problem_led)}
      ${rewriteCard("Category-led", rewrite.hero.category_led)}
    </div>
    <div class="rewrite-grid">
      ${ctaCard("Outcome CTA", rewrite.cta.outcome_led)}
      ${ctaCard("Problem CTA", rewrite.cta.problem_led)}
      ${ctaCard("Category CTA", rewrite.cta.category_led)}
    </div>
    <div class="actions">
      <button class="secondary" data-copy="markdown">Copy Markdown</button>
      <button class="secondary" data-share="self">Create public report</button>
      <button class="secondary" data-copy="badge">Copy badge HTML</button>
    </div>
  `;

  rewritePack.querySelector('[data-copy="markdown"]').addEventListener("click", () => copyText(rewrite.markdown));
  rewritePack.querySelector('[data-copy="badge"]').addEventListener("click", () => copyText(rewrite.badge_html));
  rewritePack.querySelector("[data-share]").addEventListener("click", createShare);
}

function rewriteCard(title, text) {
  return `<article class="rewrite-card"><h3>${title}</h3><p>${escapeHtml(text)}</p><button class="secondary" type="button" onclick="navigator.clipboard.writeText(${JSON.stringify(text)})">Copy</button></article>`;
}

function ctaCard(title, value) {
  return `<article class="rewrite-card">
    <h3>${title}</h3>
    <p><strong>Primary:</strong> ${escapeHtml(value.primary)}</p>
    <p><strong>Secondary:</strong> ${escapeHtml(value.secondary)}</p>
    <p><strong>Microcopy:</strong> ${escapeHtml(value.microcopy)}</p>
  </article>`;
}

async function createShare() {
  const data = await api("/api/share", {
    audit_id: currentAudit.id,
    source_label: "self",
  });
  const absolute = `${location.origin}${data.public_url}`;
  await copyText(absolute);
  showError(`Public report created and copied: ${absolute}`, false);
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
  showError("Copied to clipboard.", false);
}

function setBusy(scope, busy) {
  scope.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

function showError(message, isError = true) {
  scrapeNote.textContent = message;
  scrapeNote.classList.remove("hidden");
  scrapeNote.style.background = isError ? "#ffebe8" : "#eff8f4";
  scrapeNote.style.borderColor = isError ? "#ffc4bd" : "#b7d8cf";
}

function labelFor(id) {
  const labels = {
    primary_cta: "One clear primary CTA",
    cta_above_fold: "CTA above the fold",
    meta_title: "Meta title length",
    meta_description: "Meta description length",
    trust_signal: "Trust signal",
    hero_readable: "Hero readable in 5 seconds",
    hero_specific_target_user: "Hero names target user",
    hero_concrete_outcome: "Hero states concrete outcome",
    hero_avoids_generic_claims: "Hero avoids generic claims",
    cta_matches_intent: "CTA matches intent",
    painful_alternative: "Painful alternative explained",
    clear_differentiation: "Clear differentiation",
  };
  return labels[id] || id;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
