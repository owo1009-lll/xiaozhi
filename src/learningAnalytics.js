import { buildKnowledgeMirrorPayload } from "./musicaiBkt";
import { getStudentProfile } from "./studentProfile";

export async function reportStudentAnalytics(payload) {
  try {
    await fetch("/api/analytics/student-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...getStudentProfile(), ...payload }),
    });
  } catch {}
}

export async function syncKnowledgeSummary(lessonId) {
  try {
    const profile = getStudentProfile();
    const payload = buildKnowledgeMirrorPayload(profile.studentId, lessonId);
    await fetch("/api/bkt/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        userId: profile.studentId,
        studentLabel: profile.studentLabel,
      }),
    });
  } catch {}
}
