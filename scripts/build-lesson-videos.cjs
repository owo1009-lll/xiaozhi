const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const dotenv = require("dotenv");
const lessons = require("./video-lessons-data.cjs");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

const buildRoot = path.join(root, "video-build");
const publicVideoRoot = path.join(root, "public", "videos");
const renderScript = path.join(__dirname, "render-slide.ps1");
const audioScript = path.join(__dirname, "synthesize-audio.ps1");
const zhFontPath = "C:/Windows/Fonts/msyh.ttc";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeUtf8(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
}

function sanitizeFileName(name) {
  return name.replace(/[^\w\-]+/g, "_");
}

function wavDurationSeconds(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Unsupported WAV file: ${filePath}`);
  }
  const byteRate = buffer.readUInt32LE(28);
  let offset = 12;
  while (offset < buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return chunkSize / byteRate;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error(`No data chunk in WAV file: ${filePath}`);
}

function splitSentences(text) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[。！？；])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunkSentences(sentences) {
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 2) {
    chunks.push(sentences.slice(i, i + 2).join(""));
  }
  return chunks;
}

function toSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function createSrtContent(text, durationSeconds) {
  const groups = chunkSentences(splitSentences(text));
  const safeGroups = groups.length ? groups : [text];
  const total = safeGroups.length;
  return safeGroups.map((group, index) => {
    const start = (durationSeconds / total) * index;
    const end = Math.max(start + 1.2, (durationSeconds / total) * (index + 1) - 0.08);
    return `${index + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${group}\n`;
  }).join("\n");
}

function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function narrationFromBullets(title, bullets, example, bridge) {
  const intro = `现在我们进入“${title}”这一部分。`;
  const details = bullets.map((bullet, index) => `第${index + 1}点，${bullet}。`).join("");
  const exampleText = example ? `结合课堂中的例子，${example}` : "";
  return `${intro}${details}${exampleText}${bridge}`;
}

function buildScenes(lesson) {
  const scenes = [];
  scenes.push({
    title: "课程导入与学习目标",
    subtitle: "课程导入",
    bullets: [
      `课程主题：${lesson.title}`,
      ...lesson.objectives.slice(0, 3),
    ],
    footer: `导入建议：${lesson.hook}`,
    narration: `同学们好，这一课我们学习《${lesson.title}》。${lesson.hook}本节课要完成三个目标：${lesson.objectives.join("；")}。请大家在学习过程中，把关键词和定义不断对应到谱面、键盘、声音或课堂例子中。`,
    accent: "intro",
  });

  lesson.sections.forEach((section, index) => {
    scenes.push({
      title: section.title,
      subtitle: "核心知识讲解",
      bullets: section.bullets.slice(0, 4),
      footer: `课堂例证：${section.example}`,
      narration: narrationFromBullets(
        section.title,
        section.bullets,
        section.example,
        "在大学乐理课堂中，这一部分既要求记住概念，更要求能结合谱例、乐器或听觉现象进行解释。"
      ),
      accent: "knowledge",
    });

    scenes.push({
      title: `${section.title} · 课堂例证`,
      subtitle: "课堂追问",
      bullets: [
        `课堂例证：${section.example}`,
        `重点回问：请用自己的话解释“${section.bullets[0].replace(/，.*/, "")}”`,
        `迁移练习：把本段知识和本课目标“${lesson.objectives[Math.min(index, lesson.objectives.length - 1)]}”对应起来`,
      ],
      footer: "这一段用于把定义、例子和课堂追问连接起来，避免学生只停留在被动听讲。",
      narration: `为了让这一段知识真正落地，教师需要把概念转化成课堂例证。${section.example}接着可以追问学生：你能不能不用教材原句，自己解释刚才出现的概念？同时继续追问，这一段内容和本课总目标之间是什么关系。只有当学生能把定义、例子和应用说清楚时，这一段知识才算真正掌握。`,
      accent: "example",
    });
  });

  scenes.push({
    title: "本课重难点",
    subtitle: "重点提炼",
    bullets: [
      `重点：${lesson.keyPoints.join("、")}`,
      `难点：${lesson.difficultPoints.join("、")}`,
      "学习策略：先回到定义，再回到例子，最后回到规范表达",
    ],
    footer: "建议教师在这一段安排针对性提问，及时检查学生是否真正理解。",
    narration: `接下来我们集中梳理本课的重点和难点。本课重点包括 ${lesson.keyPoints.join("、")}。这些内容是后续做题和分析的依据。难点主要在于 ${lesson.difficultPoints.join("、")}。如果只背定义而不结合例子，学生很容易在判断题、书写题和分析题中出错。所以这一段必须把定义、现象和规范表达再次统一起来。`,
    accent: "focus",
  });

  scenes.push({
    title: "拓展与迁移",
    subtitle: "知识拓展",
    bullets: lesson.extension.slice(0, 3),
    footer: "拓展内容不是增加负担，而是帮助学生看见本课知识在完整课程体系中的位置。",
    narration: `在大学乐理教学里，一节课不能只停留在本课知识点本身，还要看到后续延伸。本课可以进一步拓展到这些方向：${lesson.extension.join("；")}。这样做的目的，是帮助同学们把当前概念放进更大的课程框架里，理解它为什么重要，以及它将来会怎样继续出现。`,
    accent: "extend",
  });

  scenes.push({
    title: "总结与课后任务",
    subtitle: "课堂收束",
    bullets: [
      `回顾主题：${lesson.title}`,
      `课后任务：${lesson.homework}`,
      "复习建议：当天回顾定义，隔天回顾易错点，一周后进行迁移练习",
    ],
    footer: "收尾阶段再次点明核心概念、规范和应用场景，避免学生学完后只剩零碎印象。",
    narration: `最后我们做一个收束。本课的核心主题是《${lesson.title}》。请大家在离开课堂前，再次回顾定义、关键规则和最容易混淆的地方。课后任务是：${lesson.homework}。建议同学们当天先回顾本课概念，第二天针对错误点复盘，一周后再用练习或作品片段做迁移应用。这样一节课的学习闭环才算真正完成。`,
    accent: "summary",
  });

  return scenes;
}

function renderSlide(scene, lesson, sceneIndex, totalScenes, outputImage) {
  const payload = {
    lessonLabel: `第 ${lesson.number} 课`,
    lessonTitle: lesson.title,
    title: scene.title,
    subtitle: scene.subtitle,
    bullets: scene.bullets,
    footer: scene.footer,
    pageLabel: `${String(sceneIndex + 1).padStart(2, "0")} / ${String(totalScenes).padStart(2, "0")}`,
    progress: (sceneIndex + 1) / totalScenes,
    accent: scene.accent,
  };
  const jsonPath = outputImage.replace(/\.png$/i, ".json");
  writeUtf8(jsonPath, JSON.stringify(payload, null, 2));
  run("powershell", ["-ExecutionPolicy", "Bypass", "-File", renderScript, "-JsonPath", jsonPath, "-OutputPath", outputImage], { cwd: root });
}

async function synthesizeWithOpenAI(text, outputWav) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return false;
  const tempMp3 = outputWav.replace(/\.wav$/i, ".openai.mp3");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "coral",
      input: text,
      instructions: "Use a natural, engaging Mandarin Chinese teaching voice. Speak clearly, lively, and around 1.5x the previous slow classroom pace while keeping pronunciation stable.",
      format: "mp3",
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS failed: ${response.status} ${errorText}`);
  }
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempMp3, audioBuffer);
  run(ffmpegPath, ["-y", "-loglevel", "error", "-i", tempMp3, outputWav], { cwd: root });
  return true;
}

