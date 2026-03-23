/* ═══════════════════════════════════════════════════
   NUDGET — AI MODULE
   Uses Groq API (free tier) for NLP task parsing and
   morning briefing. Falls back to a local rule-based
   parser if no API key is set.

   HOW TO SET UP (free):
   1. Go to https://console.groq.com and sign up (free).
   2. Create an API key.
   3. Open js/config.js and paste your key into GROQ_API_KEY.
   4. That's it. No credit card required for Groq free tier.

   Model used: llama-3.1-8b-instant (fast, free on Groq)
   Rate limit: ~30 req/min on free tier — more than enough.
═══════════════════════════════════════════════════ */

/* Config is loaded from js/config.js (not committed to git) */

const AI = {

  /* ── Parse natural language into structured task ── */
  async parseTask(userText) {
    if (typeof CONFIG !== 'undefined' && CONFIG.GROQ_API_KEY) {
      try {
        return await AI._groqParse(userText);
      } catch (err) {
        console.warn('Groq API error, falling back to local parser:', err.message);
      }
    }
    return AI._localParse(userText);
  },

  async _groqParse(userText) {
    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = `You are a task parsing assistant for a GTD productivity app called Nudget. 
The user will describe something they need to do in natural language.
Your job is to return a JSON object — nothing else, no markdown, no explanation, only raw JSON.

JSON schema:
{
  "title": string,           // concise task title
  "gtdState": "inbox"|"next"|"waiting"|"someday"|"reference",
  "energy": "low"|"med"|"high",
  "dueDate": "YYYY-MM-DD" or null,
  "freqDays": number or null,  // if task should happen at a frequency (e.g. every 14 days), else null
  "project": null,             // always null — user will set this manually
  "progressType": "binary"|"percent"|"numeric",
  "progressTarget": number or null,
  "progressUnit": string or null,
  "recurrence": string or null,  // iCal RRULE string e.g. "FREQ=DAILY" or null
  "subtasks": [string],          // array of subtask strings, empty if none
  "notes": string                // any extra context
}

Today's date is ${today}.
Rules:
- If it sounds urgent or has a near deadline → gtdState: "next"
- If it's vague or exploratory → gtdState: "inbox"  
- If it has no deadline but a desired frequency → use freqDays, set dueDate to null
- If it's a goal requiring breakdown → populate subtasks
- Energy: reading/admin = low, writing/calls = med, deep work/exercise = high
- If no deadline is mentioned, dueDate = null
- Return ONLY the JSON object.`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        max_tokens: 400,
        temperature: 0.2,
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
    /* strip possible markdown code fences */
    const cleaned = raw.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
    return JSON.parse(cleaned);
  },

  /* ── Morning briefing / prioritization ── */
  async generateBriefing(tasks) {
    if (!tasks.length) return [];

    if (typeof CONFIG !== 'undefined' && CONFIG.GROQ_API_KEY) {
      try {
        return await AI._groqBriefing(tasks);
      } catch (err) {
        console.warn('Groq briefing error:', err.message);
      }
    }
    /* fallback: sort by due date then energy */
    return tasks
      .filter(t => t.gtdState !== 'done')
      .sort((a,b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        const eMap = { high:0, med:1, low:2 };
        return (eMap[a.energy]||1) - (eMap[b.energy]||1);
      })
      .slice(0, 3)
      .map(t => t.title);
  },

  async _groqBriefing(tasks) {
    const today = new Date().toISOString().split('T')[0];
    const taskList = tasks
      .filter(t => t.gtdState !== 'done')
      .slice(0, 20)
      .map(t => `- "${t.title}" [state:${t.gtdState}, energy:${t.energy}, due:${t.dueDate||'none'}]`)
      .join('\n');

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `You are a calm, supportive productivity assistant. Today is ${today}. Given a list of tasks, return a JSON array of exactly 3 task title strings — the most important ones to focus on today. Prioritize by: urgency (due today/overdue first), then high energy work, then next actions. Return ONLY a raw JSON array of strings, no markdown, no explanation.` },
          { role: 'user', content: taskList }
        ],
        max_tokens: 150,
        temperature: 0.3,
      })
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '[]';
    const cleaned = raw.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
    return JSON.parse(cleaned);
  },

  /* ── Nudge reason line ── */
  async nudgeReason(taskTitle, daysSince) {
    if (typeof CONFIG !== 'undefined' && CONFIG.GROQ_API_KEY) {
      try {
        return await AI._groqNudge(taskTitle, daysSince);
      } catch { /* fall through */ }
    }
    return `You haven't done "${taskTitle}" in ${Math.round(daysSince)} days.`;
  },

  async _groqNudge(taskTitle, daysSince) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You write single-line, calm, warm nudge messages for a productivity app. No exclamation marks, no guilt. Just a gentle reminder. Maximum 12 words.' },
          { role: 'user', content: `Task: "${taskTitle}". Days since last done: ${Math.round(daysSince)}. Write the nudge.` }
        ],
        max_tokens: 40,
        temperature: 0.7,
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g,'') || '';
  },

  /* ── Local fallback parser (no API needed) ── */
  _localParse(text) {
    const lower = text.toLowerCase();
    const today = new Date();
    const result = {
      title: text.charAt(0).toUpperCase() + text.slice(1),
      gtdState: 'inbox',
      energy: 'med',
      dueDate: null,
      freqDays: null,
      project: null,
      progressType: 'binary',
      progressTarget: null,
      progressUnit: null,
      recurrence: null,
      subtasks: [],
      notes: '',
    };

    /* Energy heuristics */
    if (/read|relax|check|review|look|browse/i.test(text)) result.energy = 'low';
    if (/write|code|build|design|research|study|plan|draft/i.test(text)) result.energy = 'high';

    /* GTD state heuristics */
    if (/urgent|asap|today|tonight|now|must|deadline/i.test(text)) result.gtdState = 'next';
    if (/someday|maybe|eventually|one day|would like/i.test(text)) result.gtdState = 'someday';
    if (/waiting|pending|blocked|once|after/i.test(text)) result.gtdState = 'waiting';

    /* Due date heuristics */
    if (/today/i.test(text)) {
      result.dueDate = today.toISOString().split('T')[0];
      result.gtdState = 'next';
    } else if (/tomorrow/i.test(text)) {
      const d = new Date(today); d.setDate(d.getDate() + 1);
      result.dueDate = d.toISOString().split('T')[0];
    } else if (/next week/i.test(text)) {
      const d = new Date(today); d.setDate(d.getDate() + 7);
      result.dueDate = d.toISOString().split('T')[0];
    }

    /* Frequency heuristics */
    if (/every (day|daily)/i.test(text)) result.freqDays = 1;
    else if (/every week|weekly/i.test(text)) result.freqDays = 7;
    else if (/every 2 weeks|fortnightly|biweekly/i.test(text)) result.freqDays = 14;
    else if (/every month|monthly/i.test(text)) result.freqDays = 30;

    /* Subtask heuristics for goal-like inputs */
    if (/clean|prepare|plan|organise|organize|setup|set up|review/i.test(text)) {
      result.subtasks = ['Research / gather info', 'Draft / rough pass', 'Review and finalise'];
    }

    /* Numeric progress heuristics */
    const numMatch = text.match(/(\d+)\s*(glass|cup|km|mile|page|min|hour|rep|set)/i);
    if (numMatch) {
      result.progressType = 'numeric';
      result.progressTarget = parseInt(numMatch[1]);
      result.progressUnit = numMatch[2].toLowerCase() + 's';
    }

    return result;
  }
};