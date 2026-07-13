import {createServer, request as httpRequest} from "http";
import {request as httpsRequest} from "https";
import {readFileSync, existsSync, statSync} from "fs";
import {extname, join, dirname} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  let url = req.url.split("?")[0];

    if (req.method === "POST" && url === "/api/chat") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const {messages, apiKey, model, apiBaseUrl} = JSON.parse(body);
        if (!messages || !Array.isArray(messages)) {
          res.writeHead(400, {"Content-Type": "application/json"});
          res.end(JSON.stringify({reply: "Expected a messages array."}));
          return;
        }

        const dataContext = buildDataContext();
        const lastMsg = messages[messages.length - 1]?.content || "";
        const urls = extractURLs(lastMsg);
        let fetched = "";
        if (urls.length > 0) {
          const results = await Promise.all(urls.map(u => webFetch(u).then(c => `URL: ${u}\n${c}`)));
          fetched = "I fetched the following web content for you. Read it carefully and use it to answer the user. Do not say you cannot access the web — the content is right here.\n\n" + results.join("\n\n---\n\n");
        }

        const systemMessage = {
          role: "system",
          content: "You are a retention analyst assistant for Renewal Radar, a churn prediction and client renewal dashboard. Answer concisely and focus on churn risk analysis, retention strategy, and client insights.\n\n" + dataContext + (fetched ? "\n\n" + fetched : ""),
        };

        const chatMessages = [systemMessage, ...messages];

        if (apiKey) {
          await doProviderChat(chatMessages, model || "gpt-4o-mini", apiKey, apiBaseUrl || "https://api.openai.com/v1", res);
        } else {
          await doOllamaChat(chatMessages, res);
        }
      } catch (e) {
        res.writeHead(400, {"Content-Type": "application/json"});
        res.end(JSON.stringify({reply: "Invalid request."}));
      }
    });
    return;
  }

  if (url === "/" || url === "/dashboard/" || url === "/dashboard") url = "/dashboard/index.html";

  const filePath = join(root, url);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  try {
    const isDir = statSync(filePath).isDirectory();
    if (isDir) {
      const dirIndex = join(filePath, "index.html");
      const content = readFileSync(dirIndex);
      res.writeHead(200, {"Content-Type": "text/html"});
      res.end(content);
      return;
    }
  } catch {}

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {"Content-Type": contentType});
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch { return null; }
}

function readCSVSummary(path) {
  try {
    const text = readFileSync(path, "utf-8");
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(",");
    const rows = lines.slice(1).map(l => {
      const vals = l.split(",");
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = vals[i] ? vals[i].trim() : ""; });
      return row;
    });
    return rows;
  } catch { return null; }
}

function buildDataContext() {
  const parts = [];

  const metrics = readJSON(join(root, "outputs/churn_model_metrics.json"));
  if (metrics) {
    parts.push(`Churn model metrics: ROC AUC = ${metrics.roc_auc?.toFixed(3) ?? "?"}, Average Precision = ${metrics.average_precision?.toFixed(3) ?? "?"}, Accuracy = ${metrics.classification_report?.accuracy ?? "?"}.`);
  }

  const renewalMetrics = readJSON(join(root, "outputs/renewal_model_metrics.json"));
  if (renewalMetrics) {
    parts.push(`Renewal model metrics: ROC AUC = ${renewalMetrics.roc_auc?.toFixed(3) ?? "?"}, Average Precision = ${renewalMetrics.average_precision?.toFixed(3) ?? "?"}, Accuracy = ${renewalMetrics.classification_report?.accuracy ?? "?"}.`);
  }

  const rows = readCSVSummary(join(root, "outputs/client_risk_scores.csv"));
  if (rows && rows.length > 0) {
    parts.push(`Total accounts in dashboard: ${rows.length}.`);
    const segments = {};
    let totalChurn = 0, totalRenewal = 0;
    rows.forEach(r => {
      const seg = r.risk_segment || "unknown";
      segments[seg] = (segments[seg] || 0) + 1;
      totalChurn += parseFloat(r.churn_probability) || 0;
      totalRenewal += parseFloat(r.renewal_probability) || 0;
    });
    parts.push("Risk segment distribution: " + Object.entries(segments).map(([k, v]) => `${k} = ${v}`).join(", ") + ".");
    parts.push(`Average churn probability: ${(totalChurn / rows.length * 100).toFixed(1)}%, average renewal probability: ${(totalRenewal / rows.length * 100).toFixed(1)}%.`);

    const sorted = [...rows].sort((a, b) => parseFloat(b.churn_probability || 0) - parseFloat(a.churn_probability || 0));
    const top5 = sorted.slice(0, 5).map(r => `${r.client_id} (churn: ${(parseFloat(r.churn_probability) * 100).toFixed(0)}%, renewal: ${(parseFloat(r.renewal_probability) * 100).toFixed(0)}%, segment: ${r.risk_segment})`);
    parts.push("Top 5 highest churn risk accounts: " + top5.join("; ") + ".");
  }

  return parts.join("\n");
}

