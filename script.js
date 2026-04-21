    const STORAGE_KEY = "research_progress_portal_v3";
    const LEGACY_KEYS = ["research_progress_portal_v3","research_progress_portal_v2","research_progress_portal_v1"];
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    const defaultState = {
      projects: [],
      worklog: [],
      runs: [],
      findings: [],
      blockers: [],
      ideas: [],
      reviews: [],
      todayTodos: []
    };
    const SEARCH_SCOPES = [
      { id: "all", label: "All" },
      { id: "projects", label: "Projects" },
      { id: "logs", label: "Work Log" },
      { id: "runs", label: "Runs" },
      { id: "context", label: "Context" },
      { id: "reviews", label: "Reviews" },
      { id: "todos", label: "To-Do" }
    ];
    const FEEDBACK_FORM_URL = "https://forms.gle/QvEvu24T7opV4GJ28";

    let activeTab = "dashboard";
    let selectedProjectId = "";
    let activeContextTab = "findings";
    let contextProjectId = "";
    const filters = { worklog: "", runs: "" };
    let projectPanelResizeObserver = null;
    let searchScope = "all";
    let searchQuery = "";
    let searchActiveIndex = -1;
    let searchResultsCache = [];
    let searchLastFocused = null;
    let quickCaptureType = "worklog";
    let quickCaptureLastFocused = null;
    const quickCaptureDrafts = {};
    let confirmResolver = null;
    let confirmLastFocused = null;
    let activeRunsTab = "runs";
    let runCompareLeftId = "";
    let runCompareRightId = "";
    let state = loadState();
    ensureSelectedProject();
    ensureContextProject();
    attachEvents();
    renderTodayDate();
    renderAll();
    resetInitialScroll();

    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
    function uid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }
    function esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    function todayISO() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    function nowFilenameStamp() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      const sec = String(d.getSeconds()).padStart(2, "0");
      return `${y}-${m}-${day}_${h}-${min}-${sec}`;
    }
    function nowISO() {
      return new Date().toISOString();
    }
    function renderTodayDate() {
      const badge = document.getElementById("todayDateBadge");
      if (!badge) return;
      const today = new Date();
      badge.textContent = today.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      });
    }
    function resetInitialScroll() {
      const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      scrollToTop();
      window.requestAnimationFrame(scrollToTop);
      window.addEventListener("pageshow", scrollToTop, { once: true });
    }
    function fmtDate(dateStr) {
      if (!dateStr) return "—";
      const d = new Date(dateStr + "T00:00:00");
      if (Number.isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    function fmtDateTime(dateTimeStr) {
      if (!dateTimeStr) return "—";
      const d = new Date(dateTimeStr);
      if (Number.isNaN(d.getTime())) return dateTimeStr;
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }
    function recordLoggedAt(record) {
      return String(record?.loggedAt || record?.createdAt || "").trim();
    }
    function loggedLine(record) {
      const loggedAt = recordLoggedAt(record);
      return loggedAt ? `<p class="muted"><strong>Logged:</strong> ${esc(fmtDateTime(loggedAt))}</p>` : '';
    }
    function normalizeLoggedRecord(record = {}, dateKey = "date") {
      return {
        ...record,
        [dateKey]: String(record?.[dateKey] || "").trim(),
        loggedAt: recordLoggedAt(record)
      };
    }
    function normalizeIdeaRecord(record = {}) {
      const createdAt = String(record?.createdAt || record?.loggedAt || "").trim();
      return {
        ...record,
        date: String(record?.date || "").trim(),
        createdAt,
        loggedAt: String(record?.loggedAt || createdAt).trim()
      };
    }
    function sortByLoggedDesc(arr, fallbackKey = "date") {
      return [...arr].sort((a, b) =>
        recordLoggedAt(b).localeCompare(recordLoggedAt(a))
        || String(b?.[fallbackKey] || "").localeCompare(String(a?.[fallbackKey] || ""))
        || String(b?.id || "").localeCompare(String(a?.id || ""))
      );
    }
    function daysUntil(dateStr) {
      if (!dateStr) return null;
      const today = new Date();
      today.setHours(0,0,0,0);
      const target = new Date(dateStr + "T00:00:00");
      if (Number.isNaN(target.getTime())) return null;
      return Math.round((target - today) / 86400000);
    }
    function projectDeadlineDate(project) {
      return project?.deadlineDate || project?.deadline || "";
    }
    function projectEndDate(project) {
      return project?.endDate || "";
    }
    function projectCollaborators(project) {
      return String(project?.collaborators || "").trim();
    }
    function projectUpdatedAt(project) {
      return String(project?.updatedAt || project?.createdAt || "").trim();
    }
    function projectTargetDate(project) {
      return projectDeadlineDate(project) || "";
    }
    function normalizedProjectStatus(status, endDate) {
      const nextStatus = String(status || "");
      if (endDate) return "Completed";
      return nextStatus === "Completed" ? "Active" : nextStatus;
    }
    function resolvedProjectEndDate(previousStatus, nextStatus, endDate) {
      const movedOutOfCompleted = String(previousStatus || "") === "Completed" && String(nextStatus || "") !== "Completed";
      return movedOutOfCompleted ? "" : projectEndDate({ endDate });
    }
    function isCompletedProject(project) {
      return String(project?.status || "") === "Completed";
    }
    function projectDirectorySort(a, b) {
      const aCompleted = isCompletedProject(a);
      const bCompleted = isCompletedProject(b);
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      return (b.createdAt || "").localeCompare(a.createdAt || "") || (b.id || "").localeCompare(a.id || "");
    }
    function topProjectId() {
      return [...state.projects].sort(projectDirectorySort)[0]?.id || "";
    }
    function normalizeProject(project = {}) {
      const deadlineDate = projectDeadlineDate(project);
      const rawEndDate = projectEndDate(project);
      const collaborators = projectCollaborators(project);
      const createdAt = String(project?.createdAt || "");
      const updatedAt = projectUpdatedAt(project);
      const status = normalizedProjectStatus(project.status, rawEndDate);
      return {
        ...project,
        deadlineDate,
        endDate: status === "Completed" ? rawEndDate : "",
        collaborators,
        updatedAt,
        status,
        createdAt
      };
    }
    function normalizeProjects(projects = []) {
      const fallbackBase = Date.UTC(2020, 0, 1);
      return projects.map((project, index) => {
        const normalized = normalizeProject(project);
        if (normalized.createdAt) {
          return normalized.updatedAt ? normalized : { ...normalized, updatedAt: normalized.createdAt };
        }
        const fallbackCreatedAt = new Date(fallbackBase + index * 1000).toISOString();
        return {
          ...normalized,
          createdAt: fallbackCreatedAt,
          updatedAt: normalized.updatedAt || fallbackCreatedAt
        };
      });
    }
    function loadState() {
      for (const key of LEGACY_KEYS) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const loaded = {
            ...clone(defaultState),
            ...parsed,
            projects: Array.isArray(parsed.projects) ? normalizeProjects(parsed.projects) : [],
            worklog: Array.isArray(parsed.worklog) ? parsed.worklog.map(item => normalizeLoggedRecord(item, "date")) : [],
            runs: Array.isArray(parsed.runs) ? parsed.runs.map(item => normalizeLoggedRecord(item, "date")) : [],
            findings: Array.isArray(parsed.findings) ? parsed.findings.map(item => normalizeLoggedRecord(item, "date")) : [],
            blockers: Array.isArray(parsed.blockers) ? parsed.blockers.map(item => normalizeLoggedRecord(item, "date")) : [],
            ideas: Array.isArray(parsed.ideas) ? parsed.ideas.map(normalizeIdeaRecord) : [],
            reviews: Array.isArray(parsed.reviews) ? parsed.reviews.map(item => normalizeLoggedRecord(item, "weekOf")) : [],
            todayTodos: Array.isArray(parsed.todayTodos) ? parsed.todayTodos : []
          };
          delete loaded.runTemplates;
          return loaded;
        } catch (e) {
          continue;
        }
      }
      return clone(defaultState);
    }
    function saveState(message) {
      state.projects = normalizeProjects(state.projects);
      delete state.runTemplates;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      ensureSelectedProject();
      ensureContextProject();
      renderAll();
      if (message) showToast(message);
    }
    function ensureSelectedProject() {
      if (state.projects.some(p => p.id === selectedProjectId)) return;
      selectedProjectId = topProjectId();
    }
    function ensureContextProject() {
      if (state.projects.some(p => p.id === contextProjectId)) return;
      contextProjectId = "";
    }
    function showToast(text) {
      const toast = document.getElementById("toast");
      toast.textContent = text;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
    }
    function syncModalBodyState() {
      const searchOpen = !document.getElementById("searchModal")?.hidden;
      const quickCaptureOpen = !document.getElementById("quickCaptureModal")?.hidden;
      const confirmOpen = !document.getElementById("confirmModal")?.hidden;
      document.body.classList.toggle("modal-open", searchOpen || quickCaptureOpen || confirmOpen);
    }
    function normalizeSearchText(value) {
      return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    }
    function previewSearchText(value, max = 180) {
      const text = String(value ?? "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      return text.length > max ? `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...` : text;
    }
    function searchScopeLabel(scopeId) {
      return SEARCH_SCOPES.find(scope => scope.id === scopeId)?.label || "All";
    }
    function searchTypeLabel(type) {
      return ({
        project: "Project",
        worklog: "Work log",
        run: "Run",
        review: "Review",
        idea: "Idea",
        finding: "Finding",
        blocker: "Blocker",
        todo: "To-do"
      })[type] || "Record";
    }
    function makeSearchRecord({
      type,
      scope,
      id,
      title = "",
      subtitle = "",
      body = "",
      projectId = "",
      sortKey = "",
      dateLabel = ""
    }) {
      const cleanTitle = String(title || searchTypeLabel(type)).trim() || searchTypeLabel(type);
      const cleanSubtitle = String(subtitle || "").trim();
      const bodyText = String(body || "").replace(/\s+/g, " ").trim();
      return {
        key: `${type}:${id}`,
        type,
        scope,
        id,
        projectId,
        typeLabel: searchTypeLabel(type),
        title: cleanTitle,
        subtitle: cleanSubtitle,
        preview: previewSearchText(bodyText),
        dateLabel: String(dateLabel || "").trim(),
        sortKey: String(sortKey || "").trim(),
        titleText: normalizeSearchText(cleanTitle),
        subtitleText: normalizeSearchText(cleanSubtitle),
        bodyText: normalizeSearchText(bodyText),
        searchText: normalizeSearchText([cleanTitle, cleanSubtitle, bodyText, searchTypeLabel(type)].join(" "))
      };
    }
    function buildSearchRecords() {
      const records = [];

      state.projects.forEach(project => {
        const updatedAt = projectUpdatedAt(project);
        records.push(makeSearchRecord({
          type: "project",
          scope: "projects",
          id: project.id,
          projectId: project.id,
          title: project.title || "Untitled project",
          subtitle: [project.area, project.status, project.priority ? `${project.priority} priority` : ""].filter(Boolean).join(" | "),
          body: [
            project.collaborators,
            project.notes,
            project.startDate ? `Started ${fmtDate(project.startDate)}` : "",
            projectDeadlineDate(project) ? `Deadline ${fmtDate(projectDeadlineDate(project))}` : "",
            projectEndDate(project) ? `Completed ${fmtDate(projectEndDate(project))}` : ""
          ].filter(Boolean).join(" "),
          sortKey: updatedAt || project.createdAt || "",
          dateLabel: updatedAt ? `Updated ${fmtDateTime(updatedAt)}` : ""
        }));
      });

      state.worklog.forEach(entry => {
        records.push(makeSearchRecord({
          type: "worklog",
          scope: "logs",
          id: entry.id,
          projectId: entry.projectId,
          title: entry.objective || entry.outcome || `${fmtDate(entry.date)} ${entry.type || "Work log"}`,
          subtitle: [projectName(entry.projectId), entry.date ? fmtDate(entry.date) : "", entry.type || "", `${Number(entry.hours || 0).toFixed(2)} h`].filter(Boolean).join(" | "),
          body: [entry.objective, entry.outcome, entry.nextStep].filter(Boolean).join(" "),
          sortKey: recordLoggedAt(entry) || entry.date || "",
          dateLabel: entry.date ? fmtDate(entry.date) : ""
        }));
      });

      state.runs.forEach(entry => {
        records.push(makeSearchRecord({
          type: "run",
          scope: "runs",
          id: entry.id,
          projectId: entry.projectId,
          title: entry.title || `${entry.kind || "Run"} entry`,
          subtitle: [projectName(entry.projectId), entry.date ? fmtDate(entry.date) : "", entry.kind || "", entry.status || ""].filter(Boolean).join(" | "),
          body: [entry.tool, entry.inputs, entry.parameters, entry.summary, entry.location, entry.nextStep].filter(Boolean).join(" "),
          sortKey: recordLoggedAt(entry) || entry.date || "",
          dateLabel: entry.date ? fmtDate(entry.date) : ""
        }));
      });

      state.findings.forEach(entry => {
        records.push(makeSearchRecord({
          type: "finding",
          scope: "context",
          id: entry.id,
          projectId: entry.projectId,
          title: hasText(entry.category) ? entry.category : "Finding",
          subtitle: [projectName(entry.projectId), entry.date ? fmtDate(entry.date) : "", entry.impact ? `${entry.impact} impact` : ""].filter(Boolean).join(" | "),
          body: [entry.summary, entry.nextStep].filter(Boolean).join(" "),
          sortKey: recordLoggedAt(entry) || entry.date || "",
          dateLabel: entry.date ? fmtDate(entry.date) : ""
        }));
      });

      state.ideas.forEach(entry => {
        records.push(makeSearchRecord({
          type: "idea",
          scope: "context",
          id: entry.id,
          projectId: entry.projectId,
          title: entry.title || "Idea",
          subtitle: [projectName(entry.projectId), entry.date ? fmtDate(entry.date) : "", entry.stage || "", entry.priority ? `${entry.priority} priority` : ""].filter(Boolean).join(" | "),
          body: [entry.description, entry.nextStep].filter(Boolean).join(" "),
          sortKey: entry.date || recordLoggedAt(entry) || entry.createdAt || "",
          dateLabel: entry.date ? fmtDate(entry.date) : (recordLoggedAt(entry) ? fmtDateTime(recordLoggedAt(entry)) : "")
        }));
      });

      state.blockers.forEach(entry => {
        records.push(makeSearchRecord({
          type: "blocker",
          scope: "context",
          id: entry.id,
          projectId: entry.projectId,
          title: previewSearchText(entry.description, 72) || "Blocker",
          subtitle: [projectName(entry.projectId), entry.date ? fmtDate(entry.date) : "", entry.status || "", entry.severity || ""].filter(Boolean).join(" | "),
          body: [entry.description, entry.nextAction, entry.nextActionDate ? fmtDate(entry.nextActionDate) : ""].filter(Boolean).join(" "),
          sortKey: recordLoggedAt(entry) || entry.date || "",
          dateLabel: entry.date ? fmtDate(entry.date) : ""
        }));
      });

      state.reviews.forEach(entry => {
        records.push(makeSearchRecord({
          type: "review",
          scope: "reviews",
          id: entry.id,
          projectId: entry.projectId,
          title: entry.weekOf ? `Week of ${fmtDate(entry.weekOf)}` : "Weekly review",
          subtitle: [entry.projectId ? projectName(entry.projectId) : "", "Weekly Review"].filter(Boolean).join(" | "),
          body: [entry.win, entry.lesson, entry.priority, entry.support, entry.projectId ? projectName(entry.projectId) : ""].filter(Boolean).join(" "),
          sortKey: recordLoggedAt(entry) || entry.weekOf || "",
          dateLabel: entry.weekOf ? fmtDate(entry.weekOf) : ""
        }));
      });

      state.todayTodos.forEach(entry => {
        records.push(makeSearchRecord({
          type: "todo",
          scope: "todos",
          id: entry.id,
          projectId: entry.projectId,
          title: entry.text || "To-do item",
          subtitle: [entry.done ? "Completed" : "Open", entry.projectId ? projectName(entry.projectId) : "", entry.date ? fmtDate(entry.date) : "Today"].filter(Boolean).join(" | "),
          body: [entry.text, entry.done ? "done completed" : "open pending"].join(" "),
          sortKey: entry.completedAt || entry.createdAt || entry.date || "",
          dateLabel: entry.date ? fmtDate(entry.date) : "Today"
        }));
      });

      return records;
    }
    function scoreSearchRecord(record, tokens, query) {
      let score = 0;
      if (record.titleText.includes(query)) score += 120;
      if (record.subtitleText.includes(query)) score += 65;
      if (record.bodyText.includes(query)) score += 35;
      tokens.forEach(token => {
        if (record.titleText.includes(token)) score += 18;
        if (record.subtitleText.includes(token)) score += 9;
        if (record.bodyText.includes(token)) score += 4;
      });
      if (record.type === "project") score += 2;
      return score;
    }
    function getSearchResults() {
      const query = normalizeSearchText(searchQuery);
      if (!query) return [];
      const tokens = query.split(" ").filter(Boolean);
      return buildSearchRecords()
        .filter(record => (searchScope === "all" || record.scope === searchScope) && tokens.every(token => record.searchText.includes(token)))
        .map(record => ({ ...record, score: scoreSearchRecord(record, tokens, query) }))
        .sort((a, b) => b.score - a.score || b.sortKey.localeCompare(a.sortKey) || a.title.localeCompare(b.title))
        .slice(0, 18);
    }
    function scrollActiveSearchResultIntoView() {
      const active = document.querySelector(".search-result.active");
      active?.scrollIntoView({ block: "nearest" });
    }
    function renderSearchResults(shouldScrollActive = false) {
      const modal = document.getElementById("searchModal");
      const resultsWrap = document.getElementById("searchResults");
      const summaryText = document.getElementById("searchSummaryText");
      const resultCount = document.getElementById("searchResultCount");
      const scopeButtons = document.querySelectorAll("[data-search-scope]");
      if (!modal || !resultsWrap || !summaryText || !resultCount) return;

      scopeButtons.forEach(button => button.classList.toggle("active", button.dataset.searchScope === searchScope));

      const rawQuery = String(searchQuery || "").trim();
      if (!rawQuery) {
        searchResultsCache = [];
        searchActiveIndex = -1;
        summaryText.textContent = searchScope === "all"
          ? "Search across all saved portal records."
          : `Search within ${searchScopeLabel(searchScope).toLowerCase()}.`;
        resultCount.textContent = searchScope === "all" ? "Ready" : searchScopeLabel(searchScope);
        resultsWrap.innerHTML = `
          <div class="search-empty">
            <div>
              <h4>Search across the whole portal</h4>
              <p>Try a project title, tool name, finding category, blocker text, review note, or next step.</p>
            </div>
          </div>`;
        return;
      }

      searchResultsCache = getSearchResults();
      summaryText.textContent = `Searching ${searchScope === "all" ? "all records" : searchScopeLabel(searchScope).toLowerCase()} for "${rawQuery}".`;

      if (!searchResultsCache.length) {
        searchActiveIndex = -1;
        resultCount.textContent = "0 matches";
        resultsWrap.innerHTML = `
          <div class="search-empty">
            <div>
              <h4>No matches found</h4>
              <p>Try fewer words, a project title, a tool name, or switch the search scope.</p>
            </div>
          </div>`;
        return;
      }

      searchActiveIndex = Math.max(0, Math.min(searchActiveIndex, searchResultsCache.length - 1));
      resultCount.textContent = `${searchResultsCache.length} match${searchResultsCache.length === 1 ? "" : "es"}`;
      resultsWrap.innerHTML = searchResultsCache.map((result, index) => `
        <button
          class="search-result${index === searchActiveIndex ? " active" : ""}"
          type="button"
          data-search-index="${index}"
          role="option"
          aria-selected="${index === searchActiveIndex ? "true" : "false"}"
        >
          <div class="search-result-top">
            <div class="search-result-copy">
              <div class="search-result-title-row">
                ${tag(result.typeLabel, "tag-neutral")}
                <h4 class="search-result-title">${esc(result.title)}</h4>
              </div>
              ${result.subtitle ? `<p class="search-result-subtitle">${esc(result.subtitle)}</p>` : ""}
            </div>
            ${result.dateLabel ? `<div class="pill pill-neutral">${esc(result.dateLabel)}</div>` : ""}
          </div>
          ${result.preview ? `<p class="search-result-preview">${esc(result.preview)}</p>` : ""}
        </button>`).join("");

      if (shouldScrollActive) window.requestAnimationFrame(scrollActiveSearchResultIntoView);
    }
    function openSearchModal() {
      const modal = document.getElementById("searchModal");
      const input = document.getElementById("searchInput");
      if (!modal || !input) return;
      if (!document.getElementById("confirmModal")?.hidden) return;
      if (!document.getElementById("quickCaptureModal")?.hidden) closeQuickCaptureModal({ restoreFocus: false });
      if (!modal.hidden) {
        input.focus();
        input.select();
        return;
      }
      searchLastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      syncModalBodyState();
      input.value = searchQuery;
      renderSearchResults();
      window.requestAnimationFrame(() => {
        input.focus();
        if (searchQuery) input.select();
      });
    }
    function closeSearchModal({ restoreFocus = true } = {}) {
      const modal = document.getElementById("searchModal");
      if (!modal || modal.hidden) return;
      const previousFocus = searchLastFocused;
      searchLastFocused = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      syncModalBodyState();
      if (restoreFocus && previousFocus?.focus && previousFocus.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
    }
    function setSearchScope(nextScope) {
      searchScope = SEARCH_SCOPES.some(scope => scope.id === nextScope) ? nextScope : "all";
      searchActiveIndex = 0;
      renderSearchResults();
      document.getElementById("searchInput")?.focus();
    }
    function openSearchResult(result) {
      if (!result) return;
      closeSearchModal({ restoreFocus: false });
      if (result.type === "project") {
        selectedProjectId = result.id;
        renderProjects();
        switchTab("projects", true, true);
        queueSelectedProjectReveal();
        return;
      }
      editRecord(result.type, result.id);
    }
    function handleSearchInput(e) {
      searchQuery = e.target.value;
      searchActiveIndex = 0;
      renderSearchResults();
    }
    function handleSearchModalClick(e) {
      const modal = document.getElementById("searchModal");
      if (!modal || modal.hidden) return;
      if (e.target === modal || e.target.closest("[data-search-dismiss]")) {
        closeSearchModal();
        return;
      }
      const scopeBtn = e.target.closest("[data-search-scope]");
      if (scopeBtn) {
        setSearchScope(scopeBtn.dataset.searchScope);
        return;
      }
      const resultBtn = e.target.closest("[data-search-index]");
      if (resultBtn) openSearchResult(searchResultsCache[Number(resultBtn.dataset.searchIndex)]);
    }
    function handleSearchInputKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearchModal();
        return;
      }
      if (!searchResultsCache.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        searchActiveIndex = searchActiveIndex >= searchResultsCache.length - 1 ? 0 : searchActiveIndex + 1;
        renderSearchResults(true);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        searchActiveIndex = searchActiveIndex <= 0 ? searchResultsCache.length - 1 : searchActiveIndex - 1;
        renderSearchResults(true);
        return;
      }
      if (e.key === "Enter" && searchActiveIndex >= 0) {
        e.preventDefault();
        openSearchResult(searchResultsCache[searchActiveIndex]);
      }
    }
    function handleSearchModalKeydown(e) {
      const modal = document.getElementById("searchModal");
      if (!modal || modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearchModal();
      }
    }
    function defaultQuickCaptureDraft(type) {
      const projectId = preferredQuickCaptureProjectId();
      if (type === "run") {
        return {
          projectId,
          date: todayISO(),
          kind: "Analysis",
          status: "Running",
          title: "",
          tool: "",
          inputs: "",
          parameters: "",
          summary: "",
          location: "",
          nextStep: ""
        };
      }
      if (type === "finding") {
        return { projectId, date: todayISO(), impact: "Medium", category: "", summary: "", nextStep: "" };
      }
      if (type === "idea") {
        return { projectId, date: todayISO(), title: "", stage: "Incubating", priority: "Medium", description: "", nextStep: "" };
      }
      if (type === "blocker") {
        return { projectId, date: todayISO(), severity: "Medium", status: "Open", description: "", nextAction: "", nextActionDate: "" };
      }
      if (type === "todo") {
        return { projectId, text: "" };
      }
      return { projectId, date: todayISO(), type: "Experiment", hours: 1, objective: "", outcome: "", nextStep: "" };
    }
    function focusQuickCaptureField(selectAll = false) {
      const field = document.querySelector("#quickCaptureForm input:not([type='hidden']), #quickCaptureForm select, #quickCaptureForm textarea");
      if (!field?.focus) return;
      window.requestAnimationFrame(() => {
        field.focus();
        if (selectAll && typeof field.select === "function") field.select();
      });
    }
    function saveQuickCaptureDraft() {
      const form = document.getElementById("quickCaptureForm");
      if (!form) return;
      quickCaptureDrafts[quickCaptureType] = formToObject(form);
    }
    function renderQuickCapture() {
      const modal = document.getElementById("quickCaptureModal");
      const body = document.getElementById("quickCaptureContent");
      const subtitle = document.getElementById("quickCaptureSubtitle");
      if (!modal || !body) return;
      const draft = { ...defaultQuickCaptureDraft(quickCaptureType), ...(quickCaptureDrafts[quickCaptureType] || {}) };
      const subtitles = {
        worklog: "Capture what you just worked on without leaving the current page.",
        run: "Log a run or analysis the moment it starts, finishes, or needs review.",
        finding: "Save an observation, result, or conclusion while it is still fresh.",
        idea: "Log a new direction or experiment before it disappears into scratch notes.",
        blocker: "Record what is slowing progress and the next action to unblock it.",
        todo: "Drop a small action item into today's list from anywhere in the portal."
      };
      if (subtitle) subtitle.textContent = subtitles[quickCaptureType] || subtitles.worklog;
      document.querySelectorAll("[data-quick-capture-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.quickCaptureTab === quickCaptureType);
      });
      if (!["worklog", "run", "finding", "idea", "blocker", "todo"].includes(quickCaptureType)) {
        body.innerHTML = '<div class="quick-capture-empty"><div><h4>Choose a capture type</h4><p>Select one of the capture tabs to add a record.</p></div></div>';
        return;
      }
      const worklogTypes = ["Experiment", "Analysis", "Coding", "Writing", "Planning", "Meeting", "Admin", "Other"];
      const runKinds = ["Run", "Analysis", "Pipeline", "Benchmark", "QC", "Visualization", "Simulation", "Experiment", "Other"];
      const runStatuses = ["Planned", "Running", "Needs Review", "Complete", "Paused", "Cancelled"];
      const impacts = ["Low", "Medium", "High"];
      const ideaStages = ["Incubating", "Active", "Paused", "Promoted", "Archived"];
      const priorities = ["Low", "Medium", "High"];
      const severities = ["Low", "Medium", "High", "Critical"];
      const blockerStatuses = ["Open", "Waiting", "Resolved"];
      if (quickCaptureType === "run") {
        body.innerHTML = `
          <form class="quick-capture-form" id="quickCaptureForm" data-quick-capture-type="run">
            <div class="field-grid">
              <label>Project
                <select name="projectId">${projectOptionsMarkup(draft.projectId)}</select>
              </label>
              <label>Date
                <input type="date" name="date" value="${esc(draft.date)}" required />
              </label>
              <label>Entry type
                <select name="kind">${optionList(runKinds, draft.kind)}</select>
              </label>
              <label>Status
                <select name="status">${optionList(runStatuses, draft.status)}</select>
              </label>
            </div>
            <label>Title
              <input type="text" name="title" value="${esc(draft.title)}" placeholder="Short run or analysis name" required />
            </label>
            <label>Tool / method
              <input type="text" name="tool" value="${esc(draft.tool)}" placeholder="e.g., Nextflow, DESeq2, custom script" />
            </label>
            <label>Inputs / dataset / sample set
              <textarea name="inputs" placeholder="Which data, files, or samples were used?">${esc(draft.inputs)}</textarea>
            </label>
            <label>Parameters / setup
              <textarea name="parameters" placeholder="Key settings, versions, environment notes, or command details">${esc(draft.parameters)}</textarea>
            </label>
            <label>Outcome / summary
              <textarea name="summary" placeholder="What happened or what do the outputs suggest?">${esc(draft.summary)}</textarea>
            </label>
            <div class="field-grid">
              <label>Output location / reference
                <input type="text" name="location" value="${esc(draft.location)}" placeholder="Folder path, notebook, result ID, or file" />
              </label>
              <label>Next step
                <input type="text" name="nextStep" value="${esc(draft.nextStep)}" placeholder="What should happen next?" />
              </label>
            </div>
            <div class="actions-row">
              <button class="btn btn-soft" type="submit">Save run / analysis</button>
            </div>
          </form>`;
      } else if (quickCaptureType === "finding") {
        body.innerHTML = `
          <form class="quick-capture-form" id="quickCaptureForm" data-quick-capture-type="finding">
            <div class="field-grid">
              <label>Project
                <select name="projectId">${projectOptionsMarkup(draft.projectId)}</select>
              </label>
              <label>Date
                <input type="date" name="date" value="${esc(draft.date)}" required />
              </label>
              <label>Impact
                <select name="impact">${optionList(impacts, draft.impact)}</select>
              </label>
            </div>
            <label>Category
              <input type="text" name="category" value="${esc(draft.category)}" placeholder="e.g., Result, validation, decision" />
            </label>
            <label>Summary
              <textarea name="summary" placeholder="What was found or concluded?">${esc(draft.summary)}</textarea>
            </label>
            <label>Next step
              <input type="text" name="nextStep" value="${esc(draft.nextStep)}" placeholder="What follows from this finding?" />
            </label>
            <div class="actions-row">
              <button class="btn btn-soft" type="submit">Save finding</button>
            </div>
          </form>`;
      } else if (quickCaptureType === "idea") {
        body.innerHTML = `
          <form class="quick-capture-form" id="quickCaptureForm" data-quick-capture-type="idea">
            <div class="field-grid">
              <label>Project
                <select name="projectId">${projectOptionsMarkup(draft.projectId)}</select>
              </label>
              <label>Date
                <input type="date" name="date" value="${esc(draft.date)}" required />
              </label>
              <label>Stage
                <select name="stage">${optionList(ideaStages, draft.stage)}</select>
              </label>
              <label>Priority
                <select name="priority">${optionList(priorities, draft.priority)}</select>
              </label>
            </div>
            <label>Idea title
              <input type="text" name="title" value="${esc(draft.title)}" placeholder="Short idea name" required />
            </label>
            <label>Description
              <textarea name="description" placeholder="What is the idea and why might it matter?">${esc(draft.description)}</textarea>
            </label>
            <label>Next step
              <input type="text" name="nextStep" value="${esc(draft.nextStep)}" placeholder="What would test or clarify it?" />
            </label>
            <div class="actions-row">
              <button class="btn btn-soft" type="submit">Save idea</button>
            </div>
          </form>`;
      } else if (quickCaptureType === "blocker") {
        body.innerHTML = `
          <form class="quick-capture-form" id="quickCaptureForm" data-quick-capture-type="blocker">
            <div class="field-grid">
              <label>Project
                <select name="projectId">${projectOptionsMarkup(draft.projectId)}</select>
              </label>
              <label>Date
                <input type="date" name="date" value="${esc(draft.date)}" required />
              </label>
              <label>Severity
                <select name="severity">${optionList(severities, draft.severity)}</select>
              </label>
              <label>Status
                <select name="status">${optionList(blockerStatuses, draft.status)}</select>
              </label>
            </div>
            <label>Description
              <textarea name="description" placeholder="What is blocked?" required>${esc(draft.description)}</textarea>
            </label>
            <div class="field-grid">
              <label>Next action
                <input type="text" name="nextAction" value="${esc(draft.nextAction)}" placeholder="What should unblock it?" />
              </label>
              <label>Target date
                <input type="date" name="nextActionDate" value="${esc(draft.nextActionDate)}" />
              </label>
            </div>
            <div class="actions-row">
              <button class="btn btn-soft" type="submit">Save blocker</button>
            </div>
          </form>`;
      } else if (quickCaptureType === "todo") {
        body.innerHTML = `
          <form class="quick-capture-form" id="quickCaptureForm" data-quick-capture-type="todo">
            <label>Project
              <select name="projectId">${projectOptionsMarkup(draft.projectId)}</select>
            </label>
            <label>To-do
              <input type="text" name="text" value="${esc(draft.text)}" placeholder="What needs to happen next?" required />
            </label>
            <div class="actions-row">
              <button class="btn btn-soft" type="submit">Save to-do</button>
            </div>
          </form>`;
      } else {
        body.innerHTML = `
          <form class="quick-capture-form" id="quickCaptureForm" data-quick-capture-type="worklog">
            <div class="field-grid">
              <label>Project
                <select name="projectId">${projectOptionsMarkup(draft.projectId)}</select>
              </label>
              <label>Date
                <input type="date" name="date" value="${esc(draft.date)}" required />
              </label>
              <label>Activity type
                <select name="type">${optionList(worklogTypes, draft.type)}</select>
              </label>
              <label>Hours spent
                <input type="number" name="hours" min="0" step="0.25" value="${esc(draft.hours)}" />
              </label>
            </div>
            <label>Objective
              <textarea name="objective" placeholder="What was the goal of the session?">${esc(draft.objective)}</textarea>
            </label>
            <label>Outcome
              <textarea name="outcome" placeholder="What changed, finished, or was learned?">${esc(draft.outcome)}</textarea>
            </label>
            <label>Next step
              <input type="text" name="nextStep" value="${esc(draft.nextStep)}" placeholder="What should happen next?" />
            </label>
            <div class="actions-row">
              <button class="btn btn-soft" type="submit">Save work log</button>
            </div>
          </form>`;
      }
      document.getElementById("quickCaptureForm")?.addEventListener("submit", handleQuickCaptureSubmit);
    }
    function openQuickCaptureModal() {
      const modal = document.getElementById("quickCaptureModal");
      if (!modal) return;
      if (!document.getElementById("confirmModal")?.hidden) return;
      if (!document.getElementById("searchModal")?.hidden) closeSearchModal({ restoreFocus: false });
      if (!modal.hidden) {
        focusQuickCaptureField(true);
        return;
      }
      quickCaptureLastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      renderQuickCapture();
      syncModalBodyState();
      focusQuickCaptureField(true);
    }
    function closeQuickCaptureModal({ restoreFocus = true, preserveDraft = true } = {}) {
      const modal = document.getElementById("quickCaptureModal");
      if (!modal || modal.hidden) return;
      if (preserveDraft) saveQuickCaptureDraft();
      const previousFocus = quickCaptureLastFocused;
      quickCaptureLastFocused = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      syncModalBodyState();
      if (restoreFocus && previousFocus?.focus && previousFocus.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
    }
    function setQuickCaptureType(nextType) {
      if (!["worklog", "run", "finding", "idea", "blocker", "todo"].includes(nextType)) return;
      saveQuickCaptureDraft();
      quickCaptureType = nextType;
      renderQuickCapture();
      focusQuickCaptureField(true);
    }
    function handleQuickCaptureModalClick(e) {
      const modal = document.getElementById("quickCaptureModal");
      if (!modal || modal.hidden) return;
      if (e.target === modal || e.target.closest("[data-quick-capture-dismiss]")) {
        closeQuickCaptureModal();
        return;
      }
      const tabBtn = e.target.closest("[data-quick-capture-tab]");
      if (tabBtn) setQuickCaptureType(tabBtn.dataset.quickCaptureTab);
    }
    function handleQuickCaptureModalKeydown(e) {
      const modal = document.getElementById("quickCaptureModal");
      if (!modal || modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeQuickCaptureModal();
      }
    }
    function handleQuickCaptureSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const data = formToObject(form);
      const type = form.dataset.quickCaptureType;
      const timestamp = nowISO();
      let record = null;
      let collection = "";
      let message = "";

      if (type === "finding") {
        if (!hasText(data.category) && !hasText(data.summary)) {
          showToast("Add a finding category or summary");
          form.elements.summary?.focus();
          return;
        }
        collection = "findings";
        record = {
          id: uid(),
          projectId: data.projectId || "",
          date: data.date,
          impact: data.impact,
          category: data.category.trim(),
          summary: data.summary.trim(),
          nextStep: data.nextStep.trim(),
          loggedAt: timestamp
        };
        message = "Finding saved";
      } else if (type === "run") {
        if (!hasText(data.title)) {
          showToast("Add a run title");
          form.elements.title?.focus();
          return;
        }
        collection = "runs";
        record = {
          id: uid(),
          projectId: data.projectId || "",
          date: data.date,
          kind: data.kind,
          status: data.status,
          title: data.title.trim(),
          tool: data.tool.trim(),
          inputs: data.inputs.trim(),
          parameters: data.parameters.trim(),
          summary: data.summary.trim(),
          location: data.location.trim(),
          nextStep: data.nextStep.trim(),
          loggedAt: timestamp
        };
        message = "Run / analysis saved";
      } else if (type === "idea") {
        if (!hasText(data.title)) {
          showToast("Add an idea title");
          form.elements.title?.focus();
          return;
        }
        collection = "ideas";
        record = {
          id: uid(),
          projectId: data.projectId || "",
          date: data.date,
          title: data.title.trim(),
          stage: data.stage,
          priority: data.priority,
          description: data.description.trim(),
          nextStep: data.nextStep.trim(),
          createdAt: timestamp,
          loggedAt: timestamp
        };
        message = "Idea saved";
      } else if (type === "blocker") {
        if (!hasText(data.description)) {
          showToast("Add a blocker description");
          form.elements.description?.focus();
          return;
        }
        collection = "blockers";
        record = {
          id: uid(),
          projectId: data.projectId || "",
          date: data.date,
          severity: data.severity,
          status: data.status,
          description: data.description.trim(),
          nextAction: data.nextAction.trim(),
          nextActionDate: data.nextActionDate,
          loggedAt: timestamp
        };
        message = "Blocker saved";
      } else if (type === "todo") {
        if (!hasText(data.text)) {
          showToast("Add a to-do item");
          form.elements.text?.focus();
          return;
        }
        collection = "todayTodos";
        record = {
          id: uid(),
          date: todayISO(),
          projectId: data.projectId || "",
          text: data.text.trim(),
          done: false,
          createdAt: timestamp,
          completedAt: ""
        };
        message = "To-do added";
      } else {
        if (![data.objective, data.outcome, data.nextStep].some(hasText)) {
          showToast("Add an objective, outcome, or next step");
          form.elements.objective?.focus();
          return;
        }
        collection = "worklog";
        record = {
          id: uid(),
          projectId: data.projectId || "",
          date: data.date,
          type: data.type,
          hours: Number(data.hours || 0),
          objective: data.objective.trim(),
          outcome: data.outcome.trim(),
          nextStep: data.nextStep.trim(),
          loggedAt: timestamp
        };
        message = "Work log saved";
      }

      if (record?.projectId) {
        selectedProjectId = record.projectId;
        if (["finding", "idea", "blocker"].includes(type)) contextProjectId = record.projectId;
      }
      delete quickCaptureDrafts[type];
      closeQuickCaptureModal({ restoreFocus: false, preserveDraft: false });
      upsertRecord(collection, record);
      saveState(message);
    }
    function showConfirmModal({
      eyebrow = "Please confirm",
      title = "Confirm action",
      message = "",
      confirmText = "Confirm",
      cancelText = "Cancel",
      confirmVariant = "danger"
    } = {}) {
      const modal = document.getElementById("confirmModal");
      const eyebrowEl = document.getElementById("confirmEyebrow");
      const titleEl = document.getElementById("confirmTitle");
      const messageEl = document.getElementById("confirmMessage");
      const cancelBtn = document.getElementById("confirmCancelBtn");
      const approveBtn = document.getElementById("confirmApproveBtn");
      if (!modal || !eyebrowEl || !titleEl || !messageEl || !cancelBtn || !approveBtn) {
        return Promise.resolve(window.confirm(message || title));
      }
      if (confirmResolver) closeConfirmModal(false);
      confirmLastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      eyebrowEl.textContent = eyebrow;
      titleEl.textContent = title;
      messageEl.textContent = message;
      cancelBtn.textContent = cancelText;
      approveBtn.textContent = confirmText;
      approveBtn.className = confirmVariant === "danger" ? "btn btn-danger" : "btn btn-primary";
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      syncModalBodyState();
      return new Promise(resolve => {
        confirmResolver = resolve;
        window.requestAnimationFrame(() => cancelBtn.focus());
      });
    }
    function closeConfirmModal(confirmed = false) {
      const modal = document.getElementById("confirmModal");
      if (!modal || modal.hidden) return;
      const resolve = confirmResolver;
      const previousFocus = confirmLastFocused;
      confirmResolver = null;
      confirmLastFocused = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      syncModalBodyState();
      if (previousFocus?.focus && previousFocus.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
      if (resolve) resolve(confirmed);
    }
    function handleConfirmModalClick(e) {
      const modal = document.getElementById("confirmModal");
      if (!modal || modal.hidden) return;
      if (e.target === modal || e.target.closest("[data-confirm-dismiss]")) {
        closeConfirmModal(false);
        return;
      }
      if (e.target.closest("[data-confirm-approve]")) closeConfirmModal(true);
    }
    function handleConfirmModalKeydown(e) {
      const modal = document.getElementById("confirmModal");
      if (!modal || modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeConfirmModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = [...modal.querySelectorAll("button:not([disabled])")];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
        return;
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    function touchProject(projectId, timestamp = nowISO()) {
      if (!projectId) return;
      const idx = state.projects.findIndex(item => item.id === projectId);
      if (idx < 0) return;
      state.projects[idx] = normalizeProject({
        ...state.projects[idx],
        updatedAt: timestamp
      });
    }
    function queueProjectDirectoryHeightSync() {
      window.requestAnimationFrame(syncProjectDirectoryHeight);
    }
    function syncProjectDirectoryHeight() {
      const source = document.getElementById("projectFormPanel");
      const target = document.getElementById("projectDirectoryPanel");
      const projectsPanel = document.getElementById("projects");
      if (!source || !target || !projectsPanel) return;
      if (!projectsPanel.classList.contains("active")) {
        target.style.height = "";
        return;
      }
      const sourceHeight = Math.ceil(source.getBoundingClientRect().height);
      target.style.height = sourceHeight > 0 ? `${sourceHeight}px` : "";
    }
    function observeProjectDirectoryHeight() {
      const source = document.getElementById("projectFormPanel");
      if (!source || typeof ResizeObserver === "undefined") return;
      projectPanelResizeObserver?.disconnect();
      projectPanelResizeObserver = new ResizeObserver(() => queueProjectDirectoryHeightSync());
      projectPanelResizeObserver.observe(source);
    }
    function queueSelectedProjectReveal() {
      window.requestAnimationFrame(() => {
        revealSelectedProjectInDirectory();
        revealSelectedProjectWorkspace();
      });
    }
    function revealSelectedProjectInDirectory() {
      const list = document.getElementById("projectList");
      const selectedCard = list?.querySelector(".card.selected");
      if (!list || !selectedCard) return;
      const listRect = list.getBoundingClientRect();
      const cardRect = selectedCard.getBoundingClientRect();
      const overflowTop = cardRect.top - listRect.top;
      const overflowBottom = cardRect.bottom - listRect.bottom;
      if (overflowTop < 0) {
        list.scrollBy({ top: overflowTop - 12, behavior: "smooth" });
        return;
      }
      if (overflowBottom > 0) {
        list.scrollBy({ top: overflowBottom + 12, behavior: "smooth" });
      }
    }
    function revealSelectedProjectWorkspace() {
      const workspace = document.getElementById("projectWorkspace");
      if (!workspace) return;
      const tabs = document.getElementById("tabs");
      const stickyOffset = tabs
        ? tabs.getBoundingClientRect().height + parseFloat(getComputedStyle(tabs).top || "0") + 16
        : 24;
      const targetTop = window.scrollY + workspace.getBoundingClientRect().top - stickyOffset;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
    function projectName(id) {
      const p = state.projects.find(item => item.id === id);
      return p ? p.title : "Unassigned";
    }
    function selectedAttr(value, expected) {
      return String(value ?? "") === String(expected ?? "") ? " selected" : "";
    }
    function optionList(values, current) {
      return values.map(value => `<option${selectedAttr(current, value)}>${esc(value)}</option>`).join("");
    }
    function projectOptionsMarkup(selectedValue = "", placeholder = "Select project") {
      return [`<option value="">${esc(placeholder)}</option>`]
        .concat(state.projects.map(project => `<option value="${esc(project.id)}"${selectedAttr(selectedValue, project.id)}>${esc(project.title)}</option>`))
        .join("");
    }
    function preferredQuickCaptureProjectId() {
      if (contextProjectId && state.projects.some(project => project.id === contextProjectId)) return contextProjectId;
      if (selectedProjectId && state.projects.some(project => project.id === selectedProjectId)) return selectedProjectId;
      return "";
    }
    function findRunById(id) {
      return state.runs.find(item => item.id === id) || null;
    }
    function recentEntries(arr, dateField, days) {
      const today = new Date();
      today.setHours(0,0,0,0);
      return arr.filter(item => {
        if (!item[dateField]) return false;
        const d = new Date(item[dateField] + "T00:00:00");
        if (Number.isNaN(d.getTime())) return false;
        return (today - d) / 86400000 <= days;
      });
    }
    function weekHours() {
      return recentEntries(state.worklog, "date", 7).reduce((sum, item) => sum + Number(item.hours || 0), 0);
    }
    function activeProjects() {
      return state.projects.filter(p => p.status !== "Completed");
    }
    function dueSoonProjects() {
      return state.projects
        .filter(p => p.status !== "Completed" && projectDeadlineDate(p))
        .map(p => ({ ...normalizeProject(p), delta: daysUntil(projectTargetDate(p)) }))
        .filter(p => p.delta !== null && p.delta <= 21)
        .sort((a,b) => (a.delta ?? 999) - (b.delta ?? 999));
    }
    function todayTodos() {
      const today = todayISO();
      return [...state.todayTodos]
        .filter(item => !item.date || item.date === today)
        .sort((a,b) => Number(Boolean(a.done)) - Number(Boolean(b.done)) || (b.createdAt || "").localeCompare(a.createdAt || "") || (b.id || "").localeCompare(a.id || ""));
    }
    function dashboardDeadlineSummary(project) {
      const target = projectTargetDate(project);
      if (!target) return null;
      const delta = daysUntil(target);
      const timing = delta === null ? "Date unavailable" : delta < 0 ? `${Math.abs(delta)} day(s) overdue` : delta === 0 ? "Due today" : `${delta} day(s) left`;
      const cls = delta === null ? "tag-neutral" : delta < 0 ? "severity-high" : delta <= 7 ? "severity-medium" : "tag-neutral";
      return { date: fmtDate(target), timing, cls };
    }
    function sortByDateDesc(arr, key) {
      return [...arr].sort((a,b) => (b[key] || "").localeCompare(a[key] || ""));
    }
    function priorityClass(priority) { return `priority-${String(priority || "").toLowerCase().replaceAll(" ", "-")}`; }
    function statusClass(status) { return `status-${String(status || "").toLowerCase().replaceAll(" ", "-")}`; }
    function ideaClass(stage) { return `idea-${String(stage || "").toLowerCase().replaceAll(" ", "-")}`; }
    function impactClass(impact) { return `impact-${String(impact || "").toLowerCase().replaceAll(" ", "-")}`; }
    function blockerStatusClass(status) { return `blocker-${String(status || "").toLowerCase().replaceAll(" ", "-")}`; }
    function severityClass(sev) { return `severity-${String(sev || "").toLowerCase().replaceAll(" ", "-")}`; }
    function runStatusClass(status) {
      const map = {
        "planned":"run-planned",
        "running":"run-running",
        "needs review":"run-needs-review",
        "complete":"run-complete",
        "paused":"run-paused",
        "cancelled":"run-cancelled"
      };
      return map[String(status || "").toLowerCase()] || "tag-neutral";
    }
    function metricCard(label, value, meta = "") {
      return `<div class="metric-card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${hasText(meta) ? `<div class="meta">${esc(meta)}</div>` : ''}</div>`;
    }
    function tag(text, cls = "tag-neutral") { return `<span class="pill ${esc(cls)}">${esc(text)}</span>`; }
    function hasText(value) { return String(value ?? "").trim().length > 0; }
    function detailLine(label, value, cls = "") {
      if (!hasText(value)) return "";
      const classAttr = cls ? ` class="${esc(cls)}"` : "";
      return `<p${classAttr}><strong>${esc(label)}:</strong> ${esc(value)}</p>`;
    }
    function emptyDetail(text, cls = "muted") {
      return `<p class="${esc(cls)}">${esc(text)}</p>`;
    }
    function getFiltered(arr, key) {
      const filterValue = filters[key] || "";
      return filterValue ? arr.filter(item => item.projectId === filterValue) : arr;
    }
    function syncProjectFormState(sourceName = "") {
      const form = document.getElementById("projectForm");
      if (!form) return;
      const statusField = form.elements.status;
      const endDateField = form.elements.endDate;
      if (!statusField || !endDateField) return;
      if (sourceName === "status" && statusField.value === "Completed" && !endDateField.value) {
        showToast("Add an end date before marking a project as completed");
        endDateField.focus();
        return;
      }
      if (sourceName === "status" && statusField.value !== "Completed") {
        endDateField.value = "";
        return;
      }
      if (sourceName === "endDate") {
        if (endDateField.value) {
          statusField.value = "Completed";
          return;
        }
        if (statusField.value === "Completed") statusField.value = "Active";
      }
    }
    function attachEvents() {
      document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
      document.querySelectorAll("[data-tab-jump]").forEach(btn => btn.addEventListener("click", event => {
        if (btn.tagName === "A") event.preventDefault();
        switchTab(btn.dataset.tabJump);
      }));
      document.querySelectorAll("[data-runs-tab]").forEach(btn => btn.addEventListener("click", () => setRunsTab(btn.dataset.runsTab || "runs")));
      document.querySelectorAll("[data-clear-form]").forEach(btn => btn.addEventListener("click", () => clearForm(btn.dataset.clearForm)));
      document.getElementById("projectForm").addEventListener("submit", handleProjectSubmit);
      document.getElementById("projectForm").addEventListener("change", e => syncProjectFormState(e.target.name));
      document.getElementById("todayTodoForm").addEventListener("submit", handleTodayTodoSubmit);
      document.getElementById("worklogForm").addEventListener("submit", handleWorklogSubmit);
      document.getElementById("runForm").addEventListener("submit", handleRunSubmit);
      document.getElementById("closeRunFormBtn").addEventListener("click", () => closeRunForm());
      document.getElementById("reviewForm").addEventListener("submit", handleReviewSubmit);
      document.getElementById("loadDemoBtn").addEventListener("click", loadDemoData);
      document.getElementById("exportBtn").addEventListener("click", exportData);
      document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
      document.getElementById("openQuickCaptureBtn").addEventListener("click", openQuickCaptureModal);
      document.getElementById("openSearchBtn").addEventListener("click", openSearchModal);
      document.getElementById("footerFeedbackLink").addEventListener("click", handleFeedbackLinkClick);
      document.getElementById("closeQuickCaptureBtn").addEventListener("click", () => closeQuickCaptureModal());
      document.getElementById("closeSearchBtn").addEventListener("click", () => closeSearchModal());
      document.getElementById("backToTopBtn").addEventListener("click", scrollToTop);
      document.getElementById("resetBtn").addEventListener("click", resetData);
      document.getElementById("importFile").addEventListener("change", importData);
      document.getElementById("runCompareLeft").addEventListener("change", e => {
        runCompareLeftId = e.target.value;
        renderRuns();
      });
      document.getElementById("runCompareRight").addEventListener("change", e => {
        runCompareRightId = e.target.value;
        renderRuns();
      });
      document.getElementById("swapRunCompareBtn").addEventListener("click", swapRunComparison);
      document.getElementById("clearRunCompareBtn").addEventListener("click", clearRunComparison);
      document.getElementById("searchInput").addEventListener("input", handleSearchInput);
      document.getElementById("searchInput").addEventListener("keydown", handleSearchInputKeydown);
      document.getElementById("quickCaptureModal").addEventListener("click", handleQuickCaptureModalClick);
      document.getElementById("quickCaptureModal").addEventListener("keydown", handleQuickCaptureModalKeydown);
      document.getElementById("searchModal").addEventListener("click", handleSearchModalClick);
      document.getElementById("searchModal").addEventListener("keydown", handleSearchModalKeydown);
      document.getElementById("confirmModal").addEventListener("click", handleConfirmModalClick);
      document.getElementById("confirmModal").addEventListener("keydown", handleConfirmModalKeydown);
      document.getElementById("worklogFilter").addEventListener("change", e => { filters.worklog = e.target.value; renderWorklog(); });
      document.getElementById("runFilter").addEventListener("change", e => { filters.runs = e.target.value; renderRuns(); });
      document.getElementById("contextProjectSelect").addEventListener("change", e => {
        contextProjectId = e.target.value;
        if (contextProjectId) selectedProjectId = contextProjectId;
        renderProjects();
        renderContext();
      });
      document.body.addEventListener("change", handleBodyChange);
      document.body.addEventListener("click", handleBodyClick);
      window.addEventListener("resize", queueProjectDirectoryHeightSync);
      observeProjectDirectoryHeight();
    }
    function switchTab(tabId, keepProjectSelection = false, skipScroll = false) {
      activeTab = tabId;
      if (tabId === 'projects' && !keepProjectSelection) {
        selectedProjectId = topProjectId();
        renderProjects();
      }
      document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
      document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
      if (tabId === 'runs') {
        renderRunsTabState();
        renderRunFormState();
      }
      if (tabId === 'projects') queueProjectDirectoryHeightSync();
      if (!skipScroll) scrollToTop();
    }
    function handleFeedbackLinkClick(event) {
      event.preventDefault();
      const url = String(FEEDBACK_FORM_URL || "").trim();
      if (!url) {
        showToast("Add your Google Form URL to enable feedback.");
        return;
      }
      window.open(url, "_blank", "noopener");
    }
    function clearForm(formId) {
      const form = document.getElementById(formId);
      form.reset();
      if (form.elements.id) form.elements.id.value = "";
      if (formId === "worklogForm") form.elements.date.value = todayISO();
      if (formId === "runForm") {
        form.elements.date.value = todayISO();
        form.elements.projectId.value = defaultRunProjectId();
        renderRunFormState();
      }
      if (formId === "reviewForm") form.elements.weekOf.value = todayISO();
    }
    function setFormValues(formId, data) {
      const form = document.getElementById(formId);
      Object.entries(data).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ""; });
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function scrollToTop() {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
    function renderRunsTabState() {
      const validTabs = new Set(["runs", "compare"]);
      if (!validTabs.has(activeRunsTab)) activeRunsTab = "runs";
      document.querySelectorAll("[data-runs-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.runsTab === activeRunsTab);
      });
      document.querySelectorAll("[data-runs-panel]").forEach(panel => {
        const isActive = panel.dataset.runsPanel === activeRunsTab;
        panel.classList.toggle("active", isActive);
        panel.hidden = !isActive;
      });
    }
    function setRunsTab(nextTab) {
      activeRunsTab = nextTab;
      renderRunsTabState();
    }
    function defaultRunProjectId(preferredId = "") {
      return preferredId || filters.runs || selectedProjectId || "";
    }
    function renderRunFormState() {
      const panel = document.getElementById("runFormPanel");
      const form = document.getElementById("runForm");
      if (!panel || !form) return;
      const isEditing = Boolean(form.elements.id?.value);
      const heading = document.getElementById("runFormHeading");
      const intro = document.getElementById("runFormIntro");
      const submitBtn = document.getElementById("runFormSubmitBtn");
      const clearBtn = document.getElementById("clearRunFormBtn");
      const closeBtn = document.getElementById("closeRunFormBtn");
      if (heading) heading.textContent = isEditing ? "Edit run / analysis" : "Add new run / analysis";
      if (intro) intro.textContent = isEditing
        ? "Update the setup, outcome, or next step for this saved run."
        : "Capture the setup, outcome, and next step for a run or analysis.";
      if (submitBtn) submitBtn.textContent = isEditing ? "Update run / analysis" : "Save run / analysis";
      if (clearBtn) clearBtn.textContent = isEditing ? "Reset form" : "Clear form";
      if (closeBtn) closeBtn.hidden = !isEditing;
    }
    function openRunForm({ reset = false, projectId, focusField = true, scroll = true } = {}) {
      const form = document.getElementById("runForm");
      if (!form) return;
      if (reset) clearForm("runForm");
      if (projectId !== undefined && form.elements.projectId) form.elements.projectId.value = projectId || "";
      renderRunFormState();
      if (scroll) document.getElementById("runFormPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (focusField) {
        const focusTarget = form.elements.title || form.elements.date;
        window.requestAnimationFrame(() => focusTarget?.focus());
      }
    }
    function closeRunForm({ reset = true } = {}) {
      if (reset) clearForm("runForm");
      renderRunFormState();
    }
    function renderProjectSelects() {
      const projectOptions = state.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
      document.querySelectorAll("[data-project-select]").forEach(select => {
        const isContextSelect = select.id === "contextProjectSelect";
        const current = isContextSelect ? contextProjectId : select.value;
        const placeholder = '<option value="">Select project</option>';
        select.innerHTML = placeholder + projectOptions;
        if ([...select.options].some(o => o.value === current)) select.value = current;
        else select.value = "";
      });
      const filtersMarkup = ['<option value="">All projects</option>'].concat(state.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`)).join("");
      ["worklogFilter", "runFilter"].forEach(id => {
        const el = document.getElementById(id);
        const current = filters[id === "worklogFilter" ? "worklog" : "runs"] || "";
        el.innerHTML = filtersMarkup;
        el.value = current;
      });
    }
    function renderCompareCard(run, label) {
      if (!run) {
        return `
          <div class="compare-card is-empty">
            <div>
              <h4>${esc(label)}</h4>
              <p>Select a run from the dropdown or use the compare buttons in the run cards.</p>
            </div>
          </div>`;
      }
      return `
        <div class="compare-card">
          <div class="compare-card-header">
            <div>
              <div class="card-meta">${tag(label, "tag-neutral")} ${tag(run.status, runStatusClass(run.status))}</div>
              <h4 class="compare-card-title">${esc(run.title || `${run.kind} entry`)}</h4>
              <p class="compare-card-subtitle">${esc([projectName(run.projectId), run.date ? fmtDate(run.date) : "", run.kind || "", run.tool || ""].filter(Boolean).join(" | "))}</p>
            </div>
          </div>
          <div class="compare-field-grid">
            <div class="compare-field"><strong>Inputs</strong><span>${esc(run.inputs || "Not recorded")}</span></div>
            <div class="compare-field"><strong>Parameters</strong><span>${esc(run.parameters || "Not recorded")}</span></div>
            <div class="compare-field"><strong>Output</strong><span>${esc(run.location || "Not recorded")}</span></div>
            <div class="compare-field"><strong>Summary</strong><span>${esc(run.summary || "Not recorded")}</span></div>
            <div class="compare-field"><strong>Next step</strong><span>${esc(run.nextStep || "Not recorded")}</span></div>
          </div>
        </div>`;
    }
    function renderRunComparison(list) {
      const leftSelect = document.getElementById("runCompareLeft");
      const rightSelect = document.getElementById("runCompareRight");
      const view = document.getElementById("runCompareView");
      if (!leftSelect || !rightSelect || !view) return;
      if (runCompareLeftId && !findRunById(runCompareLeftId)) runCompareLeftId = "";
      if (runCompareRightId && !findRunById(runCompareRightId)) runCompareRightId = "";
      const compareRuns = [...list];
      [findRunById(runCompareLeftId), findRunById(runCompareRightId)].forEach(run => {
        if (run && !compareRuns.some(item => item.id === run.id)) compareRuns.push(run);
      });
      const options = sortByLoggedDesc(compareRuns, "date");
      const optionMarkup = ['<option value="">Select run</option>']
        .concat(options.map(run => `<option value="${esc(run.id)}">${esc([fmtDate(run.date), run.kind, run.title].filter(Boolean).join(" | "))}</option>`))
        .join("");
      leftSelect.innerHTML = optionMarkup;
      rightSelect.innerHTML = optionMarkup;
      leftSelect.value = runCompareLeftId;
      rightSelect.value = runCompareRightId;
      view.innerHTML = renderCompareCard(findRunById(runCompareLeftId), "Run A") + renderCompareCard(findRunById(runCompareRightId), "Run B");
    }
    function swapRunComparison() {
      [runCompareLeftId, runCompareRightId] = [runCompareRightId, runCompareLeftId];
      renderRuns();
    }
    function clearRunComparison() {
      runCompareLeftId = "";
      runCompareRightId = "";
      renderRuns();
    }
    function scrollRunComparisonIntoView() {
      document.getElementById("runComparePanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function addRunToComparison(runId) {
      if (!findRunById(runId)) return;
      if (runCompareLeftId === runId || runCompareRightId === runId) {
        setRunsTab("compare");
        switchTab("runs");
        renderRuns();
        scrollRunComparisonIntoView();
        showToast("Run already added to comparison");
        return;
      }
      if (!runCompareLeftId) {
        runCompareLeftId = runId;
        showToast("Added run to comparison slot A");
      } else if (!runCompareRightId) {
        runCompareRightId = runId;
        showToast("Added run to comparison slot B");
      } else {
        runCompareRightId = runId;
        showToast("Replaced comparison slot B");
      }
      setRunsTab("compare");
      switchTab("runs");
      renderRuns();
      scrollRunComparisonIntoView();
    }
    function renderDashboard() {
      const metrics = [
        ["Active projects", activeProjects().length],
        ["Upcoming deadlines", dueSoonProjects().length],
        ["This week hours", weekHours().toFixed(1)],
        ["Runs this week", recentEntries(state.runs, "date", 7).length]
      ];
      document.getElementById("dashboardMetrics").innerHTML = metrics.map(([a,b,c]) => metricCard(a,b,c)).join("");

      const active = [...activeProjects()].sort((a,b) => (projectTargetDate(a) || '9999-12-31').localeCompare(projectTargetDate(b) || '9999-12-31') || a.title.localeCompare(b.title));
      document.getElementById("projectProgressList").innerHTML = active.length ? active.map(p => {
        const runCount = state.runs.filter(r => r.projectId === p.id).length;
        const openBlockers = state.blockers.filter(b => b.projectId === p.id && b.status !== 'Resolved').length;
        const deadline = dashboardDeadlineSummary(p);
        const lastUpdated = projectUpdatedAt(p);
        return `
          <div class="card">
            <div class="card-head">
              <div>
                <h4>${esc(p.title)}</h4>
                <div class="card-meta">
                  ${tag(p.status, statusClass(p.status))}
                  ${tag(`${p.priority} priority`, priorityClass(p.priority))}
                  ${p.area ? tag(p.area, 'tag-neutral') : ''}
                </div>
              </div>
              <div class="right-tools">
                <button class="btn btn-ghost btn-sm" data-open-project="${esc(p.id)}">Open</button>
              </div>
            </div>
            ${lastUpdated ? `<p class="muted"><strong>Last updated:</strong> ${esc(fmtDateTime(lastUpdated))}</p>` : ''}
            <p>${esc(p.notes || 'No notes added.')}</p>
            <div class="card-meta">
              ${deadline ? tag(`Deadline ${deadline.date}`, 'tag-neutral') : ''}
              ${deadline ? tag(deadline.timing, deadline.cls) : ''}
              ${tag(`${runCount} run(s)`, 'tag-neutral')}
              ${tag(`${openBlockers} open blocker(s)`, openBlockers ? 'severity-medium' : 'tag-neutral')}
            </div>
          </div>`;
      }).join("") : '<div class="empty">No active projects yet.</div>';

      const todos = todayTodos();
      const openTodoCount = todos.filter(item => !item.done).length;
      const todoSummary = document.getElementById("todayTodoSummary");
      if (todoSummary) todoSummary.textContent = !todos.length ? "No items" : openTodoCount ? `${openTodoCount} open` : "All done";
      document.getElementById("todayTodoList").innerHTML = todos.length ? todos.map(item => `
        <div class="todo-item ${item.done ? 'is-done' : ''}">
          <label class="todo-main">
            <input type="checkbox" data-toggle-todo="${esc(item.id)}" ${item.done ? 'checked' : ''} />
            <div class="todo-copy">
              <div class="todo-text">${esc(item.text || "")}</div>
              <div class="card-meta">${item.projectId ? tag(projectName(item.projectId), 'tag-neutral') : ''}</div>
            </div>
          </label>
          <div class="todo-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-type="todo" data-id="${esc(item.id)}">Edit</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-type="todo" data-id="${esc(item.id)}">Delete</button>
          </div>
        </div>`).join("") : '<div class="empty">No to-do items for today yet.</div>';

      const recentLogs = sortByLoggedDesc(state.worklog, 'date').slice(0, 5);
      document.getElementById("recentWorklog").innerHTML = recentLogs.length ? recentLogs.map(w => `
        <div class="card">
          <div class="card-head">
            <div>
              <h4>${esc(fmtDate(w.date))} · ${esc(w.type)}</h4>
              <div class="card-meta">${tag(projectName(w.projectId), 'tag-neutral')} ${tag(`${Number(w.hours || 0).toFixed(2)} h`, 'tag-neutral')}</div>
            </div>
          </div>
          ${loggedLine(w)}
          ${detailLine("Objective", w.objective)}
          ${detailLine("Outcome", w.outcome, "muted") || (!hasText(w.objective) ? emptyDetail("No objective or outcome logged.") : "")}
        </div>`).join("") : '<div class="empty">No work log entries yet.</div>';

      const recentRuns = sortByLoggedDesc(state.runs, 'date').slice(0, 5);
      document.getElementById("recentRuns").innerHTML = recentRuns.length ? recentRuns.map(r => `
        <div class="card">
          <div class="card-head">
            <div>
              <h4>${esc(fmtDate(r.date))} · ${esc(r.kind)} · ${esc(r.title)}</h4>
              <div class="card-meta">${tag(projectName(r.projectId), 'tag-neutral')} ${tag(r.status, runStatusClass(r.status))}</div>
            </div>
          </div>
          ${loggedLine(r)}
          ${hasText(r.summary) ? `<p>${esc(r.summary)}</p>` : emptyDetail("No summary logged.")}
          ${r.tool ? `<p class="muted"><strong>Tool:</strong> ${esc(r.tool)}</p>` : ''}
        </div>`).join("") : '<div class="empty">No runs or analyses logged yet.</div>';
    }
    function renderProjects() {
      const list = [...state.projects].sort(projectDirectorySort);
      document.getElementById("projectList").innerHTML = list.length ? list.map(p => {
        const openBlockers = state.blockers.filter(b => b.projectId === p.id && b.status !== 'Resolved').length;
        const classes = p.id === selectedProjectId ? 'card selected' : 'card';
        const ending = projectEndDate(p);
        return `
          <div class="${classes}">
            <div class="card-head">
              <div>
                <h4>${esc(p.title)}</h4>
                <div class="card-meta">
                  ${tag(p.status, statusClass(p.status))}
                  ${tag(`${p.priority} priority`, priorityClass(p.priority))}
                  ${p.area ? tag(p.area, 'tag-neutral') : ''}
                  ${p.collaborators ? tag('Has collaborators', 'tag-neutral') : ''}
                  ${projectDeadlineDate(p) ? tag(`Deadline ${fmtDate(projectDeadlineDate(p))}`, 'tag-neutral') : ''}
                  ${ending ? tag(`Completed ${fmtDate(ending)}`, 'tag-neutral') : tag('Completion date not logged', 'tag-neutral')}
                  ${tag(`${openBlockers} open blocker(s)`, openBlockers ? 'severity-medium' : 'tag-neutral')}
                </div>
              </div>
              <div class="right-tools">
                <button class="btn btn-ghost btn-sm" data-open-project="${esc(p.id)}">Open</button>
                <button class="btn btn-ghost btn-sm" data-action="edit" data-type="project" data-id="${esc(p.id)}">Edit</button>
                <button class="btn btn-danger btn-sm" data-action="delete" data-type="project" data-id="${esc(p.id)}">Delete</button>
              </div>
            </div>
            ${p.collaborators ? `<p class="muted"><strong>Collaborator(s):</strong> ${esc(p.collaborators)}</p>` : ''}
            <p>${esc(p.notes || 'No notes added.')}</p>
          </div>`;
      }).join("") : '<div class="empty">No projects yet. Add one to anchor the rest of the portal.</div>';
      renderProjectWorkspace();
      queueProjectDirectoryHeightSync();
    }
    function buildProjectTimeline(projectId) {
      const items = [];
      state.worklog.filter(entry => entry.projectId === projectId).forEach(entry => {
        items.push({
          type: "worklog",
          id: entry.id,
          sortKey: recordLoggedAt(entry) || entry.date || entry.id,
          dateLabel: entry.date ? fmtDate(entry.date) : "",
          title: entry.type ? `${entry.type} session` : "Work session",
          meta: `${tag("Work log", "tag-neutral")} ${tag(`${Number(entry.hours || 0).toFixed(2)} h`, "tag-neutral")}`,
          body: `${detailLine("Objective", entry.objective)}${detailLine("Outcome", entry.outcome) || (!hasText(entry.objective) ? emptyDetail("No objective or outcome logged.") : "")}${entry.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(entry.nextStep)}</p>` : ""}`
        });
      });
      state.runs.filter(entry => entry.projectId === projectId).forEach(entry => {
        items.push({
          type: "run",
          id: entry.id,
          sortKey: recordLoggedAt(entry) || entry.date || entry.id,
          dateLabel: entry.date ? fmtDate(entry.date) : "",
          title: [entry.kind, entry.title].filter(Boolean).join(" · ") || "Run / analysis",
          meta: `${tag("Run", "tag-neutral")} ${tag(entry.status, runStatusClass(entry.status))}${entry.tool ? ` ${tag(entry.tool, "tag-neutral")}` : ""}`,
          body: `${entry.inputs ? `<p><strong>Inputs:</strong> ${esc(entry.inputs)}</p>` : ""}${entry.parameters ? `<p><strong>Parameters:</strong> ${esc(entry.parameters)}</p>` : ""}${detailLine("Summary", entry.summary) || emptyDetail("No summary logged.")}${entry.location ? `<p class="muted"><strong>Output:</strong> ${esc(entry.location)}</p>` : ""}${entry.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(entry.nextStep)}</p>` : ""}`
        });
      });
      state.findings.filter(entry => entry.projectId === projectId).forEach(entry => {
        items.push({
          type: "finding",
          id: entry.id,
          sortKey: recordLoggedAt(entry) || entry.date || entry.id,
          dateLabel: entry.date ? fmtDate(entry.date) : "",
          title: hasText(entry.category) ? entry.category : "Finding",
          meta: `${tag("Finding", "tag-neutral")} ${tag(`${entry.impact} impact`, impactClass(entry.impact))}`,
          body: `${hasText(entry.summary) ? `<p>${esc(entry.summary)}</p>` : emptyDetail("No summary logged.")}${entry.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(entry.nextStep)}</p>` : ""}`
        });
      });
      state.ideas.filter(entry => entry.projectId === projectId).forEach(entry => {
        items.push({
          type: "idea",
          id: entry.id,
          sortKey: entry.date || recordLoggedAt(entry) || entry.id,
          dateLabel: entry.date ? fmtDate(entry.date) : "",
          title: entry.title || "Idea",
          meta: `${tag("Idea", "tag-neutral")} ${tag(entry.stage, ideaClass(entry.stage))} ${tag(`${entry.priority} priority`, priorityClass(entry.priority))}`,
          body: `${hasText(entry.description) ? `<p>${esc(entry.description)}</p>` : emptyDetail("No description logged.")}${entry.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(entry.nextStep)}</p>` : ""}`
        });
      });
      state.blockers.filter(entry => entry.projectId === projectId).forEach(entry => {
        items.push({
          type: "blocker",
          id: entry.id,
          sortKey: recordLoggedAt(entry) || entry.date || entry.id,
          dateLabel: entry.date ? fmtDate(entry.date) : "",
          title: previewSearchText(entry.description, 90) || "Blocker",
          meta: `${tag("Blocker", "tag-neutral")} ${tag(entry.severity, severityClass(entry.severity))} ${tag(entry.status, blockerStatusClass(entry.status))}`,
          body: `${hasText(entry.description) ? `<p>${esc(entry.description)}</p>` : emptyDetail("No blocker description logged.")}${entry.nextAction ? `<p class="muted"><strong>Next action:</strong> ${esc(entry.nextAction)}</p>` : ""}${entry.nextActionDate ? `<p class="muted"><strong>Target:</strong> ${esc(fmtDate(entry.nextActionDate))}</p>` : ""}`
        });
      });
      state.reviews.filter(entry => entry.projectId === projectId).forEach(entry => {
        items.push({
          type: "review",
          id: entry.id,
          sortKey: recordLoggedAt(entry) || entry.weekOf || entry.id,
          dateLabel: entry.weekOf ? `Week of ${fmtDate(entry.weekOf)}` : "Weekly review",
          title: "Weekly review",
          meta: `${tag("Review", "tag-neutral")}`,
          body: `${detailLine("Win", entry.win)}${detailLine("Lesson", entry.lesson)}${detailLine("Priority next week", entry.priority)}${entry.support ? `<p class="muted"><strong>Support needed:</strong> ${esc(entry.support)}</p>` : ""}${!hasText(entry.win) && !hasText(entry.lesson) && !hasText(entry.priority) && !hasText(entry.support) ? emptyDetail("No review notes logged yet.") : ""}`
        });
      });
      return items.sort((a, b) => String(b.sortKey || "").localeCompare(String(a.sortKey || "")) || a.type.localeCompare(b.type) || String(b.id || "").localeCompare(String(a.id || "")));
    }
    function renderTimelineEntry(item) {
      const extraRunActions = item.type === "run"
        ? `<button class="btn btn-ghost btn-sm" type="button" data-compare-run="${esc(item.id)}">Compare</button>`
        : "";
      return `
        <div class="card timeline-entry">
          <div class="timeline-entry-top">
            <div class="timeline-entry-copy">
              <div class="card-meta">${item.meta} ${item.dateLabel ? tag(item.dateLabel, "tag-neutral") : ""}</div>
              <h4 class="timeline-entry-title">${esc(item.title)}</h4>
            </div>
            <div class="right-tools">
              <button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-type="${esc(item.type)}" data-id="${esc(item.id)}">Open</button>
              ${extraRunActions}
            </div>
          </div>
          ${item.body}
        </div>`;
    }
    function renderProjectWorkspace() {
      const wrap = document.getElementById("projectWorkspace");
      const p = state.projects.find(item => item.id === selectedProjectId);
      if (!p) {
        wrap.innerHTML = `<div class="section-title"><div><h2>Project workspace</h2><p>Select or create a project to view linked runs, work logs, deadlines, and the project summary.</p></div></div><div class="empty">No project selected yet.</div>`;
        return;
      }
      const projectIdeas = sortByLoggedDesc(state.ideas.filter(i => i.projectId === p.id), "date");
      const projectFindings = sortByLoggedDesc(state.findings.filter(f => f.projectId === p.id), "date");
      const projectBlockers = sortByLoggedDesc(state.blockers.filter(b => b.projectId === p.id), "date");
      const projectLogs = sortByLoggedDesc(state.worklog.filter(w => w.projectId === p.id), "date");
      const projectRuns = sortByLoggedDesc(state.runs.filter(r => r.projectId === p.id), "date");
      const projectTimeline = buildProjectTimeline(p.id);
      const openProjectBlockers = projectBlockers.filter(b => b.status !== "Resolved");
      const ending = projectEndDate(p);
      const deadline = projectDeadlineDate(p);
      const lastUpdated = projectUpdatedAt(p);
      wrap.innerHTML = `
        <div class="section-title">
          <div>
            <h2 class="project-workspace-title">${esc(p.title)}</h2>
          </div>
          <div class="right-tools">
            <button class="btn btn-soft btn-sm" data-link-project-tab="runs">Log run</button>
            <button class="btn btn-soft btn-sm" data-link-project-tab="worklog">Log work session</button>
            <button class="btn btn-soft btn-sm" data-link-project-tab="context" data-context-target="findings">Open findings</button>
          </div>
        </div>
        <div class="card" style="margin-top:18px">
          <div class="project-overview-grid">
            <div class="project-overview-main">
              <div class="card-meta">
                ${tag(p.status, statusClass(p.status))}
                ${tag(`${p.priority} priority`, priorityClass(p.priority))}
                ${p.area ? tag(p.area, "tag-neutral") : ""}
                ${p.collaborators ? tag("Has collaborators", "tag-neutral") : ""}
                ${p.startDate ? tag(`Started ${fmtDate(p.startDate)}`, "tag-neutral") : ""}
                ${deadline ? tag(`Deadline ${fmtDate(deadline)}`, "tag-neutral") : ""}
                ${ending ? tag(`Completed ${fmtDate(ending)}`, "tag-neutral") : ""}
              </div>
              ${p.collaborators ? `<p><strong>Collaborator(s):</strong> ${esc(p.collaborators)}</p>` : ""}
              <p class="muted"><strong>Last updated:</strong> ${esc(fmtDateTime(lastUpdated))}</p>
              <p>${esc(p.notes || "No project notes added.")}</p>
            </div>
            <div class="project-overview-divider" aria-hidden="true"></div>
            <div class="project-overview-side">
              <div class="section-title" style="margin-bottom:12px">
                <div>
                  <h3>Project health snapshot</h3>
                </div>
              </div>
              <div class="project-health-grid">
                <div class="metric-card"><div class="label">Execution records</div><div class="value">${projectRuns.length}</div></div>
                <div class="metric-card"><div class="label">Ideas</div><div class="value">${projectIdeas.length}</div></div>
                <div class="metric-card"><div class="label">Findings</div><div class="value">${projectFindings.length}</div></div>
                <div class="metric-card"><div class="label">Open blockers</div><div class="value">${openProjectBlockers.length}</div></div>
                <div class="metric-card"><div class="label">Work logs</div><div class="value">${projectLogs.length}</div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="project-detail-grid" style="margin-top:18px">
          <section class="panel content-panel project-detail-panel">
            <div class="section-title"><div><h3>Linked runs &amp; analyses</h3><p>Execution history connected to this project.</p></div></div>
            <div class="list project-detail-scroll">${projectRuns.length ? projectRuns.slice(0, 8).map(r => `
              <div class="card">
                <div class="card-head">
                  <div>
                    <h4>${esc(fmtDate(r.date))} · ${esc(r.kind)} · ${esc(r.title)}</h4>
                    <div class="card-meta">${tag(r.status, runStatusClass(r.status))}${r.tool ? " " + tag(r.tool, "tag-neutral") : ""}</div>
                  </div>
                  <div class="right-tools">
                    <button class="btn btn-ghost btn-sm" type="button" data-edit-run="${esc(r.id)}">Edit</button>
                    <button class="btn btn-ghost btn-sm" type="button" data-compare-run="${esc(r.id)}">Compare</button>
                    <button class="btn btn-danger btn-sm" type="button" data-action="delete" data-type="run" data-id="${esc(r.id)}">Delete</button>
                  </div>
                </div>
                ${loggedLine(r)}
                ${hasText(r.summary) ? `<p>${esc(r.summary)}</p>` : emptyDetail("No summary logged.")}
                ${r.location ? `<p class="muted"><strong>Output:</strong> ${esc(r.location)}</p>` : ""}
                ${r.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(r.nextStep)}</p>` : ""}
              </div>`).join("") : '<div class="empty">No runs or analyses linked yet.</div>'}</div>
          </section>

          <section class="panel content-panel project-detail-panel">
            <div class="section-title"><div><h3>Recent work log</h3><p>Latest work sessions for this project.</p></div></div>
            <div class="list project-detail-scroll">${projectLogs.length ? projectLogs.slice(0, 6).map(w => `
              <div class="card"><h4>${esc(fmtDate(w.date))} · ${esc(w.type)}</h4><div class="card-meta">${tag(`${Number(w.hours || 0).toFixed(2)} h`, "tag-neutral")}</div>${loggedLine(w)}${detailLine("Objective", w.objective)}${detailLine("Outcome", w.outcome, "muted") || (!hasText(w.objective) ? emptyDetail("No objective or outcome logged.") : "")}${w.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(w.nextStep)}</p>` : ""}</div>`).join("") : '<div class="empty">No work sessions linked yet.</div>'}</div>
          </section>
        </div>

        <div class="project-context-grid" style="margin-top:18px">
          <section class="panel content-panel project-context-panel">
            <div class="section-title">
              <div><h3>Findings</h3></div>
              <div class="right-tools"><button class="btn btn-ghost btn-sm" type="button" data-link-project-tab="context" data-context-target="findings">Open</button></div>
            </div>
            <div class="list project-detail-scroll">${projectFindings.length ? projectFindings.map(f => `
              <div class="card"><div class="card-head"><div><h4>${esc(hasText(f.category) ? f.category : "Finding")} · ${esc(fmtDate(f.date))}</h4></div><div class="card-meta">${tag(`${f.impact} impact`, impactClass(f.impact))}</div></div>${loggedLine(f)}${hasText(f.summary) ? `<p>${esc(f.summary)}</p>` : emptyDetail("No summary logged.")}${f.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(f.nextStep)}</p>` : ""}</div>`).join("") : '<div class="empty">No findings linked yet.</div>'}</div>
          </section>

          <section class="panel content-panel project-context-panel">
            <div class="section-title">
              <div><h3>Ideas</h3></div>
              <div class="right-tools"><button class="btn btn-ghost btn-sm" type="button" data-link-project-tab="context" data-context-target="ideas">Open</button></div>
            </div>
            <div class="list project-detail-scroll">${projectIdeas.length ? projectIdeas.map(i => `
              <div class="card"><div class="card-head"><div><h4>${esc(i.title)}</h4></div><div class="card-meta">${i.date ? tag(fmtDate(i.date), "tag-neutral") : ""} ${tag(i.stage, ideaClass(i.stage))} ${tag(`${i.priority} priority`, priorityClass(i.priority))}</div></div>${loggedLine(i)}${hasText(i.description) ? `<p>${esc(i.description)}</p>` : emptyDetail("No description logged.")}${i.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(i.nextStep)}</p>` : ""}</div>`).join("") : '<div class="empty">No ideas linked yet.</div>'}</div>
          </section>

          <section class="panel content-panel project-context-panel">
            <div class="section-title">
              <div><h3>Blockers</h3></div>
              <div class="right-tools"><button class="btn btn-ghost btn-sm" type="button" data-link-project-tab="context" data-context-target="blockers">Open</button></div>
            </div>
            <div class="list project-detail-scroll">${projectBlockers.length ? projectBlockers.map(b => `
              <div class="card"><div class="card-head"><div><h4>${esc(fmtDate(b.date))}</h4></div><div class="card-meta">${tag(b.severity, severityClass(b.severity))} ${tag(b.status, blockerStatusClass(b.status))}</div></div>${loggedLine(b)}${hasText(b.description) ? `<p>${esc(b.description)}</p>` : emptyDetail("No blocker description logged.")}${b.nextAction ? `<p class="muted"><strong>Next action:</strong> ${esc(b.nextAction)}</p>` : ""}${b.nextActionDate ? `<p class="muted"><strong>Target:</strong> ${esc(fmtDate(b.nextActionDate))}</p>` : ""}</div>`).join("") : '<div class="empty">No blockers linked yet.</div>'}</div>
          </section>
        </div>

        <section class="panel content-panel project-timeline-panel">
          <div class="section-title">
            <div>
              <h3>Project timeline</h3>
              <p>A single chronological feed across work logs, runs, findings, ideas, blockers, and linked reviews.</p>
            </div>
            <div class="pill pill-neutral">${projectTimeline.length} item${projectTimeline.length === 1 ? "" : "s"}</div>
          </div>
          <div class="timeline-list project-timeline-scroll">${projectTimeline.length ? projectTimeline.map(renderTimelineEntry).join("") : '<div class="empty">No project-linked activity yet.</div>'}</div>
        </section>`;
    }
    function renderContext() {
      const wrap = document.getElementById("contextContent");
      const select = document.getElementById("contextProjectSelect");
      if (select && select.value !== contextProjectId) select.value = contextProjectId;
      const p = state.projects.find(item => item.id === contextProjectId);
      if (!p) {
        wrap.innerHTML = '<div class="panel content-panel"><div class="empty">Select a project to manage ideas, findings, and blockers.</div></div>';
        return;
      }
      const projectIdeas = sortByLoggedDesc(state.ideas.filter(i => i.projectId === p.id), 'date');
      const projectFindings = sortByLoggedDesc(state.findings.filter(f => f.projectId === p.id), 'date');
      const projectBlockers = sortByLoggedDesc(state.blockers.filter(b => b.projectId === p.id), 'date');
      const openBlockers = projectBlockers.filter(b => b.status !== 'Resolved').length;
      const tabs = [
        { id:'findings', label:'Findings', count: projectFindings.length },
        { id:'ideas', label:'Ideas', count: projectIdeas.length },
        { id:'blockers', label:'Blockers', count: openBlockers }
      ];

      let activePanel = '';
      if (activeContextTab === 'ideas') {
        activePanel = `
          <div class="context-layout">
            <section class="panel content-panel">
              <div class="section-title"><div>
                <h3>Add idea</h3>
                <!-- <p>Store a possible direction, experiment, or improvement for ${esc(p.title)}.</p> -->
                </div></div>
              <form class="inline-form" id="projectIdeaForm">
                <input type="hidden" name="id" />
                <input type="hidden" name="projectId" value="${esc(p.id)}" />
                <label>Idea title<input type="text" name="title" placeholder="Short idea name" required /></label>
                <div class="field-grid">
                  <label>Date<input type="date" name="date" value="${esc(todayISO())}" /></label>
                  <label>Stage<select name="stage"><option selected>Incubating</option><option>Active</option><option>Paused</option><option>Promoted</option><option>Archived</option></select></label>
                  <label>Priority<select name="priority"><option>Low</option><option selected>Medium</option><option>High</option></select></label>
                </div>
                <label>Description<textarea name="description" placeholder="What is the idea and why might it matter?"></textarea></label>
                <label>Next step<input type="text" name="nextStep" placeholder="What would test or clarify it?" /></label>
                <div class="actions-row"><button class="btn btn-soft btn-sm" type="submit">Save idea</button></div>
              </form>
            </section>
            <section class="panel content-panel">
              <div class="section-title"><div><h3>Ideas list</h3>
                <!-- <p>Browse current and older ideas for this project.</p> -->
                </div></div>
              <div class="list">${projectIdeas.length ? projectIdeas.map(i => `
                <div class="card"><div class="card-head"><div><h4>${esc(i.title)}</h4><div class="card-meta">${i.date ? tag(fmtDate(i.date), 'tag-neutral') + ' ' : ''}${tag(i.stage, ideaClass(i.stage))} ${tag(`${i.priority} priority`, priorityClass(i.priority))}</div></div><div class="right-tools"><button class="btn btn-ghost btn-sm" data-action="edit" data-type="idea" data-id="${esc(i.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="delete" data-type="idea" data-id="${esc(i.id)}">Delete</button></div></div>${loggedLine(i)}${hasText(i.description) ? `<p>${esc(i.description)}</p>` : emptyDetail("No description logged.")}${i.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(i.nextStep)}</p>` : ''}</div>`).join('') : '<div class="empty">No ideas linked yet.</div>'}</div>
            </section>
          </div>`;
      } else if (activeContextTab === 'blockers') {
        activePanel = `
          <div class="context-layout">
            <section class="panel content-panel">
              <div class="section-title"><div>
                <h3>Add blocker</h3>
                <p>Track what is slowing or stopping progress on ${esc(p.title)}.</p>
                </div>
                </div>
              <form class="inline-form" id="projectBlockerForm">
                <input type="hidden" name="id" />
                <input type="hidden" name="projectId" value="${esc(p.id)}" />
                <div class="field-grid">
                  <label>Date<input type="date" name="date" value="${esc(todayISO())}" required /></label>
                  <label>Severity<select name="severity"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></label>
                  <label>Status<select name="status"><option selected>Open</option><option>Waiting</option><option>Resolved</option></select></label>
                </div>
                <label>Description<textarea name="description" placeholder="What is blocked?"></textarea></label>
                <div class="field-grid">
                  <label>Next action<input type="text" name="nextAction" placeholder="What should unblock it?" /></label>
                  <label>Next action date<input type="date" name="nextActionDate" /></label>
                </div>
                <div class="actions-row"><button class="btn btn-soft btn-sm" type="submit">Save blocker</button></div>
              </form>
            </section>
            <section class="panel content-panel">
              <div class="section-title"><div><h3>Blockers list</h3><p>See open, waiting, and resolved blockers for this project.</p></div></div>
              <div class="list">${projectBlockers.length ? projectBlockers.map(b => `
                <div class="card"><div class="card-head"><div><h4>${esc(fmtDate(b.date))}</h4><div class="card-meta">${tag(b.severity, severityClass(b.severity))} ${tag(b.status, blockerStatusClass(b.status))}</div></div><div class="right-tools"><button class="btn btn-ghost btn-sm" data-action="edit" data-type="blocker" data-id="${esc(b.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="delete" data-type="blocker" data-id="${esc(b.id)}">Delete</button></div></div>${loggedLine(b)}${hasText(b.description) ? `<p>${esc(b.description)}</p>` : emptyDetail("No blocker description logged.")}${b.nextAction ? `<p class="muted"><strong>Next action:</strong> ${esc(b.nextAction)}</p>` : ''}</div>`).join('') : '<div class="empty">No blockers recorded yet.</div>'}</div>
            </section>
          </div>`;
      } else {
        activeContextTab = 'findings';
        activePanel = `
          <div class="context-layout">
            <section class="panel content-panel">
              <div class="section-title"><div><h3>Add finding</h3>
                <!-- <p>Capture what you found, concluded, or decided for ${esc(p.title)}.</p> -->
                </div>
                </div>
              <form class="inline-form" id="projectFindingForm">
                <input type="hidden" name="id" />
                <input type="hidden" name="projectId" value="${esc(p.id)}" />
                <div class="field-grid">
                  <label>Date<input type="date" name="date" value="${esc(todayISO())}" required /></label>
                  <label>Impact<select name="impact"><option>Low</option><option selected>Medium</option><option>High</option></select></label>
                </div>
                <label>Category<input type="text" name="category" placeholder="e.g., Result, decision, validation" /></label>
                <label>Summary<textarea name="summary" placeholder="What was found or decided?"></textarea></label>
                <label>Implication / next step<input type="text" name="nextStep" placeholder="Why it matters or what follows" /></label>
                <div class="actions-row"><button class="btn btn-soft btn-sm" type="submit">Save finding</button></div>
              </form>
            </section>
            <section class="panel content-panel">
              <div class="section-title">
                <div>
                  <h3>Findings list</h3>
                  <!-- <p>Review saved findings and decisions for this project.</p> -->
                </div>
              </div>
              <div class="list">${projectFindings.length ? projectFindings.map(f => `
                <div class="card"><div class="card-head"><div><h4>${esc(hasText(f.category) ? f.category : "Finding")} · ${esc(fmtDate(f.date))}</h4><div class="card-meta">${tag(`${f.impact} impact`, impactClass(f.impact))}</div></div><div class="right-tools"><button class="btn btn-ghost btn-sm" data-action="edit" data-type="finding" data-id="${esc(f.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="delete" data-type="finding" data-id="${esc(f.id)}">Delete</button></div></div>${loggedLine(f)}${hasText(f.summary) ? `<p>${esc(f.summary)}</p>` : emptyDetail("No summary logged.")}${f.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(f.nextStep)}</p>` : ''}</div>`).join('') : '<div class="empty">No findings recorded yet.</div>'}</div>
            </section>
          </div>`;
      }

      wrap.innerHTML = `
        <section class="panel content-panel">
          <div class="section-title">
            <div>
              <h3>${esc(p.title)}</h3>
              <p>Use the tabs to switch context types without losing the selected project.</p>
            </div>
            <div class="card-meta">
              ${projectDeadlineDate(p) ? tag(`Deadline ${fmtDate(projectDeadlineDate(p))}`, 'tag-neutral') : ''}
              ${projectEndDate(p) ? tag(`Ends ${fmtDate(projectEndDate(p))}`, 'tag-neutral') : ''}
            </div>
          </div>
          <!--<div class="helper-grid">
            <div class="helper-card"><h4>Findings</h4><p>${projectFindings.length} saved for this project.</p></div>
            <div class="helper-card"><h4>Ideas</h4><p>${projectIdeas.length} directions currently tracked.</p></div>
            <div class="helper-card"><h4>Open blockers</h4><p>${openBlockers} blocker(s) still need attention.</p></div>
            <div class="helper-card"><h4>How to use this page</h4><p>Select a tab, add an entry on the left, and browse saved entries on the right.</p></div>
          </div> -->
          <div class="subtabs">
            ${tabs.map(tab => `<button class="subtab-btn ${activeContextTab === tab.id ? 'active' : ''}" type="button" data-context-tab="${esc(tab.id)}">${esc(tab.label)} (${esc(tab.count)})</button>`).join('')}
          </div>
        </section>
        ${activePanel}`;

      const ideaForm = document.getElementById('projectIdeaForm');
      const findingForm = document.getElementById('projectFindingForm');
      const blockerForm = document.getElementById('projectBlockerForm');
      if (ideaForm) ideaForm.addEventListener('submit', handleIdeaSubmit);
      if (findingForm) findingForm.addEventListener('submit', handleFindingSubmit);
      if (blockerForm) blockerForm.addEventListener('submit', handleBlockerSubmit);
    }
    function renderWorklog() {
      const list = sortByLoggedDesc(getFiltered(state.worklog, 'worklog'), 'date');
      document.getElementById("worklogList").innerHTML = list.length ? list.map(w => `
        <div class="card"><div class="card-head"><div><h4>${esc(fmtDate(w.date))} · ${esc(w.type)}</h4><div class="card-meta">${tag(projectName(w.projectId), 'tag-neutral')} ${tag(`${Number(w.hours || 0).toFixed(2)} h`, 'tag-neutral')}</div></div><div class="right-tools"><button class="btn btn-ghost btn-sm" data-action="edit" data-type="worklog" data-id="${esc(w.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="delete" data-type="worklog" data-id="${esc(w.id)}">Delete</button></div></div>${loggedLine(w)}${detailLine("Objective", w.objective)}${detailLine("Outcome", w.outcome) || (!hasText(w.objective) ? emptyDetail("No objective or outcome logged.") : "")}${w.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(w.nextStep)}</p>` : ''}</div>`).join('') : '<div class="empty">No work log entries yet.</div>';
    }
    function renderRuns() {
      const list = sortByLoggedDesc(getFiltered(state.runs, 'runs'), 'date');
      renderRunsTabState();
      renderRunFormState();
      renderRunComparison(list);
      document.getElementById("runList").innerHTML = list.length ? list.map(r => `
        <div class="card">
          <div class="card-head">
            <div>
              <h4>${esc(fmtDate(r.date))} · ${esc(r.kind)} · ${esc(r.title)}</h4>
              <div class="card-meta">${tag(projectName(r.projectId), 'tag-neutral')} ${tag(r.status, runStatusClass(r.status))}${r.tool ? ' ' + tag(r.tool, 'tag-neutral') : ''}</div>
            </div>
            <div class="right-tools">
              <button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-type="run" data-id="${esc(r.id)}">Edit</button>
              <button class="btn btn-ghost btn-sm" type="button" data-compare-run="${esc(r.id)}">Compare</button>
              <button class="btn btn-danger btn-sm" type="button" data-action="delete" data-type="run" data-id="${esc(r.id)}">Delete</button>
            </div>
          </div>
          ${loggedLine(r)}
          ${r.inputs ? `<p><strong>Inputs:</strong> ${esc(r.inputs)}</p>` : ''}
          ${r.parameters ? `<p><strong>Parameters:</strong> ${esc(r.parameters)}</p>` : ''}
          ${detailLine("Summary", r.summary) || emptyDetail("No summary logged.")}
          ${r.location ? `<p class="muted"><strong>Output:</strong> ${esc(r.location)}</p>` : ''}
          ${r.nextStep ? `<p class="muted"><strong>Next:</strong> ${esc(r.nextStep)}</p>` : ''}
        </div>`).join('') : '<div class="empty">No runs or analyses logged yet.</div>';
    }
    function renderReviews() {
      const list = sortByLoggedDesc(state.reviews, 'weekOf');
      document.getElementById("reviewList").innerHTML = list.length ? list.map(r => `
        <div class="card"><div class="card-head"><div><h4>Week of ${esc(fmtDate(r.weekOf))}</h4><div class="card-meta">${r.projectId ? tag(projectName(r.projectId), 'tag-neutral') : ''}</div></div><div class="right-tools"><button class="btn btn-ghost btn-sm" data-action="edit" data-type="review" data-id="${esc(r.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="delete" data-type="review" data-id="${esc(r.id)}">Delete</button></div></div>${loggedLine(r)}${detailLine("Win", r.win)}${detailLine("Lesson", r.lesson)}${detailLine("Priority next week", r.priority)}${r.support ? `<p class="muted"><strong>Support needed:</strong> ${esc(r.support)}</p>` : ''}${!hasText(r.win) && !hasText(r.lesson) && !hasText(r.priority) && !hasText(r.support) ? emptyDetail("No review notes logged yet.") : ''}</div>`).join('') : '<div class="empty">No weekly reviews yet.</div>';
    }
    function renderDataOverview() {
      const metricsWrap = document.getElementById("dataOverviewMetrics");
      if (!metricsWrap) return;
      const contextCount = state.findings.length + state.ideas.length + state.blockers.length;
      const overviewMetrics = [
        ["Projects", state.projects.length, "Project records"],
        ["Work logs", state.worklog.length, "Logged sessions"],
        ["Runs", state.runs.length, "Runs and analyses"],
        ["Context", contextCount, "Ideas, findings, blockers"],
        ["To-dos", state.todayTodos.length, "Checklist items"],
        ["Reviews", state.reviews.length, "Weekly reviews"],
        ["Storage", "Browser", "Local until exported"]
      ];
      metricsWrap.innerHTML = overviewMetrics.map(([label, value, meta]) => metricCard(label, value, meta)).join("");
    }
    function renderAll() {
      renderProjectSelects();
      renderDashboard();
      renderProjects();
      renderContext();
      renderWorklog();
      renderRuns();
      renderReviews();
      renderDataOverview();
      if (!document.getElementById("quickCaptureModal")?.hidden) renderQuickCapture();
      if (!document.getElementById("searchModal")?.hidden) renderSearchResults();
    }
    function formToObject(form) {
      const data = new FormData(form);
      return Object.fromEntries(data.entries());
    }
    function handleProjectSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const data = formToObject(form);
      if (data.status === "Completed" && !data.endDate) {
        showToast("Add an end date before marking a project as completed");
        form.elements.endDate.focus();
        return;
      }
      const existing = state.projects.find(item => item.id === data.id);
      const requestedStatus = data.status;
      const nextEndDate = resolvedProjectEndDate(existing?.status, requestedStatus, data.endDate);
      const timestamp = nowISO();
      const record = normalizeProject({
        id: data.id || uid(),
        title: data.title.trim(),
        area: data.area.trim(),
        collaborators: data.collaborators.trim(),
        status: requestedStatus,
        priority: data.priority,
        startDate: data.startDate,
        deadlineDate: data.deadlineDate,
        endDate: nextEndDate,
        notes: data.notes.trim(),
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp
      });
      upsertRecord('projects', record);
      selectedProjectId = record.id;
      clearForm('projectForm');
      saveState('Project saved');
    }
    function handleTodayTodoSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const data = formToObject(form);
      const text = String(data.text || "").trim();
      if (!text) return;
      const existing = state.todayTodos.find(item => item.id === data.id);
      const record = {
        id: data.id || uid(),
        date: existing?.date || todayISO(),
        projectId: data.projectId || "",
        text,
        done: existing?.done || false,
        createdAt: existing?.createdAt || nowISO(),
        completedAt: existing?.completedAt || ""
      };
      upsertRecord('todayTodos', record);
      clearForm('todayTodoForm');
      saveState(existing ? "To-do updated" : "To-do added");
    }
    function handleWorklogSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const data = formToObject(form);
      const existing = state.worklog.find(item => item.id === data.id);
      const timestamp = nowISO();
      const record = {
        id: data.id || uid(),
        date: data.date,
        projectId: data.projectId,
        type: data.type,
        hours: Number(data.hours || 0),
        objective: data.objective.trim(),
        outcome: data.outcome.trim(),
        nextStep: data.nextStep.trim(),
        loggedAt: existing?.loggedAt || timestamp
      };
      upsertRecord('worklog', record);
      clearForm('worklogForm');
      saveState('Work log saved');
    }
    function handleRunSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const data = formToObject(form);
      const existing = state.runs.find(item => item.id === data.id);
      const timestamp = nowISO();
      const record = {
        id: data.id || uid(),
        date: data.date,
        projectId: data.projectId,
        kind: data.kind,
        status: data.status,
        title: data.title.trim(),
        tool: data.tool.trim(),
        inputs: data.inputs.trim(),
        parameters: data.parameters.trim(),
        summary: data.summary.trim(),
        location: data.location.trim(),
        nextStep: data.nextStep.trim(),
        loggedAt: existing?.loggedAt || timestamp
      };
      upsertRecord('runs', record);
      setRunsTab('runs');
      clearForm('runForm');
      saveState(existing ? 'Run / analysis updated' : 'Run / analysis saved');
    }
    function handleReviewSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const data = formToObject(form);
      const existing = state.reviews.find(item => item.id === data.id);
      const timestamp = nowISO();
      const record = {
        id: data.id || uid(),
        weekOf: data.weekOf,
        projectId: data.projectId || "",
        win: data.win.trim(),
        lesson: data.lesson.trim(),
        priority: data.priority.trim(),
        support: data.support.trim(),
        loggedAt: existing?.loggedAt || timestamp
      };
      upsertRecord('reviews', record);
      clearForm('reviewForm');
      saveState('Weekly review saved');
    }
    function handleIdeaSubmit(e) {
      e.preventDefault();
      const data = formToObject(e.currentTarget);
      const existing = state.ideas.find(item => item.id === data.id);
      const timestamp = nowISO();
      const record = {
        id: data.id || uid(),
        projectId: data.projectId,
        date: data.date,
        title: data.title.trim(),
        stage: data.stage,
        priority: data.priority,
        description: data.description.trim(),
        nextStep: data.nextStep.trim(),
        createdAt: existing?.createdAt || timestamp,
        loggedAt: existing?.loggedAt || existing?.createdAt || timestamp
      };
      upsertRecord('ideas', record);
      saveState('Idea saved');
    }
    function handleFindingSubmit(e) {
      e.preventDefault();
      const data = formToObject(e.currentTarget);
      const existing = state.findings.find(item => item.id === data.id);
      const timestamp = nowISO();
      const record = {
        id: data.id || uid(),
        projectId: data.projectId,
        date: data.date,
        impact: data.impact,
        category: data.category.trim(),
        summary: data.summary.trim(),
        nextStep: data.nextStep.trim(),
        loggedAt: existing?.loggedAt || timestamp
      };
      upsertRecord('findings', record);
      saveState('Finding saved');
    }
    function handleBlockerSubmit(e) {
      e.preventDefault();
      const data = formToObject(e.currentTarget);
      const existing = state.blockers.find(item => item.id === data.id);
      const timestamp = nowISO();
      const record = {
        id: data.id || uid(),
        projectId: data.projectId,
        date: data.date,
        severity: data.severity,
        status: data.status,
        description: data.description.trim(),
        nextAction: data.nextAction.trim(),
        nextActionDate: data.nextActionDate,
        loggedAt: existing?.loggedAt || timestamp
      };
      upsertRecord('blockers', record);
      saveState('Blocker saved');
    }
    function upsertRecord(collection, record) {
      const timestamp = nowISO();
      const normalized = collection === 'projects' ? normalizeProject(record) : record;
      const idx = state[collection].findIndex(item => item.id === normalized.id);
      const existing = idx >= 0 ? state[collection][idx] : null;
      if (idx >= 0) state[collection][idx] = normalized;
      else state[collection].push(normalized);
      if (collection !== 'projects') {
        new Set([existing?.projectId, normalized?.projectId].filter(Boolean)).forEach(projectId => touchProject(projectId, timestamp));
      }
    }
    function handleBodyChange(e) {
      const todoToggle = e.target.closest('[data-toggle-todo]');
      if (!todoToggle) return;
      const todo = state.todayTodos.find(item => item.id === todoToggle.dataset.toggleTodo);
      if (!todo) return;
      todo.done = Boolean(todoToggle.checked);
      todo.completedAt = todo.done ? nowISO() : "";
      if (todo.projectId) touchProject(todo.projectId);
      saveState();
    }
    function handleBodyClick(e) {
      const openProject = e.target.closest('[data-open-project]');
      if (openProject) {
        selectedProjectId = openProject.dataset.openProject;
        renderProjects();
        renderContext();
        switchTab('projects', true, true);
        queueSelectedProjectReveal();
        return;
      }
      const projectJump = e.target.closest('[data-link-project-tab]');
      if (projectJump) {
        const tab = projectJump.dataset.linkProjectTab;
        if (tab === 'runs') {
          setRunsTab('runs');
          switchTab(tab);
          openRunForm({ reset: true, projectId: selectedProjectId });
          return;
        }
        if (tab === 'worklog') document.getElementById('worklogForm').elements.projectId.value = selectedProjectId;
        if (tab === 'context') {
          contextProjectId = selectedProjectId;
          document.getElementById('contextProjectSelect').value = contextProjectId;
          activeContextTab = projectJump.dataset.contextTarget || activeContextTab || 'findings';
          renderContext();
        }
        switchTab(tab);
        return;
      }
      const contextTabBtn = e.target.closest('[data-context-tab]');
      if (contextTabBtn) {
        activeContextTab = contextTabBtn.dataset.contextTab || 'findings';
        renderContext();
        return;
      }
      const editRun = e.target.closest('[data-edit-run]');
      if (editRun) {
        editRecord('run', editRun.dataset.editRun);
        return;
      }
      const compareRunBtn = e.target.closest('[data-compare-run]');
      if (compareRunBtn) {
        addRunToComparison(compareRunBtn.dataset.compareRun);
        return;
      }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const { action: kind, type, id } = action.dataset;
      if (kind === 'delete') deleteRecord(type, id);
      if (kind === 'edit') editRecord(type, id);
    }
    function collectionName(type) {
      return ({ project:'projects', worklog:'worklog', run:'runs', review:'reviews', idea:'ideas', finding:'findings', blocker:'blockers', todo:'todayTodos' })[type];
    }
    async function deleteRecord(type, id) {
      const collection = collectionName(type);
      if (!collection) return;
      const removed = state[collection].find(item => item.id === id);
      if (!removed && type !== 'project') return;
      if (type === 'project') {
        const project = state.projects.find(item => item.id === id);
        const ok = await showConfirmModal({
          title: "Delete project?",
          message: `"${project?.title || "This project"}" will be removed together with its linked work logs, runs, findings, ideas, blockers, reviews, and to-do items.`,
          confirmText: "Delete project"
        });
        if (!ok) return;
        state.projects = state.projects.filter(item => item.id !== id);
        ['worklog','runs','ideas','findings','blockers','reviews','todayTodos'].forEach(key => state[key] = state[key].filter(item => item.projectId !== id));
        if (selectedProjectId === id) selectedProjectId = topProjectId();
      } else if (type === 'todo') {
        const todo = state.todayTodos.find(item => item.id === id);
        const ok = await showConfirmModal({
          title: "Delete to-do item?",
          message: `"${todo?.text || "This item"}" will be removed from today's list.`,
          confirmText: "Delete item"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      } else if (type === 'worklog') {
        const ok = await showConfirmModal({
          title: "Delete work log entry?",
          message: removed?.date
            ? `The work log entry for ${fmtDate(removed.date)}${removed?.type ? ` (${removed.type})` : ""} will be removed.`
            : "This work log entry will be removed.",
          confirmText: "Delete entry"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      } else if (type === 'run') {
        const ok = await showConfirmModal({
          title: "Delete run / analysis?",
          message: `"${removed?.title || removed?.kind || "This run"}" will be removed from saved runs and analyses.`,
          confirmText: "Delete run"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (document.getElementById('runForm')?.elements?.id?.value === id) closeRunForm();
        if (removed?.projectId) touchProject(removed.projectId);
      } else if (type === 'review') {
        const ok = await showConfirmModal({
          title: "Delete weekly review?",
          message: removed?.weekOf
            ? `The weekly review for ${fmtDate(removed.weekOf)} will be removed.`
            : "This weekly review will be removed from saved reviews.",
          confirmText: "Delete review"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      } else if (type === 'idea') {
        const ok = await showConfirmModal({
          title: "Delete idea?",
          message: `"${removed?.title || "This idea"}" will be removed from project context.`,
          confirmText: "Delete idea"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      } else if (type === 'finding') {
        const ok = await showConfirmModal({
          title: "Delete finding?",
          message: `This finding${hasText(removed?.category) ? ` in "${removed.category}"` : ""} will be removed from project context.`,
          confirmText: "Delete finding"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      } else if (type === 'blocker') {
        const ok = await showConfirmModal({
          title: "Delete blocker?",
          message: "This blocker will be removed from project context.",
          confirmText: "Delete blocker"
        });
        if (!ok) return;
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      } else {
        state[collection] = state[collection].filter(item => item.id !== id);
        if (removed?.projectId) touchProject(removed.projectId);
      }
      saveState('Deleted');
    }
    function editRecord(type, id) {
      const collection = collectionName(type);
      if (!collection) return;
      const item = state[collection].find(x => x.id === id);
      if (!item) return;
      if (type === 'project') { setFormValues('projectForm', { ...item, endDate: projectEndDate(item) }); switchTab('projects', true); return; }
      if (type === 'todo') {
        switchTab('dashboard');
        setFormValues('todayTodoForm', item);
        document.getElementById('todayTodoForm')?.elements?.text?.focus();
        return;
      }
      if (type === 'worklog') { setFormValues('worklogForm', item); switchTab('worklog'); return; }
      if (type === 'run') {
        setRunsTab('runs');
        switchTab('runs');
        setFormValues('runForm', item);
        renderRunFormState();
        return;
      }
      if (type === 'review') { setFormValues('reviewForm', item); switchTab('reviews'); return; }
      if (type === 'idea') {
        contextProjectId = item.projectId;
        selectedProjectId = item.projectId;
        activeContextTab = 'ideas';
        switchTab('context');
        renderProjects();
        renderContext();
        setFormValues('projectIdeaForm', item);
        return;
      }
      if (type === 'finding') {
        contextProjectId = item.projectId;
        selectedProjectId = item.projectId;
        activeContextTab = 'findings';
        switchTab('context');
        renderProjects();
        renderContext();
        setFormValues('projectFindingForm', item);
        return;
      }
      if (type === 'blocker') {
        contextProjectId = item.projectId;
        selectedProjectId = item.projectId;
        activeContextTab = 'blockers';
        switchTab('context');
        renderProjects();
        renderContext();
        setFormValues('projectBlockerForm', item);
        return;
      }
    }
    function exportData() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research-progress-portal-backup-${nowFilenameStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Backup exported');
    }
    function importData(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const importStatus = document.getElementById("importStatus");
      if (importStatus) importStatus.textContent = `Importing ${file.name}...`;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          state = {
            ...clone(defaultState),
            ...parsed,
            projects: Array.isArray(parsed.projects) ? normalizeProjects(parsed.projects) : [],
            worklog: Array.isArray(parsed.worklog) ? parsed.worklog.map(item => normalizeLoggedRecord(item, "date")) : [],
            runs: Array.isArray(parsed.runs) ? parsed.runs.map(item => normalizeLoggedRecord(item, "date")) : [],
            findings: Array.isArray(parsed.findings) ? parsed.findings.map(item => normalizeLoggedRecord(item, "date")) : [],
            blockers: Array.isArray(parsed.blockers) ? parsed.blockers.map(item => normalizeLoggedRecord(item, "date")) : [],
            ideas: Array.isArray(parsed.ideas) ? parsed.ideas.map(normalizeIdeaRecord) : [],
            reviews: Array.isArray(parsed.reviews) ? parsed.reviews.map(item => normalizeLoggedRecord(item, "weekOf")) : [],
            todayTodos: Array.isArray(parsed.todayTodos) ? parsed.todayTodos : []
          };
          delete state.runTemplates;
          if (importStatus) importStatus.textContent = `Imported ${file.name}.`;
          saveState('Backup imported');
        } catch (err) {
          if (importStatus) importStatus.textContent = `Import failed for ${file.name}.`;
          showToast('Import failed');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    }
    async function resetData() {
      const ok = await showConfirmModal({
        title: "Reset local data?",
        message: "This will remove all portal records stored in this browser. Export a backup first if you may need this data again.",
        confirmText: "Reset data"
      });
      if (!ok) return;
      state = clone(defaultState);
      saveState('All data reset');
    }
    async function loadDemoData() {
      const shouldReplace = state.projects.length || state.worklog.length || state.runs.length || state.findings.length || state.blockers.length || state.ideas.length || state.reviews.length || state.todayTodos.length;
      if (shouldReplace) {
        const ok = await showConfirmModal({
          eyebrow: "Demo data",
          title: "Load demo data?",
          message: "This replaces the current portal state in this browser. Export a backup first if you want to keep what is already here.",
          confirmText: "Load demo data",
          confirmVariant: "primary"
        });
        if (!ok) return;
      }
      const demoTimestamp = nowISO();
      state = {
        projects: [
          { id:'p1', title:'Transcriptome workflow optimization', area:'Method development', collaborators:'Dr. Lin, A. Chen', status:'Active', priority:'High', startDate:'2026-03-01', deadlineDate:'2026-04-20', endDate:'', notes:'Improve preprocessing, quantify runtime, and compare outputs across settings.', createdAt:'2026-03-01T09:00:00.000Z' },
          { id:'p2', title:'Host-pathogen interaction model validation', area:'Validation', collaborators:'J. Patel, M. Rivera', status:'Planning', priority:'Critical', startDate:'2026-04-01', deadlineDate:'2026-04-28', endDate:'', notes:'Validate candidate interactions across multiple evidence layers and prioritize follow-up.', createdAt:'2026-04-01T09:00:00.000Z' }
        ],
        worklog: [
          { id:'w1', date:todayISO(), projectId:'p1', type:'Analysis', hours:2.5, objective:'Compare normalization choices', outcome:'TPM and count-based summaries disagree on low abundance genes.', nextStep:'Run filtered comparison and update plots.', loggedAt:demoTimestamp },
          { id:'w2', date:todayISO(), projectId:'p2', type:'Planning', hours:1.25, objective:'Define validation batches', outcome:'Split candidates into three evidence tiers.', nextStep:'Match each tier to available datasets.', loggedAt:demoTimestamp }
        ],
        runs: [
          { id:'r1', date:todayISO(), projectId:'p1', kind:'Pipeline', status:'Running', title:'STAR + featureCounts rerun', tool:'STAR/featureCounts', inputs:'24 RNA-seq samples batch B', parameters:'Updated trimming threshold and genome index', summary:'Alignment finished for 18/24 samples; six still queued.', location:'results/run_2026_04_batchB', nextStep:'Check strandedness before DE.', loggedAt:demoTimestamp },
          { id:'r2', date:todayISO(), projectId:'p2', kind:'Analysis', status:'Needs Review', title:'Consensus interaction overlap', tool:'Custom Python workflow', inputs:'Interolog, domain, and GO similarity outputs', parameters:'Overlap by Host/Pathogen pair', summary:'Consensus set is smaller than expected after deduplication.', location:'validation/consensus_overlap_v2.tsv', nextStep:'Inspect merge logic and duplicate handling.', loggedAt:demoTimestamp }
        ],
        findings: [
          { id:'f1', date:todayISO(), projectId:'p1', impact:'Medium', category:'Result', summary:'Filtering low-count genes reduces noise in PCA separation.', nextStep:'Use filtered matrix for downstream comparison.', loggedAt:demoTimestamp }
        ],
        blockers: [
          { id:'b1', date:todayISO(), projectId:'p2', severity:'High', status:'Open', description:'One annotation source has inconsistent identifiers.', nextAction:'Build mapping table and retest merge.', nextActionDate:todayISO(), loggedAt:demoTimestamp }
        ],
        ideas: [
          { id:'i1', projectId:'p1', date:todayISO(), title:'Benchmark splice-aware alternatives', stage:'Incubating', priority:'Medium', description:'Check whether a lighter aligner changes final gene counts meaningfully.', nextStep:'Pick 4 representative samples for pilot.', createdAt:demoTimestamp, loggedAt:demoTimestamp }
        ],
        todayTodos: [
          { id:'t1', date:todayISO(), projectId:'p1', text:'Review filtered PCA plots for transcriptome workflow.', done:false, createdAt:new Date().toISOString(), completedAt:'' },
          { id:'t2', date:todayISO(), projectId:'p2', text:'Draft identifier mapping fix for annotation merge.', done:false, createdAt:new Date().toISOString(), completedAt:'' },
          { id:'t3', date:todayISO(), projectId:'', text:'Export backup after updating project notes.', done:true, createdAt:new Date().toISOString(), completedAt:new Date().toISOString() }
        ],
        reviews: [
          { id:'rv1', weekOf:todayISO(), projectId:'p1', win:'Recovered reproducible preprocessing settings for the main pipeline.', lesson:'Logging parameters early saves rework later.', priority:'Finish validation rerun and review outputs.', support:'Need final decision on annotation source.', loggedAt:demoTimestamp }
        ]
      };
      selectedProjectId = 'p1';
      saveState('Demo data loaded');
    }

    clearForm('worklogForm');
    clearForm('todayTodoForm');
    clearForm('runForm');
    clearForm('reviewForm');