// ============================================================
// 知识记忆 PWA — 主程序
// ============================================================

// ---------- 状态 + 持久化 ----------
const STORE_KEY = "knowledge-quiz-state-v1";
const DEFAULT_STATE = {
  records: {},          // questionId -> {ef, interval, reps, due, lastResult}
  history: [],          // [{questionId, ts, correct}]
  wrongQueue: [],       // 错题 id 列表（去重）
  settings: { dailyCount: 10 },
  lastVisitDate: null,
  streak: 0
};

let state = loadState();
let DATA = { questions: [], cards: [], topics: [] };

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// ---------- SM-2 间隔重复 ----------
function sm2Update(record, correct) {
  const r = record || { ef: 2.5, interval: 0, reps: 0, due: 0, lastResult: null };
  const quality = correct ? 5 : 2;
  let { ef, interval, reps } = r;
  if (quality < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.round(interval * ef);
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const due = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { ef, interval, reps, due, lastResult: correct };
}

function recordAnswer(questionId, correct) {
  state.records[questionId] = sm2Update(state.records[questionId], correct);
  state.history.push({ questionId, ts: Date.now(), correct });
  if (!correct) {
    if (!state.wrongQueue.includes(questionId)) state.wrongQueue.unshift(questionId);
  } else {
    // 答对 2 次后从错题本移除
    const last3 = state.history.filter(h => h.questionId === questionId).slice(-3);
    const recentCorrect = last3.filter(h => h.correct).length;
    if (recentCorrect >= 2) {
      state.wrongQueue = state.wrongQueue.filter(id => id !== questionId);
    }
  }
  // streak
  const today = new Date().toDateString();
  if (state.lastVisitDate !== today) {
    const yest = new Date(Date.now() - 86400000).toDateString();
    state.streak = state.lastVisitDate === yest ? state.streak + 1 : 1;
    state.lastVisitDate = today;
  }
  saveState();
}

// ---------- 组卷 ----------
function pickQuiz(opts = {}) {
  const { topic = null, count = state.settings.dailyCount, mode = "random" } = opts;
  let pool = DATA.questions.slice();
  if (topic) pool = pool.filter(q => q.topic === topic);

  if (mode === "due") {
    const now = Date.now();
    pool = pool.filter(q => {
      const r = state.records[q.id];
      return !r || (r.due && r.due <= now);
    });
  } else if (mode === "wrong") {
    pool = pool.filter(q => state.wrongQueue.includes(q.id));
  } else {
    // 加权: 薄弱主题题目优先；未做过的优先
    pool = pool
      .map(q => ({ q, w: weightFor(q) }))
      .sort((a, b) => b.w - a.w + (Math.random() - 0.5) * 0.3)
      .map(x => x.q);
  }

  return shuffle(pool).slice(0, count).map(prepQuestion);
}

function weightFor(q) {
  const r = state.records[q.id];
  if (!r) return 1.0;                  // 未做：高权重
  if (r.lastResult === false) return 1.5; // 上次错：最高
  return 1 / (r.reps + 1);
}

function prepQuestion(q) {
  // 选择题：随机打乱选项；判断题保持
  if (q.type === "choice") {
    const order = q.options.map((_, i) => i);
    shuffle(order);
    return {
      ...q,
      _displayOptions: order.map(i => q.options[i]),
      _correctIndex: order.indexOf(q.answer)
    };
  }
  return q;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 数据加载 ----------
async function loadData() {
  const [qRes, cRes] = await Promise.all([
    fetch("./data/questions.json"),
    fetch("./data/cards.json")
  ]);
  DATA.questions = await qRes.json();
  const cardData = await cRes.json();
  DATA.cards = cardData.cards || [];
  DATA.topics = cardData.topics || [];
  // 从题库收集主题（题库可能比卡片多）
  const topicSet = new Map(DATA.topics.map(t => [t.id, t]));
  for (const q of DATA.questions) {
    if (!topicSet.has(q.topic)) {
      topicSet.set(q.topic, { id: q.topic, name: q.topicName || q.topic, source: "" });
    }
  }
  DATA.topics = [...topicSet.values()];
}

// ---------- 路由 ----------
const screen = document.getElementById("screen");
const tabbar = document.getElementById("tabbar");
let currentTab = "library";

tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  navigate(btn.dataset.tab);
});