function webFetch(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? httpsRequest : httpRequest;
    const req = mod(url, {timeout: 15000, headers: {"User-Agent": "RenewalRadar/1.0 (dashboard assistant)"}}, resp => {
      let data = "";
      resp.on("data", chunk => data += chunk);
      resp.on("end", () => resolve(data.slice(0, 8000)));
    });
    req.on("error", () => resolve("Failed to fetch URL."));
    req.on("timeout", () => { req.destroy(); resolve("Request timed out."); });
    req.end();
  });
}

function ollamaChat(messages) {
  return new Promise((resolve, reject) => {
    const payload = {model: "gemma3:4b", messages, stream: false};

    const req = httpRequest(
      {hostname: "127.0.0.1", port: 11434, path: "/api/chat", method: "POST", headers: {"Content-Type": "application/json"}},
      resp => {
        let data = "";
        resp.on("data", chunk => data += chunk);
        resp.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error("Failed to parse Ollama response")); }
        });
      }
    );
    req.on("error", () => reject(new Error("Cannot reach Ollama")));
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function extractURLs(text) {
  const urlRegex = /https?:\/\/[^\s,)\]}'"`]+/g;
  const matches = text.match(urlRegex);
  if (!matches) return [];
  return [...new Set(matches)].filter(u => {
    try { new URL(u); return true; }
    catch { return false; }
  });
}

async function doOllamaChat(messages, res) {
  try {
    const response = await ollamaChat(messages);
    const content = response.message?.content || "";
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({reply: content || "I'm not sure how to respond to that."}));
  } catch (e) {
    res.writeHead(503, {"Content-Type": "application/json"});
    res.end(JSON.stringify({reply: e.message === "Cannot reach Ollama" ? "Cannot reach Ollama. Make sure it's running on port 11434." : "The assistant encountered an error."}));
  }
}

function providerRequest(messages, model, apiKey, apiBaseUrl) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiBaseUrl);
    const payload = { model, messages, max_tokens: 1024 };

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: (urlObj.pathname === "/" ? "" : urlObj.pathname.replace(/\/$/, "")) + "/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    };

    const mod = urlObj.protocol === "https:" ? httpsRequest : httpRequest;
    const req = mod(options, resp => {
      let data = "";
      resp.on("data", chunk => data += chunk);
      resp.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: resp.statusCode, body: parsed });
        } catch {
          reject(new Error("Failed to parse provider response."));
        }
      });
    });
    req.on("error", err => reject(err));
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function doProviderChat(messages, model, apiKey, apiBaseUrl, res, attempt) {
  if (attempt === undefined) attempt = 0;
  try {
    const {status, body} = await providerRequest(messages, model, apiKey, apiBaseUrl);
    if (status >= 400) {
      const errMsg = body.error?.message || body.error || `HTTP ${status}`;
      if (status === 429 && attempt < 3) {
        const delay = (attempt + 1) * 2000;
        await new Promise(r => setTimeout(r, delay));
        return doProviderChat(messages, model, apiKey, apiBaseUrl, res, attempt + 1);
      }
      res.writeHead(502, {"Content-Type": "application/json"});
      const hint = status === 429 ? "Rate limited by the provider. Try a different model or wait a moment." : "";
      res.end(JSON.stringify({reply: `API error: ${errMsg}. ${hint}`.trim()}));
      return;
    }
    const content = body.choices?.[0]?.message?.content || "";
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({reply: content || "No response from provider."}));
  } catch (err) {
    res.writeHead(502, {"Content-Type": "application/json"});
    res.end(JSON.stringify({reply: `Provider error: ${err.message}`}));
  }
}

const PORT = process.env.PORT || 8000;
const HOST = process.env.PORT ? "0.0.0.0" : "127.0.0.1";

server.listen(PORT, HOST, () => {
  console.log(`Serving dashboard at http://${HOST}:${PORT}/dashboard/`);
});
