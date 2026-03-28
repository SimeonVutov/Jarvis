// Pure helpers — global scope, no ES modules

const daysUntil = d =>
  Math.round((new Date(d) - new Date(new Date().toDateString())) / 86400000);

const fmtSize = b => b ? (b / 1e9).toFixed(1) + " GB" : "—";

const fmtBytes = b =>
  b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : b > 1e3 ? (b / 1e3).toFixed(0) + " KB" : b + " B";

const stripHtml = s => (s || "").replace(/<[^>]+>/g, "");

const weatherIcon = desc => {
  const d = (desc || "").toLowerCase();
  if (d.includes("sun") || d.includes("clear"))  return "☀️";
  if (d.includes("cloud"))                        return "☁️";
  if (d.includes("rain") || d.includes("shower")) return "🌧️";
  if (d.includes("snow"))                         return "❄️";
  if (d.includes("thunder"))                      return "⛈️";
  if (d.includes("fog")  || d.includes("mist"))   return "🌫️";
  return "🌤️";
};

const fileIcon = mime => {
  if (!mime)                                        return "📄";
  if (mime.includes("pdf"))                         return "📕";
  if (mime.includes("image"))                       return "🖼️";
  if (mime.includes("text"))                        return "📝";
  if (mime.includes("video"))                       return "🎬";
  if (mime.includes("audio"))                       return "🎵";
  if (mime.includes("zip") || mime.includes("tar")) return "📦";
  return "📎";
};

const PROJECT_COLORS = [
  "#00c8f0","#3d8ef5","#a855f7","#00c97a","#f07830","#f0c040","#f04060","#e879f9",
];

const POPULAR_MODELS = [
  { name:"llama3.2:3b",         desc:"Llama 3.2 3B — fast & lightweight",      size:"2 GB",   cat:"general" },
  { name:"llama3.1:8b",         desc:"Llama 3.1 8B — best all-round",           size:"5 GB",   cat:"general" },
  { name:"mistral:7b-instruct", desc:"Mistral 7B — sharp & concise",            size:"4.5 GB", cat:"general" },
  { name:"gemma2:9b",           desc:"Gemma 2 9B — strong reasoning",           size:"5.5 GB", cat:"general" },
  { name:"qwen2.5:7b",          desc:"Qwen 2.5 7B — multilingual",              size:"5 GB",   cat:"general" },
  { name:"qwen2.5-coder:7b",    desc:"Qwen 2.5 Coder 7B — best 7B coder",      size:"4.5 GB", cat:"coding"  },
  { name:"qwen2.5-coder:14b",   desc:"Qwen 2.5 Coder 14B — stronger",          size:"9 GB",   cat:"coding"  },
  { name:"codellama:7b",        desc:"Code Llama 7B — Meta's code model",       size:"4.5 GB", cat:"coding"  },
  { name:"deepseek-r1:7b",      desc:"DeepSeek R1 7B — chain-of-thought",       size:"5 GB",   cat:"study"   },
  { name:"deepseek-r1:14b",     desc:"DeepSeek R1 14B — deep reasoning",        size:"9 GB",   cat:"study"   },
  { name:"nomic-embed-text",    desc:"Nomic Embed — required for memory",       size:"270 MB", cat:"embed"   },
];

const timeAgo = isoStr => {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff <    60) return "just now";
  if (diff <  3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
};
