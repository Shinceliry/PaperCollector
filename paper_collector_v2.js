function collectAndProcessScholarAlerts() {
  const threads = GmailApp.search('subject:"Google Scholar Alerts" newer_than:1d');
  if (threads.length === 0) {
    Logger.log("対象メールなし");
    return;
  }

  const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/XXXX/XXXX";
  const OPENAI_API_KEY = "sk-XXXX";

  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      const htmlBody = message.getBody();
      const paperInfos = extractPaperInfos(htmlBody);

      for (const paper of paperInfos) {
        if (paper.link.toLowerCase().endsWith(".pdf")) {
          Logger.log(`Skip PDF: ${paper.title}`);
          continue;
        }

        let abstractText = "";
        try {
          abstractText = fetchAbstractFromHtml(paper.link);
        } catch(e) {
          Logger.log("Abstract取得失敗: " + e);
          continue;
        }

        if (!abstractText) {
          Logger.log("Abstract未取得 or 空");
          continue;
        }

        const isCS = checkIfComputerScience(OPENAI_API_KEY, abstractText);
        if (!isCS) {
          Logger.log("CS分野ではなさそうなのでスキップ: " + paper.title);
          continue;
        }

        const summary = summarizeAbstract(OPENAI_API_KEY, abstractText);
        postToDiscord(DISCORD_WEBHOOK, { content: createDiscordMessage(paper, summary) });
      }
      thread.moveToTrash();
    }
  }
}

function extractPaperInfos(html) {
  const results = [];
  const re = /<h3.*?>.*?<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const link = match[1];
    let title = match[2] || "";
    title = title.replace(/<.*?>/g, "").trim();
    const publisher = "PublisherX";
    const conference = "CONF2025";
    results.push({
      title: title,
      link: link,
      publisher: publisher,
      conference: conference
    });
  }
  return results;
}

function fetchAbstractFromHtml(linkUrl) {
  const res = UrlFetchApp.fetch(linkUrl, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error("HTTP Status != 200");
  }
  const html = res.getContentText();
  const m = html.match(/<blockquote class="abstract">([\s\S]*?)<\/blockquote>/);
  if (!m) return "";
  let abstractText = m[1].replace(/<.*?>/g, "").trim();
  abstractText = abstractText.replace(/^Abstract:\s*/i, "");
  return abstractText;
}

function checkIfComputerScience(apiKey, abstractText) {
  const questionPrompt = `
以下はある論文のアブストラクトです。これはコンピュータサイエンス(Computer Science)分野の論文でしょうか？
必ず "Yes" か "No" のみで回答してください。

---
${abstractText}
---
`;
  const resTxt = callOpenAI(apiKey, questionPrompt);
  return resTxt.trim().toLowerCase().startsWith("yes");
}

function summarizeAbstract(apiKey, abstractText) {
  const prompt = `
以下は論文のアブストラクトです。これを日本語で300字以内に要約してください。

---
${abstractText}
---
`;
  const resTxt = callOpenAI(apiKey, prompt);
  let summary = resTxt.trim();
  if (summary.length > 300) {
    summary = summary.slice(0, 300) + "…";
  }
  return summary;
}

function callOpenAI(apiKey, userPrompt) {
  const url = "https://api.openai.com/v1/chat/completions";
  const payload = {
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "あなたは優秀な日本語の研究者です。" },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.0
  };
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  if (!json.choices || !json.choices[0]) {
    throw new Error("OpenAI API error: " + response.getContentText());
  }
  return json.choices[0].message.content;
}

function postToDiscord(webhookUrl, bodyObj) {
  const params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(bodyObj),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(webhookUrl, params);
}

function createDiscordMessage(paper, summary) {
  const lines = [];
  lines.push(`**タイトル**: ${paper.title}`);
  lines.push(`**リンク**: ${paper.link}`);
  lines.push(`**出版元**: ${paper.publisher}`);
  lines.push(`**学会名**: ${paper.conference}`);
  lines.push("------");
  lines.push("**[要約]**");
  lines.push(summary);
  return lines.join("\n");
}