function navigate(tab, params = {}) {
  currentTab = tab;
  for (const b of tabbar.querySelectorAll("button")) {
    b.classList.toggle("active", b.dataset.tab === topTabFor(tab));
  }
  switch (tab) {
    case "library": renderLibrary(); break;
    case "library:cards": renderCardViewer(params.topic); break;
    case "quiz": renderQuizHome(); break;
    case "quiz:run": renderQuizRun(params); break;
    case "quiz:result": renderQuizResult(params); break;
    case "review": renderReview(); break;
    case "stats": renderStats(); break;
    case "settings": renderSettings(); break;
  }
  window.scrollTo(0, 0);
}
function topTabFor(tab) {
  if (tab.startsWith("library")) return "library";
  if (tab.startsWith("quiz")) return "quiz";
  if (tab.startsWith("review")) return "review";
  if (tab.startsWith("stats")) return "stats";
  return "library";
}

// ---------- 工具 ----------
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

function topicStats(topicId) {
  const qs = DATA.questions.filter(q => q.topic === topicId);
  let correct = 0, total = 0;
  for (const q of qs) {
    const recs = state.history.filter(h => h.questionId === q.id);
    if (recs.length === 0) continue;
    const last = recs[recs.length - 1];
    total++;
    if (last.correct) correct++;
  }
  return { correct, total, count: qs.length, accuracy: total ? correct / total : null };
}

function dueCount() {
  const now = Date.now();
  return DATA.questions.filter(q => {
    const r = state.records[q.id];
    return r && r.due && r.due <= now;
  }).length;
}

// ============================================================
// 知识库
// ============================================================
function renderLibrary() {
  screen.innerHTML = "";
  screen.append(el("h1", {}, "知识库"));

  // 顶部今日复习 + 快速测验入口
  const due = dueCount();
  screen.append(
    el("div", { class: "quick-card" },
      el("h2", {}, "🔥 今日记忆"),
      el("p", {}, due > 0 ? `你有 ${due} 道题待复习` : "暂无待复习，开始随机测验吧"),
      el("button", { class: "btn", onclick: () => navigate("quiz") }, "开始刷题")
    )
  );

  screen.append(el("h2", {}, `主题 (${DATA.topics.length})`));

  const list = el("div", { class: "topic-list" });
  for (const t of DATA.topics) {
    const ts = topicStats(t.id);
    const cardCount = DATA.cards.filter(c => c.topic === t.id).length;
    list.append(
      el("button", {
        class: "topic-row",
        onclick: () => navigate("library:cards", { topic: t.id })
      },
        el("div", {},
          el("div", { style: "font-weight: 600; font-size: 15px;" }, t.name),
          el("div", { class: "meta" },
            `${cardCount} 张卡片 · ${ts.count} 道题` +
            (ts.accuracy != null ? ` · 正确率 ${Math.round(ts.accuracy * 100)}%` : "")
          )
        ),
        el("div", { class: "right" }, el("span", {}, "›"))
      )
    );
  }
  screen.append(list);
}

// ============================================================
// 知识卡片浏览
// ============================================================
function renderCardViewer(topicId) {
  screen.innerHTML = "";
  const topic = DATA.topics.find(t => t.id === topicId);
  const cards = DATA.cards.filter(c => c.topic === topicId);

  screen.append(
    el("button", { class: "back-link", onclick: () => navigate("library") }, "‹ 返回")
  );
  screen.append(el("h1", {}, topic?.name || topicId));
  if (topic?.source) {
    screen.append(el("div", { style: "color: var(--text-muted); font-size: 13px; margin-bottom: 16px;" },
      "来源：" + topic.source));
  }

  if (cards.length === 0) {
    screen.append(el("div", { class: "empty" },
      el("div", { class: "emoji" }, "📭"), "该主题暂无知识卡片"));
  } else {
    for (const card of cards) screen.append(renderCard(card));
  }

  screen.append(el("button", {
    class: "btn", style: "margin-top: 16px;",
    onclick: () => navigate("quiz:run", { topic: topicId, mode: "random" })
  }, `刷这个主题的题`));
}