async function synthesizeAudio(text, outputAudio) {
  const textPath = outputAudio.replace(/\.wav$/i, ".txt");
  writeUtf8(textPath, text);
  if (process.env.OPENAI_API_KEY) {
    await synthesizeWithOpenAI(text, outputAudio);
    return;
  }
  run("powershell", ["-ExecutionPolicy", "Bypass", "-File", audioScript, "-TextPath", textPath, "-OutputPath", outputAudio, "-VoiceName", "Microsoft Huihui Desktop", "-Rate", "0"], { cwd: root });
}

function buildSceneVideo(imagePath, audioPath, subtitlePath, outputVideo, duration, sceneIndex) {
  const frames = Math.max(120, Math.round(duration * 30));
  const fadeOutStart = Math.max(0.45, duration - 0.5);
  const focusX = sceneIndex % 2 === 0 ? "0.20" : "0.68";
  const focusY = sceneIndex % 2 === 0 ? "0.18" : "0.54";
  const subtitleFilterPath = escapeFilterPath(subtitlePath);
  const fontFilterPath = escapeFilterPath(zhFontPath);

  const videoFilter = [
    `zoompan=z='min(zoom+0.0008,1.10)':x='(iw-iw/zoom)*${focusX}':y='(ih-ih/zoom)*${focusY}':d=${frames}:s=1280x720:fps=30`,
    `drawbox=x='-220+mod(t*140,1500)':y=78:w=220:h=220:color=white@0.06:t=fill`,
    `drawtext=fontfile='${fontFilterPath}':text='♪':fontcolor=white@0.12:fontsize=54:x='W-180+28*sin(t*1.5)':y='88+18*cos(t*1.3)'`,
    `drawtext=fontfile='${fontFilterPath}':text='♫':fontcolor=white@0.08:fontsize=42:x='110+20*cos(t*1.2)':y='H-170+16*sin(t*1.6)'`,
    `drawbox=x=84:y=638:w='20+1092*(t/${duration.toFixed(2)})':h=5:color=white@0.18:t=fill`,
    `fade=t=in:st=0:d=0.35`,
    `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.35`,
    `subtitles='${subtitleFilterPath}':force_style='FontName=Microsoft YaHei,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00111111,BackColour=&H8A000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=28'`,
    "format=yuv420p",
  ].join(",");

  run(ffmpegPath, [
    "-y",
    "-loglevel", "error",
    "-loop", "1",
    "-framerate", "30",
    "-i", imagePath,
    "-i", audioPath,
    "-t", duration.toFixed(2),
    "-vf", videoFilter,
    "-af", `afade=t=in:st=0:d=0.18,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.35`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "160k",
    outputVideo,
  ], { cwd: root });
}

