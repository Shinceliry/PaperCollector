function fetchArxivPapersAndNotify() {
  const discordWebHookURL = "YOUR DISCORD WEBHOOK URL"; // Discord Webhook URL
  const cache = CacheService.getScriptCache(); // スクリプトキャッシュサービスを取得
  const query = "diffusion OR denoising"; // 論文のAbstractに含まれてほしいキーワード
  const cat = "cs.CV" // Subject Category
  const arxivApiUrl = `http://export.arxiv.org/api/query?search_query=abs:${encodeURIComponent(query)}+AND+cat:${encodeURIComponent(cat)}&sortBy=submittedDate&sortOrder=descending`;

  try {
    let response = UrlFetchApp.fetch(arxivApiUrl, { muteHttpExceptions: true }); // URLからデータ取得
    if (response.getResponseCode() != 200) {
      Logger.log(`Error fetching arXiv data: ${response.getContentText()}`);
      return;
    }

    let content = response.getContentText(); // 取得したデータの内容をテキストとして取得
    let papers = parseArxivContent(content); // 取得したテキストデータを解析して論文のリストを生成
    let newPapers = filterNewPapers(papers); // 新しい論文をフィルタリングして過去に送信したことのない論文だけをリストに残す

    // Discordに転送するための処理
    for (let i = 0; i < newPapers.length; i++) {
      let paper = newPapers[i];
      let message = {
        "content": `Title: ${paper.title}\nLink: ${paper.link}`,
        "tts": false
      };
      let options = {
        "method": "POST",
        "headers": { 'Content-Type': 'application/json' },
        "payload": JSON.stringify(message)
      };
      let discordResponse = UrlFetchApp.fetch(discordWebHookURL, options); // Discordへ転送

      // Discordのレスポンスをログに記録
      Logger.log(`Discord response code: ${discordResponse.getResponseCode()}`);
      Logger.log(`Discord response: ${discordResponse.getContentText()}`);
    }

    updateCache(newPapers);
  } catch (e) {
    Logger.log(`Error: ${e.message}`);
  }
}

// arXiv APIから取得したXML形式のレスポンスから論文のタイトルとリンクを抽出し、オブジェクトとして配列に格納する関数
function parseArxivContent(content) {
  let papers = [];
  let entries = content.split('<entry>'); //XMLデータを <entry> タグで分割

  // 各 <entry> 要素内の論文タイトルとリンクを正規表現を使用して抽出
  for (let i = 1; i < entries.length; i++) {
    let entry = entries[i];
    let titleMatch = entry.match(/<title>(.*?)<\/title>/);
    let linkMatch = entry.match(/<id>(.*?)<\/id>/);
    if (titleMatch && linkMatch) {
      papers.push({
        title: titleMatch[1].trim(),
        link: linkMatch[1].trim()
      });
    }
  }
  return papers;
}

// キャッシュに保存されていない新しい論文をフィルタリングする関数
function filterNewPapers(papers) {
  const cache = CacheService.getScriptCache();
  let cachedPapers = cache.get("cachedPapers");
  cachedPapers = cachedPapers ? cachedPapers.split(",") : [];

  let newPapers = papers.filter(paper => !cachedPapers.includes(paper.link));
  return newPapers;
}

// 新しい論文のリンクをキャッシュに追加する関数
function updateCache(newPapers) {
  const cache = CacheService.getScriptCache();
  let cachedPapers = cache.get("cachedPapers");
  cachedPapers = cachedPapers ? cachedPapers.split(",") : [];

  newPapers.forEach(paper => {
    cachedPapers.push(paper.link);
  });

  cache.put("cachedPapers", cachedPapers.join(","), 60 * 60 * 24);
}