function renderCard(card) {
  const wrap = el("div", { class: "kcard" });
  if (card.source) wrap.append(el("div", { class: "kcard-source" }, card.source));
  wrap.append(el("div", { class: "kcard-title" }, card.title));
  if (card.content) wrap.append(el("div", { class: "kcard-content" }, card.content));
  const rich = renderRichDisplay(card.displayType, card.richData);
  if (rich) wrap.append(rich);
  if (card.actionItem) wrap.append(el("div", { class: "kcard-action" }, card.actionItem));
  return wrap;
}

function renderRichDisplay(type, data) {
  if (!data) return null;
  switch (type) {
    case "table": return renderDtTable(data);
    case "chart": return renderDtChart(data);
    case "flow": return renderDtFlow(data);
    case "formula": return renderDtFormula(data);
    case "checklist": return renderDtChecklist(data);
    case "comparison": return renderDtComparison(data);
    case "bigNumber": return renderDtBigNumber(data);
    default: return null;
  }
}
function renderDtTable(d) {
  const t = el("table", { class: "dt-table" });
  if (d.headers) {
    const tr = el("tr");
    d.headers.forEach(h => tr.append(el("th", {}, h)));
    t.append(tr);
  }
  for (const row of d.rows || []) {
    const tr = el("tr");
    row.forEach(cell => tr.append(el("td", {}, cell)));
    t.append(tr);
  }
  return t;
}
function renderDtChart(d) {
  const max = Math.max(...d.bars.map(b => Number(b.value) || 0));
  const wrap = el("div", { class: "dt-chart" });
  for (const bar of d.bars) {
    const pct = max > 0 ? (Number(bar.value) / max) * 100 : 0;
    wrap.append(el("div", { class: "dt-chart-row" },
      el("span", {}, bar.label),
      el("div", { class: "dt-chart-bar-bg" },
        el("div", { class: "dt-chart-bar-fill", style: `width: ${pct}%;` })
      ),
      el("span", { class: "dt-chart-value" }, bar.display || bar.value)
    ));
  }
  return wrap;
}
function renderDtFlow(d) {
  const wrap = el("div", { class: "dt-flow" });
  for (const step of d.steps) wrap.append(el("div", { class: "dt-flow-step" }, step));
  return wrap;
}
function renderDtFormula(d) {
  return el("div", { class: "dt-formula" }, d.formula);
}
function renderDtChecklist(d) {
  const wrap = el("div", { class: "dt-checklist" });
  for (const it of d.items) wrap.append(el("div", { class: "dt-checklist-item" }, it));
  return wrap;
}
function renderDtComparison(d) {
  const wrap = el("div", { class: "dt-comparison" });
  const left = el("div", { class: "dt-comparison-left" });
  left.append(el("h4", {}, d.leftTitle || ""));
  for (const it of (d.leftItems || [])) left.append(el("div", {}, "• " + it));
  const right = el("div", { class: "dt-comparison-right" });
  right.append(el("h4", {}, d.rightTitle || ""));
  for (const it of (d.rightItems || [])) right.append(el("div", {}, "• " + it));
  wrap.append(left, right);
  return wrap;
}
function renderDtBigNumber(d) {
  return el("div", { class: "dt-bignumber" },
    el("div", { class: "dt-bignumber-num" }, d.number),
    el("div", { class: "dt-bignumber-label" }, d.label)
  );
}

