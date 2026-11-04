// A fake OpenAI-compatible model for capture runs. It answers on port 4010 with fixed text, so screens that
// call a model show the same result every time. Plain Node, no dependencies.
import { createServer } from "node:http";

const modelId = "fake-model";
const reply = "The lamp turned slowly, and the keeper counted the flashes until dawn.";

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://fake-model").pathname;
  req.resume();
  req.on("end", () => {
    if (req.method === "GET" && path === "/v1/models") {
      return send(res, 200, { object: "list", data: [{ id: modelId, object: "model", owned_by: "docs" }] });
    }
    if (req.method === "POST" && path === "/v1/chat/completions") {
      return send(res, 200, {
        id: "chatcmpl-fake",
        object: "chat.completion",
        created: 1767225600,
        model: modelId,
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
      });
    }
    send(res, 404, { error: { message: "not found" } });
  });
}).listen(4010, "0.0.0.0");