function concatLessonVideos(sceneVideos, outputVideo) {
  const concatFile = outputVideo.replace(/\.mp4$/i, ".txt");
  writeUtf8(concatFile, sceneVideos.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
  run(ffmpegPath, [
    "-y",
    "-loglevel", "error",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-c", "copy",
    outputVideo,
  ], { cwd: root });
}

async function buildLessonVideo(lesson) {
  const lessonDir = path.join(buildRoot, sanitizeFileName(lesson.id));
  ensureDir(lessonDir);
  ensureDir(publicVideoRoot);

  const scenes = buildScenes(lesson);
  const sceneVideos = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const baseName = path.join(lessonDir, `${String(index + 1).padStart(2, "0")}-${sanitizeFileName(scene.title)}`);
    const imagePath = `${baseName}.png`;
    const audioPath = `${baseName}.wav`;
    const subtitlePath = `${baseName}.srt`;
    const videoPath = `${baseName}.mp4`;

    renderSlide(scene, lesson, index, scenes.length, imagePath);
    await synthesizeAudio(scene.narration, audioPath);
    const sceneDuration = wavDurationSeconds(audioPath) + 0.55;
    writeUtf8(subtitlePath, createSrtContent(scene.narration, Math.max(2, sceneDuration - 0.15)));
    buildSceneVideo(imagePath, audioPath, subtitlePath, videoPath, sceneDuration, index);
    sceneVideos.push(videoPath);
  }

  const outputVideo = path.join(publicVideoRoot, `${lesson.id}.mp4`);
  concatLessonVideos(sceneVideos, outputVideo);
  return outputVideo;
}

function resolveTargets(argv) {
  if (argv.includes("--all")) return lessons;
  const ids = argv.filter((arg) => !arg.startsWith("--"));
  if (!ids.length) return [lessons[0]];
  return ids.map((id) => {
    const found = lessons.find((lesson) => lesson.id.toLowerCase() === id.toLowerCase());
    if (!found) throw new Error(`Unknown lesson id: ${id}`);
    return found;
  });
}

async function main() {
  const targets = resolveTargets(process.argv.slice(2));
  console.log(`Building ${targets.length} lesson video(s)...`);
  for (const lesson of targets) {
    console.log(`\n[${lesson.id}] ${lesson.title}`);
    const output = await buildLessonVideo(lesson);
    console.log(`Created: ${output}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