// ============================================================
// 刷题首页
// ============================================================
function renderQuizHome() {
  screen.innerHTML = "";
  screen.append(el("h1", {}, "刷题"));

  const due = dueCount();

  screen.append(
    el("div", { class: "surface", style: "margin-bottom: 12px;" },
      el("h2", { style: "margin-top: 0;" }, "📅 今日复习"),
      el("div", { style: "color: var(--text-muted); font-size: 13px; margin-bottom: 12px;" },
        due > 0 ? `${due} 道题到期` : "暂无到期复习"),
      el("button", {
        class: due > 0 ? "btn" : "btn btn-secondary",
        onclick: () => due > 0 ? navigate("quiz:run", { mode: "due" }) : navigate("quiz:run", { mode: "random" })
      }, due > 0 ? "开始复习" : "做新题")
    )
  );

  screen.append(
    el("div", { class: "surface", style: "margin-bottom: 12px;" },
      el("h2", { style: "margin-top: 0;" }, "🎲 随机测验"),
      el("div", { style: "color: var(--text-muted); font-size: 13px; margin-bottom: 12px;" },
        `每次 ${state.settings.dailyCount} 题，可在设置中调整`),
      el("button", {
        class: "btn",
        onclick: () => navigate("quiz:run", { mode: "random" })
      }, "开始")
    )
  );

  screen.append(el("h2", {}, "按主题练习"));
  const list = el("div", { class: "topic-list" });
  for (const t of DATA.topics) {
    const ts = topicStats(t.id);
    list.append(
      el("button", {
        class: "topic-row",
        onclick: () => navigate("quiz:run", { topic: t.id, mode: "random" })
      },
        el("div", {},
          el("div", { style: "font-weight: 600;" }, t.name),
          el("div", { class: "meta" },
            `${ts.count} 题` +
            (ts.accuracy != null ? ` · 正确率 ${Math.round(ts.accuracy * 100)}%` : ""))
        ),
        el("span", {}, "›")
      )
    );
  }
  screen.append(list);

  screen.append(
    el("button", { class: "btn btn-ghost", style: "margin-top: 20px;",
      onclick: () => navigate("settings") }, "⚙️ 设置")
  );
}

// ============================================================
// 刷题进行中
// ============================================================
let quizSession = null;

function renderQuizRun(params) {
  if (!quizSession || quizSession.params !== JSON.stringify(params)) {
    const questions = pickQuiz(params);
    if (questions.length === 0) {
      screen.innerHTML = "";
      screen.append(el("button", { class: "back-link", onclick: () => navigate("quiz") }, "‹ 返回"));
      screen.append(el("div", { class: "empty" },
        el("div", { class: "emoji" }, "🎉"), "暂无可做题目"));
      return;
    }
    quizSession = {
      params: JSON.stringify(params),
      questions, idx: 0, results: [], answered: false, selectedIdx: null
    };
  }
  drawCurrentQuestion();
}

function drawCurrentQuestion() {
  const s = quizSession;
  const q = s.questions[s.idx];
  screen.innerHTML = "";

  screen.append(
    el("button", { class: "back-link", onclick: () => {
      if (confirm("退出本次测验？")) { quizSession = null; navigate("quiz"); }
    } }, "‹ 退出")
  );

  // 进度
  screen.append(
    el("div", { class: "quiz-progress" },
      el("span", {}, `${s.idx + 1} / ${s.questions.length}`),
      el("div", { class: "quiz-progress-bar" },
        el("div", { class: "quiz-progress-bar-fill",
          style: `width: ${((s.idx) / s.questions.length) * 100}%` })
      ),
      el("span", { class: "chip" }, q.topicName || q.topic)
    )
  );

  screen.append(el("div", { class: "quiz-question" }, q.question));

  const opts = el("div", { class: "quiz-options" });
  const letters = ["A", "B", "C", "D"];
  if (q.type === "choice") {
    q._displayOptions.forEach((text, i) => {
      const btn = el("button", {
        class: "quiz-option",
        onclick: () => onAnswer(i)
      },
        el("span", { class: "letter" }, letters[i]),
        el("span", {}, text)
      );
      if (s.answered) {
        btn.disabled = true;
        if (i === q._correctIndex) btn.classList.add("correct");
        else if (i === s.selectedIdx) btn.classList.add("wrong");
      }
      opts.append(btn);
    });
  } else if (q.type === "truefalse") {
    [["对", true], ["错", false]].forEach(([label, val], i) => {
      const btn = el("button", {
        class: "quiz-option",
        onclick: () => onAnswer(val)
      },
        el("span", { class: "letter" }, label),
        el("span", {}, val ? "正确" : "错误")
      );
      if (s.answered) {
        btn.disabled = true;
        if (val === q.answer) btn.classList.add("correct");
        else if (val === s.selectedIdx) btn.classList.add("wrong");
      }
      opts.append(btn);
    });
  }
  screen.append(opts);

  if (s.answered) {
    if (q.explanation) screen.append(el("div", { class: "quiz-explanation" }, q.explanation));
    const next = el("div", { class: "quiz-nav" });
    next.append(el("button", {
      class: "btn",
      onclick: () => {
        if (s.idx + 1 >= s.questions.length) {
          const result = quizSession;
          quizSession = null;
          navigate("quiz:result", { result });
        } else {
          s.idx++;
          s.answered = false;
          s.selectedIdx = null;
          drawCurrentQuestion();
        }
      }
    }, s.idx + 1 >= s.questions.length ? "完成" : "下一题 →"));
    screen.append(next);
  }
}

function onAnswer(value) {
  const s = quizSession;
  const q = s.questions[s.idx];
  let correct;
  if (q.type === "choice") {
    correct = value === q._correctIndex;
  } else {
    correct = value === q.answer;
  }
  s.answered = true;
  s.selectedIdx = value;
  s.results.push({ questionId: q.id, correct });
  recordAnswer(q.id, correct);
  drawCurrentQuestion();
}

// ============================================================
// 测验结果
// ============================================================
function renderQuizResult({ result }) {
  screen.innerHTML = "";
  const total = result.results.length;
  const correct = result.results.filter(r => r.correct).length;
  const pct = Math.round((correct / total) * 100);

  screen.append(
    el("div", { class: "result-hero" },
      el("div", { class: "score" }, `${correct}/${total}`),
      el("div", { class: "label" }, `正确率 ${pct}%`)
    )
  );

  let comment = "继续保持！🚀";
  if (pct === 100) comment = "完美！🏆";
  else if (pct >= 80) comment = "非常棒！👏";
  else if (pct >= 60) comment = "不错的开始 💪";
  else comment = "多看看错题，下次会更好 📝";

  screen.append(el("div", { class: "surface", style: "text-align: center; margin-bottom: 12px;" }, comment));

  // 错题列表
  const wrong = result.results.filter(r => !r.correct);
  if (wrong.length) {
    screen.append(el("h2", {}, `错题回顾 (${wrong.length})`));
    for (const w of wrong) {
      const q = DATA.questions.find(x => x.id === w.questionId);
      if (!q) continue;
      screen.append(
        el("div", { class: "surface", style: "margin-bottom: 10px;" },
          el("div", { style: "font-weight: 600; margin-bottom: 6px;" }, q.question),
          el("div", { style: "color: var(--good); font-size: 13px;" },
            "✓ " + (q.type === "choice" ? q.options[q.answer] : (q.answer ? "正确" : "错误"))),
          q.explanation ? el("div", { class: "quiz-explanation", style: "margin-top: 8px;" }, q.explanation) : null
        )
      );
    }
  }

  screen.append(
    el("div", { class: "quiz-nav" },
      el("button", { class: "btn btn-secondary", onclick: () => navigate("quiz") }, "返回首页"),
      el("button", { class: "btn", onclick: () => navigate("quiz:run", JSON.parse(result.params)) }, "再来一组")
    )
  );
}

// ============================================================
// 错题本
// ============================================================
function renderReview() {
  screen.innerHTML = "";
  screen.append(el("h1", {}, "错题本"));

  const wrongQs = state.wrongQueue.map(id => DATA.questions.find(q => q.id === id)).filter(Boolean);

  if (wrongQs.length === 0) {
    screen.append(el("div", { class: "empty" },
      el("div", { class: "emoji" }, "🎯"),
      "还没有错题，做几组题吧"));
    return;
  }

  screen.append(
    el("button", { class: "btn", style: "margin-bottom: 16px;",
      onclick: () => navigate("quiz:run", { mode: "wrong" }) },
      `专项练习错题 (${wrongQs.length})`)
  );

  for (const q of wrongQs) {
    screen.append(
      el("div", { class: "surface", style: "margin-bottom: 10px;" },
        el("div", { class: "chip", style: "margin-bottom: 6px;" }, q.topicName || q.topic),
        el("div", { style: "font-weight: 600; margin-bottom: 4px;" }, q.question),
        el("div", { style: "color: var(--good); font-size: 13px;" },
          "✓ " + (q.type === "choice" ? q.options[q.answer] : (q.answer ? "正确" : "错误")))
      )
    );
  }
}

// ============================================================
// 统计
// ============================================================
function renderStats() {
  screen.innerHTML = "";
  screen.append(el("h1", {}, "统计"));

  const totalAnswered = state.history.length;
  const correctAnswered = state.history.filter(h => h.correct).length;
  const pct = totalAnswered ? Math.round((correctAnswered / totalAnswered) * 100) : 0;

  const grid = el("div", { class: "stat-grid" });
  grid.append(
    el("div", { class: "stat-cell" }, el("div", { class: "num" }, totalAnswered), el("div", { class: "label" }, "答题次数")),
    el("div", { class: "stat-cell" }, el("div", { class: "num" }, pct + "%"), el("div", { class: "label" }, "总正确率")),
    el("div", { class: "stat-cell" }, el("div", { class: "num" }, state.streak), el("div", { class: "label" }, "连续天数")),
    el("div", { class: "stat-cell" }, el("div", { class: "num" }, state.wrongQueue.length), el("div", { class: "label" }, "错题数"))
  );
  screen.append(grid);

  screen.append(el("h2", {}, "各主题正确率"));
  const allTopics = DATA.topics.slice();
  allTopics.sort((a, b) => {
    const sa = topicStats(a.id), sb = topicStats(b.id);
    return (sa.accuracy ?? 1.1) - (sb.accuracy ?? 1.1);
  });
  for (const t of allTopics) {
    const s = topicStats(t.id);
    const pct = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
    screen.append(
      el("div", { class: "topic-bar" },
        el("div", { class: "topic-bar-head" },
          el("span", {}, t.name),
          el("span", { style: "color: var(--text-muted);" },
            pct == null ? "未练习" : `${pct}% (${s.correct}/${s.total})`)
        ),
        el("div", { class: "topic-bar-bg" },
          el("div", { class: "topic-bar-fill", style: `width: ${pct ?? 0}%` })
        )
      )
    );
  }

  screen.append(
    el("button", {
      class: "btn btn-ghost", style: "margin-top: 24px;",
      onclick: () => {
        if (confirm("清空所有学习记录？此操作不可恢复。")) {
          state = structuredClone(DEFAULT_STATE);
          saveState();
          navigate("stats");
        }
      }
    }, "🗑 清空记录")
  );
}

// ============================================================
// 设置
// ============================================================
function renderSettings() {
  screen.innerHTML = "";
  screen.append(
    el("button", { class: "back-link", onclick: () => navigate("quiz") }, "‹ 返回")
  );
  screen.append(el("h1", {}, "设置"));

  const wrap = el("div", { class: "surface" });

  // 每次测验题数
  const dailyRow = el("div", { class: "setting-row" },
    el("div", {},
      el("div", { style: "font-weight: 500;" }, "每次测验题数"),
      el("div", { style: "font-size: 12px; color: var(--text-muted);" }, "随机测验/今日复习抽取的题数")
    ),
    el("input", {
      type: "number", min: "1", max: "50", value: String(state.settings.dailyCount),
      oninput: (e) => {
        const n = Math.max(1, Math.min(50, parseInt(e.target.value) || 10));
        state.settings.dailyCount = n;
        saveState();
      }
    })
  );
  wrap.append(dailyRow);
  screen.append(wrap);
}

// ============================================================
// 启动
// ============================================================
(async function init() {
  try {
    await loadData();
  } catch (e) {
    screen.innerHTML = `<div class="empty"><div class="emoji">⚠️</div>题库加载失败：${e.message}<br><small>请用 http(s) 服务器访问，不要直接打开 file://</small></div>`;
    return;
  }
  navigate("library");

  // service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
})();
